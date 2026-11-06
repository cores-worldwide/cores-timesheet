async page => {
  // Regressions from the 2026-11-06 review: draft loss on close/leave, reset, long or unreadable drafts, cleared fields, work dates.
  await page.addInitScript(()=>addEventListener('beforeunload',event=>event.stopImmediatePropagation(),true));
  const checks=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  const origin='http://127.0.0.1:5212/cores-timesheet/';
  const first='11111111-1111-4111-8111-111111111111',longJob='55555555-5555-4555-8555-555555555555',futureJob='66666666-6666-4666-8666-666666666666';
  const employee={id:'technician-a',name:'Technician A'};
  const job=(id,n)=>({id,job_number:n,status:'open',description:'Inspection request',customers:{name:'Sample customer'},vessels:{name:'Sample vessel'}});
  const jobs=[job(first,'FIX-TEST-A'),job(longJob,'FIX-TEST-B'),job(futureJob,'FIX-TEST-C')];
  const entries=[{id:'a',job_id:first,employee_id:employee.id,work_date:'2026-11-03',hours:4,description:'First',employees:employee,jobs:jobs[0]},{id:'b',job_id:first,employee_id:employee.id,work_date:'2026-11-04',hours:3,description:'Second',employees:employee,jobs:jobs[0]},{id:'c',job_id:longJob,employee_id:employee.id,work_date:'2026-11-03',hours:1,description:'Long',employees:employee,jobs:jobs[1]},{id:'d',job_id:futureJob,employee_id:employee.id,work_date:'2026-11-03',hours:1,description:'Future',employees:employee,jobs:jobs[2]}];
  const photos=[{id:'still',job_id:first,employee_id:employee.id,work_date:'2026-11-03',storage_path:'test/still.jpg'},{id:'clip-a',job_id:first,employee_id:employee.id,work_date:'2026-11-03',storage_path:'test/clip.mp4'},{id:'clip-b',job_id:first,employee_id:employee.id,work_date:'2026-11-03',storage_path:'test/clip.3GP'}];
  await page.route('https://giwexoouqxioxkjhoxoe.supabase.co/storage/v1/object/public/gear-photos/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4XcAAAAASUVORK5CYII=','base64')}));
  const writes=[];
  await page.route('https://giwexoouqxioxkjhoxoe.supabase.co/rest/v1/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(!['GET','HEAD','OPTIONS'].includes(req.method())){writes.push(req.method());return route.fulfill({status:405,body:'Writes forbidden in this test'});}
    let data=({jobs,employees:[employee],timesheet_entries:entries,gear_photos:photos})[url.pathname.split('/').pop()]||[];
    for(const field of ['id','job_id'])if(url.searchParams.get(field)?.startsWith('eq.'))data=data.filter(row=>row[field]===url.searchParams.get(field).slice(3));
    await route.fulfill({status:200,contentType:'application/json',headers:{'content-range':data.length?`0-${data.length-1}/${data.length}`:'*/0'},body:req.method()==='HEAD'?'':JSON.stringify(req.headers().accept?.includes('vnd.pgrst.object')?data[0]||{}:data)});
  });
  const key=id=>`cores-service-report-dev-${id}-v1`;
  const store=fn=>page.evaluate(async([src,args])=>{const m=await import('/cores-timesheet/report-builder/draft-store.mjs');return new Function('m','args','return '+src)(m,args);},fn);
  const read=id=>store(['m.readDraft(args)',key(id)]);
  const seed=(id,value)=>store(['m.writeDraft(args[0],args[1])',[key(id),value]]);
  const editor=()=>page.frameLocator('iframe[title^="Service report editor"]');
  const frame=()=>page.frames().find(f=>f.url().includes('report-builder'));
  const openBuilder=async()=>{await page.getByRole('button',{name:'Build service report',exact:true}).click();await editor().locator('#report-blocks').waitFor({state:'attached'});await page.waitForFunction(()=>document.querySelector('iframe[title^="Service report editor"]')?.contentDocument?.querySelector('[data-cover="projectNo"]')?.value.startsWith('FIX-TEST'));};
  const loadJob=async id=>{await page.goto(`${origin}#/reports?job=${id}`);await page.reload();await openBuilder();};
  const type=async text=>{await editor().locator('.component-card').first().click();await editor().locator('.richtext').last().click();await page.keyboard.type(text);};
  await page.goto(origin);
  await page.evaluate(()=>{localStorage.setItem('cores_unlocked','true');localStorage.setItem('cores_admin_name','Dev review');});
  for(const id of [first,longJob,futureJob])await seed(id,null);

  await loadJob(first);
  await type('CLOSE-AT-ONCE');
  await page.getByRole('button',{name:'Close report builder',exact:true}).click();
  await page.getByRole('button',{name:'Build service report',exact:true}).waitFor();
  check(JSON.stringify(await read(first)).includes('CLOSE-AT-ONCE'),'Text typed just before Close is saved');

  await openBuilder();
  await type('LEAVE-AT-ONCE');
  await page.getByRole('button',{name:/←/}).first().click();
  await page.locator('iframe[title^="Service report editor"]').waitFor({state:'detached'});
  await page.waitForTimeout(500);
  check(JSON.stringify(await read(first)).includes('LEAVE-AT-ONCE'),'Text typed just before leaving the job is saved');

  await loadJob(first);
  check(await editor().locator('#reset-demo').isHidden(),'Reset sample report is not offered on a real job');
  check(await editor().locator('[data-cover="visitStart"]').inputValue()==='2026-11-03'&&await editor().locator('[data-cover="visitEnd"]').inputValue()==='2026-11-04','Job started and finished are the actual work dates');

  await editor().locator('#show-cover').click();
  await editor().locator('[data-cover="plantVessel"]').fill('');
  await editor().locator('[data-cover="serviceReason"]').fill('');
  await page.getByRole('button',{name:'Close report builder',exact:true}).click();
  await openBuilder();
  await page.waitForFunction(()=>document.querySelector('iframe[title^="Service report editor"]')?.contentDocument?.querySelector('#job-fill-note')?.textContent.startsWith('Job details loaded'));
  check(await editor().locator('[data-cover="plantVessel"]').inputValue()===''&&await editor().locator('[data-cover="serviceReason"]').inputValue()==='','Cleared cover fields stay cleared after reopening');
  check(await editor().locator('[data-cover="customerName"]').inputValue()==='Sample customer','Fields not cleared still fill from the job');

  await frame().evaluate(()=>{IDBObjectStore.prototype.put=function(){throw new DOMException('Full','QuotaExceededError');};});
  await editor().locator('#show-body').click();
  await type('WILL-NOT-SAVE');
  await page.waitForTimeout(900);
  check(await editor().locator('#save-state').isVisible()&&await editor().locator('#save-state').innerText()==='Draft not saved','A failed save is visible inside Job Reports');
  await page.getByRole('button',{name:'Close report builder',exact:true}).click();
  await page.getByRole('alert').waitFor();
  check(await page.locator('iframe[title^="Service report editor"]').count()===1,'A failed save keeps the report open on Close');
  await page.getByRole('button',{name:'Close report builder',exact:true}).click();
  await page.getByRole('button',{name:'Build service report',exact:true}).waitFor();
  check(true,'A second Close can still leave after a warning');

  await loadJob(first);
  await page.getByText('Select photos').first().click();
  const boxes=page.locator('input[aria-label^="Include photograph"]');
  check(await boxes.count()===1&&await boxes.first().getAttribute('aria-label')==='Include photograph still','Only still photos can be selected, whatever the video file extension case');
  check(await page.getByText('Videos can’t go in a printed report').isVisible(),'The picker says why videos are not listed');
  check(await page.locator('span',{hasText:'📷 3'}).count()>=1,'The page still counts and opens the job’s videos');
  await boxes.first().check();
  await page.getByRole('button',{name:'Add selected photos to report',exact:true}).click();
  await editor().locator('.media-figure img').first().waitFor();
  check(await editor().locator('.media-figure').count()===1,'The selected still photo is added');
  const before=(await read(first)).blocks.length;
  const rejected=await page.evaluate(jobId=>new Promise(resolve=>{addEventListener('message',event=>{if(event.data?.type==='cores-report-imported'&&event.data.id==='video-probe')resolve(event.data.error||'');});document.querySelector('iframe[title^="Service report editor"]').contentWindow.postMessage({type:'cores-report-import',id:'video-probe',jobId,sections:[{type:'media',title:'Video',items:[{kind:'image',name:'clip.mp4',url:'https://giwexoouqxioxkjhoxoe.supabase.co/storage/v1/object/public/gear-photos/test/clip.mp4'}]}]},location.origin);}),first);
  check(rejected.includes('Videos')&&(await read(first)).blocks.length===before,'The editor refuses a video even if one is sent directly');

  const many=Array.from({length:101},(_,i)=>({id:'b'+i,type:'text',title:'S'+i,html:'<p>x</p>'}));
  await seed(longJob,{version:1,cover:{},blocks:many});
  await loadJob(longJob);
  await page.waitForTimeout(1200);
  check((await read(longJob)).blocks.length===101,'A report over 100 sections reopens intact');
  check(await editor().locator('.report-block').count()===101,'All sections over 100 are shown');

  const future={version:2,cover:{plantVessel:'Keep'},blocks:[{id:'x',type:'text',title:'Keep',html:'<p>Keep</p>'}]};
  await seed(futureJob,future);
  await loadJob(futureJob);
  await page.waitForTimeout(1200);
  check(JSON.stringify(await read(futureJob))===JSON.stringify(future),'An unreadable draft is not overwritten');
  check(await editor().locator('#save-state').innerText()!=='Saved in this browser','An unreadable draft does not report a save');

  check(writes.length===0,'No database writes were attempted');
  for(const id of [first,longJob,futureJob])await seed(id,null);
  return {passed:checks.length,checks};
}
