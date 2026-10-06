"use strict";

// 項目の追加はこの定義から。キーは保存データとの互換性のため変更しません。
const DATA_VERSION = 4; // UI V2.2の保存形式
const STORAGE_KEY = "ai-prompt-maker-v2-2";
const PREVIOUS_KEY = "ai-prompt-maker-v2-1";
const LEGACY_KEY = "ai-prompt-maker-v2";
const RATIOS = ["9:16", "4:5", "1:1", "3:4", "16:9"];
const STYLES = ["実写・フォトリアル", "スマートフォン写真風", "イラスト", "アニメ"];
const SCHEMA = {
  character: { label: "人物", name: "characterName", basic: ["characterName", "age", "description"], fields: {
    characterName: "管理用キャラクター名", age: "年齢／年代", description: "雰囲気・人物像", face: "顔立ち", hair: "髪", eyes: "目", skinMakeup: "肌・メイク", physique: "体型・身長", physicalFeatures: "その他の身体的特徴", requiredFeatures: "必ず維持する特徴", characterNotes: "補足・一貫性指示" } },
  outfit: { label: "衣装", name: "outfitName", basic: ["outfitName", "outfit"], fields: {
    outfitName: "管理用衣装名", outfit: "衣装説明", outfitType: "種類", outfitColor: "色", outfitMaterial: "素材", outfitDesign: "デザイン", shoes: "靴", accessories: "アクセサリー", outfitOther: "その他" } },
  situation: { label: "シーン", name: "sceneName", basic: ["sceneName", "situation"], fields: {
    sceneName: "管理用シーン名", situation: "状況", location: "場所", timeOfDay: "時間帯", sceneActivity: "人物がしていること", people: "周囲の人物", sceneLight: "照明", atmosphere: "雰囲気", props: "小物", background: "背景", sceneOther: "その他" } },
  action: { label: "表情・動作", name: "actionName", basic: ["actionName", "actionExpression", "movement"], fields: {
    actionName: "管理用設定名", actionExpression: "表情", gaze: "視線", mouth: "口元", movement: "身体の動作", hands: "手の動き", interaction: "人物同士のやり取り", actionOther: "その他" } },
  composition: { label: "構図・カメラ", name: "compositionName", basic: ["compositionName", "composition", "framing"], fields: {
    compositionName: "管理用構図名", composition: "構図の説明（V2も引き継ぎます）", framing: "撮影範囲", cameraDirection: "カメラ方向", cameraHeight: "カメラ高さ", distance: "被写体との距離", angle: "アングル", pose: "ポーズ", cameraGaze: "視線", photographer: "撮影者", cameraFeel: "撮影機材感", lens: "レンズ感", bokeh: "背景ボケ", compositionOther: "その他" } },
  finish: { label: "仕上がり", name: "finishName", basic: ["finishName", "ratio", "style"], fields: {
    finishName: "管理用プリセット名", ratio: "画像比率", style: "表現形式", finishCamera: "撮影機材感", finishLight: "光", tone: "色調", depth: "被写界深度", texture: "画質・質感", finishOther: "その他" } }
};
const FIELD_KEYS = [...Object.values(SCHEMA).flatMap(s => Object.keys(s.fields)), "negative", "expression"];
const DEFAULT_DRAFT = Object.fromEntries(FIELD_KEYS.map(k => [k, k === "ratio" ? "9:16" : k === "style" ? STYLES[0] : ""]));
const PLACEHOLDERS = {
  characterName: "例：いつもの人物A（管理用）", age: "例：24歳", description: "例：明るく親しみやすい雰囲気。大人っぽさもある",
  face: "例：やや丸みのある卵型の輪郭、柔らかな顔立ち", eyes: "例：やや大きめのアーモンド型の目",
  hair: "例：胸元までのゆるいウェーブのロングヘア、暗めのブラウン",
  skinMakeup: "例：自然な肌の質感。毛穴感を適度に残し、過度な美肌加工をしない。ナチュラルメイク",
  physique: "例：健康的で自然な成人女性の体型、165cm", physicalFeatures: "例：すらっとした手足",
  requiredFeatures: "例：顔立ち、髪型、髪色", characterNotes: "例：顔立ちと髪型の一貫性を強く維持",
  outfitName: "例：黒のナイトドレス", outfit: "例：シンプルな黒いロングドレス", outfitType: "例：ナイトドレス", outfitColor: "例：黒",
  outfitMaterial: "例：シルク", outfitDesign: "例：装飾の少ないデザイン", shoes: "例：黒のパンプス", accessories: "例：小さなイヤリング", outfitOther: "例：自然な生地のしわ",
  sceneName: "例：ホテルパーティ", situation: "例：友人と夜のパーティを楽しんでいる", location: "例：ホテルのラウンジ", timeOfDay: "例：夜",
  sceneActivity: "例：友人と会話する", people: "例：背景に他の参加者", sceneLight: "例：暖色の間接照明", atmosphere: "例：落ち着いて華やか",
  props: "例：テーブルのグラス", background: "例：ホテルのロビー", sceneOther: "例：背景は自然な生活感",
  actionName: "例：自然な笑顔", actionExpression: "例：穏やかな笑顔", gaze: "例：カメラを見る", mouth: "例：軽く口角を上げる", movement: "例：ゆっくり歩く",
  hands: "例：片手でバッグを持つ", interaction: "例：友人と話している", actionOther: "例：動きを作り込みすぎない",
  compositionName: "例：全身・友人撮影", composition: "例：全身を中央に配置", framing: "例：全身", cameraDirection: "例：正面より少し斜め", cameraHeight: "例：目線程度",
  distance: "例：2〜3m", angle: "例：自然な正面", pose: "例：自然に立つ", cameraGaze: "例：撮影者を見る", photographer: "例：友人", cameraFeel: "例：スマートフォン写真",
  lens: "例：標準レンズ", bokeh: "例：弱い背景ボケ", compositionOther: "例：頭上と足元に少し余白",
  finishName: "例：スマホ実写", finishCamera: "例：スマートフォン撮影風", finishLight: "例：自然な光", tone: "例：自然な色調", depth: "例：適度な被写界深度",
  texture: "例：過度な美肌加工を避ける", finishOther: "例：自然な粒子感を残す"
};
const $ = selector => document.querySelector(selector);
const form = $("#prompt-form");
const warning = $("#storage-warning");
let storageBlocked = false;
let statusTimer;
let currentPrompt = "";
let selectedCategory = "character";
let saveCategory;
let editing = null;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function action(label, callback, className = "secondary") {
  const button = element("button", className, label);
  button.type = "button";
  button.addEventListener("click", callback);
  return button;
}
function showStatus(message, duration = 3000) {
  clearTimeout(statusTimer);
  $("#status").textContent = message;
  statusTimer = setTimeout(() => { $("#status").textContent = ""; }, duration);
}
function showWarning(message) { warning.textContent = message; warning.hidden = false; }
function newId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function isObject(value) { return value && typeof value === "object" && !Array.isArray(value); }
// expressionは旧人物設定の回収用。人物UIに表示せず表情・動作へ引き継ぎます。
function mergeDetails(...parts) { return parts.filter(part => part && part.trim()).map(part => part.trim()).join("\n"); }
function migrateDraft(value, version) {
  if (!isObject(value)) throw new Error("入力データが不正です");
  if (version === DATA_VERSION) return cleanDraft(value);
  const migrated = { ...value };
  const groups = { hair: ["hairStyle", "hairColor"], skinMakeup: ["skin", "makeup"], physique: ["bodyType", "height"], requiredFeatures: ["fixedFeatures", "maintainedFeatures"], characterNotes: ["features", "characterNotes"] };
  for (const [target, keys] of Object.entries(groups)) {
    for (const key of keys) if (value[key] !== undefined && typeof value[key] !== "string") throw new Error("旧人物項目の型が不正です");
    migrated[target] = mergeDetails(...keys.map(key => value[key] || ""));
  }
  if (!migrated.actionExpression && migrated.expression) migrated.actionExpression = migrated.expression;
  return cleanDraft(migrated);
}
function cleanDraft(value) {
  if (!isObject(value)) throw new Error("入力データが不正です");
  const result = { ...DEFAULT_DRAFT };
  for (const key of FIELD_KEYS) {
    if (value[key] !== undefined && typeof value[key] !== "string") throw new Error("入力の型が不正です");
    if (typeof value[key] === "string") result[key] = value[key];
  }
  const oldStyles = { "実写風": STYLES[0], "イラスト風": "イラスト", "アニメ風": "アニメ" };
  result.style = oldStyles[result.style] || result.style;
  if (!RATIOS.includes(result.ratio) || !STYLES.includes(result.style)) throw new Error("比率・表現形式が不正です");
  return result;
}
function categoryData(category, draft) {
  const keys = [...Object.keys(SCHEMA[category].fields), ...(category === "character" ? ["expression"] : [])];
  return Object.fromEntries(keys.map(key => [key, draft[key]]));
}
function emptyState() {
  return { version: DATA_VERSION, draft: { ...DEFAULT_DRAFT }, presets: Object.fromEntries(Object.keys(SCHEMA).map(k => [k, []])), history: [], recent: {} };
}
// V2/V2.1のキーは残し、初回だけV2.2へ移行。完成文章・IDも保持します。
function normalizeState(saved) {
  if (!isObject(saved) || ![2, 3, DATA_VERSION].includes(saved.version) || !isObject(saved.presets) || !Array.isArray(saved.history)) throw new Error("未対応の保存形式です");
  const result = emptyState();
  result.draft = migrateDraft(saved.draft, saved.version);
  const allIds = new Set();
  for (const category of Object.keys(SCHEMA)) {
    const entries = saved.presets[category] ?? (saved.version === 2 && ["action", "finish"].includes(category) ? [] : null);
    if (!Array.isArray(entries)) throw new Error("保存設定が不正です");
    result.presets[category] = entries.map(item => {
      if (!isObject(item) || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name.trim() || !validDate(item.createdAt) || allIds.has(item.id)) throw new Error("保存設定が不正です");
      if (saved.version >= 3 && (item.type !== category || item.version !== saved.version || !validDate(item.updatedAt) || typeof item.favorite !== "boolean")) throw new Error("設定メタデータが不正です");
      allIds.add(item.id);
      const draft = migrateDraft(item.data, saved.version);
      // V2保存時の名前を管理名にも引き継ぎ、カードの要約に使用します。
      if (!draft[SCHEMA[category].name]) draft[SCHEMA[category].name] = item.name;
      return { id: item.id, type: category, name: item.name, createdAt: item.createdAt, updatedAt: item.updatedAt || item.createdAt, favorite: item.favorite === true, version: DATA_VERSION, data: categoryData(category, draft) };
    });
  }
  const historyIds = new Set();
  if (saved.history.length > 100) throw new Error("履歴は100件までです");
  result.history = saved.history.map(item => {
    if (!isObject(item) || typeof item.id !== "string" || !item.id || historyIds.has(item.id) || typeof item.prompt !== "string" || !validDate(item.createdAt)) throw new Error("履歴が不正です");
    historyIds.add(item.id);
    return { id: item.id, prompt: item.prompt, createdAt: item.createdAt, draft: migrateDraft(item.draft, saved.version) };
  });
  if (isObject(saved.recent)) for (const category of Object.keys(SCHEMA)) {
    if (typeof saved.recent[category] === "string" && result.presets[category].some(p => p.id === saved.recent[category])) result.recent[category] = saved.recent[category];
  }
  return result;
}
function validDate(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function loadState() {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    const previous = current === null ? localStorage.getItem(PREVIOUS_KEY) : null;
    const legacy = current === null && previous === null ? localStorage.getItem(LEGACY_KEY) : null;
    if (current === null && previous === null && legacy === null) return emptyState();
    const result = normalizeState(JSON.parse(current ?? previous ?? legacy));
    if (current === null) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(result)); }
      catch { showWarning("旧データは読み込めましたが、V2.2の保存に失敗しました。元データは残っています。JSONでバックアップしてください。"); }
    }
    return result;
  } catch {
    storageBlocked = true;
    showWarning("保存データを読み込めず自動保存を停止しました。元データは上書きしていません。作成・コピー・JSON書き出しは利用できます。");
    return emptyState();
  }
}
let state = loadState();
function persist() {
  if (storageBlocked) return false;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); warning.hidden = true; return true; }
  catch { showWarning("ブラウザに保存できませんでした。容量や設定を確認し、JSONでバックアップしてください。画面の入力は閉じると失われる可能性があります。"); return false; }
}
// 保存設定や履歴への操作は、永続化失敗時に元に戻します。
function commitChange(change) {
  const previous = JSON.stringify(state);
  change();
  if (persist()) return true;
  state = JSON.parse(previous);
  showStatus("変更を保存できませんでした");
  return false;
}
function readDraft() { return cleanDraft(Object.fromEntries(new FormData(form))); }
function fillForm(draft) {
  for (const key of FIELD_KEYS) form.elements.namedItem(key).value = draft[key];
  for (const category of Object.keys(SCHEMA)) $(`#preset-${category}`).value = "";
  renderPrompt();
}
function sentence(text) { return /[。！？.!?]$/.test(text) ? text : `${text}。`; }
// 既知の補助表現だけを意味キーへ対応させます。自由文の類似推測はしません。
function cameraMeaning(value, role) {
  const fullBody = ["全身", "全身構図", "頭から足元まで画面に入る全身構図", "全身（頭から足元まで画面に入れる）", "全身構図（頭から足元まで画面に入れる）"];
  const friend = ["友達が撮影", "友人が撮影", "友達が撮影したような視点", "友人が撮影したような視点", "友人が撮影したような自然な視点"];
  const selfie = ["自撮り", "本人が自分を撮影する自撮りの視点", "自撮り（本人が自分を撮影する視点）"];
  if(role === "framing" && fullBody.includes(value)) return "full-body";
  if(role === "framing" && ["顔アップ", "顔のアップ", "顔を中心にした近距離構図"].includes(value)) return "face-closeup";
  if(role === "framing" && ["バストアップ", "頭部から胸元付近までを中心にした構図"].includes(value)) return "bust-up";
  if(role === "photographer" && friend.includes(value)) return "friend-photo";
  if(role === "photographer" && selfie.includes(value)) return "selfie";
  return "";
}
function compileCameraPhrase(value, role) {
  const meaning = cameraMeaning(value,role);
  return {"full-body":"頭から足元まで画面に入る全身構図", "face-closeup":"顔を中心にした近距離構図", "bust-up":"頭部から胸元付近までを中心にした構図", "friend-photo":"友人が撮影したような自然な視点", "selfie":"本人が自分を撮影する自撮りの視点"}[meaning] || value;
}
function uniqueInstructions(value) {
  return [...new Set(value.split("\n").map(line => line.trim()).filter(Boolean))].join("\n");
}
// 補強は限定した条件だけで判断。管理情報・ネガティブは判断材料にも使いません。
function compilerContext(d) {
  const names = new Set(Object.values(SCHEMA).map(schema => schema.name));
  const text = FIELD_KEYS.filter(key => !names.has(key) && !["negative", "expression", "ratio", "style"].includes(key)).map(key => d[key]).join("\n");
  const notes = ["characterNotes", "outfitOther", "sceneOther", "actionOther", "compositionOther", "finishOther", "requiredFeatures"].some(key => d[key]);
  const photographic = ["実写・フォトリアル", "スマートフォン写真風"].includes(d.style);
  // 自由文の否定・指定を勝手に解釈せず、該当語があれば補強を控えます。
  const alternateCapture = /鏡|三脚|セルフタイマー|タイマー撮影|リモート|ドローン/.test(text);
  const staged = /作り込|作りこ|演出|ポーズ|スタジオ|記念写真|スナップ|カメラを意識/.test(text) || !!d.pose;
  const cameraSpecified = notes || alternateCapture || /距離|望遠|広角|魚眼|接写|一眼|フィルム|スマートフォン|スマホ|カメラ位置/.test(text) || !![d.distance, d.cameraDirection, d.cameraHeight, d.angle, d.cameraFeel, d.finishCamera, d.lens].some(Boolean);
  const night = ["夜", "夜間", "深夜"].includes(d.timeOfDay) || (/ナイトパーティ/.test(d.situation) && !/ない|なく|禁止|避け|以外|除く/.test(d.situation));
  const lightSpecified = /夜(?:では|じゃ)?(?:ない|なく)|ナイトパーティ(?:では|じゃ)?(?:ない|なく)/.test(text) || notes || !!d.sceneLight || !!d.finishLight || /照明|光|昼|日中|明るい時間|ネオン|街灯|ライト|夕方|朝/.test(text);
  const textureSpecified = notes || !!d.texture || /質感|CG|加工|絵画|非現実|イラスト|アニメ|現実的|写真のよう/.test(text);
  return {photographic, cameraSpecified, staged, night, lightSpecified, textureSpecified};
}
function normalizeScene(value) {
  // 明確な短い表現だけを表記整理。長文・否定や引用を含む自由文は保持。
  return /^ナイトパーティでおさけをのんでる[。]?$/.test(value) ? value.replace("おさけをのんでる", "お酒を飲んでいる") : value;
}
// 短い名詞句だけを接続します。否定・指示・長文は文意を推測せず保持します。
function detailParts(value, separator = /\n/) {
  return [...new Set(value.split(separator).map(part => part.trim()).filter(Boolean))];
}
function simpleDetail(value) {
  return value.length <= 160 && !/[。！？.!?\n「」]|ない|なく|禁止|避け|以外|除く|維持|固定|してください|とする/.test(value);
}
function compilePerson(d) {
  let sentences=[]; const groups=[]; const seen=new Set();
  const finishGroup=()=>{if(sentences.length) groups.push(sentences.join(" ")); sentences=[];};
  const add=value=>{if(value) { const text=sentence(value); if(!seen.has(text)) { seen.add(text); sentences.push(text); } }};
  const ageNoun=/^(?:\d+(?:〜\d+)?歳|\d+代)$/.test(d.age);
  const ageAlreadyDescribed=ageNoun && d.description.startsWith(`${d.age}の`) && !/ない|なく|禁止|避け|以外|除く/.test(d.description);
  if(d.age && !ageAlreadyDescribed) add(ageNoun ? `${d.age}の人物` : `年齢・年代は${d.age}`);
  if(d.description) add(/^[^。！？\n]{1,80}雰囲気$/.test(d.description) ? `${d.description}の人物` : d.description);

  finishGroup();
  const faceNoun=simpleDetail(d.face) && /(?:輪郭|顔立ち|顔|目元)$/.test(d.face);
  const eyeNoun=simpleDetail(d.eyes) && /(?:目|瞳|目元)$/.test(d.eyes);
  if(d.face && d.eyes && faceNoun && eyeNoun) add(d.face === d.eyes ? d.face : `${d.face}で、${d.eyes}`);
  else {
    if(d.face) add(faceNoun ? d.face : `顔立ちは${d.face}`);
    if(d.eyes) add(eyeNoun ? d.eyes : `目は${d.eyes}`);
  }
  finishGroup();
  // 旧髪型＋髪色の改行結合も、現行の一体化した自由入力も受け付けます。
  const hair=detailParts(d.hair, /[\n、]/);
  const color=/^(?:暗めの|明るめの|淡い|濃い)?(?:ブラウン|茶色|黒|黒髪|金色|金髪|白|白髪|赤|赤髪|銀色|シルバー|ベージュアッシュ|ブロンド)$/;
  if(hair.length===2 && hair.every(simpleDetail) && hair.some(part=>color.test(part))) {
    const hue=hair.find(part=>color.test(part));const shape=hair.find(part=>part!==hue);
    if(shape && /(?:ヘア|髪|ロング|ショート|ウェーブ|ボブ)$/.test(shape)) add(`${hue}の${shape}${/^(?:ロング|ショート)$/.test(shape) ? "ヘア" : ""}`);
    else add(`髪は${hair.join("、")}`);
  } else if(d.hair) add(hair.every(simpleDetail) && hair.length>1 ? `髪は${hair.join("、")}` : `髪は${d.hair}`);

  finishGroup();
  const skin=detailParts(d.skinMakeup, /[\n、]/);
  if(skin.length===2 && skin.every(simpleDetail) && /肌$/.test(skin[0]) && /メイク|化粧$/.test(skin[1])) add(`${skin[0]}に${skin[1]}`);
  else if(d.skinMakeup) add(skin.every(simpleDetail) && skin.length>1 ? `肌・メイクは${skin.join("、")}` : `肌・メイクは${d.skinMakeup}`);

  finishGroup();
  const physique=detailParts(d.physique, /[\n、]/);
  const height=physique.find(part=>/^\d+(?:\.\d+)?\s*(?:cm|センチ|センチメートル)$/.test(part));
  const body=height && physique.length===2 ? physique.find(part=>part!==height) : d.physique;
  const bodyText=height && physique.length<=2 ? `身長${height}${body && body!==height ? `、${body}` : ""}` : body;
  const bodyNoun=body && simpleDetail(body) && /(?:体型|体格|細身|筋肉質)$/.test(body);
  if(bodyText && d.physicalFeatures && bodyNoun && simpleDetail(d.physicalFeatures)) add(bodyText === d.physicalFeatures ? bodyText : `${bodyText}で、${d.physicalFeatures}`);
  else {
    if(bodyText) add(bodyNoun || height ? bodyText : `体型・身長は${bodyText}`);
    if(d.physicalFeatures) add(`身体的特徴は${d.physicalFeatures}`);
  }
  finishGroup();
  const fixedList=/^(?:顔立ち|顔|髪型|髪色|髪|目|肌|肌質|体型)(?:[、・](?:顔立ち|顔|髪型|髪色|髪|目|肌|肌質|体型))*$/;
  const instructions=detailParts(d.requiredFeatures);
  const isInstruction=part=>/維持|固定|保持|保つ|残す|ない|なく|禁止|避け|せず|してください|する[。]?$/.test(part);
  // 固定欄の意味を必ず残す。既存の指示や否定を別の指示に変換しません。
  const consistency=instructions.map(part=>fixedList.test(part) ? `${part}の特徴を維持する` : !isInstruction(part) ? (simpleDetail(part) ? `${part}を維持する` : `維持する特徴は${part}`) : part);
  if(instructions.length===2 && fixedList.test(instructions[0])) {
    const strong=instructions[1].match(/^(.+)の一貫性を強く維持[。]?$/);
    const names=instructions[0].split(/[、・]/);
    const targets=strong ? strong[1].split(/[と・、]/) : [];
    if(targets.length && targets.every(name=>names.includes(name))) {
      add(`${instructions[0]}の特徴を維持し、特に${instructions[1]}`);
    } else consistency.forEach(add);
  } else consistency.forEach(add);
  if(d.characterNotes) add(d.characterNotes);
  finishGroup();
  return groups.join("\n\n");
}
function buildPrompt(draft) {
  const d = Object.fromEntries(Object.entries(draft).map(([key,value]) => [key,value.trim()]));

  // 表現形式だけでも画像全体と質感を生成。既定の選択も通常の指定として扱います。
  const context = compilerContext(d);

  const style = {"実写・フォトリアル":"実写・フォトリアルな画像", "スマートフォン写真風":"スマートフォンで撮影した写真のような画像", "イラスト":"イラスト", "アニメ":"アニメ風の画像"};
  const orientation = {"9:16":"縦長", "4:5":"縦長", "1:1":"正方形", "3:4":"縦長", "16:9":"横長"};
  const paragraphs = [`${d.ratio}の${orientation[d.ratio]}、${style[d.style]}。`];
  const addParagraph = parts => { const text=parts.filter(Boolean).join(" "); if(text) paragraphs.push(text); };
  // 値の中の句読点・否定・数値は保持し、入力の外側だけに接続表現を付けます。
  const directFields = fields => fields.filter(([key]) => d[key]).map(([key,label]) => sentence(`${label}は${d[key]}`));

  addParagraph([compilePerson(d)]);

  const description=[];
  const scene = normalizeScene(d.situation);
  // 短い衣服名だけを「着ている」へ接続。否定・指示文・複雑な自由文はそのまま。
  const garment=/^[^。！？\n]{1,80}(?:ドレス|シャツ|ローブ|コート|スーツ|ワンピース|ジャケット|着物|制服|服)$/;
  const wearable=garment.test(d.outfit) && !/(?:ない|禁止|避け|以外|除く|せず)/.test(d.outfit);
  const sceneClause=/[^。！？\n](?:ている|でいる|んでいる|てる|でる|する|いる|歩く|話す|飲む|楽しむ)$/.test(scene);
  if(wearable && sceneClause) description.push(sentence(`${d.outfit}を着て、${scene}`));
  else {
    if(d.outfit) description.push(sentence(wearable ? `${d.outfit}を着ている` : `衣装は${d.outfit}`));
    if(d.situation) description.push(sentence(scene));
  }
  description.push(...directFields([["outfitType","衣装の種類"],["outfitColor","衣装の色"],["outfitMaterial","素材"],["outfitDesign","デザイン"],["shoes","靴"],["accessories","アクセサリー"]]));
  description.push(...directFields([["location","場所"],["timeOfDay","時間帯"],["sceneActivity","場面内の行動"],["people","周囲の人物"],["atmosphere","雰囲気"],["props","小物"],["background","背景"]]));
  const expressions=["笑顔","自然な笑顔","穏やかな笑顔","真剣な表情","無表情"];
  const movementClause=/^[^。！？\n]{1,80}(?:ている|でいる|んでいる|てる|でる|歩く|話す|飲む)$/.test(d.movement);
  if(expressions.includes(d.actionExpression) && movementClause) description.push(sentence(`${d.actionExpression}で${d.movement}`));
  else description.push(...directFields([["actionExpression","表情"],["movement","身体の動作"]]));
  description.push(...directFields([["gaze","視線"],["mouth","口元"],["hands","手の動き"],["interaction","人物同士のやり取り"]]));
  addParagraph(description);

  // 構図欄と専用欄をまたぐ、コンパイラ由来の既知の意味重複を一度に整理。
  const camera=[]; const known=new Set();
  const addCamera=(value,role,prefix="") => {
    if(!value) return;
    const meaning=cameraMeaning(value,role);
    if(meaning && known.has(meaning)) return;
    if(meaning) known.add(meaning);
    let phrase = meaning ? compileCameraPhrase(value,role) : `${prefix}${value}`;
    if(meaning === "friend-photo" && context.photographic && !context.staged && !context.cameraSpecified) phrase += "。何気ないスナップ写真のような仕上がり";
    if(meaning === "selfie" && !context.cameraSpecified) phrase += "。自撮りらしいカメラとの距離感";
    camera.push(sentence(phrase));
  };
  const compositionParts=d.composition.split(/[\n、,]/).map(part=>part.trim()).filter(Boolean);
  const unrecognized=[];
  for(const part of compositionParts) {
    const role=cameraMeaning(part,"framing") ? "framing" : cameraMeaning(part,"photographer") ? "photographer" : "";
    if(role) addCamera(part,role); else unrecognized.push(part);
  }
  if(unrecognized.length) camera.push(sentence(unrecognized.join("、")));
  // 自由入力同士は、全文が同じ場合以外に削除しません。
  if(d.framing !== d.composition) addCamera(d.framing,"framing","撮影範囲は");
  camera.push(...directFields([["pose","ポーズ"],["cameraDirection","カメラ方向"],["cameraHeight","カメラの高さ"],["distance","被写体との距離"],["angle","アングル"]]));
  if(d.cameraGaze && d.cameraGaze!==d.gaze) camera.push(sentence(`構図での視線は${d.cameraGaze}`));
  addCamera(d.photographer,"photographer","撮影者は");
  camera.push(...directFields([["cameraFeel","撮影機材感"],["lens","レンズ感"]]));
  addParagraph(camera);

  const finishFields=[["sceneLight","場面の照明"],["finishLight","仕上がりの光"],["finishCamera","仕上がりの撮影機材感"],["tone","色調"],["depth","被写界深度"],["bokeh","背景ボケ"],["texture","画質・質感"]];
  const finish=finishFields.filter(([key])=> !(key==="finishLight" && d[key]===d.sceneLight) && !(key==="finishCamera" && d[key]===d.cameraFeel));
  const finishText = directFields(finish);
  if(context.night && !context.lightSpecified) finishText.push("夜の環境に合う自然な環境光。");
  if(context.photographic && !context.textureSpecified) finishText.push("現実的な質感を保った仕上がり。");
  addParagraph(finishText);
  addParagraph(["outfitOther","sceneOther","actionOther","compositionOther","finishOther"].filter(key=>d[key]).map(key=>sentence(d[key])));
  return paragraphs.join("\n\n");
}

function createField(key, label, prefix = "") {
  const wrapper = element("div", "field");
  const labelNode = element("label", "", label);
  labelNode.htmlFor = `${prefix}${key}`;
  const input = element(["ratio", "style"].includes(key) ? "select" : "textarea");
  input.id = `${prefix}${key}`; input.name = key;
  if (["ratio", "style"].includes(key)) {
    for (const value of key === "ratio" ? RATIOS : STYLES) input.add(new Option(value, value));
  } else {
    input.rows = ["description", "requiredFeatures", "characterNotes"].includes(key) ? 3 : 2;
    input.placeholder = PLACEHOLDERS[key] || `例：${label}についての希望を記入`;
    if (Object.values(SCHEMA).some(s => s.name === key)) input.maxLength = 100;
  }
  wrapper.append(labelNode, input);
  return wrapper;
}
function appendCategoryFields(container, category, prefix = "") {
  const schema = SCHEMA[category];
  if (category === "character") {
    const basic=element("section","person-group");
    basic.append(element("h3","person-group-title","基本情報"));
    for(const key of schema.basic) basic.append(createField(key,schema.fields[key],prefix));
    const hint=element("p","hint","顔・髪・体型などの外見は下の『外見』へ入力");
    hint.id=`${prefix}person-description-hint`;
    basic.children[basic.children.length-1].children[1].setAttribute("aria-describedby",hint.id);
    basic.append(hint);container.append(basic);
    for(const [title,keys,open] of [
      ["外見",["face","eyes","hair","skinMakeup","physique","physicalFeatures"],true],
      ["一貫性",["requiredFeatures","characterNotes"],false]
    ]) {
      const group=element("details","field-details person-group");group.open=open;
      group.append(element("summary","",title));
      for(const key of keys) group.append(createField(key,schema.fields[key],prefix));
      container.append(group);
    }
    return;
  }
  for (const key of schema.basic) container.append(createField(key, schema.fields[key], prefix));
  const details = element("details", "field-details");
  details.append(element("summary", "", "詳細設定"));
  for (const [key,label] of Object.entries(schema.fields)) if (!schema.basic.includes(key)) details.append(createField(key,label,prefix));
  container.append(details);
}
function setupEditors() {
  const legacyExpression = element("input"); legacyExpression.type = "hidden"; legacyExpression.name = "expression"; legacyExpression.id = "expression"; form.append(legacyExpression);
  for (const [category, schema] of Object.entries(SCHEMA)) {
    const quick = element("div");
    const label = element("label", "", schema.label); label.htmlFor = `preset-${category}`;
    const select = element("select"); select.id = `preset-${category}`; select.dataset.preset = category;
    select.addEventListener("change", () => { if (select.value) applyPreset(category,select.value); });
    const chips = element("div", "quick-chips"); chips.id = `chips-${category}`;
    quick.append(label,select,chips); $("#quick-selects").append(quick);
    const card = element("details", "card editor-card"); card.id = `card-${category}`;
    const summary = element("summary"); summary.append(element("span", "card-label", schema.label));
    const preview = element("span", "card-summary"); preview.id = `summary-${category}`; summary.append(preview);
    const body = element("div", "card-body"); appendCategoryFields(body,category);
    if (category === "finish") body.append(element("p", "hint", "比率は生成サービス側でも設定が必要な場合があります。"));
    body.append(action(`${schema.label}を別名で保存`, () => openSave(category)));
    body.append(element("p", "hint", "新規保存です。元の設定を上書きする場合は「保存設定」の「編集」から変更を保存してください。"));
    card.append(summary,body); $("#editor-cards").append(card);
    $("#preset-category").add(new Option(schema.label,category));
  }
}
function summaryText(category, draft) {
  const schema = SCHEMA[category];
  if (category === "finish") return [draft.finishName, draft.ratio, draft.style].filter(Boolean).join("・");
  if (draft[schema.name].trim()) return draft[schema.name].trim();
  return Object.keys(schema.fields).filter(k => k !== schema.name).map(k => draft[k].trim()).filter(Boolean).slice(0,2).join("・");
}
function hasCategoryContent(category,draft) {
  return Object.keys(SCHEMA[category].fields).filter(k => k !== SCHEMA[category].name).some(k => draft[k].trim());
}
function renderPrompt() {
  resizeTextareas(form);
  const draft = readDraft();
  currentPrompt = buildPrompt(draft);
  $("#prompt-output").textContent = currentPrompt || "設定を選ぶか、カードを開いて入力してください。";
  $("#negative-output").textContent = draft.negative.trim() || "未入力";
  for (const id of ["copy-button", "quick-copy", "save-history"]) $(`#${id}`).disabled = !currentPrompt;
  $("#copy-negative").disabled = !draft.negative.trim();
  for (const category of Object.keys(SCHEMA)) {
    const value = summaryText(category,draft);
    $(`#summary-${category}`).textContent = hasCategoryContent(category,draft) ? `${value || "設定済み"} ✓` : "未設定";
  }
  $("#negative-summary").textContent = draft.negative.trim() ? "入力済み ✓" : "未入力";
}
function updateDraft() {
  state.draft = readDraft(); renderPrompt(); persist();
  // 手入力したカテゴリは「保存設定そのまま」の選択状態を解除します。
  for (const category of Object.keys(SCHEMA)) {
    const select = $(`#preset-${category}`);
    const item = state.presets[category].find(p => p.id === select.value);
    if (item && Object.keys(SCHEMA[category].fields).some(k => state.draft[k] !== item.data[k])) select.value = "";
  }
}
function sortedPresets(category) {
  return [...state.presets[category]].sort((a,b) => Number(b.favorite)-Number(a.favorite) || b.updatedAt.localeCompare(a.updatedAt));
}
function renderQuick() {
  for (const category of Object.keys(SCHEMA)) {
    const select = $(`#preset-${category}`); const selected = select.value;
    select.replaceChildren(new Option("選択してください", ""));
    const items = sortedPresets(category);
    for (const item of items) select.add(new Option(`${item.favorite ? "★ " : ""}${item.name}`, item.id));
    const matching = items.find(item => item.id === selected);
    if (matching && Object.keys(SCHEMA[category].fields).every(key => state.draft[key] === matching.data[key])) select.value = selected;
    const chips = $(`#chips-${category}`); chips.replaceChildren();
    const candidates = items.filter(item => item.favorite).slice(0,2);
    const recent = items.find(item => item.id === state.recent[category]);
    if (recent && !candidates.some(item => item.id === recent.id)) candidates.push(recent);
    for (const item of candidates.slice(0,3)) {
      const chip = action(`${item.favorite ? "★ " : "↺ "}${item.name}`, () => applyPreset(category,item.id), "chip");
      chip.title = item.name; chips.append(chip);
    }
  }
}
function applyPreset(category,id) {
  const item = state.presets[category].find(p => p.id === id); if (!item) return;
  for (const key of Object.keys(SCHEMA[category].fields)) form.elements.namedItem(key).value = item.data[key];
  if (category === "character") {
    form.elements.namedItem("expression").value = item.data.expression || "";
    if (!form.elements.namedItem("actionExpression").value.trim() && item.data.expression) form.elements.namedItem("actionExpression").value = item.data.expression;
  }
  state.draft = readDraft(); state.recent[category] = id;
  $(`#preset-${category}`).value = id;
  $(`#card-${category}`).open = false;
  renderPrompt(); renderQuick(); persist(); showStatus(`${SCHEMA[category].label}を読み込みました`);
}
function switchTab(tab) {
  for (const name of ["create", "presets", "history"]) {
    $(`#panel-${name}`).hidden = name !== tab;
    if (name === tab) $(`#nav-${name}`).setAttribute("aria-current","page"); else $(`#nav-${name}`).removeAttribute("aria-current");
  }
  $("#result-shortcuts").hidden = tab !== "create";
  window.scrollTo(0,0);
}
function openSave(category) {
  saveCategory = category;
  const draft = readDraft();
  if (!hasCategoryContent(category,draft)) { showStatus("保存する内容を入力してください"); return; }
  $("#preset-name").value = (draft[SCHEMA[category].name] || summaryText(category,draft)).slice(0,100);
  $("#save-title").textContent = `${SCHEMA[category].label}を保存`;
  $("#save-hint").textContent = "新しい設定として保存します。同じ名前でも元の設定は上書きしません。";
  $("#save-dialog").showModal(); $("#preset-name").focus();
}
function savePreset(category,name,draft) {
  if (!name.trim() || !hasCategoryContent(category,draft)) return false;
  const now = new Date().toISOString();
  const data = categoryData(category,draft); data[SCHEMA[category].name] = name.trim();
  return commitChange(() => state.presets[category].unshift({id:newId(),type:category,name:name.trim(),createdAt:now,updatedAt:now,favorite:false,version:DATA_VERSION,data}));
}
function findPreset(category,id) { return state.presets[category].find(p => p.id === id); }
function toggleFavorite(category,id) {
  if (!commitChange(() => { const item=findPreset(category,id); item.favorite=!item.favorite; item.updatedAt=new Date().toISOString(); })) return;
  renderPresets(); renderQuick();
}
function duplicatePreset(category,id) {
  const original=findPreset(category,id); if (!original) return;
  const now=new Date().toISOString();
  if (!commitChange(() => {
    const copy=JSON.parse(JSON.stringify(original));
    copy.id=newId(); copy.name=`${original.name.slice(0,95)}（コピー）`; copy.data[SCHEMA[category].name]=copy.name;
    copy.createdAt=now; copy.updatedAt=now;
    state.presets[category].unshift(copy);
  })) return;
  renderPresets(); renderQuick(); showStatus("設定を複製しました");
}
function deletePreset(category,id) {
  const item=findPreset(category,id);
  if (!item || !confirm(`「${item.name}」を削除しますか？`)) return;
  if (!commitChange(() => { state.presets[category]=state.presets[category].filter(p => p.id!==id); if(state.recent[category]===id) delete state.recent[category]; })) return;
  renderPresets(); renderQuick(); showStatus("設定を削除しました。作成中の入力は残っています。");
}
function openEdit(category,id) {
  const item=findPreset(category,id); if (!item) return;
  editing={category,id}; $("#edit-title").textContent=`${SCHEMA[category].label}の保存設定を編集`;
  $("#edit-name").value=item.name;
  const fields=$("#edit-fields"); fields.replaceChildren();
  appendCategoryFields(fields,category,"edit-");
  for (const key of Object.keys(SCHEMA[category].fields)) $(`#edit-${key}`).value=item.data[key];
  // 管理名は設定名欄に一本化し、二重入力を避けます。
  $(`#edit-${SCHEMA[category].name}`).parentElement.hidden=true;
  $("#edit-dialog").showModal(); resizeTextareas($("#edit-form")); $("#edit-name").focus();
}
// 長文も手動リサイズなしで読める高さへ。折りたたみ中は展開時に再計算します。
function resizeTextareas(container) {
  for (const textarea of container.querySelectorAll("textarea")) {
    textarea.style.height = "auto";
    const minimum = textarea.rows >= 3 ? 96 : 72;
    textarea.style.height = `${Math.min(256, Math.max(minimum, textarea.scrollHeight || minimum))}px`;
  }
}
function editPreset(category,id,name,data) {
  if (!findPreset(category,id) || !name.trim()) return false;
  const draft=cleanDraft({...data, ...(category === "character" ? {expression: findPreset(category,id).data.expression || ""} : {})});
  if (!hasCategoryContent(category,draft)) { showStatus("設定内容を入力してください"); return false; }
  return commitChange(() => {
    const item=findPreset(category,id); item.name=name.trim(); item.data=categoryData(category,draft);
    item.data[SCHEMA[category].name]=item.name; item.updatedAt=new Date().toISOString();
  });
}
function renderPresets() {
  const list=$("#preset-list"); list.replaceChildren();
  const items=sortedPresets(selectedCategory);
  if (!items.length) list.append(element("p","empty","このカテゴリの設定はありません。作成画面のカードから保存できます。"));
  for (const item of items) {
    const row=element("article","preset-row");
    const heading=element("div","preset-heading");
    const favorite=action(item.favorite ? "★" : "☆",()=>toggleFavorite(selectedCategory,item.id),"favorite");
    favorite.setAttribute("aria-label",`${item.name}のお気に入り`); favorite.setAttribute("aria-pressed",String(item.favorite));
    heading.append(element("h3","entry-title",item.name),favorite); row.append(heading);
    const actions=element("div","row-actions");
    actions.append(action("読み込み",()=>{applyPreset(selectedCategory,item.id);switchTab("create");}),action("編集",()=>openEdit(selectedCategory,item.id)),action("複製",()=>duplicatePreset(selectedCategory,item.id)),action("削除",()=>deletePreset(selectedCategory,item.id),"danger"));
    row.append(actions); list.append(row);
  }
}
function saveHistory() {
  const draft=readDraft(); const prompt=buildPrompt(draft); if(!prompt) return;
  if(!commitChange(()=>{state.history=[{id:newId(),createdAt:new Date().toISOString(),draft,prompt},...state.history].slice(0,100);})) return;
  renderHistory(); showStatus("履歴に保存しました");
}
function restoreHistory(id) {
  const item=state.history.find(h=>h.id===id);
  if(!item || !confirm("現在の入力をこの履歴の設定に置き換えますか？")) return;
  state.draft={...item.draft}; fillForm(state.draft);
  for(const category of Object.keys(SCHEMA)) { $(`#preset-${category}`).value=""; $(`#card-${category}`).open=false; }
  persist(); switchTab("create"); showStatus("履歴の設定を復元しました");
}
function deleteHistory(id) {
  if(!confirm("この履歴を削除しますか？")) return;
  if(!commitChange(()=>{state.history=state.history.filter(h=>h.id!==id);})) return;
  renderHistory(); showStatus("履歴を削除しました");
}
function renderHistory() {
  const list=$("#history-list"); list.replaceChildren(); $("#history-count").textContent=`（${state.history.length}/100）`;
  if(!state.history.length) list.append(element("p","empty","「履歴に保存」で組み合わせを残せます。"));
  for(const item of state.history) {
    const row=element("article","history-row");
    row.append(element("h3","entry-title",item.draft.characterName || "プロンプト"));
    const brief=element("p","history-brief",[summaryText("character",item.draft),summaryText("outfit",item.draft),summaryText("situation",item.draft),item.draft.ratio].filter(Boolean).join(" / "));
    row.append(brief,element("p","hint",new Date(item.createdAt).toLocaleString("ja-JP")));
    const details=element("details"); details.append(element("summary","","プロンプトを見る"),element("p","entry-text",item.prompt));
    if(item.draft.negative.trim()) details.append(element("h3","","ネガティブ"),element("p","entry-text",item.draft.negative));
    row.append(details);
    const actions=element("div","row-actions"); actions.append(action("コピー",()=>copyText(item.prompt,details)),action("設定を復元",()=>restoreHistory(item.id)),action("削除",()=>deleteHistory(item.id),"danger"));
    if(item.draft.negative.trim()) actions.append(action("ネガティブをコピー",()=>copyText(item.draft.negative.trim(),details)));
    row.append(actions); list.append(row);
  }
}
async function copyText(text,target,successMessage="コピーしました！") {
  if(!text) return;
  try { await navigator.clipboard.writeText(text); showStatus(successMessage); }
  catch {
    const temporary=element("textarea"); temporary.value=text; temporary.setAttribute("readonly",""); temporary.style.position="fixed"; temporary.style.top="0"; document.body.append(temporary);
    const active=document.activeElement; temporary.select(); temporary.setSelectionRange(0,text.length);
    let copied=false; try {copied=document.execCommand("copy");} catch { /* 長押しへ誘導 */ }
    temporary.remove(); active?.focus?.({preventScroll:true});
    if(copied) {showStatus(successMessage);return;}
    if(target.tagName==="DETAILS") target.open=true;
    target.scrollIntoView({block:"center"}); showStatus("コピーできませんでした。表示された文章を長押ししてコピーしてください。",5000);
  }
}
function makeBackup() {
  state.draft=readDraft();
  const backup={app:"ai-prompt-maker",exportedAt:new Date().toISOString(),...state};
  // 読めない元データも回収し、空の初期状態だけを書き出して失わないようにします。
  if(storageBlocked) {
    try {backup.recoveryData={current:localStorage.getItem(STORAGE_KEY),previous:localStorage.getItem(PREVIOUS_KEY),legacy:localStorage.getItem(LEGACY_KEY)};}
    catch {backup.recoveryNote="ブラウザの保存領域を読み取れませんでした";}
  }
  return JSON.stringify(backup,null,2);
}
function exportBackup() {
  const blob=new Blob([makeBackup()],{type:"application/json"}); const url=URL.createObjectURL(blob);
  const link=element("a"); link.href=url; link.download=`ai-prompt-maker-v2-2-${new Date().toISOString().slice(0,10)}.json`;
  document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),10000);
  showStatus("JSONを書き出しました。ダウンロードを確認してください。");
}
function importBackup(text) {
  const parsed=JSON.parse(text);
  if(parsed.app!==undefined && parsed.app!=="ai-prompt-maker") throw new Error("別のアプリのバックアップです");
  const incoming=normalizeState(parsed);
  const count=Object.values(incoming.presets).reduce((total,items)=>total+items.length,0);
  if(!confirm(`設定${count}件・履歴${incoming.history.length}件を復元します。現在のV2.2設定・履歴・入力を置き換えますか？`)) return false;
  // 読み込み不可状態からの復元も明示的な確認後だけ許可します。
  try {localStorage.setItem(STORAGE_KEY,JSON.stringify(incoming));}
  catch {showWarning("復元を保存できませんでした。現在のデータは変更していません。");return false;}
  state=incoming; storageBlocked=false; warning.hidden=true;
  fillForm(state.draft); renderQuick(); renderPresets(); renderHistory(); showStatus("JSONから復元しました"); return true;
}
function showResult() {switchTab("create");$("#result").scrollIntoView({block:"start"});}

setupEditors(); fillForm(state.draft); renderQuick(); renderPresets(); renderHistory();
form.addEventListener("input",updateDraft);
form.addEventListener("change",updateDraft);
form.addEventListener("submit",event=>{event.preventDefault();});
$("#jump-result").addEventListener("click",showResult);
$("#copy-button").addEventListener("click",()=>copyText(currentPrompt,$("#prompt-output")));
$("#quick-copy").addEventListener("click",()=>copyText(currentPrompt,$("#prompt-output"),"通常プロンプトをコピーしました"));
$("#copy-negative").addEventListener("click",()=>copyText(readDraft().negative.trim(),$("#negative-output")));
$("#save-history").addEventListener("click",saveHistory);
document.querySelectorAll("[data-tab]").forEach(button=>button.addEventListener("click",()=>switchTab(button.dataset.tab)));
$("#preset-category").addEventListener("change",event=>{selectedCategory=event.target.value;renderPresets();});
$("#cancel-save").addEventListener("click",()=>$("#save-dialog").close());
$("#save-form").addEventListener("submit",event=>{
  event.preventDefault(); const name=$("#preset-name").value.trim(); if(!name) return;
  if(!savePreset(saveCategory,name,readDraft())) return;
  form.elements.namedItem(SCHEMA[saveCategory].name).value=name;
  state.draft=readDraft();persist();renderPrompt();renderQuick();renderPresets();$("#save-dialog").close();showStatus("設定を保存しました");
});
$("#cancel-edit").addEventListener("click",()=>$("#edit-dialog").close());
$("#edit-form").addEventListener("submit",event=>{
  event.preventDefault(); if(!editing) return;
  const data=Object.fromEntries(new FormData($("#edit-form")));const name=$("#edit-name").value.trim();
  if(!editPreset(editing.category,editing.id,name,data)) return;
  renderQuick();renderPresets();$("#edit-dialog").close();editing=null;showStatus("保存設定を更新しました。作成中の入力は変更していません。");
});
$("#export-data").addEventListener("click",exportBackup);
$("#import-data").addEventListener("change",async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try {if(file.size>10*1024*1024)throw new Error("JSONは10MB以下にしてください");const restored=importBackup(await file.text());if(!restored)showStatus("復元しませんでした");}
  catch(error){showStatus(`読み込めませんでした：${error.message}`,5000);}
  finally {event.target.value="";}
});
// Android Chromeはresizes-contentでキーボードに合わせて縮小。
// 非対応環境ではvisualViewportも参照し、固定ボタンの占有を減らします。
function updateKeyboardLayout() {
  const viewport=window.visualViewport;
  const active=document.activeElement;
  const typing=active && ["INPUT","TEXTAREA","SELECT"].includes(active.tagName);
  const keyboard=typing && viewport && window.innerHeight-viewport.height>150;
  document.body.classList.toggle("keyboard-open",Boolean(keyboard));
}
window.visualViewport?.addEventListener("resize",updateKeyboardLayout);
document.addEventListener("focusin",updateKeyboardLayout);
document.addEventListener("focusout",()=>setTimeout(updateKeyboardLayout,50));
document.addEventListener("toggle",()=>{resizeTextareas(form);resizeTextareas($("#edit-form"));},true);
$("#edit-form").addEventListener("input",()=>resizeTextareas($("#edit-form")));
