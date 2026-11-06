export const IMAGE_LAYOUTS = {
  full: {label:'Full page',count:1,columns:1,rows:1},
  half: {label:'Half page',count:2,columns:1,rows:2},
  quarter: {label:'Quarter page',count:4,columns:2,rows:2},
};
// Retain the contents of earlier drafts while upgrading their compact layouts.
export const imageLayout = value => value==='one' ? 'half' : value==='two' ? 'quarter' : Object.hasOwn(IMAGE_LAYOUTS,value) ? value : 'quarter';
export function imagePages(items, layout) {
  const {count}=IMAGE_LAYOUTS[imageLayout(layout)];
  return Array.from({length:Math.ceil(items.length/count)},(_,index)=>items.slice(index*count,(index+1)*count));
}
// Adjacent quarter-page sections share page space without merging saved sections.
export function reportGroups(blocks) {
  const groups=[];
  blocks.forEach((block,index)=>{
    if(block.type==='media'&&imageLayout(block.layout)==='quarter'&&block.items?.length){
      if(groups.at(-1)?.kind!=='quarters')groups.push({kind:'quarters',entries:[]});
      groups.at(-1).entries.push({block,index});
    }else groups.push({kind:'block',block,index});
  });
  return groups;
}
