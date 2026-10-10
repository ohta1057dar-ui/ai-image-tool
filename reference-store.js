"use strict";
// 画像本体はこのIndexedDBだけに保存。ネットワーク通信は行いません。
(() => {
  const DB_NAME="ai-prompt-maker-reference-images", STORE="images";
  const MAX_IMAGE=2*1024*1024, MAX_TOTAL=50*1024*1024, MAX_EDGE=1024;
  let dbPromise;
  let writes=Promise.resolve();
  function open() {
    if(!globalThis.indexedDB) return Promise.reject(new Error("このブラウザでは画像保存を利用できません"));
    if(!dbPromise) dbPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE,{keyPath:"id"});};
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();dbPromise=undefined;};resolve(db);};
      request.onerror=()=>reject(new Error("画像保存を開けませんでした"));
      request.onblocked=()=>reject(new Error("画像保存が他のタブで使用中です。ほかのタブを閉じて再試行してください"));
    }).catch(error=>{dbPromise=undefined;throw error;});
    return dbPromise;
  }
  function serial(operation) {
    const result=writes.then(operation); writes=result.catch(()=>{}); return result;
  }
  async function get(id) {
    if(!id) return null;
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,"readonly"), request=tx.objectStore(STORE).get(id);let result;
      request.onsuccess=()=>{result=request.result || null;};
      tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(new Error("基準画像を読み込めませんでした"));
    });
  }
  function dimensions(width,height) {
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width*height>40000000) throw new Error("画像サイズが大きすぎるか、画像を読み込めません");
    const scale=Math.min(1,MAX_EDGE/Math.max(width,height));
    return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
  }
  async function prepare(file) {
    if(!file || !["image/jpeg","image/png","image/webp"].includes(file.type)) throw new Error("JPEG・PNG・WebP画像を選択してください");
    if(file.size>15*1024*1024) throw new Error("原本は15MB以下の画像を選択してください");
    let source, originalURL;
    try {
      if(globalThis.createImageBitmap) source=await createImageBitmap(file);
      else {
        originalURL=URL.createObjectURL(file);
        source=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("画像を読み込めません"));img.src=originalURL;});
      }
      const size=dimensions(source.width || source.naturalWidth,source.height || source.naturalHeight);
      const canvas=document.createElement("canvas");canvas.width=size.width;canvas.height=size.height;
      const context=canvas.getContext("2d");if(!context) throw new Error("画像の縮小に対応していません");
      context.drawImage(source,0,0,size.width,size.height);
      const encode=type=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob ? resolve(blob) : reject(new Error("画像を変換できませんでした")),type,0.85));
      // PNGへのフォールバックは透過を維持します。原本Blobは保存しません。
      let blob;
      try {blob=await encode("image/webp");} catch {blob=await encode("image/png");}
      if(!["image/webp","image/png","image/jpeg"].includes(blob.type)) throw new Error("画像形式を変換できませんでした");
      if(blob.size>MAX_IMAGE) throw new Error("縮小後の画像が2MBを超えています。小さい画像を選択してください");
      return {id:crypto.randomUUID(),blob,mime:blob.type,...size,createdAt:new Date().toISOString()};
    } finally {source?.close?.();if(originalURL) URL.revokeObjectURL(originalURL);}
  }
  function put(record) {
    return serial(async()=>{
      if(!record || typeof record.id!=="string" || !record.id || record.id.length>512 || !(record.blob instanceof Blob) || record.blob.size>MAX_IMAGE || !["image/webp","image/png","image/jpeg"].includes(record.mime) || record.mime!==record.blob.type || !Number.isInteger(record.width) || !Number.isInteger(record.height) || record.width<1 || record.height<1 || Math.max(record.width,record.height)>MAX_EDGE || !Number.isFinite(Date.parse(record.createdAt))) throw new Error("保存する画像が不正、または2MBを超えています");
      const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,"readwrite"), store=tx.objectStore(STORE), request=store.getAll();let error;
        request.onsuccess=()=>{
          const total=request.result.filter(r=>r.id!==record.id).reduce((sum,r)=>sum+r.blob.size,0)+record.blob.size;
          if(total>MAX_TOTAL) {error=new Error("画像保存が50MBを超えます。未使用画像を整理してください");tx.abort();return;}
          store.put(record);
        };
        tx.oncomplete=()=>resolve(record.id);
        tx.onabort=tx.onerror=()=>reject(error || new Error("画像を保存できませんでした。空き容量やブラウザ設定を確認してください"));
      });
    });
  }
  function collect(getUsedIds) {
    return serial(async()=>{
      const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,"readwrite"), store=tx.objectStore(STORE), request=store.getAll();let count=0;
        request.onsuccess=()=>{
          let used;try {used=getUsedIds();} catch {tx.abort();return;}
          if(!used || typeof used.has!=="function") {tx.abort();return;}
          for(const record of request.result) if(!used.has(record.id) && Date.now()-Date.parse(record.createdAt)>=5*60*1000) {store.delete(record.id);count++;}
        };
        tx.oncomplete=()=>resolve(count);tx.onabort=tx.onerror=()=>reject(new Error("未使用画像を整理できませんでした"));
      });
    });
  }
  globalThis.ReferenceStore=Object.freeze({get,put,prepare,collect,dimensions,MAX_EDGE,MAX_IMAGE,MAX_TOTAL});
})();
