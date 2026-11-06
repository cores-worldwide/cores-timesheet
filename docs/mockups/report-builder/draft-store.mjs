// Image-heavy reports exceed localStorage's small quota. Keep complete drafts in
// IndexedDB and read earlier localStorage drafts until their first successful save.
const DATABASE='cores-report-drafts';
const STORE='drafts';
let connection;
let writes=Promise.resolve();
function database() {
  if(!connection)connection=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
    request.onerror=()=>{connection=undefined;reject(request.error);};
    request.onblocked=()=>{connection=undefined;reject(new Error('Report storage is waiting for another browser tab. Close other dev report tabs and retry.'));};
    request.onsuccess=()=>{
      const db=request.result;
      db.onversionchange=()=>{db.close();connection=undefined;};
      resolve(db);
    };
  });
  return connection;
}
async function readRecord(key) {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE,'readonly');
    const request=transaction.objectStore(STORE).get(key);
    transaction.oncomplete=()=>resolve(request.result);
    transaction.onabort=()=>reject(transaction.error||new Error('Report storage could not be read.'));
    transaction.onerror=()=>reject(transaction.error||request.error);
  });
}
export async function readDraft(key) {
  const saved=await readRecord(key);
  if(saved!==undefined)return saved;
  return JSON.parse(localStorage.getItem(key)||'null');
}
export function writeDraft(key,state) {
  // Snapshot before awaiting anything: later edits must not alter a queued save.
  const snapshot=structuredClone(state);
  const pending=writes.catch(()=>{}).then(async()=>{
    const db=await database();
    await new Promise((resolve,reject)=>{
      const transaction=db.transaction(STORE,'readwrite');
      transaction.objectStore(STORE).put(snapshot,key);
      transaction.oncomplete=resolve;
      transaction.onabort=()=>reject(transaction.error||new Error('The report save was interrupted. Your draft is still open; try saving again.'));
      transaction.onerror=()=>reject(transaction.error||new Error('Report storage could not be written.'));
    });
    // Remove only this draft's old copy, after its replacement is committed.
    try{localStorage.removeItem(key);}catch{/* Keeping an older copy is safe. */}
  });
  writes=pending;
  return pending;
}
export function draftStorageMessage(error) {
  if(error?.name==='QuotaExceededError')return 'Browser storage is full. Keep this report open, free device storage and try saving again.';
  if(error?.name==='SecurityError')return 'This browser is blocking report storage. Keep the report open and allow browser storage before retrying.';
  return 'The report could not be saved. Your draft is still open; try saving again before leaving this page.';
}
