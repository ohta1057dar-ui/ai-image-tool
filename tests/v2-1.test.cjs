// V2/V2.1の回帰テストをV2.2向けに更新。Node.jsのみで実行。DOM/保存/コピーを模擬し、実際のscript.jsを検証します。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
class Node {
  constructor(tag='div') { this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.dataset={};this.style={};this.value='';this.textContent='';this.hidden=false;this.attrs={};this.classList={toggle(){}};this.open=false; }
  append(...nodes) { for(const n of nodes){n.parentElement=this;this.children.push(n);if(this.tagName==='SELECT' && this.children.length===1)this.value=n.value;} }
  replaceChildren(...nodes){this.children=[];this.value='';this.append(...nodes);}
  add(n){this.append(n);}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  async emit(type,target=this){for(const fn of this.listeners[type]??[])await fn({target,preventDefault(){}});}
  setAttribute(k,v){this.attrs[k]=v;} removeAttribute(k){delete this.attrs[k];}
  focus(){documentActive=this;} scrollIntoView(){this.scrolled=true;} select(){} setSelectionRange(){}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);}
  showModal(){this.open=true;} close(){this.open=false;} click(){this.clicked=true;}
  querySelectorAll(selector){return walk(this).filter(n=>n!==this && n.tagName===selector.toUpperCase());}
  get elements(){return {namedItem:key=>walk(this).find(n=>n.name===key)};}
}
let documentActive=null;
function walk(node){return [node,...node.children.flatMap(walk)];}
function parseHTML(){
  const body=new Node('body');const stack=[body];
  const voids=new Set(['meta','link','input','br','hr']);
  for(const m of html.matchAll(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/g)){
    if(m[0].startsWith('</')) { if(stack.length>1)stack.pop();continue; }
    const node=new Node(m[1]);
    for(const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)){
      const [,k,v]=a;node.attrs[k]=v;
      if(k==='id'||k==='name')node[k]=v;
      if(k.startsWith('data-'))node.dataset[k.slice(5)]=v;
    }
    node.hidden=/\bhidden\b/.test(m[2]);stack.at(-1).append(node);
    if(!voids.has(m[1]))stack.push(node);
  }
  return body;
}
function boot(storage=new Map(), flags={}){
  documentActive=null;
  const body=parseHTML();const copies=[];const downloads=[];
  const document={body,get activeElement(){return documentActive;},createElement:tag=>new Node(tag),addEventListener(){},execCommand:()=>!!flags.fallback,
    querySelector(selector){const found=walk(body).find(n=>selector.startsWith('#')?n.id===selector.slice(1):false);assert(found,'Missing '+selector);return found;},
    querySelectorAll(selector){const key=selector.match(/^\[data-(\w+)\]$/)[1];return walk(body).filter(n=>key in n.dataset);}
  };
  const context=vm.createContext({document,globalThis:null,localStorage:{getItem:k=>{if(flags.readFail)throw Error('denied');return storage.get(k)??null;},setItem:(k,v)=>{if(flags.writeFail)throw Error('quota');storage.set(k,v);}},crypto:require('node:crypto').webcrypto,Option:class extends Node{constructor(label,value){super('option');this.textContent=label;this.value=value;}},FormData:class{constructor(form){this.entries=walk(form).filter(n=>n.name&&['INPUT','TEXTAREA','SELECT'].includes(n.tagName)).map(n=>[n.name,n.value]);}*[Symbol.iterator](){yield* this.entries;}},navigator:{clipboard:{async writeText(text){if(flags.clipFail)throw Error('denied');copies.push(text);}}},window:{innerHeight:800,scrollTo(){}},confirm:()=>flags.confirm!==false,setTimeout:()=>1,clearTimeout(){},Blob:class {constructor(parts,options){downloads.push({parts,options});}},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){} }});
  context.globalThis=context;
  vm.runInContext(script,context);
  return {storage,flags,copies,downloads,body,$:s=>document.querySelector(s),run:c=>vm.runInContext(c,context),data:()=>JSON.parse(storage.get('ai-prompt-maker-v2-2')),async input(key,value){document.querySelector('#'+key).value=value;await document.querySelector('#prompt-form').emit('input');}};
}
function legacyFixture(){
  const draft={characterName:'清楚ギャル',description:'成人の女性',age:'20代',hairStyle:'ロング',hairColor:'茶色',skin:'自然な肌',expression:'微笑み',bodyType:'細身',features:'眼鏡',outfit:'黒いドレス',situation:'ホテルパーティ',composition:'全身・友人撮影',negative:'ぼやけ',ratio:'9:16',style:'実写風'};
  const presets={character:[],outfit:[],situation:[],composition:[]};
  for(const category of Object.keys(presets))presets[category]=[{id:'v2-'+category,name:'旧'+category,createdAt:'2026-10-03T12:00:00Z',data:category==='character'?{...draft}:{[category]:draft[category]}}];
  return {version:2,draft,presets,history:[{id:'v2-history',createdAt:'2026-10-03T12:00:00Z',draft:{...draft},prompt:'V2の完成文章を保持'}]};
}
const findButton=(node,text)=>walk(node).find(n=>n.tagName==='BUTTON'&&n.textContent===text);
function previousFixture(){
  const saved=legacyFixture();saved.version=3;
  Object.assign(saved.draft,{face:'卵型の顔',eyes:'茶色の目',makeup:'ナチュラルメイク',height:'165cm',physicalFeatures:'左頬のほくろ',fixedFeatures:'顔立ちを固定',maintainedFeatures:'髪色を維持',characterNotes:'装飾控えめ',actionExpression:''});
  saved.presets.action=[];saved.presets.finish=[];
  for(const [type,items] of Object.entries(saved.presets))for(const item of items){item.type=type;item.version=3;item.updatedAt=item.createdAt;item.favorite=true;if(type==='character')item.data={...saved.draft};}
  saved.history[0].draft={...saved.draft};saved.recent={character:'v2-character'};
  return saved;
}
(async()=>{
  let count=0;const check=(label,fn)=>{fn();count++;console.log('PASS '+label);};
  const previous=previousFixture();const previousRaw=JSON.stringify(previous);
  const previousStorage=new Map([['ai-prompt-maker-v2-1',previousRaw]]);const migrated=boot(previousStorage);
  check('V2.1初回移行・形式version4・元データ非破壊',()=>{assert.equal(migrated.data().version,4);assert.equal(previousStorage.get('ai-prompt-maker-v2-1'),previousRaw);});
  const merged={hair:'ロング\n茶色',skinMakeup:'自然な肌\nナチュラルメイク',physique:'細身\n165cm',requiredFeatures:'顔立ちを固定\n髪色を維持',characterNotes:'眼鏡\n装飾控えめ'};
  for(const [key,value] of Object.entries(merged))check('V2.1 '+key+'の統合（入力・人物設定・履歴）',()=>{assert.equal(migrated.data().draft[key],value);assert.equal(migrated.data().presets.character[0].data[key],value);assert.equal(migrated.data().history[0].draft[key],value);});
  check('旧表情は人物UIに表示せず表情・動作へ移行',()=>{assert.equal(migrated.$('#expression').type,'hidden');assert.equal(migrated.$('#actionExpression').value,'微笑み');assert.equal(migrated.run('SCHEMA.character.fields.expression'),undefined);});
  check('V2.1のID・お気に入り・最近使用・完成文章保持',()=>{assert.equal(migrated.data().presets.character[0].id,'v2-character');assert(migrated.data().presets.character[0].favorite);assert.equal(migrated.data().recent.character,'v2-character');assert.equal(migrated.data().history[0].prompt,'V2の完成文章を保持');});
  const reread=boot(previousStorage);check('再読み込み時の二重移行なし',()=>assert.deepEqual(reread.data(),migrated.data()));
  const previousBackup=migrated.run('makeBackup()');assert(migrated.run(`importBackup(${JSON.stringify(previousBackup)})`));
  check('V2.2 JSON再復元時も二重結合なし',()=>{for(const [key,value] of Object.entries(merged))assert.equal(migrated.data().draft[key],value);});
  assert(migrated.run(`importBackup(${JSON.stringify(previousRaw)})`));
  check('V2.1 JSONからの復元と元保存領域保持',()=>{assert.equal(migrated.data().draft.hair,merged.hair);assert.equal(previousStorage.get('ai-prompt-maker-v2-1'),previousRaw);});
  check('片方空欄・両方空欄を自然に統合',()=>{const value=JSON.stringify({hairStyle:'',hairColor:'黒',skin:'  ',makeup:'',bodyType:'',height:'165cm',fixedFeatures:'',maintainedFeatures:'髪を維持',features:'',characterNotes:'補足のみ'});const d=JSON.parse(migrated.run(`JSON.stringify(migrateDraft(${value},3))`));assert.equal(d.hair,'黒');assert.equal(d.skinMakeup,'');assert.equal(d.physique,'165cm');assert.equal(d.requiredFeatures,'髪を維持');assert.equal(d.characterNotes,'補足のみ');});
  check('新人物項目と生成順序・管理名除外・決定論',()=>{const p=migrated.run('currentPrompt');let position=-1;for(const marker of ['年齢・年代は','人物は','顔立ちは','髪は','目の特徴は','肌・メイクは','体型・身長は','身体的特徴として','必ず維持する特徴は','人物についての補足','衣装は','シーンは','表情は','構図は','画像比率は']){const index=p.indexOf(marker);assert(index>position,marker);position=index;}assert(!p.includes('清楚ギャル'));assert.equal(p,migrated.run('buildPrompt(readDraft())'));});
  check('人物基本3項目・詳細8項目・具体例',()=>{assert.equal(migrated.run('SCHEMA.character.basic.length'),3);assert.equal(migrated.run('Object.keys(SCHEMA.character.fields).length'),11);for(const key of migrated.run('Object.keys(SCHEMA.character.fields)'))assert(migrated.$('#'+key).placeholder.startsWith('例：'));assert.equal(migrated.$('#description').rows,3);assert.equal(migrated.$('#hair').rows,2);});
  await migrated.input('actionExpression','');check('旧表情を通常UIで消せる・暗黙の再出力なし',()=>assert(!migrated.run('currentPrompt').includes('表情は')));
  migrated.run('openEdit("character","v2-character")');migrated.$('#edit-name').value='移行人物';migrated.$('#edit-hair').value='変更した髪';await migrated.$('#edit-form').emit('submit');
  check('移行人物の編集・旧内部表情保持・新構造保存',()=>{assert.equal(migrated.data().presets.character[0].data.hair,'変更した髪');assert.equal(migrated.data().presets.character[0].data.expression,'微笑み');assert(!('hairStyle' in migrated.data().presets.character[0].data));});
  check('操作バー48pxと固定UI下の余白・自動高さ',()=>{assert(css.includes('--action-height: 48px'));assert(css.includes('--nav-height: 64px'));assert(css.includes('var(--bottom-space) + 24px'));assert(css.includes('resize: none'));assert(html.includes('class="secondary">結果</button>'));assert(migrated.$('#hair').style.height);});
  const legacy=legacyFixture();const raw=JSON.stringify(legacy);const storage=new Map([['ai-prompt-maker-v2',raw]]);let app=boot(storage);
  check('V2→V2.2移行・V2元データ不変',()=>{assert.equal(app.data().version,4);assert.equal(storage.get('ai-prompt-maker-v2'),raw);assert.equal(app.$('#description').value,'成人の女性');assert.equal(app.$('#style').value,'実写・フォトリアル');});
  check('V2の4保存カテゴリ・ID・表情・favorite初期値保持',()=>{for(const c of ['character','outfit','situation','composition']){assert.equal(app.data().presets[c][0].id,'v2-'+c);assert.equal(app.data().presets[c][0].favorite,false);}assert.equal(app.$('#expression').value,'微笑み');assert.equal(app.data().presets.action.length,0);});
  check('V2履歴の完成文章・ネガティブ・入力保持',()=>{assert.equal(app.data().history[0].prompt,'V2の完成文章を保持');assert.equal(app.data().history[0].draft.negative,'ぼやけ');});
  check('6カテゴリ全カードが初期閉状態',()=>{for(const c of ['character','outfit','situation','action','composition','finish'])assert(!app.$('#card-'+c).open);});
  await app.input('face','柔らかな顔立ち');await app.input('skinMakeup','自然な肌、ナチュラルメイク');await app.input('requiredFeatures','目の色を固定');await app.input('actionExpression','自然な笑顔');await app.input('gaze','カメラを見る');await app.input('cameraGaze','右を見る');await app.input('movement','歩いている');await app.input('finishLight','自然光');
  check('プロンプト自動更新・情報順・管理名除外・表情/視線優先',()=>{const p=app.run('currentPrompt');assert(p.indexOf('実写')<p.indexOf('人物は'));assert(p.indexOf('顔立ち')<p.indexOf('必ず維持'));assert(p.indexOf('必ず維持')<p.indexOf('衣装'));assert(p.indexOf('衣装')<p.indexOf('シーン'));assert(p.indexOf('シーン')<p.indexOf('表情'));assert(p.indexOf('表情')<p.indexOf('構図'));assert(p.indexOf('構図')<p.indexOf('光は'));assert(p.indexOf('光は')<p.indexOf('画像比率'));assert(!p.includes('清楚ギャル'));assert(!p.includes('微笑み'));assert(!p.includes('右を見る'));assert(p.includes('自然な笑顔'));assert(!p.includes('ぼやけ'));});
  for(const [key,value] of Object.entries({eyes:'緑の目',physique:'165cm、自然な体型',physicalFeatures:'ほくろ',requiredFeatures:'髪色を維持',characterNotes:'左右対称を意識',outfitType:'ドレス',outfitColor:'黒',outfitMaterial:'シルク',outfitDesign:'シンプル',shoes:'パンプス',accessories:'イヤリング',outfitOther:'装飾控えめ',location:'ホテル',timeOfDay:'夜',sceneActivity:'会話する',people:'友人',sceneLight:'間接照明',atmosphere:'穏やか',props:'グラス',background:'ロビー',sceneOther:'人混みを避ける',mouth:'口を閉じる',hands:'手を下げる',interaction:'友人と話す',actionOther:'自然な動き',framing:'全身',cameraDirection:'斜め',cameraHeight:'目線',distance:'2m',angle:'正面',pose:'立つ',photographer:'友人',cameraFeel:'スマホ',lens:'標準',bokeh:'弱め',compositionOther:'余白を残す',finishCamera:'スマホ撮影',tone:'自然な色調',depth:'適度',texture:'加工なし',finishOther:'粒子感'}))await app.input(key,value);
  check('全追加項目を生成文章に反映',()=>{const p=app.run('currentPrompt');for(const s of ['165cm','シルク','ロビー','手を下げる','2m','余白を残す','粒子感'])assert(p.includes(s));});
  for(const c of ['character','outfit','situation','action','composition','finish'])assert(app.run(`savePreset('${c}','新${c}',readDraft())`));
  check('全6カテゴリの新規保存とメタデータ',()=>{for(const c of Object.keys(app.data().presets)){const p=app.data().presets[c][0];for(const key of ['id','type','name','createdAt','updatedAt','favorite','version'])assert(key in p);assert.equal(p.type,c);assert.equal(p.version,4);}assert(!('negative' in app.data().presets.outfit[0].data));});
  app.run('renderQuick();renderPresets()');
  const characterId=app.data().presets.character[0].id;
  await app.input('description','作成中の変更');app.run(`applyPreset('character','${characterId}')`);
  check('設定読み込み・カード自動閉・元データ非変更',()=>{assert.equal(app.$('#description').value,'成人の女性');assert(!app.$('#card-character').open);assert.equal(app.data().presets.character[0].data.description,'成人の女性');});
  await app.input('description','作成中は変更しない');app.run(`openEdit('character','${characterId}')`);
  app.$('#edit-name').value='編集済み人物';app.$('#edit-description').value='編集した人物説明';await app.$('#edit-form').emit('submit');
  check('設定編集・ID維持・作成途中は非変更',()=>{assert.equal(app.data().presets.character[0].id,characterId);assert.equal(app.data().presets.character[0].name,'編集済み人物');assert.equal(app.data().presets.character[0].data.description,'編集した人物説明');assert.equal(app.$('#description').value,'作成中は変更しない');});
  app.run(`toggleFavorite('character','${characterId}')`);
  check('お気に入り・候補優先・タップ候補',()=>{assert(app.data().presets.character[0].favorite);assert(app.$('#preset-character').children[1].textContent.startsWith('★'));assert(app.$('#chips-character').children.length>0);});
  app.run(`duplicatePreset('character','${characterId}')`);
  check('複製は別ID・内容保持',()=>{const a=app.data().presets.character;assert.notEqual(a[0].id,characterId);assert.equal(a[0].data.description,'編集した人物説明');assert(a[0].name.includes('コピー'));});
  const duplicateId=app.data().presets.character[0].id;app.flags.confirm=false;app.run(`deletePreset('character','${duplicateId}')`);
  check('削除キャンセル',()=>assert(app.data().presets.character.some(p=>p.id===duplicateId)));
  app.flags.confirm=true;app.run(`deletePreset('character','${duplicateId}')`);
  check('削除確認・元設定維持',()=>{assert(!app.data().presets.character.some(p=>p.id===duplicateId));assert(app.data().presets.character.some(p=>p.id===characterId));});
  app.$('#preset-category').value='outfit';await app.$('#preset-category').emit('change');
  check('保存画面は選択カテゴリだけ表示',()=>{assert.equal(app.$('#preset-list').children.length,app.data().presets.outfit.length);assert(!walk(app.$('#preset-list')).some(n=>n.textContent==='編集済み人物'));});
  await app.$('#copy-button').emit('click');await app.$('#copy-negative').emit('click');
  check('通常・ネガティブの個別コピー',()=>assert.deepEqual(app.copies,[app.run('currentPrompt'),'ぼやけ']));
  for(const style of ['実写・フォトリアル','スマートフォン写真風','イラスト','アニメ'])for(const ratio of ['9:16','4:5','1:1','3:4','16:9']){await app.input('style',style);await app.input('ratio',ratio);assert(app.run('currentPrompt').includes(ratio));}
  check('表現4種×比率5種',()=>assert(app.run('currentPrompt').includes('アニメ')));
  for(let i=0;i<101;i++){await app.input('description','履歴'+i);app.run('saveHistory()');}
  check('履歴上限100件・新しい順',()=>{assert.equal(app.data().history.length,100);assert.equal(app.data().history[0].draft.description,'履歴100');assert.equal(app.data().history[99].draft.description,'履歴1');});
  const historyId=app.data().history[0].id;await app.input('description','復元前');app.run(`restoreHistory('${historyId}')`);
  check('履歴復元・ネガティブ保持',()=>{assert.equal(app.$('#description').value,'履歴100');assert.equal(app.$('#negative').value,'ぼやけ');});
  app.run(`deleteHistory('${historyId}')`);check('履歴削除',()=>assert.equal(app.data().history.length,99));
  const reopened=boot(storage);check('localStorage再読み込み・全新項目/設定/履歴保持',()=>{assert.equal(reopened.$('#description').value,'履歴100');assert.equal(reopened.$('#eyes').value,'緑の目');assert.equal(reopened.data().history.length,99);assert(reopened.data().presets.character.some(p=>p.favorite));});
  const backup=reopened.run('makeBackup()');const parsed=JSON.parse(backup);
  check('JSON全データ書き出し',()=>{assert.equal(parsed.app,'ai-prompt-maker');assert.equal(parsed.history.length,99);assert.equal(parsed.version,4);assert.equal(parsed.draft.eyes,'緑の目');});
  reopened.run('exportBackup()');check('ダウンロード用JSON生成',()=>assert.equal(JSON.parse(reopened.downloads[0].parts[0]).version,4));
  await reopened.input('description','置換前');reopened.flags.confirm=false;
  assert.equal(reopened.run(`importBackup(${JSON.stringify(backup)})`),false);
  check('JSON復元キャンセルで既存データ非変更',()=>assert.equal(reopened.$('#description').value,'置換前'));
  reopened.flags.confirm=true;assert(reopened.run(`importBackup(${JSON.stringify(backup)})`));
  check('JSON復元・お気に入り/履歴/入力復元',()=>{assert.equal(reopened.$('#description').value,'履歴100');assert.equal(reopened.data().history.length,99);});
  const before=JSON.stringify(reopened.data());
  for(const invalid of ['{bad',JSON.stringify({...parsed,version:99}),JSON.stringify({...parsed,presets:[]}),JSON.stringify({...parsed,draft:{description:123}}),JSON.stringify({...parsed,app:'other'})])assert.throws(()=>reopened.run(`importBackup(${JSON.stringify(invalid)})`));
  check('JSON形式/version/型チェック・不正時非変更',()=>assert.equal(JSON.stringify(reopened.data()),before));
  for(const mutate of [
    p=>{p.presets.character[0].favorite='yes';},
    p=>{p.presets.character[0].type='outfit';},
    p=>{p.presets.character[0].createdAt='invalid';},
    p=>{p.presets.character.push(p.presets.character[0]);},
    p=>{p.history.push(...Array(101).fill(p.history[0]));}
  ]) {
    const invalid=JSON.parse(backup);mutate(invalid);
    assert.throws(()=>reopened.run(`importBackup(${JSON.stringify(JSON.stringify(invalid))})`));
  }
  check('JSONメタデータ・重複ID・履歴上限チェック',()=>assert.equal(JSON.stringify(reopened.data()),before));
  const imported=boot();assert(imported.run(`importBackup(${JSON.stringify(raw)})`));
  check('V2 JSON復元の移行',()=>{assert.equal(imported.data().version,4);assert.equal(imported.data().history[0].prompt,'V2の完成文章を保持');});
  reopened.flags.writeFail=true;reopened.run('saveHistory()');
  check('保存容量不足のロールバック',()=>{assert.equal(reopened.run('state.history.length'),99);assert(!reopened.$('#storage-warning').hidden);});
  const inputBefore=reopened.$('#description').value;
  assert.equal(reopened.run(`importBackup(${JSON.stringify(raw)})`),false);
  check('JSON復元保存失敗は入力も非変更',()=>assert.equal(reopened.$('#description').value,inputBefore));
  const brokenStorage=new Map([['ai-prompt-maker-v2-2','{bad'],['ai-prompt-maker-v2',raw]]);const broken=boot(brokenStorage);await broken.input('outfit','使える');
  check('破損データ自動上書き防止・作成継続',()=>{assert.equal(brokenStorage.get('ai-prompt-maker-v2-2'),'{bad');assert(broken.run('currentPrompt').includes('使える'));});
  check('破損元データもバックアップに保持',()=>assert.equal(JSON.parse(broken.run('makeBackup()')).recoveryData.current,'{bad'));
  assert(broken.run(`importBackup(${JSON.stringify(raw)})`));check('確認済みJSONで保存停止状態から復旧',()=>assert.equal(broken.data().version,4));
  const empty=boot();await empty.input('characterName','管理名だけ');await empty.input('negative','避けたい');
  check('管理名/ネガティブのみでは通常文生成しない',()=>{assert.equal(empty.run('currentPrompt'),'');assert(empty.$('#copy-button').disabled);assert(!empty.$('#copy-negative').disabled);});
  await empty.input('outfit','コート');check('空欄除外・未入力情報を追加しない',()=>{const p=empty.run('currentPrompt');assert(!p.includes('表情'));assert(!p.includes('肌'));assert(!p.includes('自然な'));assert(!p.includes('undefined'));assert(p.includes('コート'));});
  empty.run('openSave("outfit")');empty.$('#preset-name').value='コート設定';await empty.$('#save-form').emit('submit');
  check('保存ダイアログのイベント経由で保存・要約更新',()=>{assert.equal(empty.data().presets.outfit[0].name,'コート設定');assert(empty.$('#summary-outfit').textContent.includes('コート設定'));assert(!empty.$('#save-dialog').open);});
  const outfitId=empty.data().presets.outfit[0].id;empty.run(`toggleFavorite('outfit','${outfitId}');toggleFavorite('outfit','${outfitId}');`);
  check('お気に入りOFFも永続化',()=>assert.equal(boot(empty.storage).data().presets.outfit[0].favorite,false));
  await empty.input('outfit','変更');empty.run(`applyPreset('outfit','${outfitId}')`);
  check('最近使用のタップ候補と読み込み内容',()=>{assert.equal(empty.$('#outfit').value,'コート');assert(empty.$('#chips-outfit').children.some(n=>n.textContent.includes('コート設定')));});
  empty.flags.clipFail=true;empty.flags.fallback=true;await empty.$('#copy-button').emit('click');check('コピー代替処理',()=>assert(empty.$('#status').textContent.includes('コピーしました')));
  empty.flags.fallback=false;await empty.$('#copy-button').emit('click');check('コピー失敗の長押し案内',()=>assert(empty.$('#status').textContent.includes('長押し')));
  for(const tab of ['presets','history','create']){await empty.$('#nav-'+tab).emit('click');for(const name of ['presets','history','create'])assert.equal(empty.$('#panel-'+name).hidden,name!==tab);}
  check('既存3タブと結果ショートカット',()=>{assert(!empty.$('#result-shortcuts').hidden);empty.run('showResult()');assert(empty.$('#result').scrolled);});
  const ids=walk(empty.body).filter(n=>n.id).map(n=>n.id);assert.equal(ids.length,new Set(ids).size);
  check('動的HTML ID整合・スマートフォンCSS静的確認',()=>{for(const key of empty.run('FIELD_KEYS'))assert(empty.$('#'+key));assert(html.includes('interactive-widget=resizes-content'));assert(css.includes('font-size: 16px'));assert(css.includes('safe-area-inset-bottom'));assert(css.includes('keyboard-open'));assert(css.includes('min-height: 44px'));assert(!/<(?:script|link)[^>]+https?:/.test(html));});
  console.log(`${count} checks passed; DOM/localStorage/Clipboard mocks (no browser rendering).`);
})().catch(error=>{console.error(error);process.exitCode=1;});
