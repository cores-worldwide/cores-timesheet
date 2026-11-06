async page => {
 const checks=[];
 const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
 // Fixture seeding replaces the stored draft directly; avoid the prior page flushing its old fixture on reload.
 await page.addInitScript(()=>addEventListener('beforeunload',event=>event.stopImmediatePropagation(),true));
 const base='http://127.0.0.1:5212/cores-timesheet/report-builder/';
 const key='cores-report-builder-mockup-v1';
 await page.route('**/api/jobs',route=>route.fulfill({contentType:'application/json',body:'{"environment":"dev","jobs":[]}'}));
 await page.goto(base+'index.html');
 const original=await page.evaluate(async key=>(await import('/cores-timesheet/report-builder/draft-store.mjs')).readDraft(key),key);
 const setup=await page.evaluate(async key=>{
  const store=await import('/cores-timesheet/report-builder/draft-store.mjs');
  const legacyKey='cores-storage-legacy-check-'+crypto.randomUUID();
  localStorage.setItem(legacyKey,JSON.stringify({version:1,blocks:[],cover:{projectNo:'Legacy'}}));
  const legacy=await store.readDraft(legacyKey);
  await store.writeDraft(legacyKey,legacy);
  const migrated=await store.readDraft(legacyKey);
  const migration=legacy.cover.projectNo==='Legacy'&&migrated.cover.projectNo==='Legacy'&&localStorage.getItem(legacyKey)===null;
  await store.writeDraft(legacyKey,null);
  const canvas=document.createElement('canvas');canvas.width=900;canvas.height=700;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(900,700);
  let seed=37;
  for(let i=0;i<pixels.data.length;i+=4){for(let j=0;j<3;j++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels.data[i+j]=seed>>>24;}pixels.data[i+3]=255;}
  ctx.putImageData(pixels,0,0);
  const url=canvas.toDataURL('image/png');
  const state={version:1,cover:{projectNo:'STORAGE-QA'},blocks:[{id:'large-photos',type:'media',title:'Large photographs',layout:'quarter',items:[{id:'large-one',kind:'image',name:'large-one.png',url,caption:'First image'},{id:'large-two',kind:'image',name:'large-two.png',url,caption:'Second image'}]}]};
  let localRejected=false;
  try{localStorage.setItem('cores-storage-overflow-check',JSON.stringify(state));}catch(error){localRejected=error.name==='QuotaExceededError';}
  localStorage.removeItem('cores-storage-overflow-check');
  for(let size=1024*1024;size<=8*1024*1024;size+=1024*1024){try{localStorage.setItem('cores-storage-filler','x'.repeat(size));}catch{break;}}
  await store.writeDraft(key,state);
  const saved=await store.readDraft(key);
  return {migration,localRejected,size:JSON.stringify(state).length,images:saved.blocks[0].items.length,originalsIdentical:saved.blocks[0].items.every(item=>item.url===url)};
 },key);
 check(setup.migration,'Legacy drafts migrate only after the replacement is committed');
 check(setup.localRejected,'The image-heavy draft reproduces the old localStorage quota failure');
 check(setup.images===2&&setup.originalsIdentical,'Larger browser storage keeps both full original images');
 await page.reload();
 await page.getByRole('button',{name:'Edit image large-one.png',exact:true}).waitFor();
 check(await page.locator('.media-figure').count()===2,'An image-heavy draft reopens from the new store');
 await page.getByRole('button',{name:'Edit image large-one.png',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('[data-image-save]').disabled);
 const dialog=page.getByRole('dialog',{name:'Edit image',exact:true});
 const change=async(selector,value)=>dialog.locator(selector).evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},String(value));
 await change('[data-image-zoom]',200);await change('[data-image-scale]',75);
 // Hold a real IndexedDB transaction briefly so the UI's saving state is observable.
 await page.evaluate(()=>new Promise(resolve=>{
  const request=indexedDB.open('cores-report-drafts',1);
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('drafts','readwrite'),start=performance.now();const pulse=()=>{tx.objectStore('drafts').get('hold').onsuccess=()=>{if(performance.now()-start<1200)pulse();};};pulse();tx.oncomplete=()=>db.close();resolve();};
 }));
 await dialog.getByRole('button',{name:'Apply image changes',exact:true}).click();
 check(await dialog.isVisible()&&await dialog.getByRole('button',{name:'Apply image changes',exact:true}).isDisabled(),'The dialog stays open with Save disabled until storage confirms the write');
 await dialog.waitFor({state:'hidden'});
 const saved=await page.evaluate(async key=>(await (await import('/cores-timesheet/report-builder/draft-store.mjs')).readDraft(key)).blocks[0].items.map(item=>({edit:item.edit,caption:item.caption})),key);
 check(saved[0].edit.scale===75&&saved[0].edit.crop.width===0.5,'Image crop and resize save despite the old storage area being full');
 check(saved[1].edit==null,'Saving one image leaves its neighbour unchanged');
 await page.reload();
 check(await page.locator('[data-item-id="large-one"] .edited-image').count()===1,'The saved crop survives a full page reload');
 await page.getByRole('button',{name:'Edit image large-one.png',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-image-save]').disabled);
 await change('[data-image-scale]',65);
 // Abort exactly one real transaction; no failed edit may be reported as saved.
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){const result=original.apply(this,args);if(this.name==='drafts'){IDBObjectStore.prototype.put=original;this.transaction.abort();}return result;};});
 await dialog.getByRole('button',{name:'Apply image changes',exact:true}).click();
 await dialog.getByText(/The report could not be saved/).waitFor();
 check(await dialog.isVisible()&&await dialog.getByRole('button',{name:'Apply image changes',exact:true}).isEnabled(),'A failed save keeps the adjustments open with an actionable error and retry');
 const afterFailure=await page.evaluate(async key=>(await (await import('/cores-timesheet/report-builder/draft-store.mjs')).readDraft(key)).blocks[0].items[0].edit.scale,key);
 check(afterFailure===75,'An aborted transaction preserves the last successfully saved edit');
 await dialog.getByRole('button',{name:'Apply image changes',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const afterRetry=await page.evaluate(async key=>(await (await import('/cores-timesheet/report-builder/draft-store.mjs')).readDraft(key)).blocks[0].items[0].edit.scale,key);
 check(afterRetry===65,'Retry succeeds after an interrupted save');
 await page.getByRole('textbox',{name:'Description for large-two.png',exact:true}).fill('Caption autosaved with full old storage');
 await page.waitForFunction(()=>document.querySelector('#save-state').textContent==='Saved in this browser');
 const persistedCaption=await page.evaluate(async key=>(await (await import('/cores-timesheet/report-builder/draft-store.mjs')).readDraft(key)).blocks[0].items[1].caption,key);
 check(persistedCaption==='Caption autosaved with full old storage','Caption autosave is committed before leaving the page');
 await page.reload();
 check(await page.getByRole('textbox',{name:'Description for large-two.png',exact:true}).inputValue()==='Caption autosaved with full old storage','Caption autosave also uses the larger store and survives reload');
 await page.evaluate(async({key,original})=>{localStorage.removeItem('cores-storage-filler');await (await import('/cores-timesheet/report-builder/draft-store.mjs')).writeDraft(key,original);},{key,original});await page.reload();
 return {passed:checks.length,checks,legacyDraftCharacters:setup.size};
}
