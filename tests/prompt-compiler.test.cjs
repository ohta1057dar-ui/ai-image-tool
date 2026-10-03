// 外部依存なし。実際のscript.jsから純粋なコンパイラと入力定義を読み込みます。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../script.js'),'utf8');
const context = vm.createContext({});
vm.runInContext([
  source.slice(0,source.indexOf('const $ =')),
  source.slice(source.indexOf('function isObject('),source.indexOf('function categoryData(')),
  source.slice(source.indexOf('function compileCameraPhrase('),source.indexOf('function createField('))
].join('\n'),context);
const run = code => vm.runInContext(code,context);
const compile = fields => run(`buildPrompt(cleanDraft(${JSON.stringify(fields)}))`);
let count=0;
const test=(name,fn)=>{fn();console.log('PASS '+name);count++;};
const example={description:'明るい雰囲気',outfit:'黒のナイトドレス',situation:'ナイトパーティでおさけをのんでる',composition:'全身\n友達が撮影',ratio:'9:16',style:'実写・フォトリアル'};
test('A 人物＋衣装＋シーン＋構図＋仕上がり',()=>{const p=compile(example);for(const text of Object.values(example))if(!text.includes('\n'))assert(p.includes(text));assert(p.includes('頭から足元まで'));assert(p.includes('友達が撮影したような視点'));assert(!p.includes('ネックレス'));assert(!p.includes('ハイヒール'));});
test('B 人物だけ・未入力カテゴリを生成しない',()=>{const p=compile({description:'成人の人物'});assert(p.includes('成人の人物'));for(const text of ['衣装\n','シーン・場所\n','構図\n','肌・メイク','光・質感・仕上がり\n'])assert(!p.includes(text));});
test('C 衣装だけ・人物特徴を創作しない',()=>{const p=compile({outfit:'黒のナイトドレス'});assert(p.includes('黒のナイトドレス'));assert(!p.includes('人物\n'));assert(!p.includes('女性'));assert(!p.includes('靴'));});
test('D 構図だけ・全身/自撮りの限定的な補助',()=>{const p=compile({composition:'全身、自撮り'});assert(p.includes('頭から足元まで'));assert(p.includes('本人が自分を撮影する視点'));assert(!p.includes('腕を'));assert(!p.includes('ローアングル'));});
test('E 空欄・管理情報・ネガティブだけなら通常文は空',()=>{assert.equal(compile({}),'');assert.equal(compile({description:'  \n',characterName:'管理名',negative:'避けたい内容'}),'');});
test('F 全項目の情報を保持し10段階の順序を守る',()=>{
  const keys=run('FIELD_KEYS');const names=run('Object.values(SCHEMA).map(s=>s.name)');
  const data={};for(const key of keys)data[key]=`内容_${key}`;
  data.ratio='4:5';data.style='イラスト';
  const p=compile(data);
  for(const key of keys)if(!names.includes(key)&&!['negative','expression','style'].includes(key))assert(p.includes(data[key]),key);
  for(const key of names)assert(!p.includes(data[key]));
  let position=-1;for(const marker of ['4:5','人物\n','外見・一貫性\n','衣装\n','シーン・場所\n','表情・動作\n','構図\n','カメラ・視点\n','光・質感・仕上がり\n','補足\n']){const next=p.indexOf(marker);assert(next>position,marker);position=next;}
});
test('G 固定特徴を優先指示として保持',()=>{const p=compile({face:'自然な左右差',requiredFeatures:'顔を左右対称にしない'});assert(p.includes('自然な左右差'));assert(p.includes('必ず維持する'));assert(p.includes('顔を左右対称にしない'));});
test('H 旧固定/維持項目の移行後も情報を保持',()=>{const fields={description:'人物',fixedFeatures:'顔を固定',maintainedFeatures:'髪色を維持',hairStyle:'ロング',hairColor:'茶色'};const p=run(`buildPrompt(migrateDraft(${JSON.stringify(fields)},3))`);for(const text of ['顔を固定','髪色を維持','ロング','茶色'])assert(p.includes(text));});
test('I ネガティブを混ぜず、入力オブジェクトも変更しない',()=>{const data={...example,negative:'低画質、文字\n透かしを避ける'};const before=JSON.stringify(data);assert(!compile(data).includes(data.negative));assert.equal(JSON.stringify(data),before);assert.equal(compile({...example,negative:''}),compile(data));});
test('J 管理用キャラクター名を含めない',()=>assert(!compile({...example,characterName:'非公開管理名'}).includes('非公開管理名')));
test('K 全保存設定名/管理メタデータを含めない',()=>{const data={...example,favorite:true,createdAt:'PRIVATE_DATE',id:'PRIVATE_ID'};for(const s of run('Object.values(SCHEMA)'))data[s.name]='PRIVATE_'+s.name;const p=compile(data);assert(!p.includes('PRIVATE'));assert(!p.includes('favorite'));});
test('L 同じ入力で毎回同一文章',()=>{const expected=compile(example);for(let i=0;i<20;i++)assert.equal(compile(example),expected);});
test('M V2.2の保存形式・項目キー・比率をそのまま使用',()=>{assert.equal(run('DATA_VERSION'),4);assert.equal(run('STORAGE_KEY'),'ai-prompt-maker-v2-2');assert(compile({characterName:'旧人物',age:'20代',hair:'ロング\n茶色',skinMakeup:'肌のツヤ',physique:'165cm',requiredFeatures:'髪を維持',ratio:'3:4'}).startsWith('3:4'));});
test('N 日本語句読点/改行を保持し余計な空段落を作らない',()=>{const p=compile({description:'自然な人物。',hair:'長い髪\n茶色',situation:'屋内。静かな場所。',composition:'全身、正面'});assert(p.includes('自然な人物。'));assert(p.includes('長い髪\n茶色'));assert(p.includes('屋内。静かな場所。'));assert(!p.includes('。。'));assert(!p.includes('\n\n\n'));assert(!p.includes('未設定'));assert(!p.includes('指定なし'));});
test('O 年齢/服/動作/カメラ位置/比率等の重要情報を落とさない',()=>{const data={age:'37歳',face:'非対称の顔',hair:'短い白髪',physique:'170cm、細身',outfit:'青いシャツ',pose:'片膝をつく',cameraDirection:'背後から',cameraHeight:'腰の高さ',distance:'2.5m',situation:'雨の公園',requiredFeatures:'顔の傷を維持',ratio:'16:9'};const p=compile(data);for(const text of Object.values(data))assert(p.includes(text),text);});
test('否定や未知の構図は推測して書き換えない',()=>{const text='全身を入れない、友達が撮影しない、自撮りではない';const p=compile({composition:text});assert(p.includes(text));assert(!p.includes('頭から足元まで'));assert(!p.includes('本人が自分'));});
test('同一の維持指示だけ重複整理・異なる指示は保持',()=>{const p=compile({requiredFeatures:'髪色を維持\n髪色を維持\n髪型を維持'});assert.equal(p.split('髪色を維持').length-1,1);assert(p.includes('髪型を維持'));});
test('同一視線は一度・異なる視線は両方保持',()=>{const same=compile({gaze:'正面を見る',cameraGaze:'正面を見る'});assert.equal(same.split('正面を見る').length-1,1);const different=compile({gaze:'左を見る',cameraGaze:'右を見る'});assert(different.includes('左を見る'));assert(different.includes('右を見る'));});
test('同じ文字でも別の人物特徴を消さない',()=>{const p=compile({hair:'黒',eyes:'黒',outfitColor:'黒'});assert.equal(p.split('「黒」').length-1,3);});
test('イラスト/アニメを実写や写真へ勝手に変更しない',()=>{for(const style of ['イラスト','アニメ']){const p=compile({composition:'友達が撮影',style});assert(!p.includes('自然な写真'));assert(!p.includes('フォトリアル'));assert(p.includes('視点'));}});
console.log(`${count} compiler checks passed.`);
console.log('\nExample output:\n'+compile(example));
