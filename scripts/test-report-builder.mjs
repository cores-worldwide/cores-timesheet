import test from 'node:test';
import assert from 'node:assert/strict';
import {fillFromJob, suggestedEngines, engineFields} from '../docs/mockups/report-builder/job-fields.mjs';
import {validateDevConfig} from './serve-report-builder.mjs';

const cover = {projectNo:'OLD',writtenBy:'Author role',reportDate:'2026-11-06',plantVessel:'Old vessel',city:'Old city',purchaseOrder:'Old PO',arrivalTime:'18:00',engine1Serial:'OLD-SERIAL',engine1Rpm:'1000',engine2Hp:'2000'};
const base = () => ({job:{id:'job-a',number:'DEMO-1',status:'open',vessel:'Sample vessel',description:'Requested inspection',contact:'Customer representative'},engines:[],services:[]});

test('the report server rejects non-dev connections before any request',() => {
  const config={VITE_DEV_DATABASE:'1',VITE_SUPABASE_URL:'https://giwexoouqxioxkjhoxoe.supabase.co',VITE_SUPABASE_ANON_KEY:'unused-test-value'};
  assert.equal(validateDevConfig(config).url,config.VITE_SUPABASE_URL);
  assert.throws(()=>validateDevConfig({...config,VITE_DEV_DATABASE:'0'}),/Refusing/);
  assert.throws(()=>validateDevConfig({...config,VITE_SUPABASE_URL:'https://another-project.example'}),/Refusing/);
  assert.throws(()=>validateDevConfig({...config,VITE_SUPABASE_URL:'http://giwexoouqxioxkjhoxoe.supabase.co'}),/Refusing/);
  assert.throws(()=>validateDevConfig({...config,VITE_SUPABASE_URL:'https://user@giwexoouqxioxkjhoxoe.supabase.co'}),/Refusing/);
});

test('switching projects clears stale job details and preserves report authorship/date',() => {
  const detail=base();
  const result=fillFromJob(cover,detail).cover;
  assert.equal(result.projectNo,'DEMO-1');
  assert.equal(result.plantVessel,'Sample vessel');
  assert.equal(result.customerContact,'Customer representative');
  assert.equal(result.serviceReason,'Requested inspection');
  for(const key of ['city','purchaseOrder','arrivalTime','engine1Serial','engine1Rpm','engine2Hp']) assert.equal(result[key],'');
  assert.equal(result.writtenBy,cover.writtenBy);
  assert.equal(result.reportDate,cover.reportDate);
  assert.equal(cover.engine1Serial,'OLD-SERIAL');
});

test('work orders, creation dates and power ratings are not substituted for different report fields',() => {
  const detail=base();
  Object.assign(detail.job,{work_order_number:'SAGE-WO',created_at:'2020-01-01'});
  detail.engines=[{id:'engine-a',model:'M1',manufacturer:'Maker',serial:'S1',kw:1000}];
  const result=fillFromJob(cover,detail).cover;
  assert.equal(result.engine1Model,'Maker M1');
  assert.equal(result.engine1Serial,'S1');
  for(const key of ['purchaseOrder','arrivalDate','arrivalTime','engine1Hp','engine1Rpm','engine1Hours']) assert.equal(result[key],'');
});

test('a vessel with several engines requires a choice unless this job identifies the engines',() => {
  const detail=base();
  detail.engines=[{id:'a',model:'A'},{id:'b',model:'B'},{id:'c',model:'C'}];
  assert.deepEqual(suggestedEngines(detail),[]);
  detail.services=[{engineId:'c',hours:0}];
  assert.deepEqual(suggestedEngines(detail),['c']);
  const result=fillFromJob(cover,detail).cover;
  assert.equal(result.engine1Model,'C');
  assert.equal(result.engine1Hours,'0');
  assert.equal(result.engine2Model,'');
});

test('conflicting service-hour readings remain blank instead of choosing an arbitrary reading',() => {
  const detail=base();
  detail.engines=[{id:'a',model:'A'}];
  detail.services=[{engineId:'a',hours:100},{engineId:'a',hours:200}];
  assert.equal(engineFields(detail,['a']).engine1Hours,'');
});

test('closed projects retain historical engine candidates',() => {
  const detail=base();
  detail.engines=[{id:'a',model:'A',retired:true},{id:'b',model:'B',retired:false}];
  assert.deepEqual(suggestedEngines(detail),['b']);
  detail.job.status='closed';
  assert.deepEqual(suggestedEngines(detail),['a','b']);
});

test('long job descriptions are explicitly marked when shortened for the front page',() => {
  const detail=base();
  detail.job.description='A'.repeat(700);
  const result=fillFromJob(cover,detail);
  assert.equal(result.cover.serviceReason.length,600);
  assert.equal(result.descriptionShortened,true);
});
