// V2.4条件付き補強。実アプリの関数を読む外部依存なしのテスト。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');
const context=vm.createContext({});
vm.runInContext([
 source.slice(0,source.indexOf('const $ =')),
 source.slice(source.indexOf('function isObject('),source.indexOf('function categoryData(')),
 source.slice(source.indexOf('function sentence('),source.indexOf('function createField('))
].join('\n'),context);
const run=code=>vm.runInContext(code,context);
const compile=data=>run(`buildPrompt(cleanDraft(${JSON.stringify(data)}))`);
let count=0;
const test=(name,fn)=>{fn();count++;console.log('PASS '+name);};
const base={description:'明るい雰囲気',outfit:'黒のナイトドレス',situation:'ナイトパーティでおさけをのんでる',actionExpression:'笑顔',movement:'はしゃいでいる',composition:'全身',photographer:'友達が撮影',ratio:'9:16',style:'実写・フォトリアル',negative:'文字、透かし'};
test('基準ケース・描写と限定補強・管理情報/ネガティブ除外',()=>{const p=compile(base);for(const value of ['明るい雰囲気','黒のナイトドレス','お酒を飲んでいる','笑顔ではしゃいでいる','頭から足元まで','スナップ写真','夜の環境','現実的な質感'])assert(p.includes(value));assert(!/とする|を指定する|描く場面は|成人|女性|国籍|文字、透かし|ネックレス|ミニドレス/.test(p));assert.equal(p.split('全身構図').length-1,1);});
test('A 自撮り＋顔アップ＋実写',()=>{const p=compile({composition:'自撮り、顔アップ'});assert(p.includes('顔を中心にした近距離構図'));assert(p.includes('自撮りらしいカメラとの距離感'));assert(p.includes('現実的な質感'));assert(!p.includes('スマートフォン'));});
test('B 友人撮影＋全身＋カメラ目線を維持',()=>{const p=compile({...base,gaze:'カメラ目線'});assert(p.includes('カメラ目線'));assert(p.includes('スナップ'));assert(!/意識していない|目線を外す|カメラを見ない/.test(p));});
test('C 鏡越し自撮りを優先',()=>{const p=compile({composition:'鏡越し自撮り',photographer:'自撮り'});assert(p.includes('鏡越し自撮り'));assert(!p.includes('自撮りらしいカメラとの距離感'));assert(!p.includes('スマートフォン'));});
test('D 全身のみ・同じ範囲を反復しない',()=>{const p=compile({composition:'全身'});assert.equal(p.split('頭から足元まで').length-1,1);assert(!p.includes('顔アップ'));assert(!p.includes('人物全体'));});
test('E フォトリアルだけで人物を創作せず生成',()=>{const p=compile({style:'実写・フォトリアル'});assert(p.includes('実写・フォトリアル'));assert(p.includes('現実的な質感'));assert(!/人物|年齢|肌|女性|髪|衣装|光/.test(p));});
test('F 多数空欄でも未指定の詳細を補わない',()=>{const p=compile({outfit:'黒のナイトドレス',style:'イラスト'});assert(p.includes('黒のナイトドレス'));assert(!/人物|光|現実的|未設定|指定なし|undefined/.test(p));});
test('G 長文・否定・句読点の重要情報を保持',()=>{const text=('青い服は着ない。顔の左右差を残す。夜ではない屋内。\n').repeat(150);const p=compile({description:text});assert(p.includes(text.trim()));assert(!p.includes('夜の環境'));assert.equal(p,compile({description:text}));});
test('H 既知の意味重複だけ抑制',()=>{for(const [a,b,marker] of [['全身','全身構図','頭から足元まで'],['顔アップ','顔のアップ','顔を中心'],['バストアップ','頭部から胸元付近までを中心にした構図','頭部から胸元']]){const p=compile({composition:a,framing:b});assert.equal(p.split(marker).length-1,1);}const p=compile({composition:'友達が撮影',photographer:'友人が撮影'});assert.equal(p.split('友人が撮影').length-1,1);assert.equal(p.split('スナップ').length-1,1);});
test('I ネガティブは補強条件にも影響せず保持',()=>{const before=JSON.stringify(base);assert.equal(compile(base),compile({...base,negative:'三脚、光、CG、夜、文字'}));assert.equal(JSON.stringify(base),before);});
test('J V2.2/V2.3/V2.3.1のversion4データをそのまま利用',()=>{for(const tag of ['V2.2','V2.3','V2.3.1']){const fixture={...base,characterName:tag+'管理名',hair:'ロング、茶色',requiredFeatures:'髪を維持',characterNotes:'眼鏡'};const raw=JSON.stringify(fixture);const p=run(`buildPrompt(migrateDraft(${raw},4))`);for(const v of ['ロング','茶色','髪を維持','眼鏡'])assert(p.includes(v));assert(!p.includes(tag+'管理名'));assert.equal(p,compile(fixture));assert.equal(JSON.stringify(fixture),raw);}assert.equal(run('DATA_VERSION'),4);assert.equal(run('STORAGE_KEY'),'ai-prompt-maker-v2-6');});
test('明示された光・質感が優先され補強しない',()=>{const p=compile({...base,sceneLight:'青い照明',finishLight:'硬い光',texture:'強いCG感'});for(const v of ['青い照明','硬い光','強いCG感'])assert(p.includes(v));assert(!p.includes('夜の環境'));assert(!p.includes('現実的な質感'));});
test('三脚・タイマー・明示距離は自撮り補強より優先',()=>{for(const fields of [{composition:'三脚、セルフタイマー'},{distance:'5m'},{finishCamera:'一眼レフ'},{sceneOther:'鏡越しに撮影'}]){const p=compile({photographer:'自撮り',...fields});assert(!p.includes('自撮りらしいカメラとの距離感'));for(const v of Object.values(fields))assert(p.includes(v));}});
test('夜の否定・昼・指定照明から夜補強を作らない',()=>{for(const fields of [{situation:'ナイトパーティではない'},{timeOfDay:'昼'},{situation:'ナイトパーティ',description:'昼の場面'},{timeOfDay:'夜',sceneLight:'蝋燭の照明'}])assert(!compile(fields).includes('夜の環境'));});
test('夜だけ指定・具体的な光源を創作しない',()=>{const p=compile({timeOfDay:'夜'});assert(p.includes('夜の環境に合う自然な環境光'));assert(!/街灯|ネオン|クラブ照明/.test(p));});
test('イラスト/アニメに実写の補強を付けない',()=>{for(const style of ['イラスト','アニメ']){const p=compile({...base,style});assert(!p.includes('現実的な質感'));assert(!p.includes('スナップ写真'));assert(!p.includes('実際に撮影'));}});
test('ポーズ/演出・機材指定時は友人スナップ補強を控える',()=>{for(const fields of [{pose:'決めポーズ'},{situation:'スタジオで演出した写真'},{cameraFeel:'フィルムカメラ'},{compositionOther:'スナップ写真ではない'}])assert(!compile({photographer:'友達が撮影',...fields}).includes('何気ないスナップ'));});
test('限定した表記整理のみ・否定や引用は書き換えない',()=>{for(const value of ['おさけをのんでるわけではない','ナイトパーティでおさけをのんでる、という設定を避ける','「ナイトパーティでおさけをのんでる」'])assert(compile({situation:value}).includes(value));});
test('全項目の情報保持と決定論',()=>{const fields={};for(const key of run('FIELD_KEYS'))fields[key]='入力_'+key;fields.style='実写・フォトリアル';fields.ratio='4:5';const p=compile(fields);const names=run('Object.values(SCHEMA).map(s=>s.name)');for(const key of run('FIELD_KEYS'))if(!names.includes(key)&&!['style','negative','expression'].includes(key))assert(p.includes(fields[key]),key);for(let i=0;i<10;i++)assert.equal(compile(fields),p);});
test('人物・衣装・シーン・動作・構図・仕上がりの順序',()=>{const p=compile(base);let at=-1;for(const token of ['9:16','明るい雰囲気','黒のナイトドレス','ナイトパーティ','笑顔','全身構図','現実的な質感']){const next=p.indexOf(token);assert(next>at);at=next;}});
test('矛盾するユーザー指定は両方保持・補強は控える',()=>{const p=compile({timeOfDay:'夜',description:'夜ではない場面',gaze:'左を見る',cameraGaze:'右を見る'});for(const v of ['夜ではない場面','時間帯は夜','左を見る','右を見る'])assert(p.includes(v));assert(!p.includes('夜の環境'));});
test('管理名は補強の判断にも使わない',()=>{const p=compile(base);for(const name of ['三脚・CG・昼','夜のスタジオ'])assert.equal(compile({...base,characterName:name,outfitName:name,situationName:name,compositionName:name,finishName:name,actionName:name}),p);});
console.log(`${count} V2.4 checks passed.`);
console.log('\nV2.4 example:\n'+compile(base));
