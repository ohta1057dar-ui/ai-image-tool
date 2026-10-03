"use strict";

// データ形式を変更するときは移行処理も用意します。
const STORAGE_KEY = "ai-prompt-maker-v2";
const CHARACTER_FIELDS = ["characterName", "description", "age", "hairStyle", "hairColor", "skin", "expression", "bodyType", "features"];
const TEXT_FIELDS = [...CHARACTER_FIELDS, "outfit", "situation", "composition", "negative"];
const CATEGORIES = { character: "キャラクター", outfit: "衣装", situation: "シチュエーション", composition: "構図" };
const DEFAULT_DRAFT = Object.fromEntries([...TEXT_FIELDS.map(key => [key, ""]), ["ratio", "9:16"], ["style", "実写風"]]);
const form = document.querySelector("#prompt-form");
const output = document.querySelector("#prompt-output");
const negativeOutput = document.querySelector("#negative-output");
const copyButton = document.querySelector("#copy-button");
const negativeButton = document.querySelector("#copy-negative");
const historyButton = document.querySelector("#save-history");
const status = document.querySelector("#status");
const warning = document.querySelector("#storage-warning");
const saveDialog = document.querySelector("#save-dialog");
let currentPrompt = "";
let statusTimer;
let pendingCategory;
let storageBlocked = false;

function cleanDraft(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("入力データが不正です");
  const draft = { ...DEFAULT_DRAFT };
  for (const key of TEXT_FIELDS) if (typeof value[key] === "string") draft[key] = value[key];
  if (["9:16", "4:5", "1:1", "16:9"].includes(value.ratio)) draft.ratio = value.ratio;
  if (["実写風", "イラスト風", "アニメ風"].includes(value.style)) draft.style = value.style;
  return draft;
}

function emptyState() {
  return { version: 2, draft: { ...DEFAULT_DRAFT }, presets: Object.fromEntries(Object.keys(CATEGORIES).map(key => [key, []])), history: [] };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const saved = JSON.parse(raw);
    if (saved.version !== 2 || !saved.presets || !Array.isArray(saved.history)) throw new Error("保存形式が不正です");
    const result = emptyState();
    result.draft = cleanDraft(saved.draft);
    for (const category of Object.keys(CATEGORIES)) {
      if (!Array.isArray(saved.presets[category])) throw new Error("保存設定が不正です");
      result.presets[category] = saved.presets[category].map(item => {
        if (!item || typeof item.id !== "string" || typeof item.name !== "string" || typeof item.createdAt !== "string") throw new Error("保存設定が不正です");
        return { id: item.id, name: item.name, createdAt: item.createdAt, data: cleanDraft(item.data) };
      });
    }
    result.history = saved.history.slice(0, 100).map(item => {
      if (!item || typeof item.id !== "string" || typeof item.prompt !== "string" || typeof item.createdAt !== "string") throw new Error("履歴が不正です");
      return { id: item.id, prompt: item.prompt, createdAt: item.createdAt, draft: cleanDraft(item.draft) };
    });
    return result;
  } catch {
    // 読めないデータを自動上書きせず、そのまま残します。
    storageBlocked = true;
    showWarning("保存データを読み込めないため、自動保存を停止しました。この画面では作成・コピーできます。元のデータは上書きしていません。");
    return emptyState();
  }
}

let state = loadState();

function showWarning(message) { warning.textContent = message; warning.hidden = false; }
function persist() {
  if (storageBlocked) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    warning.hidden = true;
    return true;
  } catch {
    showWarning("ブラウザに保存できませんでした。保存容量やブラウザ設定を確認してください。今の入力は画面に残りますが、閉じると失われる可能性があります。");
    return false;
  }
}
function showStatus(message, duration = 2500) {
  clearTimeout(statusTimer);
  status.textContent = message;
  statusTimer = setTimeout(() => { status.textContent = ""; }, duration);
}
function readDraft() { return cleanDraft(Object.fromEntries(new FormData(form))); }
function fillForm(draft) {
  for (const [key, value] of Object.entries(draft)) form.elements.namedItem(key).value = value;
  document.querySelectorAll("[data-preset]").forEach(select => { select.value = ""; });
  renderPrompt();
}
function sentence(text) { return /[。！？.!?]$/.test(text) ? text : `${text}。`; }

// サービス固有の記法や外部APIを使わず、日本語の指示文を組み立てます。
function buildPrompt(draft) {
  const d = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()]));
  const hasContent = TEXT_FIELDS.filter(key => !["characterName", "negative"].includes(key)).some(key => d[key]);
  if (!hasContent) return "";
  const styleText = { "実写風": "実写写真のような自然な質感の画像", "イラスト風": "イラストとして描かれた画像", "アニメ風": "アニメ風の画像" };
  const lines = [`${styleText[d.style]}を、画像比率${d.ratio}で作成してください。`];
  const person = [];
  if (d.description) person.push(sentence(d.description));
  if (d.age) person.push(`年齢・年代は${d.age}。`);
  if (d.hairStyle) person.push(`髪型は${d.hairStyle}。`);
  if (d.hairColor) person.push(`髪色は${d.hairColor}。`);
  if (d.skin) person.push(`肌の特徴・質感は${d.skin}。`);
  if (d.expression) person.push(`表情は${d.expression}。`);
  if (d.bodyType) person.push(`体型は${d.bodyType}。`);
  if (d.features) person.push(`その他の特徴として、${sentence(d.features)}`);
  if (person.length) lines.push(`人物の描写：\n${person.join(" ")}`);
  if (d.outfit) lines.push(`衣装は、${sentence(d.outfit)}`);
  if (d.situation) lines.push(`シーンの描写：\n${sentence(d.situation)}`);
  if (d.composition) lines.push(`構図とカメラアングルは、${sentence(d.composition)}`);
  return lines.join("\n\n");
}
function renderPrompt() {
  const draft = readDraft();
  currentPrompt = buildPrompt(draft);
  output.textContent = currentPrompt || "人物説明・衣装・シチュエーション・構図などを入力すると、ここに表示されます。";
  negativeOutput.textContent = draft.negative.trim() || "ネガティブプロンプトは未入力です。";
  copyButton.disabled = !currentPrompt;
  negativeButton.disabled = !draft.negative.trim();
  historyButton.disabled = !currentPrompt;
}
function updateDraft() { state.draft = readDraft(); renderPrompt(); persist(); }
function newId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

function switchTab(tab) {
  for (const name of ["create", "presets", "history"]) {
    document.querySelector(`#panel-${name}`).hidden = name !== tab;
    const button = document.querySelector(`#nav-${name}`);
    if (name === tab) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  }
  window.scrollTo(0, 0);
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function action(label, callback, className = "secondary") {
  const button = element("button", className, label); button.type = "button"; button.addEventListener("click", callback); return button;
}
function presetSummary(category, draft) {
  return category === "character" ? CHARACTER_FIELDS.map(key => draft[key]).filter(Boolean).join(" / ") : draft[category];
}
function applyPreset(category, id) {
  const item = state.presets[category].find(entry => entry.id === id);
  if (!item) return;
  const keys = category === "character" ? CHARACTER_FIELDS : [category];
  for (const key of keys) form.elements.namedItem(key).value = item.data[key];
  updateDraft();
  showStatus(`${CATEGORIES[category]}を読み込みました`);
}
function renderPresets() {
  const list = document.querySelector("#preset-list"); list.replaceChildren();
  for (const [category, label] of Object.entries(CATEGORIES)) {
    const select = document.querySelector(`[data-preset="${category}"]`);
    const selected = select.value; select.replaceChildren(new Option("設定を選択", ""));
    const section = element("section", "card"); section.append(element("h3", "entry-title", `${label}（${state.presets[category].length}件）`));
    if (!state.presets[category].length) section.append(element("p", "empty", "作成画面から設定を保存できます。"));
    for (const item of state.presets[category]) {
      select.add(new Option(item.name, item.id));
      const entry = element("article"); entry.append(element("h3", "entry-title", item.name), element("p", "entry-text", presetSummary(category, item.data)));
      const actions = element("div", "actions");
      actions.append(action("読み込む", () => { applyPreset(category, item.id); switchTab("create"); form.elements.namedItem(category === "character" ? "description" : category).focus(); }), action("削除", () => {
        if (!confirm(`「${item.name}」を削除しますか？`)) return;
        const previous = state.presets[category]; state.presets[category] = previous.filter(entry => entry.id !== item.id);
        if (!persist()) { state.presets[category] = previous; showStatus("削除を保存できませんでした"); return; }
        renderPresets(); showStatus("設定を削除しました");
      }, "danger")); entry.append(actions); section.append(entry);
    }
    if (state.presets[category].some(item => item.id === selected)) select.value = selected;
    list.append(section);
  }
}
function renderHistory() {
  const list = document.querySelector("#history-list"); list.replaceChildren();
  document.querySelector("#history-count").textContent = `（${state.history.length}/100）`;
  if (!state.history.length) list.append(element("p", "empty", "作成画面の「履歴に保存」で残せます。"));
  for (const item of state.history) {
    const entry = element("article", "card");
    entry.append(element("h3", "entry-title", item.draft.characterName || "プロンプト"), element("p", "hint", new Date(item.createdAt).toLocaleString("ja-JP")));
    const details = element("details"); details.append(element("summary", "", "プロンプトを見る"), element("p", "entry-text", item.prompt));
    if (item.draft.negative.trim()) details.append(element("h3", "", "ネガティブ"), element("p", "entry-text", item.draft.negative));
    entry.append(details);
    const actions = element("div", "actions");
    actions.append(action("コピー", () => copyText(item.prompt, details)), action("入力を復元", () => {
      if (!confirm("現在の入力をこの履歴の内容に置き換えますか？")) return;
      state.draft = { ...item.draft }; fillForm(state.draft); persist(); switchTab("create"); showStatus("履歴から入力を復元しました");
    }), action("削除", () => {
      if (!confirm("この履歴を削除しますか？")) return;
      const previous = state.history; state.history = previous.filter(entry => entry.id !== item.id);
      if (!persist()) { state.history = previous; showStatus("削除を保存できませんでした"); return; }
      renderHistory(); showStatus("履歴を削除しました");
    }, "danger"));
    if (item.draft.negative.trim()) actions.append(action("ネガティブをコピー", () => copyText(item.draft.negative.trim(), details)));
    entry.append(actions); list.append(entry);
  }
}
async function copyText(text, target) {
  if (!text) return;
  try { await navigator.clipboard.writeText(text); showStatus("コピーしました！"); }
  catch {
    // Clipboard APIが使えない環境でもコピーできるよう補助します。
    const temporary = element("textarea"); temporary.value = text; temporary.setAttribute("readonly", ""); temporary.style.position = "fixed"; temporary.style.top = "0"; document.body.append(temporary);
    const active = document.activeElement;
    temporary.select(); temporary.setSelectionRange(0, text.length);
    let copied = false;
    try { copied = document.execCommand("copy"); } catch { /* 長押しへ誘導 */ }
    temporary.remove(); if (active && active.focus) active.focus({ preventScroll: true });
    if (copied) { showStatus("コピーしました！"); return; }
    if (target.tagName === "DETAILS") target.open = true;
    target.scrollIntoView({ block: "center" });
    showStatus("コピーできませんでした。表示された文章を長押ししてコピーしてください。", 5000);
  }
}

form.addEventListener("input", updateDraft);
form.addEventListener("change", event => {
  const category = event.target.dataset.preset;
  if (category) applyPreset(category, event.target.value); else updateDraft();
});
form.addEventListener("submit", event => { event.preventDefault(); updateDraft(); document.querySelector("#result").scrollIntoView({ block: "start" }); });
copyButton.addEventListener("click", () => copyText(currentPrompt, output));
negativeButton.addEventListener("click", () => copyText(readDraft().negative.trim(), negativeOutput));
historyButton.addEventListener("click", () => {
  const draft = readDraft(); const prompt = buildPrompt(draft); if (!prompt) return;
  const previous = state.history;
  state.history = [{ id: newId(), createdAt: new Date().toISOString(), draft, prompt }, ...previous].slice(0, 100);
  if (!persist()) { state.history = previous; showStatus("履歴を保存できませんでした"); return; }
  renderHistory(); showStatus("履歴に保存しました");
});
document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => switchTab(button.dataset.tab)));
document.querySelectorAll("[data-save]").forEach(button => button.addEventListener("click", () => {
  const draft = readDraft(); pendingCategory = button.dataset.save;
  const keys = pendingCategory === "character" ? CHARACTER_FIELDS.filter(key => key !== "characterName") : [pendingCategory];
  if (!keys.some(key => draft[key].trim())) { showStatus("保存する設定内容を入力してください"); return; }
  document.querySelector("#preset-name").value = (pendingCategory === "character" ? draft.characterName : draft[pendingCategory]).trim().slice(0, 100);
  saveDialog.showModal(); document.querySelector("#preset-name").focus();
}));
document.querySelector("#cancel-save").addEventListener("click", () => saveDialog.close());
document.querySelector("#save-form").addEventListener("submit", event => {
  event.preventDefault(); const name = document.querySelector("#preset-name").value.trim(); if (!name) { showStatus("設定の名前を入力してください"); return; }
  const previous = state.presets[pendingCategory];
  const draft = readDraft();
  const keys = pendingCategory === "character" ? CHARACTER_FIELDS : [pendingCategory];
  const data = Object.fromEntries(keys.map(key => [key, draft[key]]));
  state.presets[pendingCategory] = [{ id: newId(), name, createdAt: new Date().toISOString(), data }, ...previous];
  if (!persist()) { state.presets[pendingCategory] = previous; showStatus("設定を保存できませんでした"); return; }
  renderPresets(); saveDialog.close(); showStatus("設定を保存しました");
});
fillForm(state.draft); renderPresets(); renderHistory();
