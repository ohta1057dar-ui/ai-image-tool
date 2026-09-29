const form = document.querySelector("#prompt-form");
const output = document.querySelector("#prompt-output");
const copyButton = document.querySelector("#copy-button");
const status = document.querySelector("#status");

let currentPrompt = "";

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const promptParts = [
    ["キャラクター", data.get("character")],
    ["衣装", data.get("outfit")],
    ["シチュエーション", data.get("situation")],
    ["構図", data.get("composition")],
  ];

  currentPrompt = promptParts
    .map(([label, value]) => [label, value.trim()])
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join(", ");

  status.textContent = "";

  if (!currentPrompt) {
    output.textContent = "少なくとも1つの項目を入力してください。";
    output.classList.remove("has-prompt");
    copyButton.disabled = true;
    return;
  }

  output.textContent = currentPrompt;
  output.classList.add("has-prompt");
  copyButton.disabled = false;
});

copyButton.addEventListener("click", async () => {
  if (!currentPrompt) return;

  try {
    await navigator.clipboard.writeText(currentPrompt);
    showStatus("コピーしました！");
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(output);
    selection.removeAllRanges();
    selection.addRange(range);
    showStatus("選択しました。長押しでコピーしてください。", 3000);
  }
});

function showStatus(message, duration = 1800) {
  status.textContent = message;
  window.setTimeout(() => {
    status.textContent = "";
  }, duration);
}
