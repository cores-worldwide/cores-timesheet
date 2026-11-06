// Explicit mappings only: a Sage work-order number is not a purchase order.
export const JOB_FIELDS = [
  'plantVessel','city','provinceState','postalZip','purchaseOrder','arrivalDate','arrivalTime','customerContact',
  'engine1Model','engine1Serial','engine1Hours','engine1Rpm','engine1Hp',
  'engine2Model','engine2Serial','engine2Hours','engine2Rpm','engine2Hp','serviceReason',
];
const text = value => typeof value === 'string' ? value.trim() : '';
const stringValue = value => value === 0 || (value !== null && value !== undefined && value !== '') ? String(value) : '';

export function engineModel(engine) {
  const model = text(engine?.model);
  const maker = text(engine?.manufacturer);
  if (!model) return '';
  return maker && !model.toLowerCase().includes(maker.toLowerCase()) ? `${maker} ${model}` : model;
}

export function suggestedEngines(detail) {
  const engines = detail.engines || [];
  const jobEngineIds = new Set((detail.services || []).map(service => service.engineId));
  const linked = engines.filter(engine => jobEngineIds.has(engine.id));
  if (linked.length) return linked.length <= 2 ? linked.map(engine => engine.id) : [];
  const candidates = detail.job.status === 'closed' ? engines : engines.filter(engine => !engine.retired);
  return candidates.length <= 2 ? candidates.map(engine => engine.id) : [];
}

export function engineFields(detail, engineIds) {
  const fields = {};
  for (let index=0; index<2; index++) {
    const prefix = `engine${index+1}`;
    for (const key of ['Model','Serial','Hours','Rpm','Hp']) fields[prefix+key] = '';
    const engine = (detail.engines || []).find(candidate => candidate.id === engineIds[index]);
    if (!engine) continue;
    fields[prefix+'Model'] = engineModel(engine);
    fields[prefix+'Serial'] = text(engine.serial);
    const hours = [...new Set((detail.services || []).filter(service => service.engineId === engine.id).map(service => stringValue(service.hours)).filter(Boolean))];
    if (hours.length === 1) fields[prefix+'Hours'] = hours[0];
  }
  return fields;
}

export function fillFromJob(cover, detail, engineIds = suggestedEngines(detail)) {
  const next = {...cover};
  for (const key of JOB_FIELDS) next[key] = '';
  next.projectNo = text(detail.job.number);
  next.plantVessel = text(detail.job.vessel);
  next.customerContact = text(detail.job.contact);
  next.serviceReason = text(detail.job.description).slice(0,600);
  Object.assign(next,engineFields(detail,engineIds));
  return {cover:next,engineIds,descriptionShortened:text(detail.job.description).length>600};
}
