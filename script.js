"use strict";

// 項目の追加はこの定義から。キーは保存データとの互換性のため変更しません。
const DATA_VERSION = 3; // UI V2.1の保存形式
const STORAGE_KEY = "ai-prompt-maker-v2-1";
const LEGACY_KEY = "ai-prompt-maker-v2";
const RATIOS = ["9:16", "4:5", "1:1", "3:4", "16:9"];
const STYLES = ["実写・フォトリアル", "スマートフォン写真風", "イラスト", "アニメ"];
const SCHEMA = {
  character: { label: "人物", name: "characterName", basic: ["characterName", "age", "description"], fields: {
    characterName: "管理用キャラクター名", age: "年齢／年代", description: "人物説明", face: "顔立ち", hairStyle: "髪型", hairColor: "髪色", eyes: "目", skin: "肌・肌質", makeup: "メイク", bodyType: "体型", height: "身長", physicalFeatures: "身体的特徴", features: "その他の特徴", fixedFeatures: "固定したい特徴", maintainedFeatures: "生成時に維持したい特徴", characterNotes: "補足", expression: "V2から引き継いだ表情" } },
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
const FIELD_KEYS = [...Object.values(SCHEMA).flatMap(s => Object.keys(s.fields)), "negative"];
const DEFAULT_DRAFT = Object.fromEntries(FIELD_KEYS.map(k => [k, k === "ratio" ? "9:16" : k === "style" ? STYLES[0] : ""]));
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
  return Object.fromEntries(Object.keys(SCHEMA[category].fields).map(key => [key, draft[key]]));
}
function emptyState() {
  return { version: DATA_VERSION, draft: { ...DEFAULT_DRAFT }, presets: Object.fromEntries(Object.keys(SCHEMA).map(k => [k, []])), history: [], recent: {} };
}
// V2のキーは残したまま、V2.1用キーに移行。履歴の完成文章・IDは変更しません。
function normalizeState(saved) {
  if (!isObject(saved) || ![2, DATA_VERSION].includes(saved.version) || !isObject(saved.presets) || !Array.isArray(saved.history)) throw new Error("未対応の保存形式です");
  const result = emptyState();
  result.draft = cleanDraft(saved.draft);
  const allIds = new Set();
  for (const category of Object.keys(SCHEMA)) {
    const entries = saved.presets[category] ?? (saved.version === 2 && ["action", "finish"].includes(category) ? [] : null);
    if (!Array.isArray(entries)) throw new Error("保存設定が不正です");
    result.presets[category] = entries.map(item => {
      if (!isObject(item) || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name.trim() || !validDate(item.createdAt) || allIds.has(item.id)) throw new Error("保存設定が不正です");
      if (saved.version === DATA_VERSION && (item.type !== category || item.version !== DATA_VERSION || !validDate(item.updatedAt) || typeof item.favorite !== "boolean")) throw new Error("設定メタデータが不正です");
      allIds.add(item.id);
      const draft = cleanDraft(item.data);
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
    return { id: item.id, prompt: item.prompt, createdAt: item.createdAt, draft: cleanDraft(item.draft) };
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
    const legacy = current === null ? localStorage.getItem(LEGACY_KEY) : null;
    if (current === null && legacy === null) return emptyState();
    const result = normalizeState(JSON.parse(current ?? legacy));
    if (current === null) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(result)); }
      catch { showWarning("V2データは読み込めましたが、V2.1の保存に失敗しました。V2の元データは残っています。JSONでバックアップしてください。"); }
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
function buildPrompt(draft) {
  const d = Object.fromEntries(Object.entries(draft).map(([k,v]) => [k,v.trim()]));
  const meaningful = FIELD_KEYS.filter(k => !Object.values(SCHEMA).some(s => s.name === k) && !["negative", "ratio", "style"].includes(k));
  if (!meaningful.some(k => d[k])) return "";
  const styles = { "実写・フォトリアル": "実写・フォトリアルな画像を作成してください。", "スマートフォン写真風": "スマートフォンで撮影した写真のような画像を作成してください。", "イラスト": "イラストを作成してください。", "アニメ": "アニメ風の画像を作成してください。" };
  const lines = [styles[d.style]];
  const add = (key, prefix) => { if (d[key]) lines.push(`${prefix}${sentence(d[key])}`); };
  add("description", "人物は、"); add("age", "年齢・年代は");
  for (const [key, prefix] of Object.entries({ face:"顔立ちは",hairStyle:"髪型は",hairColor:"髪色は",eyes:"目の特徴は",skin:"肌の特徴・質感は",makeup:"メイクは",bodyType:"体型は",height:"身長は",physicalFeatures:"身体的特徴として、",features:"その他の特徴として、" })) add(key,prefix);
  add("fixedFeatures", "一貫して固定する特徴は"); add("maintainedFeatures", "生成時に維持する特徴は"); add("characterNotes", "人物についての補足：");
  for (const [key,prefix] of Object.entries({outfit:"衣装は、",outfitType:"衣装の種類は",outfitColor:"衣装の色は",outfitMaterial:"素材は",outfitDesign:"衣装のデザインは",shoes:"靴は",accessories:"アクセサリーは",outfitOther:"衣装の補足："})) add(key,prefix);
  const expression = d.actionExpression || d.expression;
  if (expression) lines.push(`表情は${sentence(expression)}`);
  // 表情・動作の視線を優先し、構図側と二重に指示しません。
  const gaze = d.gaze || d.cameraGaze;
  if (gaze) lines.push(`視線は${sentence(gaze)}`);
  for (const [key,prefix] of Object.entries({mouth:"口元は",movement:"身体の動作は",hands:"手の動きは",interaction:"人物同士のやり取りは",actionOther:"表情・動作の補足："})) add(key,prefix);
  for (const [key,prefix] of Object.entries({location:"場所は",timeOfDay:"時間帯は",situation:"シーンは、",sceneActivity:"人物は次の行動をしています：",people:"周囲の人物は",sceneLight:"シーンの照明は",atmosphere:"雰囲気は",props:"小物は",background:"背景は",sceneOther:"シーンの補足："})) add(key,prefix);
  for (const [key,prefix] of Object.entries({composition:"構図は、",framing:"撮影範囲は",cameraDirection:"カメラ方向は",cameraHeight:"カメラの高さは",distance:"被写体との距離は",angle:"アングルは",pose:"ポーズは",photographer:"撮影者は",cameraFeel:"構図の撮影機材感は",lens:"レンズ感は",bokeh:"背景ボケは",compositionOther:"撮影の補足："})) add(key,prefix);
  for (const [key,prefix] of Object.entries({finishCamera:"仕上がりの撮影機材感は",finishLight:"光は",tone:"色調は",depth:"被写界深度は",texture:"画質・質感は",finishOther:"仕上がりの補足："})) add(key,prefix);
  lines.push(`画像比率は${d.ratio}にしてください。`);
  return lines.join("\n");
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
    input.rows = 2;
    input.placeholder = label.startsWith("管理用") ? "一覧で見分けるための名前" : "必要な内容だけ入力";
    if (Object.values(SCHEMA).some(s => s.name === key)) input.maxLength = 100;
  }
  wrapper.append(labelNode, input);
  return wrapper;
}
function appendCategoryFields(container, category, prefix = "") {
  const schema = SCHEMA[category];
  for (const key of schema.basic) container.append(createField(key, schema.fields[key], prefix));
  const details = element("details", "field-details");
  details.append(element("summary", "", category === "character" ? "外見・一貫性の詳細" : "詳細設定"));
  for (const [key,label] of Object.entries(schema.fields)) if (!schema.basic.includes(key)) details.append(createField(key,label,prefix));
  container.append(details);
}
function setupEditors() {
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
    body.append(action(`${schema.label}を保存`, () => openSave(category)));
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
  $("#edit-dialog").showModal(); $("#edit-name").focus();
}
function editPreset(category,id,name,data) {
  if (!findPreset(category,id) || !name.trim()) return false;
  const draft=cleanDraft(data);
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
async function copyText(text,target) {
  if(!text) return;
  try { await navigator.clipboard.writeText(text); showStatus("コピーしました！"); }
  catch {
    const temporary=element("textarea"); temporary.value=text; temporary.setAttribute("readonly",""); temporary.style.position="fixed"; temporary.style.top="0"; document.body.append(temporary);
    const active=document.activeElement; temporary.select(); temporary.setSelectionRange(0,text.length);
    let copied=false; try {copied=document.execCommand("copy");} catch { /* 長押しへ誘導 */ }
    temporary.remove(); active?.focus?.({preventScroll:true});
    if(copied) {showStatus("コピーしました！");return;}
    if(target.tagName==="DETAILS") target.open=true;
    target.scrollIntoView({block:"center"}); showStatus("コピーできませんでした。表示された文章を長押ししてコピーしてください。",5000);
  }
}
function makeBackup() {
  state.draft=readDraft();
  const backup={app:"ai-prompt-maker",exportedAt:new Date().toISOString(),...state};
  // 読めない元データも回収し、空の初期状態だけを書き出して失わないようにします。
  if(storageBlocked) {
    try {backup.recoveryData={current:localStorage.getItem(STORAGE_KEY),legacy:localStorage.getItem(LEGACY_KEY)};}
    catch {backup.recoveryNote="ブラウザの保存領域を読み取れませんでした";}
  }
  return JSON.stringify(backup,null,2);
}
function exportBackup() {
  const blob=new Blob([makeBackup()],{type:"application/json"}); const url=URL.createObjectURL(blob);
  const link=element("a"); link.href=url; link.download=`ai-prompt-maker-v2-1-${new Date().toISOString().slice(0,10)}.json`;
  document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),10000);
  showStatus("JSONを書き出しました。ダウンロードを確認してください。");
}
function importBackup(text) {
  const parsed=JSON.parse(text);
  if(parsed.app!==undefined && parsed.app!=="ai-prompt-maker") throw new Error("別のアプリのバックアップです");
  const incoming=normalizeState(parsed);
  const count=Object.values(incoming.presets).reduce((total,items)=>total+items.length,0);
  if(!confirm(`設定${count}件・履歴${incoming.history.length}件を復元します。現在のV2.1設定・履歴・入力を置き換えますか？`)) return false;
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
form.addEventListener("submit",event=>{event.preventDefault();updateDraft();showResult();});
$("#jump-result").addEventListener("click",showResult);
for(const id of ["copy-button","quick-copy"]) $(`#${id}`).addEventListener("click",()=>copyText(currentPrompt,$("#prompt-output")));
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
