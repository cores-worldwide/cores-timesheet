import {supabase} from '../supabaseClient';
import {fetchAll} from './fetchAll';

export const reportBuilderAvailable = import.meta.env.DEV && import.meta.env.VITE_DEV_DATABASE === '1' &&
  import.meta.env.VITE_SUPABASE_URL === 'https://giwexoouqxioxkjhoxoe.supabase.co';
const baseFields='id,job_number,status,description,vessel_id,customer_id';
const summary=row=>({id:row.id,number:row.job_number||'',status:row.status||'',description:row.description||'',vessel:row.vessels?.name||'',customer:row.customers?.name||''});
const assertDev=()=>{if(!reportBuilderAvailable)throw new Error('The report builder preview requires the dev database.');};
const unwrap=({data,error})=>{if(error)throw new Error(error.message);return data;};

export async function readReportJob(id) {
  assertDev();
  const row=unwrap(await supabase.schema('Cores').from('jobs').select(`${baseFields},customers(name,contact_name),vessels(name)`).eq('id',id).single());
  const warnings=[];
  const [engineResult,serviceResult,vesselResult,typeResult]=await Promise.all([
    fetchAll(()=>supabase.schema('Cores').from('engines').select('id,vessel_id,engine_type_id,manufacturer,model,serial_number,side,terminated_date').order('id')),
    fetchAll(()=>supabase.schema('Cores').from('engine_service_log').select('engine_id').eq('work_order_id',row.id)),
    fetchAll(()=>supabase.schema('Cores').from('vessels').select('id,name').order('id')),
    fetchAll(()=>supabase.schema('Cores').from('engine_types').select('id,name').order('id')),
  ]);
  const vessels=new Map((vesselResult.data||[]).map(vessel=>[vessel.id,vessel.name]));
  const types=new Map((typeResult.data||[]).map(type=>[type.id,type.name]));
  if(engineResult.error)warnings.push('Engine records could not be loaded; those details can be entered manually.');
  if(serviceResult.error)warnings.push('Job-to-engine links could not be loaded.');
  return {
    environment:'dev',catalogue:true,job:{...summary(row),vesselId:row.vessel_id||'',contact:row.customers?.contact_name||''},
    engines:(engineResult.data||[]).map(engine=>({id:engine.id,manufacturer:engine.manufacturer||'',model:engine.model||'',serial:engine.serial_number||'',side:engine.side||'',vesselId:engine.vessel_id||'',vessel:vessels.get(engine.vessel_id)||'',role:types.get(engine.engine_type_id)||'',retired:!!engine.terminated_date})),
    services:(serviceResult.data||[]).map(service=>({engineId:service.engine_id})),warnings,
  };
}

export async function readReportNotes(id) {
  assertDev();
  const rows=unwrap(await fetchAll(()=>supabase.schema('Cores').from('timesheet_entries').select('id,work_date,description').eq('job_id',id).order('work_date')));
  return {environment:'dev',notes:rows.filter(row=>row.description?.trim()).map(row=>({id:row.id,date:row.work_date,text:row.description}))};
}
