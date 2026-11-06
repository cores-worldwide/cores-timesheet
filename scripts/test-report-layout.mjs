import test from 'node:test';
import assert from 'node:assert/strict';
import {reportGroups,imagePages} from '../docs/mockups/report-builder/image-layouts.mjs';
const quarter=(id,count=1)=>({id,type:'media',layout:'quarter',items:Array.from({length:count},(_,i)=>({id:`${id}-${i}`}))});
test('quarter-page sections share a run, including sections containing multiple images',()=>{
 const blocks=[quarter('a'),quarter('b',2),quarter('c')];
 const groups=reportGroups(blocks);
 assert.equal(groups.length,1);
 assert.deepEqual(groups[0].entries.map(e=>e.block.id),['a','b','c']);
 assert.equal(imagePages(groups[0].entries.flatMap(e=>e.block.items),'quarter').length,1);
 assert.equal(groups[0].entries[1].block,blocks[1]);
});
test('text, page breaks, other sizes and empty sections preserve document boundaries',()=>{
 for(const barrier of [{type:'text'},{type:'break'},{type:'media',layout:'half',items:[{}]},quarter('empty',0)]){
  const groups=reportGroups([quarter('a'),barrier,quarter('b')]);
  assert.deepEqual(groups.map(g=>g.kind),['quarters','block','quarters']);
  assert.equal(groups[1].block,barrier);
 }
});
test('grouping keeps original section indexes and never changes saved content',()=>{
 const blocks=[{type:'text',html:'Original'},quarter('a'),quarter('b')];
 const before=JSON.stringify(blocks);
 assert.deepEqual(reportGroups(blocks)[1].entries.map(e=>e.index),[1,2]);
 assert.equal(JSON.stringify(blocks),before);
});
