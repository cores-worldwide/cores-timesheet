// Report fields are explicit: locations/requesters are not inferred from vessel/contact names.
const text=value=>typeof value==='string'?value.trim():'';
export function engineModel(engine) {
 const model=text(engine?.model),maker=text(engine?.manufacturer);
 return model&&maker&&!model.toLowerCase().includes(maker.toLowerCase())?`${maker} ${model}`:model;
}
export function suggestedEngines(detail) {
 const engines=detail.engines||[];
 const serviceIds=new Set((detail.services||[]).map(service=>service.engineId));
 const linked=engines.filter(engine=>serviceIds.has(engine.id));
 if(linked.length)return linked.length===1?[linked[0].id]:[];
 const candidates=engines.filter(engine=>(!detail.catalogue||!!detail.job.vesselId&&engine.vesselId===detail.job.vesselId)&&(detail.job.status==='closed'||!engine.retired));
 return candidates.length===1?[candidates[0].id]:[];
}
export function engineFields(detail,engineIds) {
 const engine=(detail.engines||[]).find(candidate=>candidate.id===engineIds[0]);
 return {engineType:text(engine?.model),engineSerial:text(engine?.serial),engineManufacturer:text(engine?.manufacturer),engineRole:['Main','Auxiliary'].includes(engine?.role)?engine.role:''};
}
export function migrateReportCover(saved,defaults) {
 const migrated={...saved,visitStart:saved.visitStart??saved.arrivalDate??'',destination:saved.destination??[saved.city,saved.provinceState].filter(Boolean).join(', '),engineType:saved.engineType??saved.engine1Model??'',engineSerial:saved.engineSerial??saved.engine1Serial??''};
 return Object.fromEntries(Object.entries(defaults).map(([key,fallback])=>[key,typeof migrated[key]==='string'?migrated[key].slice(0,key==='serviceReason'?600:key==='participants'?1200:180):fallback]));
}
export function visitDefaults(cover,range,manual={}) {
 const next={...cover};
 if(!manual.start)next.visitStart=range.start||'';
 if(!manual.end)next.visitEnd=range.end||'';
 return next;
}
export function fillFromJob(cover,detail,engineIds=suggestedEngines(detail),edited={}) {
 const next={...cover,projectNo:text(detail.job.number)};
 for(const [field,value] of Object.entries({customerName:detail.job.customer,plantVessel:detail.job.vessel,serviceReason:text(detail.job.description).slice(0,600)}))if(!next[field]&&!edited[field])next[field]=text(value);
 if(engineIds.length&&!next.engineType&&!next.engineSerial&&!edited.engineType&&!edited.engineSerial)Object.assign(next,engineFields(detail,engineIds));
 return {cover:next,engineIds,descriptionShortened:text(detail.job.description).length>600};
}
