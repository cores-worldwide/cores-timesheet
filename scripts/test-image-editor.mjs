import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCrop,normalizeImageEdit,editedImageMarkup} from '../docs/mockups/report-builder/image-editor.mjs';

test('crop bounds retain a visible region entirely inside the source image',()=>{
  assert.deepEqual(normalizeCrop({x:-1,y:2,width:0.5,height:0.25}),{x:0,y:0.75,width:0.5,height:0.25});
  assert.deepEqual(normalizeCrop({x:0.99,y:0.99,width:-2,height:0}),{x:0.97,y:0.97,width:0.03,height:0.03});
  assert.deepEqual(normalizeCrop(null),{x:0,y:0,width:1,height:1});
});
test('missing or invalid saved edit metadata falls back safely',()=>{
  assert.equal(normalizeImageEdit(),null);
  assert.equal(normalizeImageEdit({sourceWidth:0,sourceHeight:10}),null);
  assert.equal(normalizeImageEdit({sourceWidth:Infinity,sourceHeight:10}),null);
  assert.deepEqual(normalizeImageEdit({sourceWidth:400,sourceHeight:200}),{sourceWidth:400,sourceHeight:200,crop:{x:0,y:0,width:1,height:1},scale:100});
});
test('saved crop uses source coordinates, explicit clipping, and escaped image data',()=>{
  const markup=editedImageMarkup({name:'Sample "image"',url:'assets/example.png',caption:'<caption>'},{sourceWidth:400,sourceHeight:200,crop:{x:0.5,y:0,width:0.5,height:1},scale:60});
  assert.match(markup,/viewBox="200 0 200 200"/);
  assert.match(markup,/<clipPath/);
  assert.match(markup,/clip-path="url\(#crop-/);
  assert.match(markup,/--image-scale:60%/);
  assert.match(markup,/aria-label="&lt;caption&gt;"/);
});
test('image scale remains within the report frame without stretching the source',()=>{
  const base={sourceWidth:400,sourceHeight:200};
  assert.equal(normalizeImageEdit({...base,scale:-100}).scale,25);
  assert.equal(normalizeImageEdit({...base,scale:300}).scale,100);
  assert.equal(editedImageMarkup({},null),'');
});
