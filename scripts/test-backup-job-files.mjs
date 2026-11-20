import test from 'node:test';
import assert from 'node:assert/strict';
import {planBackup,parseCsv,toCsv} from './backup-job-files.mjs';
const job={job_number:'100',description:'Inspect',customers:{name:'Sample customer'},vessels:{name:'Sample vessel'}};
const row=(over={})=>({storage_path:'j/a.pdf',file_name:'a.pdf',kind:'file',folder:null,size_bytes:5,created_at:'2026-11-01T10:00:00Z',deleted_at:null,jobs:job,...over});
const plan=(over)=>planBackup({rows:[],bucketFiles:[],prevIndex:[],inDrive:new Set(),...over});
test('a new file is laid out by job and folder',()=>{
 const [i]=plan({rows:[row({folder:'con-rods'})],bucketFiles:['j/a.pdf']});
 assert.equal(i.drivePath,'by-job/100 Inspect — Sample customer/con-rods/2026-11-01 a.pdf');assert.equal(i.download,true);assert.equal(i.index.status,'current');
});
test('a file already in Drive is not downloaded again',()=>{
 const drive='by-job/x/a.pdf';
 const [i]=plan({rows:[row()],bucketFiles:['j/a.pdf'],prevIndex:[{bucket_path:'j/a.pdf',drive_path:drive,sha256:'abc'}],inDrive:new Set([drive])});
 assert.equal(i.download,false);assert.equal(i.drivePath,drive);assert.equal(i.index.sha256,'abc');
});
test('a file the office moved keeps its Drive copy and the index shows the new job',()=>{
 const drive='by-job/old job/a.pdf';
 const [i]=plan({rows:[row({jobs:{...job,job_number:'200'}})],bucketFiles:['j/a.pdf'],prevIndex:[{bucket_path:'j/a.pdf',drive_path:drive}],inDrive:new Set([drive])});
 assert.equal(i.drivePath,drive);assert.equal(i.index.job_number,'200');assert.equal(i.download,false);
});
test('a removed file is still backed up and marked',()=>{
 const [i]=plan({rows:[row({deleted_at:'2026-11-02T00:00:00Z'})],bucketFiles:['j/a.pdf']});
 assert.equal(i.download,true);assert.equal(i.index.status,'removed in app');
});
test('two files with the same name do not overwrite each other',()=>{
 const items=plan({rows:[row(),row({storage_path:'j/b.pdf'})],bucketFiles:['j/a.pdf','j/b.pdf']});
 assert.notEqual(items[0].drivePath,items[1].drivePath);assert.match(items[1].drivePath,/a \(2\)\.pdf$/);
});
test('a new file cannot take the path of a copy already in Drive',()=>{
 const taken='by-job/100 Inspect — Sample customer/2026-11-01 a.pdf';
 const [i]=plan({rows:[row({storage_path:'j/new.pdf'})],bucketFiles:['j/new.pdf'],inDrive:new Set([taken])});
 assert.notEqual(i.drivePath,taken);
});
test('a copy missing from Drive is downloaded again to its old path',()=>{
 const [i]=plan({rows:[row()],bucketFiles:['j/a.pdf'],prevIndex:[{bucket_path:'j/a.pdf',drive_path:'by-job/x/a.pdf'}]});
 assert.equal(i.download,true);assert.equal(i.drivePath,'by-job/x/a.pdf');
});
test('a record whose file is gone is flagged, not downloaded',()=>{
 const [i]=plan({rows:[row()],bucketFiles:[]});
 assert.equal(i.download,false);assert.equal(i.index.status,'MISSING FROM BUCKET');
});
test('a bucket file with no record is still backed up',()=>{
 const [i]=plan({bucketFiles:['service-reports/r/photo.jpg']});
 assert.equal(i.download,true);assert.equal(i.drivePath,'_other (no Job Files record)/service-reports/r/photo.jpg');
});
test('an entry gone from the app stays in the index',()=>{
 const items=plan({prevIndex:[{bucket_path:'j/old.pdf',drive_path:'by-job/x/old.pdf',file_name:'old.pdf'}],inDrive:new Set(['by-job/x/old.pdf'])});
 assert.equal(items[0].index.status,'gone from app');assert.equal(items[0].download,false);
});
test('file names cannot climb out of the backup folder',()=>{
 const [i]=plan({rows:[row({file_name:'../../evil.pdf',folder:'../up'})],bucketFiles:['j/a.pdf']});
 assert.ok(!i.drivePath.includes('../'));
});
test('the index survives commas, quotes and line breaks',()=>{
 const rows=[{status:'current',drive_path:'a, "b".pdf',file_name:'line\nbreak',bucket_path:'j/a.pdf'}];
 const [back]=parseCsv(toCsv(rows));
 assert.equal(back.drive_path,'a, "b".pdf');assert.equal(back.file_name,'line\nbreak');
});
