import test from 'node:test';
import assert from 'node:assert/strict';
import {fillFromJob,suggestedEngines,engineFields,migrateReportCover,visitDefaults} from '../docs/mockups/report-builder/job-fields.mjs';
import {validateDevConfig} from './serve-report-builder.mjs';
const base=()=>({catalogue:true,job:{id:'job-a',number:'DEMO-1',status:'open',vesselId:'vessel-a',vessel:'Sample vessel',customer:'Sample customer',description:'Requested inspection',contact:'Contact name'},engines:[],services:[]});
test('the report preview rejects non-dev connections before any request',()=>{
 const c={VITE_DEV_DATABASE:'1',VITE_SUPABASE_URL:'https://giwexoouqxioxkjhoxoe.supabase.co',VITE_SUPABASE_ANON_KEY:'unused-test-value'};
 assert.equal(validateDevConfig(c).url,c.VITE_SUPABASE_URL);
 assert.throws(()=>validateDevConfig({...c,VITE_DEV_DATABASE:'0'}));
 assert.throws(()=>validateDevConfig({...c,VITE_SUPABASE_URL:'https://other.example'}));
});
test('job defaults fill recorded facts while preserving authored content',()=>{
 const result=fillFromJob({writtenBy:'Report author',authorLocation:'Author office',destination:'Chosen port',serviceReason:'Edited reason'},base()).cover;
 assert.equal(result.projectNo,'DEMO-1');assert.equal(result.customerName,'Sample customer');assert.equal(result.plantVessel,'Sample vessel');
 assert.equal(result.writtenBy,'Report author');assert.equal(result.destination,'Chosen port');assert.equal(result.serviceReason,'Edited reason');
 assert.equal(result.requestedBy,undefined); // A contact is not necessarily the requester.
});
test('an engine is never suggested merely because the global catalogue is small',()=>{
 const d=base();d.engines=[{id:'other',vesselId:'another-vessel',model:'Other'}];
 assert.deepEqual(suggestedEngines(d),[]);
 d.services=[{engineId:'other'}];assert.deepEqual(suggestedEngines(d),['other']);
});
test('several engines require selection and closed jobs can use a retired engine',()=>{
 const d=base();d.engines=[{id:'a',vesselId:'vessel-a',retired:true},{id:'b',vesselId:'vessel-a'}];
 assert.deepEqual(suggestedEngines(d),['b']);d.job.status='closed';assert.deepEqual(suggestedEngines(d),[]);
 d.engines.pop();assert.deepEqual(suggestedEngines(d),['a']);
});
test('engine selection fills separate recorded fields and does not infer Auxiliary from Genset',()=>{
 const d=base();d.engines=[{id:'a',manufacturer:'Maker',model:'M1',serial:'S1',role:'Main'},{id:'b',role:'Genset'}];
 assert.deepEqual(engineFields(d,['a']),{engineType:'M1',engineManufacturer:'Maker',engineSerial:'S1',engineRole:'Main'});
 assert.equal(engineFields(d,['b']).engineRole,'');
});
test('old cover values migrate into the new fields without postal, PO or time inputs',()=>{
 const defaults={projectNo:'',writtenBy:'',destination:'',visitStart:'',engineType:'',engineSerial:''};
 const migrated=migrateReportCover({projectNo:'A',writtenBy:'Author',city:'Port',provinceState:'NS',arrivalDate:'2026-10-01',postalZip:'OLD',purchaseOrder:'OLD',arrivalTime:'18:00',engine1Model:'Model',engine1Serial:'Serial'},defaults);
 assert.equal(migrated.destination,'Port, NS');assert.equal(migrated.visitStart,'2026-10-01');assert.equal(migrated.engineType,'Model');
 for(const key of ['postalZip','purchaseOrder','arrivalTime'])assert.equal(key in migrated,false);
});
test('visit defaults follow the report range while manual dates remain intact',()=>{
 const cover={visitStart:'2026-09-01',visitEnd:'2026-09-02'};
 assert.deepEqual(visitDefaults(cover,{start:'2026-10-01',end:'2026-10-09'}),{visitStart:'2026-10-01',visitEnd:'2026-10-09'});
 assert.deepEqual(visitDefaults(cover,{start:'2026-10-01',end:'2026-10-09'},{start:true,end:true}),cover);
});
