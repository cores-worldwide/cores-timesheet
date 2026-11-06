const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function normalizeCrop(value={}) {
  value=value||{};
  const width=clamp(number(value.width,1),0.03,1);
  const height=clamp(number(value.height,1),0.03,1);
  return {x:clamp(number(value.x,0),0,1-width),y:clamp(number(value.y,0),0,1-height),width,height};
}
export function normalizeImageEdit(value) {
  if(!value||!Number.isFinite(value.sourceWidth)||!Number.isFinite(value.sourceHeight)||value.sourceWidth<1||value.sourceHeight<1)return null;
  return {sourceWidth:clamp(value.sourceWidth,1,50000),sourceHeight:clamp(value.sourceHeight,1,50000),crop:normalizeCrop(value.crop),scale:clamp(number(value.scale,100),25,100)};
}
// Crop with SVG coordinates, keeping the original source and avoiding canvas/CORS copies.
export function editedImageMarkup(item,value) {
  const edit=normalizeImageEdit(value);
  if(!edit)return '';
  const {sourceWidth:w,sourceHeight:h,crop:c,scale}=edit;
  const clip=`crop-${crypto.randomUUID()}`;
  const rect=`x="${c.x*w}" y="${c.y*h}" width="${c.width*w}" height="${c.height*h}"`;
  return `<svg class="edited-image" role="img" aria-label="${escape(item.caption||item.name)}" viewBox="${c.x*w} ${c.y*h} ${c.width*w} ${c.height*h}" preserveAspectRatio="xMidYMid meet" style="--image-scale:${scale}%"><defs><clipPath id="${clip}"><rect ${rect}/></clipPath></defs><image href="${escape(item.url)}" width="${w}" height="${h}" clip-path="url(#${clip})"/></svg>`;
}

export function createImageEditor(dialog) {
  const $=selector=>dialog.querySelector(selector);
  const surface=$('.crop-surface'),selection=$('.crop-selection');
  const source=$('.crop-source'),preview=$('.image-edit-preview');
  const save=$('[data-image-save]'),status=$('[data-image-status]');
  let draft=null,item=null,apply=null,version=0,drag=null,saving=false;
  function update() {
    if(!draft)return;
    const c=draft.crop;
    Object.assign(selection.style,{left:`${c.x*100}%`,top:`${c.y*100}%`,width:`${c.width*100}%`,height:`${c.height*100}%`});
    for(const key of ['x','y','width','height'])$(`[data-crop-value="${key}"]`).value=(c[key]*100).toFixed(1);
    const zoom=Math.round(100/Math.max(c.width,c.height));
    $('[data-image-zoom]').max=Math.max(500,zoom);
    $('[data-image-zoom]').value=zoom;
    $('[data-zoom-output]').textContent=`${zoom}%`;
    $('[data-image-scale]').value=draft.scale;
    $('[data-scale-output]').textContent=`${draft.scale}%`;
    for(const [axis,size] of [['x','width'],['y','height']]){
      const input=$(`[data-image-position="${axis}"]`);
      input.disabled=c[size]>=0.9999;
      input.value=c[size]>=0.9999?0:Math.round(c[axis]/(1-c[size])*100);
    }
    preview.innerHTML=editedImageMarkup(item,draft);
  }
  function point(event) {
    const rect=surface.getBoundingClientRect();
    return {x:clamp((event.clientX-rect.left)/rect.width,0,1),y:clamp((event.clientY-rect.top)/rect.height,0,1)};
  }
  surface.addEventListener('pointerdown',event=>{
    if(!draft||event.button!==0)return;
    event.preventDefault();
    const p=point(event),handle=event.target.closest('[data-crop-handle]')?.dataset.cropHandle;
    drag={start:p,crop:{...draft.crop},mode:handle|| (draft.crop.width>0.999&&draft.crop.height>0.999?'draw':event.target.closest('.crop-selection')?'move':'draw'),pointerId:event.pointerId};
    surface.setPointerCapture(event.pointerId);
  });
  surface.addEventListener('pointermove',event=>{
    if(!drag||!draft||event.pointerId!==drag.pointerId)return;
    const p=point(event),c=drag.crop;
    if(drag.mode==='move')draft.crop=normalizeCrop({...c,x:c.x+p.x-drag.start.x,y:c.y+p.y-drag.start.y});
    else {
      const left=drag.mode==='draw'?drag.start.x:drag.mode.includes('w')?c.x+c.width:c.x;
      const top=drag.mode==='draw'?drag.start.y:drag.mode.includes('n')?c.y+c.height:c.y;
      const right=drag.mode==='draw'||drag.mode.includes('w')||drag.mode.includes('e')?p.x:c.x+c.width;
      const bottom=drag.mode==='draw'||drag.mode.includes('n')||drag.mode.includes('s')?p.y:c.y+c.height;
      draft.crop=normalizeCrop({x:Math.min(left,right),y:Math.min(top,bottom),width:Math.abs(right-left),height:Math.abs(bottom-top)});
    }
    update();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])surface.addEventListener(type,()=>{drag=null;});
  selection.addEventListener('keydown',event=>{
    if(!draft||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();
    const amount=event.shiftKey?0.05:0.01;
    draft.crop=normalizeCrop({...draft.crop,x:draft.crop.x+(event.key==='ArrowLeft'?-amount:event.key==='ArrowRight'?amount:0),y:draft.crop.y+(event.key==='ArrowUp'?-amount:event.key==='ArrowDown'?amount:0)});
    update();
  });
  dialog.addEventListener('input',event=>{
    if(!draft)return;
    const target=event.target,c=draft.crop;
    if(target.hasAttribute('data-image-zoom')){
      const factor=100/Number(target.value)/Math.max(c.width,c.height);
      const width=c.width*factor,height=c.height*factor;
      draft.crop=normalizeCrop({...c,width,height,x:c.x+(c.width-width)/2,y:c.y+(c.height-height)/2});
    } else if(target.hasAttribute('data-image-scale'))draft.scale=Number(target.value);
    else if(target.hasAttribute('data-image-position')){
      const axis=target.dataset.imagePosition,size=axis==='x'?'width':'height';
      draft.crop=normalizeCrop({...c,[axis]:(1-c[size])*Number(target.value)/100});
    } else if(target.hasAttribute('data-crop-value'))return;
    else return;
    update();
  });
  dialog.addEventListener('change',event=>{if(draft&&event.target.hasAttribute('data-crop-value')){draft.crop=normalizeCrop({...draft.crop,[event.target.dataset.cropValue]:Number(event.target.value)/100});update();}});
  $('[data-image-reset]').addEventListener('click',()=>{if(draft){draft.crop=normalizeCrop();draft.scale=100;update();}});
  save.addEventListener('click',async()=>{
    if(!draft||saving)return;
    saving=true;dialog.dataset.saving='true';
    save.disabled=true;$('fieldset').disabled=true;
    dialog.querySelectorAll('.close-dialog').forEach(button=>button.disabled=true);
    status.textContent='Saving image changes…';
    try {
      if(await apply(normalizeImageEdit(draft)))dialog.close();
      else status.textContent='The image changes could not be saved. Your adjustments are still open; try again.';
    }catch(error){status.textContent=error.message||'The image changes could not be saved. Your adjustments are still open; try again.';}
    finally {
      saving=false;delete dialog.dataset.saving;
      dialog.querySelectorAll('.close-dialog').forEach(button=>button.disabled=false);
      if(dialog.open&&draft){save.disabled=false;$('fieldset').disabled=false;update();}
    }
  });
  dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  dialog.addEventListener('close',()=>{version++;draft=null;item=null;apply=null;drag=null;source.removeAttribute('src');preview.replaceChildren();});
  return async (nextItem,onApply)=>{
    const request=++version;
    item=nextItem;apply=onApply;draft=null;
    source.removeAttribute('src');preview.replaceChildren();
    selection.hidden=true;save.disabled=true;$('fieldset').disabled=true;
    status.textContent='Loading the original image…';
    dialog.showModal();
    try {
      const loaded=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('The original image could not be loaded. Check the file or connection and try again.'));image.src=nextItem.url;});
      if(version!==request||!dialog.open)return;
      draft=normalizeImageEdit({...nextItem.edit,sourceWidth:loaded.naturalWidth,sourceHeight:loaded.naturalHeight});
      source.src=nextItem.url;
      surface.style.setProperty('--source-ratio',`${loaded.naturalWidth}/${loaded.naturalHeight}`);
      surface.style.setProperty('--source-aspect',loaded.naturalWidth/loaded.naturalHeight);
      selection.hidden=false;save.disabled=false;$('fieldset').disabled=false;
      status.textContent='Drag to draw a crop. Drag inside it to move it, or use the corner handles to resize it.';
      update();selection.focus({preventScroll:true});
    }catch(error){if(version===request&&dialog.open)status.textContent=error.message;}
  };
}
