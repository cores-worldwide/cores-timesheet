/* Local report-builder prototype. Job reads use a dev-only local proxy. */
import {fillFromJob, jobEngines, engineFields, engineModel, migrateReportCover, visitDefaults} from './job-fields.mjs';
import {IMAGE_LAYOUTS,imageLayout,imagePages,reportGroups} from './image-layouts.mjs';
import {createImageEditor,normalizeImageEdit,editedImageMarkup} from './image-editor.mjs';
import {readDraft,writeDraft,flushDraft,draftStorageMessage} from './draft-store.mjs';
(async () => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const hostJobId = /^[a-f0-9-]{36}$/i.test(params.get('job') || '') ? params.get('job') : '';
  const embedded = params.get('embedded') === '1' && window.parent !== window && !!hostJobId;
  const STORE_KEY = embedded ? `cores-service-report-dev-${hostJobId}-v1` : 'cores-report-builder-mockup-v1';
  document.body.classList.toggle('embedded',embedded);
  const MAX_FILE_BYTES = 4 * 1024 * 1024;
  const VIDEO_FILE=/\.(mp4|mov|webm|3gp|m4v)$/i; // Same list as src/utils/media.js.
  const ENGINE_COVER_FIELDS=['engineType','engineSerial','engineManufacturer','engineRole'];
  const COVER_DEFAULTS = {
    projectNo:'',writtenBy:'',authorLocation:'',visitStart:'',visitEnd:'',destination:'',participants:'',serviceReason:'',
    customerName:'',requestedBy:'',plantVessel:'',engineType:'',engineSerial:'',engineManufacturer:'',engineRole:'',
  };
  const SAMPLE_NOTES = [
    { id: 'sample-1', date: '3 NOVEMBER 2026', text: 'Removed access covers and inspected the cylinder heads. Photographed the assemblies before disassembly.' },
    { id: 'sample-2', date: '4 NOVEMBER 2026', text: 'Cleaned the valve components and checked contact surfaces. Recorded the inspection findings and measurements.' },
    { id: 'sample-3', date: '5 NOVEMBER 2026', text: 'Reassembled the inspected components and completed the initial function checks.' },
    { id: 'sample-4', date: '6 NOVEMBER 2026', text: 'Completed the final visual inspection. Prepared the supporting photographs and recommendations for review.' },
  ];
  const $ = (selector, within = document) => within.querySelector(selector);
  const $$ = (selector, within = document) => [...within.querySelectorAll(selector)];
  const uid = () => globalThis.crypto?.randomUUID?.() || `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const safeURL = value => typeof value === 'string' && (/^data:(image\/(?:png|jpeg|jpg|gif|webp|bmp|avif)|application\/pdf|application\/octet-stream);base64,/i.test(value) || /^assets\/[\w-]+\.svg$/.test(value) || (embedded && /^https:\/\/giwexoouqxioxkjhoxoe\.supabase\.co\/storage\/v1\/object\/public\/gear-photos\/[^\s"<>?#]+$/.test(value)));
  const cleanHTML = html => {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const allowed = new Set(['P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'U', 'SPAN', 'BLOCKQUOTE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
    const clean = node => {
      [...node.children].forEach(el => {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'IMG', 'SVG', 'LINK', 'META'].includes(el.tagName)) { el.remove(); return; }
        clean(el);
        if (!allowed.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
        const align = el.style.textAlign;
        const margin = el.style.marginLeft;
        [...el.attributes].forEach(attr => el.removeAttribute(attr.name));
        if (['left', 'center', 'right', 'justify'].includes(align)) el.style.textAlign = align;
        if (/^\d{1,3}px$/.test(margin)) el.style.marginLeft = `${Math.min(120, parseInt(margin, 10))}px`;
      });
    };
    clean(template.content);
    return template.innerHTML;
  };
  const sampleState = () => ({
    version: 1,
    visitDateManual:{start:false,end:false},participantsManual:false,coverEdited:{},
    cover: { ...COVER_DEFAULTS },
    blocks: embedded ? [] : [
      { id: uid(), type: 'text', title: 'Work performed', html: '<ul><li>Removed access covers and inspected the cylinder head assemblies.</li><li>Cleaned and checked the valve components, recording the inspection findings.</li><li>Reassembled the inspected components and completed function checks.</li></ul>', sourceIds: ['sample-1', 'sample-2', 'sample-3'] },
      { id: uid(), type: 'media', title: 'Supporting images', layout: 'quarter', items: [
        { id: uid(), kind: 'image', name: 'engine-reference.svg', url: 'assets/engine-study.svg', caption: 'Engine assembly before inspection. Illustrative sample.' },
        { id: uid(), kind: 'image', name: 'valve-detail.svg', url: 'assets/valve-study.svg', caption: 'Valve component reference view. Illustrative sample.' },
      ] },
    ],
  });
  let state = sampleState();
  let selectedId = state.blocks[0]?.id || null;
  let currentPage = 'body';
  let previewing = false;
  let activeEditor = null;
  let savedRange = null;
  let pendingFileBlock = null;
  let importTarget = null;
  let saveTimer;
  let toastTimer;
  let saveVersion=0;
  let saveAttempt=0;
  let pendingSaves=0;
  let draftReadFailed=false;
  let lastSaveError='';
  let dragging = null;
  let previewURLs = [];
  let fixedProjectNumber='';
  let reportContext={range:{start:'',end:''},participants:[]};
  let jobRequestVersion = 0;
  let currentJobDetail = null;
  let availableNotes = embedded ? [] : SAMPLE_NOTES;
  const parentRequests = new Map();
  const importedRequests = new Set();
  if (embedded) {
    $('.canvas-footnote').textContent='This job’s draft is saved in this browser. Job and timesheet records are read-only.';
    $('.sample-note p').innerHTML='Dev database<br><small>Job-specific timesheet notes</small>';
    window.addEventListener('message',event => {
      if (event.source!==window.parent || event.origin!==window.location.origin) return;
      if(event.data?.type==='cores-report-context'&&event.data.jobId===hostJobId){applyReportContext(event.data);return;}
      if(event.data?.type==='cores-report-import') { importSections(event.data); return; }
      if(event.data?.type==='cores-report-flush'&&event.data.jobId===hostJobId) { flushForClose(event.data.id); return; }
      if(event.data?.type!=='cores-report-response') return;
      const pending=parentRequests.get(event.data.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      parentRequests.delete(event.data.requestId);
      if (event.data.error) pending.reject(new Error(event.data.error));
      else pending.resolve(event.data.payload);
    });
  }
  function requestParent(resource,jobId) {
    return new Promise((resolve,reject) => {
      const requestId=uid();
      const timer=setTimeout(()=>{parentRequests.delete(requestId);reject(new Error('The Job Reports page did not respond. Close and reopen the report builder.'));},25000);
      parentRequests.set(requestId,{resolve,reject,timer});
      window.parent.postMessage({type:'cores-report-request',requestId,resource,jobId},window.location.origin);
    });
  }

  function pdfPreviewURL(dataURI) {
    const bytes = Uint8Array.from(atob(dataURI.split(',')[1]), char => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    previewURLs.push(url);
    return url;
  }

  try {
    const saved = await readDraft(STORE_KEY);
    if (saved !== null && saved !== undefined) {
      // Never start empty over a draft this version cannot read: the first autosave would replace it.
      if (saved.version !== 1 || !Array.isArray(saved.blocks)) throw new Error('Unsupported draft');
      state = { version: 1, blocks: saved.blocks.filter(block => block && typeof block.id === 'string' && ['text', 'media', 'break'].includes(block.type)).map(block => {
        if (block.type === 'text') return { id: block.id, type: 'text', title: String(block.title === 'What Was Done — whole job' ? 'Job Summary' : block.title || ''), sourceLabel:String(block.sourceLabel||''), html: cleanHTML(block.html), sourceIds: Array.isArray(block.sourceIds) ? block.sourceIds.filter(id => typeof id==='string' && id.length<=100) : [] };
        if (block.type === 'media') return { id: block.id, type: 'media', title: String(block.title || ''), sourceLabel:String(block.sourceLabel||''), layout: imageLayout(block.layout), items: (Array.isArray(block.items) ? block.items : []).filter(item => item && safeURL(item.url)).map(item => ({ id: String(item.id || uid()), kind: ['image', 'pdf', 'attachment'].includes(item.kind) ? item.kind : 'attachment', name: String(item.name || 'Attachment'), url: item.url, caption: String(item.caption || ''), edit:normalizeImageEdit(item.edit) })) };
        return { id: block.id, type: 'break' };
      }) };
      state.cover=migrateReportCover(saved.cover||{},COVER_DEFAULTS);
      if(saved.coverPhoto&&safeURL(saved.coverPhoto.url))state.coverPhoto={id:String(saved.coverPhoto.id||uid()),kind:'image',name:String(saved.coverPhoto.name||'Vessel photograph'),url:saved.coverPhoto.url,caption:String(saved.coverPhoto.caption||'Vessel photograph'),edit:normalizeImageEdit(saved.coverPhoto.edit)};
      state.coverArchive=saved.coverArchive||saved.cover||{};
      state.visitDateManual=saved.visitDateManual||{start:!!(saved.cover?.visitStart||saved.cover?.arrivalDate),end:!!saved.cover?.visitEnd};
      state.participantsManual=saved.participantsManual??!!saved.cover?.participants;
      state.coverEdited=Object.fromEntries(Object.keys(COVER_DEFAULTS).filter(key=>saved.coverEdited?.[key]===true).map(key=>[key,true]));
      if (typeof saved.project?.id === 'string' && /^[a-f0-9-]{36}$/i.test(saved.project.id)) state.project = {id:saved.project.id, engineIds:Array.isArray(saved.project.engineIds) ? saved.project.engineIds.slice(0,2).map(id => typeof id === 'string' ? id : '') : []};
      selectedId = state.blocks[0]?.id || null;
      $('#save-state').textContent = 'Saved in this browser';
    }
  } catch {
    draftReadFailed=true;
    $('#save-state').textContent='Saved draft unavailable';
    toast('The saved draft could not be read. Keep this page open and reload before editing; existing drafts have not been replaced.');
  }

  function toast(message) {
    clearTimeout(toastTimer);
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4000);
  }
  async function saveDraft(explicit = false) {
    clearTimeout(saveTimer);
    if(embedded&&fixedProjectNumber)state.cover.projectNo=fixedProjectNumber;
    const version=saveVersion;
    const attempt=++saveAttempt;
    pendingSaves++;
    $('#save-state').textContent='Saving…';
    try {
      if(draftReadFailed)throw new Error('Read failed');
      await writeDraft(STORE_KEY,state);
      if(attempt===saveAttempt)$('#save-state').textContent=version===saveVersion?'Saved in this browser':'Unsaved changes';
      lastSaveError='';
      if (explicit) toast('Draft saved in this browser.');
      return true;
    } catch(error) {
      lastSaveError=draftReadFailed?'The saved draft could not be read. Reload before saving so the existing report is not replaced.':draftStorageMessage(error);
      if(attempt===saveAttempt)$('#save-state').textContent = 'Draft not saved';
      toast(lastSaveError);
      return false;
    } finally {pendingSaves--;}
  }
  function changed() {
    saveVersion++;
    $('#save-state').textContent = 'Unsaved changes';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDraft(), 650);
  }
  async function flushForClose(id) {
    const saved=draftReadFailed||await saveDraft();
    window.parent.postMessage({type:'cores-report-flushed',id,jobId:hostJobId,error:saved&&!draftReadFailed?'':(lastSaveError||'The saved draft could not be read, so nothing new was saved.')},window.location.origin);
  }
  async function importSections(request) {
    if(request.jobId!==hostJobId||typeof request.id!=='string')return;
    const reply=error=>window.parent.postMessage({type:'cores-report-imported',id:request.id,jobId:hostJobId,error},window.location.origin);
    if(importedRequests.has(request.id)){reply();return;}
    try {
      if(!Array.isArray(request.sections)||!request.sections.length)throw new Error('There was nothing to add to the report.');
      const blocks=request.sections.map(section=>{
        const common={id:uid(),title:String(section.title||'New section').slice(0,180),sourceLabel:String(section.sourceLabel||'From Job Reports').slice(0,80)};
        if(section.type==='text')return {...common,type:'text',html:cleanHTML(section.html),sourceIds:Array.isArray(section.sourceIds)?section.sourceIds.filter(id=>typeof id==='string'&&id.length<=100):[]};
        if(section.type!=='media'||!Array.isArray(section.items)||!section.items.length||section.items.some(item=>item.kind!=='image'||!safeURL(item.url)||VIDEO_FILE.test(item.url)))throw new Error('A selected photograph could not be imported. Videos can’t go in a printed report.');
        return {...common,type:'media',layout:'quarter',items:section.items.map(item=>({id:uid(),kind:'image',name:String(item.name||'Job photograph'),url:item.url,caption:String(item.caption||'')}))};
      });
      const previous=state.blocks;
      state.blocks=[...previous,...blocks];
      if(!await saveDraft()){state.blocks=previous;throw new Error(lastSaveError);}
      importedRequests.add(request.id);
      selectedId=blocks[0].id;
      if(previewing)setPreview(false);
      showPage('body');render();selectBlock(selectedId,true);
      toast('Added to the report. Headings, text, table cells and captions can be edited.');
      reply();
    }catch(error){reply(error.message||'The sections could not be added.');}
  }
  function coverDisplayValue(key) {
    const value = state.cover[key] || '';
    if ((key === 'visitStart' || key === 'visitEnd') && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-');
      const name = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1];
      return name ? `${Number(day)} ${name} ${year}` : value;
    }
    return value;
  }
  function updateCoverOutputs() {
    $$('[data-cover-output]').forEach(el => { el.textContent = coverDisplayValue(el.dataset.coverOutput) || '-'; });
    $$('[data-cover-inline]').forEach(el => { el.textContent = state.cover[el.dataset.coverInline] || '-'; });
    $('#reason-character-count').textContent = state.cover.serviceReason.length;
    $('.body-heading p').textContent=[state.cover.plantVessel,[state.cover.visitStart,state.cover.visitEnd].filter(Boolean).join(' – ')].filter(Boolean).join(' · ');
  }
  function renderCoverPhoto() {
    const photo=state.coverPhoto;
    const preview=$('#vessel-photo-preview');
    $('.cover-vessel-hero').classList.toggle('has-photo',!!photo);
    preview.hidden=!photo;
    preview.innerHTML=photo?(editedImageMarkup(photo,photo.edit)||`<img src="${esc(photo.url)}" alt="${esc(state.cover.plantVessel||'Vessel photograph')}">`):'';
    $('#choose-vessel-photo').textContent=photo?'Replace vessel photo':'Add vessel photo (optional)';
    $('#edit-vessel-photo').hidden=!photo;
    $('#remove-vessel-photo').hidden=!photo;
  }
  function syncCoverInputs() {
    $$('[data-cover]').forEach(el => { el.value = state.cover[el.dataset.cover] || ''; });
    updateCoverOutputs();
    renderCoverPhoto();
  }
  async function readJSON(path) {
    if (embedded) {
      let result;
      {
        const match=path.match(/^\/api\/jobs\/([a-f0-9-]{36})(\/notes)?$/i);
        if (!match) throw new Error('Unsupported report data request.');
        result=await requestParent(match[2]?'notes':'job',match[1]);
      }
      if (result?.environment!=='dev') throw new Error('The report source is not the expected dev database.');
      return result;
    }
    const response = await fetch(path,{cache:'no-store',signal:AbortSignal.timeout(25000)});
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.error || 'The dev project records could not be read.');
    if (value.environment !== 'dev') throw new Error('The project source is not the expected dev database.');
    return value;
  }
  function applyReportContext(context) {
    if(!embedded||context.jobId!==hostJobId)return;
    const before=JSON.stringify({cover:state.cover,manual:state.visitDateManual});
    fixedProjectNumber=String(context.number||'');
    reportContext={range:context.range||{start:'',end:''},participants:Array.isArray(context.participants)?context.participants:[]};
    state.cover.projectNo=fixedProjectNumber;
    state.cover=visitDefaults(state.cover,reportContext.range,state.visitDateManual);
    if(!state.participantsManual)state.cover.participants=reportContext.participants.join(', ');
    $('#job-source-status').textContent=`Job ${fixedProjectNumber||'—'} · fixed for this report`;
    $('#visit-date-help').textContent=reportContext.range.start||reportContext.range.end?`Work dates on this report: ${reportContext.range.start||'—'} to ${reportContext.range.end||'—'}. Dates can be adjusted for this visit.`:'No work dates are recorded yet. Enter the visit dates.';
    syncCoverInputs();
    if(before!==JSON.stringify({cover:state.cover,manual:state.visitDateManual}))changed();
  }
  function renderEngineChoices() {
    const choices=currentJobDetail?.engines||[];
    const select=$('[data-engine-slot="0"]');
    const related=jobEngines(currentJobDetail);
    // A saved choice outside this job stays visible so an earlier report is not silently changed.
    const earlier=choices.filter(engine=>engine.id===state.project?.engineIds?.[0]&&!related.includes(engine));
    const options=list=>list.map(engine=>`<option value="${esc(engine.id)}">${esc([engine.vessel,engine.side,engineModel(engine),engine.serial&&`S/N ${engine.serial}`,engine.role,engine.retired&&'retired'].filter(Boolean).join(' · ')||'Engine record')}</option>`).join('');
    select.innerHTML='<option value="">Enter details manually</option>'+options(related)+(earlier.length?`<optgroup label="Chosen earlier, not on this job">${options(earlier)}</optgroup>`:'');
    select.value=state.project?.engineIds?.[0]||'';
    select.disabled=!related.length&&!earlier.length;
    $('#engine-source-note').textContent=related.length?'Choose the engine for this report. Recorded model/type, serial number, manufacturer and Main/Auxiliary duty fill below.':'No engines are recorded for this job’s vessel. Enter the details below.';
  }
  async function loadProject() {
    const id=embedded?hostJobId:state.project?.id;
    renderEngineChoices();
    if(!id)return;
    const request=++jobRequestVersion;
    $('#retry-project-jobs').hidden=true;
    $('#job-fill-note').hidden=false;
    $('#job-fill-note').textContent='Loading job and engine records…';
    try {
      const detail=await readJSON(`/api/jobs/${encodeURIComponent(id)}`);
      if(request!==jobRequestVersion)return;
      if(detail.job?.id!==id)throw new Error('The job details do not match this report.');
      currentJobDetail=detail;
      fixedProjectNumber=String(detail.job.number||fixedProjectNumber);
      const previous=JSON.stringify({cover:state.cover,project:state.project});
      const filled=fillFromJob(state.cover,detail,state.project?.id===id?state.project.engineIds:undefined,state.coverEdited);
      state.cover=filled.cover;state.project={id,engineIds:filled.engineIds};
      if(previous!==JSON.stringify({cover:state.cover,project:state.project}))changed();
      state.cover.projectNo=fixedProjectNumber;
      if(embedded)applyReportContext({jobId:hostJobId,number:fixedProjectNumber,...reportContext});
      syncCoverInputs();renderEngineChoices();
      $('#job-fill-note').textContent=['Job details loaded. Existing report edits are kept.',...(detail.warnings||[])].join(' ');
    }catch(error){
      if(request!==jobRequestVersion)return;
      $('#job-fill-note').textContent=`${error.message} Existing report details are kept.`;
      $('#retry-project-jobs').hidden=false;
    }
  }
  function makeBlock(type) {
    if (type === 'text') return { id: uid(), type: 'text', title: 'New section', html: '', sourceIds: [] };
    if (type === 'media') return { id: uid(), type: 'media', title: 'Images & descriptions', layout: 'quarter', items: [] };
    return { id: uid(), type: 'break' };
  }
  function showPage(page) {
    currentPage = page;
    document.body.classList.toggle('cover-visible', page === 'cover');
    $('#cover-page').hidden = page !== 'cover' && !previewing;
    $('#show-cover').classList.toggle('active', page === 'cover');
    $('#show-body').classList.toggle('active', page === 'body');
    $('#canvas-label').textContent = previewing ? 'REPORT PREVIEW' : page === 'cover' ? 'OPENING PAGE · FIXED LAYOUT' : 'REPORT BODY';
  }
  function selectBlock(id, scroll = false) {
    selectedId = id;
    $$('.report-block,.report-image-card').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
    $$('.outline-row[data-id]').forEach(el => el.classList.toggle('active', el.dataset.id === id));
    const block = state.blocks.find(b => b.id === id);
    $('#format-hint').textContent = block?.type === 'text' ? 'Select text to format it' : 'Click text to format it';
    if (scroll) $(`.report-block[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const actionButton = (action, label, symbol, extra = '') => `<button class="icon-button ${extra}" data-action="${action}" title="${label}" aria-label="${label}">${icon(symbol)}</button>`;
  function blockActions(block, index) {
    return `<div class="block-topline screen-only"><button class="icon-button grip" draggable="true" data-drag-id="${block.id}" title="Drag to move component" aria-label="Drag to move component">${icon('grip')}</button><span class="block-tag">${block.type === 'text' ? 'TEXT BOX' : block.type === 'media' ? 'IMAGES & FILES' : 'PAGE BREAK'}</span>${block.sourceLabel || block.sourceIds?.length ? `<span class="source-badge">${esc(block.sourceLabel || (embedded?'From timesheets':'From sample timesheets'))}</span>` : ''}<div class="block-actions"><button class="icon-button" data-action="up" title="Move component up" aria-label="Move component up" ${index === 0 ? 'disabled' : ''}>${icon('up')}</button><button class="icon-button" data-action="down" title="Move component down" aria-label="Move component down" ${index === state.blocks.length - 1 ? 'disabled' : ''}>${icon('down')}</button>${actionButton('duplicate', 'Duplicate component', 'copy')}${actionButton('remove', 'Remove component', 'trash', 'danger')}</div></div>`;
  }
  function mediaItem(item) {
    let preview;
    if (item.kind === 'image') preview = editedImageMarkup(item,item.edit) || `<img src="${esc(item.url)}" alt="${esc(item.caption || item.name)}">`;
    else if (item.kind === 'pdf') preview = `<iframe src="${esc(pdfPreviewURL(item.url))}#toolbar=0&navpanes=0&view=FitH" title="PDF preview: ${esc(item.name)}"></iframe><span class="attachment-print-label">PDF attachment<br>${esc(item.name)}</span>`;
    else preview = `<div class="file-preview">${icon('document')}<strong>${esc(item.name)}</strong><span>Attached file · open to view</span></div>`;
    return `<figure class="media-figure" data-item-id="${item.id}"><div class="media-frame">${preview}</div><textarea class="media-caption" aria-label="Description for ${esc(item.name)}" placeholder="Add a description for this image or file…" rows="2">${esc(item.caption)}</textarea><div class="media-caption-print">${esc(item.caption)}</div><div class="media-item-actions screen-only"><span title="${esc(item.name)}">${esc(item.name)}</span>${item.kind === 'image' ? `<button class="small-text-button" data-edit-image="${esc(item.id)}" aria-label="Edit image ${esc(item.name)}">Edit image</button>` : ''}<a href="${esc(item.url)}" target="_blank" rel="noopener" download="${esc(item.name)}">Open original</a><button class="icon-button danger" data-remove-item="${item.id}" title="Remove file" aria-label="Remove ${esc(item.name)}">${icon('close')}</button></div></figure>`;
  }
  function renderBlock(block, index) {
    const top = blockActions(block, index);
    if (block.type === 'break') return `<section class="report-block pagebreak-block ${block.id === selectedId ? 'selected' : ''}" data-id="${block.id}" aria-label="Page break component">${top}</section>`;
    const title = `<input class="block-title" aria-label="Section heading" value="${esc(block.title)}" placeholder="Section heading">`;
    if (block.type === 'text') return `<section class="report-block ${block.id === selectedId ? 'selected' : ''}" data-id="${block.id}" aria-label="Text component: ${esc(block.title)}">${top}${title}<div class="richtext" contenteditable="${!previewing}" role="textbox" aria-label="Section text" aria-multiline="true" data-placeholder="Type your text, or pull notes from timesheets…">${cleanHTML(block.html)}</div><div class="block-bottomline screen-only"><button class="small-text-button" data-action="import">${icon('clock')}Add timesheet notes</button></div></section>`;
    const layout=imageLayout(block.layout);
    const spec=IMAGE_LAYOUTS[layout];
    const pages=imagePages(block.items,layout);
    const upload = block.items.length ? pages.map((items,index)=>`<div class="image-sheet layout-${layout}" data-image-page="${index+1}"><div class="image-sheet-letterhead"><strong>Cores Worldwide Inc.</strong><span>PROJECT <span data-cover-inline="projectNo">${esc(state.cover.projectNo||'—')}</span></span></div><div class="image-sheet-heading"><strong>${esc(block.title||'Supporting images')}</strong><span>${spec.label} · ${index+1} of ${pages.length}</span></div><div class="image-sheet-grid">${items.map(mediaItem).join('')}</div></div>`).join('')+`<div class="upload-more screen-only"><button class="small-text-button" data-action="upload">${icon('plus')}Add images or files</button><span>Every file has its own description</span></div>` : `<div class="upload-zone screen-only" data-upload-drop="${block.id}">${icon('photo')}<strong>Drop images, PDFs or files here</strong><span>Each one gets its own description below.</span><button class="button secondary" data-action="upload">Choose files</button><small>Mockup limit: 4 MB per file · Files stay in this browser</small></div>`;
    return `<section class="report-block media-block ${block.id === selectedId ? 'selected' : ''}" data-id="${block.id}" aria-label="Media component: ${esc(block.title)}">${top}${title}<div class="media-settings screen-only"><label>Image size <select aria-label="Image size">${Object.entries(IMAGE_LAYOUTS).map(([value,option])=>`<option value="${value}" ${layout===value?'selected':''}>${option.label} — ${option.count} per page</option>`).join('')}</select></label><span class="quiet">Captions sit below each image. Pictures keep their proportions.</span></div>${upload}</section>`;
  }
  function renderOutline() {
    $('#report-outline').innerHTML = `<button class="outline-row outline-fixed" data-show-cover="true">${icon('document')}<span>Opening page</span>${icon('lock')}</button>${state.blocks.map(block => `<button class="outline-row ${block.id === selectedId ? 'active' : ''}" data-id="${block.id}">${block.type === 'media' ? icon('photo') : block.type === 'break' ? '<span>↵</span>' : '<span>Aa</span>'}<span>${esc(block.title || (block.type === 'break' ? 'Page break' : 'Untitled section'))}</span></button>`).join('')}`;
  }
  function renderQuarterPages(entries) {
    const cards=entries.flatMap(({block,index})=>block.items.map((item,itemIndex)=>({block,index,item,first:itemIndex===0})));
    const pages=imagePages(cards,'quarter');
    return pages.map((page,pageIndex)=>`<div class="image-sheet layout-quarter quarter-shared-sheet" data-image-page="${pageIndex+1}"><div class="image-sheet-letterhead"><strong>Cores Worldwide Inc.</strong><span>PROJECT <span data-cover-inline="projectNo">${esc(state.cover.projectNo||'—')}</span></span></div><div class="image-sheet-heading"><strong>Supporting photographs</strong><span>Quarter page · ${pageIndex+1} of ${pages.length}</span></div><div class="image-sheet-grid">${page.map(({block,index,item,first})=>`<section class="${first?'report-block':'report-image-card'} media-block quarter-card ${block.id===selectedId?'selected':''}" data-id="${esc(block.id)}" aria-label="Quarter-page image: ${esc(item.name)}">${first?`<div class="drop-slot screen-only" data-drop-index="${index}"></div>${blockActions(block,index)}<input class="block-title" aria-label="Section heading" value="${esc(block.title)}" placeholder="Section heading"><div class="media-settings screen-only"><label>Image size <select aria-label="Image size">${Object.entries(IMAGE_LAYOUTS).map(([value,option])=>`<option value="${value}" ${value==='quarter'?'selected':''}>${option.label}</option>`).join('')}</select></label></div>`:`<div class="quarter-continuation-heading">${esc(block.title||'Supporting image')}</div>`}${mediaItem(item)}${first?`<div class="upload-more screen-only"><button class="small-text-button" data-action="upload">${icon('plus')}Add images or files</button></div>`:''}</section>`).join('')}</div></div>`).join('');
  }
  function render() {
    previewURLs.forEach(url => URL.revokeObjectURL(url));
    previewURLs = [];
    activeEditor = null;
    savedRange = null;
    let html = '<div class="drop-slot screen-only" data-drop-index="0"></div>';
    reportGroups(state.blocks).forEach(group=>{
      if(group.kind==='quarters'){
        html+=renderQuarterPages(group.entries)+`<div class="drop-slot screen-only" data-drop-index="${group.entries.at(-1).index+1}"></div>`;
      }else html+=renderBlock(group.block,group.index)+`<div class="drop-slot screen-only" data-drop-index="${group.index+1}"></div>`;
    });
    if (!state.blocks.length) html += '<div class="empty-state"><strong>Your report starts here.</strong><p>Add a text box, or drop in images and files.<br>The template takes care of the formatting.</p></div>';
    $('#report-blocks').innerHTML = html;
    $('#body-page').classList.toggle('starts-with-media',state.blocks[0]?.type==='media'&&!!state.blocks[0].items.length);
    $('#body-page').classList.toggle('ends-with-media',state.blocks.at(-1)?.type==='media'&&!!state.blocks.at(-1).items.length);
    $('#component-count').textContent = `${state.blocks.length} component${state.blocks.length === 1 ? '' : 's'}`;
    renderOutline();
    syncCoverInputs();
    $$('textarea.media-caption').forEach(sizeCaption);
    applyPreviewInputs();
  }
  function addComponent(type, index = state.blocks.length) {
    if (previewing) setPreview(false);
    showPage('body');
    const block = makeBlock(type);
    state.blocks.splice(index, 0, block);
    selectedId = block.id;
    render();
    changed();
    requestAnimationFrame(() => {
      const el = $(`.report-block[data-id="${block.id}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (type === 'text') $('.richtext', el)?.focus({ preventScroll: true });
    });
    return block;
  }
  function moveBlock(id, to) {
    const from = state.blocks.findIndex(b => b.id === id);
    if (from < 0) return;
    const [block] = state.blocks.splice(from, 1);
    state.blocks.splice(Math.max(0, Math.min(to, state.blocks.length)), 0, block);
    render();
    changed();
    selectBlock(id, true);
  }
  function applyPreviewInputs() {
    $$('.block-title').forEach(el => el.readOnly = previewing);
    $$('.richtext').forEach(el => el.contentEditable = String(!previewing));
    $$('.media-caption').forEach(el => el.readOnly = previewing);
    $$('[data-cover]').forEach(el => el.readOnly = el.dataset.cover==='projectNo'||previewing);
  }
  function setPreview(value) {
    previewing = value;
    document.body.classList.toggle('previewing', value);
    $('#toggle-preview').innerHTML = `${icon(value ? 'document' : 'eye')}<span>${value ? 'Back to editing' : 'Preview'}</span>`;
    showPage(currentPage);
    applyPreviewInputs();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function openNotes(target = selectedId) {
    const block = state.blocks.find(b => b.id === target);
    importTarget = block?.type === 'text' ? target : null;
    $('#timesheet-list').innerHTML='<div class="job-no-results">Loading work notes…</div>';
    updateSelectedNotes();
    $('#timesheet-dialog').showModal();
    if (embedded) {
      $('#timesheet-dialog .eyebrow').textContent=`PROJECT ${state.cover.projectNo}`;
      $('#timesheet-dialog .source-note').textContent='Work notes from this job’s timesheets. Report edits leave the original entries unchanged.';
      try { availableNotes=(await readJSON(`/api/jobs/${hostJobId}/notes`)).notes || []; }
      catch(error) { $('#timesheet-list').innerHTML=`<div class="job-no-results">${esc(error.message)}</div>`; return; }
    }
    $('#timesheet-list').innerHTML = availableNotes.length ? availableNotes.map(note => `<label class="note-option"><input type="checkbox" value="${esc(note.id)}"><span><strong>${esc(note.date)}</strong><p>${esc(note.text)}</p></span></label>`).join('') : '<div class="job-no-results">No written work notes are recorded for this job yet.</div>';
  }
  function updateSelectedNotes() {
    const count = $$('#timesheet-list input:checked').length;
    $('#selected-notes-count').textContent = `${count} note${count === 1 ? '' : 's'} selected`;
    $('#insert-notes').disabled = count === 0;
  }
  function insertNotes() {
    const ids = $$('#timesheet-list input:checked').map(input => input.value);
    const notes = availableNotes.filter(note => ids.includes(note.id));
    if (!notes.length) return;
    let block = state.blocks.find(b => b.id === importTarget && b.type === 'text');
    if (!block) {
      block = makeBlock('text');
      block.title = 'Work performed';
      state.blocks.push(block);
    }
    const style = $('input[name="import-style"]:checked').value;
    const html = style === 'bullets' ? `<ul>${notes.map(note => `<li>${esc(note.text)}</li>`).join('')}</ul>` : notes.map(note => `<p>${esc(note.text)}</p>`).join('');
    block.html = cleanHTML(block.html + html);
    block.sourceIds = [...new Set([...(block.sourceIds || []), ...ids])];
    selectedId = block.id;
    $('#timesheet-dialog').close();
    if (previewing) setPreview(false);
    showPage('body');
    render();
    changed();
    selectBlock(block.id, true);
    toast(`${notes.length}${embedded?'':' sample'} note${notes.length === 1 ? '' : 's'} added. You can edit the text.`);
  }
  function sizeCaption(el) {
    el.style.height = 'auto';
    el.style.height = `${Math.max(40, el.scrollHeight)}px`;
  }
  function openFilePicker(id) {
    pendingFileBlock = id;
    $('#file-picker').value = '';
    $('#file-picker').click();
  }
  async function addFiles(id, fileList) {
    const block = state.blocks.find(b => b.id === id && b.type === 'media');
    if (!block) return;
    let added = 0;
    for (const file of [...fileList]) {
      if (file.size > MAX_FILE_BYTES) { toast(`${file.name} exceeds the mockup’s 4 MB limit.`); continue; }
      const kind = file.type.startsWith('image/') && !/svg/i.test(file.type) ? 'image' : (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) ? 'pdf' : 'attachment';
      try {
        const raw = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
        const type = kind === 'pdf' ? 'application/pdf' : kind === 'image' ? file.type : 'application/octet-stream';
        const url = String(raw).replace(/^data:[^;]*;base64,/, `data:${type};base64,`);
        if (!safeURL(url)) { toast(`That image format cannot be previewed in this mockup: ${file.name}`); continue; }
        block.items.push({ id: uid(), kind, name: file.name, url, caption: '' });
        added++;
      } catch { toast(`Could not open ${file.name}. Try another file.`); }
    }
    if (added) {
      selectedId = block.id;
      render();
      changed();
      toast(`${added} file${added === 1 ? '' : 's'} added. Add a description below each one.`);
    }
  }
  function rememberSelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const node = selection.anchorNode?.nodeType === 1 ? selection.anchorNode : selection.anchorNode?.parentElement;
    const editor = node?.closest?.('.richtext');
    if (editor) { activeEditor = editor; savedRange = selection.getRangeAt(0).cloneRange(); }
  }
  function format(command) {
    if (previewing || currentPage === 'cover') return;
    if (!activeEditor || !document.contains(activeEditor)) activeEditor = $(`.report-block[data-id="${CSS.escape(selectedId || '')}"] .richtext`);
    if (!activeEditor) { toast('Click inside a text box first.'); return; }
    activeEditor.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (savedRange && document.contains(savedRange.startContainer) && activeEditor.contains(savedRange.commonAncestorContainer)) { selection.removeAllRanges(); selection.addRange(savedRange); }
    document.execCommand(command, false, null);
    const block = state.blocks.find(b => b.id === activeEditor.closest('.report-block').dataset.id);
    if (block) block.html = cleanHTML(activeEditor.innerHTML);
    changed();
    rememberSelection();
  }

  $('#show-cover').addEventListener('click', () => { if (previewing) setPreview(false); showPage('cover'); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('#cover-page').addEventListener('input', event => {
    if (event.target.hasAttribute('data-job-lookup')) return;
    const key = event.target.dataset.cover;
    if (!Object.hasOwn(COVER_DEFAULTS, key)||key==='projectNo') return;
    if(key==='visitStart'||key==='visitEnd')state.visitDateManual={...state.visitDateManual,[key==='visitStart'?'start':'end']:true};
    if(key==='participants')state.participantsManual=true;
    state.coverEdited={...state.coverEdited,[key]:true};
    state.cover[key] = event.target.value;
    updateCoverOutputs();
    changed();
  });
  $('#retry-project-jobs').addEventListener('click',loadProject);
  $('#engine-source-controls').addEventListener('change',event=>{
    if(!event.target.matches('[data-engine-slot]')||!currentJobDetail)return;
    const id=event.target.value;
    state.project={id:embedded?hostJobId:currentJobDetail.job.id,engineIds:id?[id]:[]};
    Object.assign(state.cover,engineFields(currentJobDetail,[id]));
    state.coverEdited=Object.fromEntries(Object.entries(state.coverEdited||{}).filter(([key])=>!ENGINE_COVER_FIELDS.includes(key)));
    syncCoverInputs();changed();
  });
  $('#use-report-visit-dates').addEventListener('click',()=>{
    state.visitDateManual={start:false,end:false};
    state.cover=visitDefaults(state.cover,reportContext.range,state.visitDateManual);
    syncCoverInputs();changed();
  });
  $('#show-body').addEventListener('click', () => { if (previewing) setPreview(false); showPage('body'); });
  $('#toggle-preview').addEventListener('click', () => setPreview(!previewing));
  $('#save-draft').addEventListener('click', () => saveDraft(true));
  $('#print-report').addEventListener('click', async () => {
    if(!await saveDraft())return;
    toast('Choose “Save as PDF” in the print window. PDFs are listed as attachments in this mockup.');
    setTimeout(() => window.print(), 100);
  });
  $('#reset-demo').addEventListener('click', () => {
    if (embedded) return; // A real job's draft is never reset from the sample control.
    if (!window.confirm('Replace this browser’s sample draft with the original demo?')) return;
    clearTimeout(saveTimer);
    state = sampleState();
    currentJobDetail = null;
    jobRequestVersion++;
    $('#job-fill-note').hidden = true;
    renderEngineChoices();
    selectedId = state.blocks[0]?.id || null;
    if (previewing) setPreview(false);
    showPage('body');
    render();
    saveDraft();
    toast('Sample report restored.');
  });
  $$('.component-card').forEach(card => {
    card.addEventListener('click', () => addComponent(card.dataset.component));
    card.addEventListener('dragstart', event => { dragging = { type: card.dataset.component }; event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/x-cores-component', card.dataset.component); $$('.drop-slot').forEach(el => el.classList.add('drag-active')); });
  });
  $('#add-at-end').addEventListener('click', () => $('#add-dialog').showModal());
  $$('[data-add]').forEach(button => button.addEventListener('click', () => { $('#add-dialog').close(); addComponent(button.dataset.add); }));
  $$('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog && dialog.dataset.saving!=='true') { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } }));
  $('#open-timesheets').addEventListener('click', () => openNotes());
  $('#timesheet-list').addEventListener('change', updateSelectedNotes);
  $('#insert-notes').addEventListener('click', insertNotes);
  $('#file-picker').addEventListener('change', event => { if (pendingFileBlock) addFiles(pendingFileBlock, event.target.files); });
  $('#report-outline').addEventListener('click', event => { const row = event.target.closest('.outline-row'); if (!row) return; if (previewing) setPreview(false); if (row.dataset.showCover) showPage('cover'); else { showPage('body'); selectBlock(row.dataset.id, true); } });
  const openImageEditor=createImageEditor($('#image-editor-dialog'));
  $('#choose-vessel-photo').addEventListener('click',()=>{$('#vessel-photo-picker').value='';$('#vessel-photo-picker').click();});
  $('#vessel-photo-picker').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    if(file.size>MAX_FILE_BYTES){toast('The vessel photo exceeds the 4 MB per-file limit.');return;}
    if(!/^image\/(png|jpeg|webp|gif|avif)$/i.test(file.type)){toast('Choose a PNG, JPG, WebP, GIF or AVIF vessel photo.');return;}
    const button=$('#choose-vessel-photo');button.disabled=true;
    const previous=state.coverPhoto;
    try {
      const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});
      if(!safeURL(url))throw new Error('The vessel photo could not be read.');
      await new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=()=>reject(new Error('This file could not be displayed as an image.'));image.src=url;});
      state.coverPhoto={id:uid(),kind:'image',name:file.name,url,caption:'Vessel photograph',edit:null};
      renderCoverPhoto();
      if(!await saveDraft()){state.coverPhoto=previous;renderCoverPhoto();throw new Error(lastSaveError);}
      toast('Vessel photo saved with this report.');
    }catch(error){toast(error.message||'The vessel photo could not be added.');}
    finally{button.disabled=false;}
  });
  $('#remove-vessel-photo').addEventListener('click',async()=>{
    const previous=state.coverPhoto;state.coverPhoto=null;renderCoverPhoto();
    if(!await saveDraft()){state.coverPhoto=previous;renderCoverPhoto();}
  });
  $('#edit-vessel-photo').addEventListener('click',()=>{
    const photo=state.coverPhoto;if(!photo)return;
    openImageEditor(photo,async edit=>{
      const previous=photo.edit;photo.edit=edit;
      if(!await saveDraft()){photo.edit=previous;throw new Error(lastSaveError);}
      renderCoverPhoto();toast('Vessel photo changes saved.');return true;
    });
  });

  $('#report-blocks').addEventListener('click', event => {
    const el = event.target.closest('.report-block,.report-image-card');
    if (!el) return;
    const id = el.dataset.id;
    selectBlock(id);
    const block = state.blocks.find(b => b.id === id);
    const index = state.blocks.indexOf(block);
    const editButton=event.target.closest('[data-edit-image]');
    if(editButton){
      const item=block.items?.find(item=>item.id===editButton.dataset.editImage&&item.kind==='image');
      if(item)openImageEditor(item,async edit=>{
        const previous=item.edit;
        item.edit=edit;
        if(!await saveDraft()){item.edit=previous;throw new Error(lastSaveError);}
        render();selectBlock(block.id);$(`[data-item-id="${CSS.escape(item.id)}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});toast('Image crop and size saved. The original is unchanged.');return true;
      });
      return;
    }
    const removeItem = event.target.closest('[data-remove-item]');
    if (removeItem) { block.items = block.items.filter(item => item.id !== removeItem.dataset.removeItem); render(); changed(); return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'up' && index > 0) moveBlock(id, index - 1);
    else if (action === 'down' && index < state.blocks.length - 1) moveBlock(id, index + 1);
    else if (action === 'duplicate') { const copy = JSON.parse(JSON.stringify(block)); copy.id = uid(); if (copy.items) copy.items.forEach(item => item.id = uid()); state.blocks.splice(index + 1, 0, copy); selectedId = copy.id; render(); changed(); selectBlock(copy.id, true); toast('Component duplicated.'); }
    else if (action === 'remove') { state.blocks.splice(index, 1); selectedId = state.blocks[Math.min(index, state.blocks.length - 1)]?.id || null; render(); changed(); toast('Component removed.'); }
    else if (action === 'import') openNotes(id);
    else if (action === 'upload') openFilePicker(id);
  });
  $('#report-blocks').addEventListener('focusin', event => {
    const el = event.target.closest('.report-block,.report-image-card');
    if (el) selectBlock(el.dataset.id);
    if (event.target.matches('.richtext')) activeEditor = event.target;
  });
  $('#report-blocks').addEventListener('input', event => {
    const el = event.target.closest('.report-block,.report-image-card');
    if (!el) return;
    const block = state.blocks.find(b => b.id === el.dataset.id);
    if (event.target.matches('.block-title')) { block.title = event.target.value; $$('.image-sheet-heading>strong',el).forEach(heading=>heading.textContent=block.title||'Supporting images'); $$('.quarter-continuation-heading').filter(heading=>heading.closest('[data-id]')?.dataset.id===block.id).forEach(heading=>heading.textContent=block.title||'Supporting image'); renderOutline(); }
    else if (event.target.closest('.richtext')) block.html = cleanHTML(event.target.closest('.richtext').innerHTML);
    else if (event.target.matches('.media-caption')) { const itemId = event.target.closest('[data-item-id]').dataset.itemId; const item = block.items.find(i => i.id === itemId); if (item) item.caption = event.target.value; event.target.nextElementSibling.textContent=event.target.value; sizeCaption(event.target); }
    changed();
  });
  $('#report-blocks').addEventListener('change', event => { if (event.target.matches('select[aria-label="Image size"]')) { const block = state.blocks.find(b => b.id === event.target.closest('.report-block,.report-image-card').dataset.id); block.layout = imageLayout(event.target.value); render(); changed(); } });
  $('#report-blocks').addEventListener('paste', event => {
    if (!event.target.closest('.richtext')) return;
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  document.addEventListener('selectionchange', rememberSelection);
  $$('#format-toolbar [data-format]').forEach(button => { button.addEventListener('mousedown', event => event.preventDefault()); button.addEventListener('click', () => format(button.dataset.format)); });
  $('#report-blocks').addEventListener('dragstart', event => {
    const handle = event.target.closest('[data-drag-id]');
    if (!handle) return;
    dragging = { id: handle.dataset.dragId };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-cores-block', dragging.id);
    $$('.drop-slot').forEach(el => el.classList.add('drag-active'));
  });
  document.addEventListener('dragend', () => { dragging = null; $$('.drag-active,.drop-hover').forEach(el => el.classList.remove('drag-active', 'drop-hover')); });
  $('#report-blocks').addEventListener('dragover', event => {
    const slot = event.target.closest('[data-drop-index]');
    const upload = event.target.closest('[data-upload-drop]');
    if ((slot && dragging) || (upload && event.dataTransfer.types.includes('Files'))) { event.preventDefault(); if (upload) upload.classList.add('drop-hover'); }
  });
  $('#report-blocks').addEventListener('dragleave', event => { const upload = event.target.closest('[data-upload-drop]'); if (upload && !upload.contains(event.relatedTarget)) upload.classList.remove('drop-hover'); });
  $('#report-blocks').addEventListener('drop', event => {
    const upload = event.target.closest('[data-upload-drop]');
    if (upload && event.dataTransfer.files.length) { event.preventDefault(); upload.classList.remove('drop-hover'); addFiles(upload.dataset.uploadDrop, event.dataTransfer.files); return; }
    const slot = event.target.closest('[data-drop-index]');
    if (!slot || !dragging) return;
    event.preventDefault();
    const target = Number(slot.dataset.dropIndex);
    if (dragging.type) addComponent(dragging.type, target);
    else {
      const from = state.blocks.findIndex(block => block.id === dragging.id);
      moveBlock(dragging.id, target > from ? target - 1 : target);
    }
    dragging = null;
    $$('.drop-slot').forEach(el => el.classList.remove('drag-active'));
  });
  window.addEventListener('beforeunload', event => {
    if(pendingSaves||['Draft not saved','Unsaved changes'].includes($('#save-state').textContent)){
      saveDraft();event.preventDefault();event.returnValue='';
    }
  });
  // Closing the builder or leaving the job removes this frame without a beforeunload.
  window.addEventListener('pagehide',()=>{
    if(!draftReadFailed&&(pendingSaves||['Draft not saved','Unsaved changes'].includes($('#save-state').textContent))){
      if(embedded&&fixedProjectNumber)state.cover.projectNo=fixedProjectNumber;
      flushDraft(STORE_KEY,state);
    }
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&$('#save-state').textContent==='Unsaved changes')saveDraft();});
  render();
  showPage('body');
  loadProject();
  if(embedded)window.parent.postMessage({type:'cores-report-ready',jobId:hostJobId},window.location.origin);
})();
