// Tweet Bot - Settings Page Logic

const elements = {
  apiKey: document.getElementById("apiKey"),
  toggleKey: document.getElementById("toggleKey"),
  keyStatus: document.getElementById("keyStatus"),
  tagInput: document.getElementById("tagInput"),
  addTag: document.getElementById("addTag"),
  tags: document.getElementById("tags"),
  save: document.getElementById("save"),
  saveStatus: document.getElementById("saveStatus"),
  clearHistory: document.getElementById("clearHistory"),
  totalGenerated: document.getElementById("totalGenerated"),
  totalSelected: document.getElementById("totalSelected"),
  historyCount: document.getElementById("historyCount"),
  inputTokens: document.getElementById("inputTokens"),
  outputTokens: document.getElementById("outputTokens"),
  estimatedCost: document.getElementById("estimatedCost"),
  resetUsage: document.getElementById("resetUsage"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
  importExportStatus: document.getElementById("importExportStatus"),
};

let topics = [];

// ─── Load Settings ────────────────────────────────────────────────────────────

async function loadSettings() {
  const data = await chrome.storage.local.get([
    "apiKey",
    "defaultPersona",
    "defaultTone",
    "selectedModel",
    "topicInterests",
    "stats",
    "tweetHistory",
  ]);

  // API Key
  if (data.apiKey) {
    elements.apiKey.value = data.apiKey;
    validateKey(data.apiKey);
  }

  // Model
  const model = data.selectedModel || "anthropic/claude-opus-4-6";
  const modelRadio = document.querySelector(`input[name="model"][value="${model}"]`);
  if (modelRadio) modelRadio.checked = true;

  // Persona (with backward compat from old tone system)
  let persona = data.defaultPersona;
  if (!persona && data.defaultTone) {
    const toneMap = {
      witty: "builder",
      professional: "builder",
      informative: "builder",
      casual: "shitposter",
      provocative: "contrarian",
    };
    persona = toneMap[data.defaultTone] || "builder";
  }
  persona = persona || "builder";
  const personaRadio = document.querySelector(`input[name="persona"][value="${persona}"]`);
  if (personaRadio) personaRadio.checked = true;

  // Topics
  topics = data.topicInterests || [];
  renderTags();

  // Stats
  const stats = data.stats || { totalGenerated: 0, totalSelected: 0 };
  elements.totalGenerated.textContent = stats.totalGenerated;
  elements.totalSelected.textContent = stats.totalSelected;

  const history = data.tweetHistory || [];
  elements.historyCount.textContent = history.length;

  // Token usage
  loadTokenUsage();
}

async function loadTokenUsage() {
  const usage = await chrome.runtime.sendMessage({ type: "GET_TOKEN_USAGE" });
  if (usage && !usage.error) {
    elements.inputTokens.textContent = usage.totalInputTokens.toLocaleString();
    elements.outputTokens.textContent = usage.totalOutputTokens.toLocaleString();
    elements.estimatedCost.textContent = `$${usage.estimatedCost.toFixed(4)}`;
  }
}

// ─── API Key ──────────────────────────────────────────────────────────────────

function validateKey(key) {
  if (!key) {
    elements.keyStatus.textContent = "";
    elements.keyStatus.className = "status";
    return false;
  }
  if (key.startsWith("sk-or-")) {
    elements.keyStatus.textContent = "Key format looks valid";
    elements.keyStatus.className = "status success";
    return true;
  }
  elements.keyStatus.textContent = 'Key should start with "sk-or-"';
  elements.keyStatus.className = "status error";
  return false;
}

elements.apiKey.addEventListener("input", () => {
  validateKey(elements.apiKey.value);
});

elements.toggleKey.addEventListener("click", () => {
  const isPassword = elements.apiKey.type === "password";
  elements.apiKey.type = isPassword ? "text" : "password";
  elements.toggleKey.textContent = isPassword ? "Hide" : "Show";
});

// ─── Topics / Tags ────────────────────────────────────────────────────────────

function renderTags() {
  elements.tags.innerHTML = topics
    .map(
      (topic) =>
        `<span class="tag">${escapeHTML(topic)}<span class="tag-remove" data-topic="${escapeHTML(topic)}">&times;</span></span>`
    )
    .join("");

  // Remove handlers
  elements.tags.querySelectorAll(".tag-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      topics = topics.filter((t) => t !== btn.dataset.topic);
      renderTags();
    });
  });
}

function addTopic() {
  const value = elements.tagInput.value.trim().toLowerCase();
  if (value && !topics.includes(value)) {
    topics.push(value);
    renderTags();
  }
  elements.tagInput.value = "";
}

elements.addTag.addEventListener("click", addTopic);
elements.tagInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTopic();
});

// ─── Save ─────────────────────────────────────────────────────────────────────

elements.save.addEventListener("click", async () => {
  const persona = document.querySelector('input[name="persona"]:checked')?.value || "builder";
  const selectedModel = document.querySelector('input[name="model"]:checked')?.value || "anthropic/claude-opus-4-6";

  await chrome.storage.local.set({
    apiKey: elements.apiKey.value.trim(),
    defaultPersona: persona,
    selectedModel,
    topicInterests: topics,
  });

  elements.saveStatus.textContent = "Settings saved!";
  elements.saveStatus.className = "save-status success";
  setTimeout(() => {
    elements.saveStatus.textContent = "";
  }, 2000);
});

// ─── Clear History ────────────────────────────────────────────────────────────

elements.clearHistory.addEventListener("click", async () => {
  if (!confirm("Clear all tweet history? This cannot be undone.")) return;

  await chrome.storage.local.set({
    tweetHistory: [],
    stats: { totalGenerated: 0, totalSelected: 0 },
  });

  elements.totalGenerated.textContent = "0";
  elements.totalSelected.textContent = "0";
  elements.historyCount.textContent = "0";
});

// ─── Reset Usage ─────────────────────────────────────────────────────────────

elements.resetUsage.addEventListener("click", async () => {
  if (!confirm("Reset all token usage data? This cannot be undone.")) return;

  await chrome.runtime.sendMessage({ type: "RESET_TOKEN_USAGE" });
  elements.inputTokens.textContent = "0";
  elements.outputTokens.textContent = "0";
  elements.estimatedCost.textContent = "$0.0000";
});

// ─── Export / Import ──────────────────────────────────────────────────────────

const EXPORT_KEYS = ["apiKey", "defaultPersona", "defaultTone", "selectedModel", "topicInterests", "tweetHistory", "stats", "tokenUsage"];

elements.exportBtn.addEventListener("click", async () => {
  const data = await chrome.storage.local.get(EXPORT_KEYS);
  data._app = "tweet-bot";
  data._exportVersion = 2;

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tweet-bot-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);

  elements.importExportStatus.textContent = "Settings exported!";
  elements.importExportStatus.className = "status success";
  setTimeout(() => { elements.importExportStatus.textContent = ""; }, 2000);
});

elements.importBtn.addEventListener("click", () => {
  elements.importFile.click();
});

elements.importFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!validateImportData(data)) {
      elements.importExportStatus.textContent = "Invalid file: not a Tweet Bot export.";
      elements.importExportStatus.className = "status error";
      return;
    }

    if (!confirm("Import settings? This will overwrite your current settings with the imported data.")) return;

    const toSet = {};
    for (const key of EXPORT_KEYS) {
      if (key in data) {
        toSet[key] = data[key];
      }
    }

    // Backward compat: migrate defaultTone to defaultPersona on import
    if (data.defaultTone && !data.defaultPersona) {
      const toneMap = {
        witty: "builder",
        professional: "builder",
        informative: "builder",
        casual: "shitposter",
        provocative: "contrarian",
      };
      toSet.defaultPersona = toneMap[data.defaultTone] || "builder";
    }

    await chrome.storage.local.set(toSet);

    elements.importExportStatus.textContent = "Settings imported! Reloading...";
    elements.importExportStatus.className = "status success";
    setTimeout(() => location.reload(), 1000);
  } catch {
    elements.importExportStatus.textContent = "Failed to parse file. Please select a valid JSON file.";
    elements.importExportStatus.className = "status error";
  }

  // Reset file input so the same file can be selected again
  elements.importFile.value = "";
});

function validateImportData(data) {
  if (data._app === "tweet-bot") return true;
  // Fallback: check if at least one known key exists
  return EXPORT_KEYS.some((key) => key in data);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

loadSettings();
