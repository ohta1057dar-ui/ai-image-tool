// 実reference-store.jsをIndexedDB/画像変換の模擬環境で実行します。
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function database(flags={}) {
 const records=new Map();const metrics={puts:0,deletes:0};
 const db={objectStoreNames:{contains:()=>true},close(){},transaction(name,mode){
  const original=new Map(records),tx={pending:0,aborted:false,finished:false,abort(){this.aborted=true;queueMicrotask(()=>this.onabort?.());}};
  const request=operation=>{const r={};tx.pending++;queueMicrotask(()=>{if(tx.aborted)return;try {r.result=operation();r.onsuccess?.();}catch(error){tx.abort();}tx.pending--;queueMicrotask(()=>{if(!tx.aborted&&!tx.pending&&!tx.finished){tx.finished=true;if(mode==='readwrite'){records.clear();for(const [k,v] of original)records.set(k,v);}tx.oncomplete?.();}});});return r;};
  tx.objectStore=()=>({get:id=>request(()=>original.get(id)),getAll:()=>request(()=>Array.from(original.values())),put:record=>request(()=>{if(flags.writeFail)throw Error('quota');metrics.puts++;original.set(record.id,record);}),delete:id=>request(()=>{metrics.deletes++;original.delete(id);})});return tx;
 }};
 const indexedDB={open(){const request={};queueMicrotask(()=>{if(flags.openFail)request.onerror?.();else {request.result=db;request.onsuccess?.();}});return request;}};
 return {records,metrics,indexedDB};
}
function boot(flags={}) {
 const data=database(flags);let uuid=0;const urls=[];let closes=0;
 const context=vm.createContext({indexedDB:flags.noDB ? undefined:data.indexedDB,Blob,Date,Set,Promise,URL:{createObjectURL:()=> 'blob:original',revokeObjectURL:u=>urls.push(u)},crypto:{randomUUID:()=> 'image-'+(++uuid)},createImageBitmap:async()=>{if(flags.decodeFail)throw Error('decode');return {width:flags.width||2048,height:flags.height||1024,close(){closes++;}};},document:{createElement:()=>({getContext:()=>({drawImage(){}}),toBlob(callback,type){callback(flags.encodeFail&&type==='image/webp'?null:new Blob([new Uint8Array(flags.bytes||500)],{type:flags.fallback ? 'image/png' : type}));}})}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../reference-store.js'),'utf8'),context);
 return {...data,store:context.ReferenceStore,flags,get closes(){return closes;}};
}
let count=0;const test=async(name,fn)=>{await fn();count++;console.log('PASS '+name);};
const file={type:'image/jpeg',size:1000,name:'原本.jpg'};
const oldRecord=(id,bytes=100)=>({id,blob:new Blob([new Uint8Array(bytes)],{type:'image/webp'}),mime:'image/webp',width:100,height:100,createdAt:'2020-01-01T00:00:00Z'});
(async()=>{
await test('縮小：最大辺1024・縦横比維持・小画像を拡大しない',async()=>{const b=boot();const r=await b.store.prepare(file);assert.equal(r.width,1024);assert.equal(r.height,512);assert.equal(r.mime,'image/webp');assert.notEqual(r.blob,file);assert.equal(b.closes,1);const small=boot({width:300,height:200});const a=await small.store.prepare(file);assert.equal(a.width,300);assert.equal(a.height,200);});
await test('PNGフォールバックと変換後2MB上限',async()=>{const b=boot({encodeFail:true});assert.equal((await b.store.prepare(file)).mime,'image/png');const big=boot({bytes:2*1024*1024+1});await assert.rejects(big.store.prepare(file),/2MB/);assert.equal(big.closes,1);});
await test('形式・原本15MB・40MP超過・復号失敗',async()=>{const b=boot();await assert.rejects(b.store.prepare({...file,type:'image/svg+xml'}));await assert.rejects(b.store.prepare({...file,size:16*1024*1024}));await assert.rejects(boot({width:10000,height:10000}).store.prepare(file));await assert.rejects(boot({decodeFail:true}).store.prepare(file));});
await test('IndexedDB登録→取得→欠損取得',async()=>{const b=boot();await b.store.put(oldRecord('a'));assert.equal((await b.store.get('a')).id,'a');assert.equal(await b.store.get('missing'),null);assert.equal(await b.store.get(''),null);});
await test('50MB容量上限：既存画像を破壊せず拒否',async()=>{const b=boot();for(let i=0;i<25;i++)b.records.set('full'+i,oldRecord('full'+i,2*1024*1024));await assert.rejects(b.store.put(oldRecord('extra',1)),/50MB/);assert.equal(b.records.size,25);});
await test('DB利用不可・open失敗・transaction失敗',async()=>{await assert.rejects(boot({noDB:true}).store.get('a'));await assert.rejects(boot({openFail:true}).store.put(oldRecord('a')));const b=boot();await b.store.put(oldRecord('old'));b.flags.writeFail=true;await assert.rejects(b.store.put(oldRecord('new')));assert(b.records.has('old'));assert(!b.records.has('new'));});
await test('共有参照保護と古い孤立画像だけ回収',async()=>{const b=boot();await b.store.put(oldRecord('shared'));await b.store.put(oldRecord('orphan'));const fresh={...oldRecord('fresh'),createdAt:new Date().toISOString()};await b.store.put(fresh);assert.equal(await b.store.collect(()=>new Set(['shared'])),1);assert(b.records.has('shared'));assert(b.records.has('fresh'));assert(!b.records.has('orphan'));});
await test('参照状況を取得できなければ整理を中止',async()=>{const b=boot();await b.store.put(oldRecord('a'));await assert.rejects(b.store.collect(()=>{throw Error('bad metadata');}));assert(b.records.has('a'));});
await test('不正な画像レコードは保存しない',async()=>{const b=boot();for(const mutate of [r=>{r.id='';},r=>{r.width=NaN;},r=>{r.height=2000;},r=>{r.mime='image/png';},r=>{r.createdAt='invalid';}]){const r=oldRecord('x');mutate(r);await assert.rejects(b.store.put(r));}assert.equal(b.records.size,0);});
console.log(`${count} reference-store checks passed (IndexedDB/canvas mocks).`);
})().catch(error=>{console.error(error);process.exitCode=1;});
