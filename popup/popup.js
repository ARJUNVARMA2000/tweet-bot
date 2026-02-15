// Tweet Bot - Toolbar Popup (New Tweet Composer)
// 3-step flow: Topic → Clarifying Questions → Generate

(() => {
  let currentStep = 1;
  let topic = "";
  let threadMode = false;
  let clarifyingQuestions = [];
  let clarifyingAnswers = {};
  let activePort = null;
  let retryIntervals = [];

  // ─── DOM refs ────────────────────────────────────────────────────────────────

  const steps = {
    1: document.getElementById("step-1"),
    2: document.getElementById("step-2"),
    3: document.getElementById("step-3"),
  };

  const topicInput = document.getElementById("topic-input");
  const threadCheckbox = document.getElementById("thread-checkbox");
  const btnNext = document.getElementById("btn-next");

  const questionsLoading = document.getElementById("questions-loading");
  const questionsContainer = document.getElementById("questions-container");
  const questionsActions = document.getElementById("questions-actions");
  const btnBack1 = document.getElementById("btn-back-1");
  const btnGenerate = document.getElementById("btn-generate");

  const resultsLoading = document.getElementById("results-loading");
  const resultsStreaming = document.getElementById("results-streaming");
  const resultsContainer = document.getElementById("results-container");
  const resultsRefinements = document.getElementById("results-refinements");
  const resultsError = document.getElementById("results-error");
  const refineInput = document.getElementById("refine-input");
  const refineSubmit = document.getElementById("refine-submit");
  const btnRegenerate = document.getElementById("btn-regenerate");
  const btnBack2 = document.getElementById("btn-back-2");

  // Quick settings refs
  const gearBtn = document.getElementById("gear-btn");
  const quickSettings = document.getElementById("quick-settings");
  const quickModel = document.getElementById("quick-model");
  const quickTone = document.getElementById("quick-tone");
  const costBadge = document.getElementById("cost-badge");
  const quickTokens = document.getElementById("quick-tokens");
  const allSettingsLink = document.getElementById("all-settings-link");

  // ─── Step Navigation ─────────────────────────────────────────────────────────

  function goToStep(step) {
    currentStep = step;
    Object.values(steps).forEach((s) => s.classList.remove("active"));
    steps[step].classList.add("active");

    document.querySelectorAll(".step-dot").forEach((dot) => {
      const dotStep = parseInt(dot.dataset.step);
      dot.classList.remove("active", "completed");
      if (dotStep === step) dot.classList.add("active");
      else if (dotStep < step) dot.classList.add("completed");
    });
  }

  // ─── Step 1: Topic ───────────────────────────────────────────────────────────

  topicInput.addEventListener("input", () => {
    btnNext.disabled = !topicInput.value.trim();
  });

  topicInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && topicInput.value.trim()) {
      e.preventDefault();
      startStep2();
    }
  });

  btnNext.addEventListener("click", () => {
    if (topicInput.value.trim()) startStep2();
  });

  function startStep2() {
    topic = topicInput.value.trim();
    threadMode = threadCheckbox.checked;
    goToStep(2);
    generateClarifyingQuestions();
  }

  // ─── Step 2: Clarifying Questions ─────────────────────────────────────────────

  function generateClarifyingQuestions() {
    questionsLoading.style.display = "flex";
    questionsContainer.innerHTML = "";
    questionsActions.style.display = "none";

    disconnectPort();

    const port = chrome.runtime.connect({ name: "tweetbot-stream" });
    activePort = port;
    let accumulated = "";

    port.onMessage.addListener((msg) => {
      if (activePort !== port) return;

      if (msg.type === "CHUNK") {
        accumulated = msg.accumulated;
      } else if (msg.type === "DONE") {
        activePort = null;
        clarifyingQuestions = parseQuestions(msg.suggestions);
        renderQuestions();
        loadCostBadge();
      } else if (msg.type === "ERROR") {
        activePort = null;
        questionsLoading.style.display = "none";
        // Fall back: show generate button without questions
        clarifyingQuestions = [];
        renderQuestions();
        showQuestionsError(msg.error);
      }
    });

    port.onDisconnect.addListener(() => {
      if (activePort === port) {
        activePort = null;
        // Try to parse what we have
        if (accumulated) {
          clarifyingQuestions = parseQuestionsFromText(accumulated);
          renderQuestions();
        }
      }
    });

    port.postMessage({
      type: "GENERATE_CLARIFYING_QUESTIONS_STREAM",
      payload: { topic, threadMode },
    });
  }

  function parseQuestions(suggestions) {
    // suggestions come back as array of {tag, text} from parseSuggestions
    return suggestions.map((s) => {
      const text = typeof s === "string" ? s : s.text;
      return text;
    });
  }

  function parseQuestionsFromText(text) {
    const questions = [];
    const lines = text.split("\n");
    let current = null;

    for (const line of lines) {
      const match = line.match(/^\s*(\d)[.):\s]\s*(.+)/);
      if (match) {
        if (current) questions.push(current);
        current = match[2].trim();
      } else if (current && line.trim()) {
        current += " " + line.trim();
      }
    }
    if (current) questions.push(current);
    return questions.slice(0, 3);
  }

  function renderQuestions() {
    questionsLoading.style.display = "none";

    if (clarifyingQuestions.length === 0) {
      // No questions generated, let user proceed directly
      questionsContainer.innerHTML = `<p style="color:#71767b;font-size:13px;text-align:center;padding:12px 0;">No clarifying questions needed. Click Generate to continue.</p>`;
    } else {
      questionsContainer.innerHTML = clarifyingQuestions
        .map((q, i) => `
          <div class="question-group">
            <label class="question-label">${escapeHTML(q)}</label>
            <input type="text" class="question-input" data-index="${i}" placeholder="Your answer (optional)" />
          </div>
        `)
        .join("");

      // Restore previous answers if user came back
      questionsContainer.querySelectorAll(".question-input").forEach((input) => {
        const idx = input.dataset.index;
        if (clarifyingAnswers[idx]) {
          input.value = clarifyingAnswers[idx];
        }
      });
    }

    questionsActions.style.display = "flex";
  }

  function showQuestionsError(message) {
    const errEl = document.createElement("p");
    errEl.style.cssText = "color:#f4212e;font-size:13px;padding:8px 0;";
    errEl.textContent = message;
    questionsContainer.prepend(errEl);
  }

  function collectAnswers() {
    clarifyingAnswers = {};
    questionsContainer.querySelectorAll(".question-input").forEach((input) => {
      const idx = input.dataset.index;
      if (input.value.trim()) {
        clarifyingAnswers[idx] = input.value.trim();
      }
    });
  }

  btnBack1.addEventListener("click", () => {
    collectAnswers();
    goToStep(1);
  });

  btnGenerate.addEventListener("click", () => {
    collectAnswers();
    goToStep(3);
    generateTweet();
  });

  // ─── Step 3: Results ──────────────────────────────────────────────────────────

  function buildClarifyingContext() {
    if (clarifyingQuestions.length === 0) return "";
    let context = "";
    clarifyingQuestions.forEach((q, i) => {
      const answer = clarifyingAnswers[i] || "(no answer)";
      context += `Q: ${q}\nA: ${answer}\n\n`;
    });
    return context.trim();
  }

  function generateTweet(options = {}, retryCount = 0) {
    resultsLoading.style.display = "flex";
    resultsStreaming.innerHTML = "";
    resultsContainer.innerHTML = "";
    resultsRefinements.style.display = "none";
    resultsError.style.display = "none";

    disconnectPort();

    const port = chrome.runtime.connect({ name: "tweetbot-stream" });
    activePort = port;

    const payload = {
      action: "new",
      newTweetTopic: topic,
      threadMode,
      clarifyingContext: buildClarifyingContext(),
      ...options,
    };

    port.onMessage.addListener((msg) => {
      if (activePort !== port) return;

      if (msg.type === "CHUNK") {
        renderStreamingText(msg.accumulated);
      } else if (msg.type === "DONE") {
        activePort = null;
        resultsLoading.style.display = "none";
        resultsStreaming.innerHTML = "";
        if (msg.isThread) {
          renderThread(msg.suggestions);
        } else {
          renderSuggestions(msg.suggestions);
        }
        loadCostBadge();
      } else if (msg.type === "ERROR") {
        activePort = null;
        resultsLoading.style.display = "none";
        resultsStreaming.innerHTML = "";
        if (msg.rateLimited && retryCount < 3) {
          showRetryCountdown(msg.retryAfterSeconds || 10, retryCount, options);
        } else {
          showError(msg.error);
        }
      }
    });

    port.onDisconnect.addListener(() => {
      if (activePort === port) {
        activePort = null;
      }
    });

    port.postMessage({ type: "GENERATE_SUGGESTIONS_STREAM", payload });
  }

  function renderStreamingText(accumulated) {
    resultsLoading.style.display = "none";
    resultsStreaming.innerHTML = `
      <div class="streaming-text">${escapeHTML(accumulated)}<span class="cursor"></span></div>
    `;
  }

  function renderSuggestions(suggestions) {
    resultsContainer.innerHTML = suggestions
      .map((suggestion, i) => {
        const text = typeof suggestion === "string" ? suggestion : suggestion.text;
        const tag = typeof suggestion === "string" ? null : suggestion.tag;
        const tagHTML = tag ? `<div class="strategy-tag">${escapeHTML(tag)}</div>` : "";
        return `
          <div class="suggestion" data-index="${i}">
            ${tagHTML}
            <div class="suggestion-text">${escapeHTML(text)}</div>
            <div class="suggestion-actions">
              <span class="char-count">${text.length}/280</span>
              <button class="copy-btn" data-index="${i}" title="Copy to clipboard">Copy</button>
            </div>
          </div>
        `;
      })
      .join("");

    resultsRefinements.style.display = "block";

    resultsContainer.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.index);
        const text = typeof suggestions[idx] === "string" ? suggestions[idx] : suggestions[idx].text;
        copyToClipboard(text);
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = "Copy"), 1500);
      });
    });
  }

  function renderThread(tweets) {
    const threadItems = tweets
      .map((tweet, i) => {
        const tagHTML = tweet.tag ? `<div class="strategy-tag">${escapeHTML(tweet.tag)}</div>` : "";
        const posLabel = tweet.position && tweet.total
          ? `[${tweet.position}/${tweet.total}]`
          : `[${i + 1}/${tweets.length}]`;
        return `
          <div class="thread-item">
            <div class="thread-connector">
              <div class="thread-dot"></div>
              ${i < tweets.length - 1 ? '<div class="thread-line"></div>' : ""}
            </div>
            <div class="thread-content">
              <span class="thread-position">${posLabel}</span>
              ${tagHTML}
              <div class="suggestion-text">${escapeHTML(tweet.text)}</div>
              <div class="suggestion-actions">
                <span class="char-count">${tweet.text.length}/280</span>
                <button class="copy-btn" data-index="${i}" title="Copy this tweet">Copy</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");

    resultsContainer.innerHTML = `
      <div class="thread-header">
        <span>Thread (${tweets.length} tweets)</span>
        <button class="copy-thread-btn">Copy Thread</button>
      </div>
      ${threadItems}
    `;

    resultsRefinements.style.display = "block";

    resultsContainer.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.index);
        copyToClipboard(tweets[idx].text);
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = "Copy"), 1500);
      });
    });

    const copyThreadBtn = resultsContainer.querySelector(".copy-thread-btn");
    if (copyThreadBtn) {
      copyThreadBtn.addEventListener("click", () => {
        const fullThread = tweets
          .map((t, i) => {
            const pos = t.position && t.total ? `[${t.position}/${t.total}]` : `[${i + 1}/${tweets.length}]`;
            return `${pos} ${t.text}`;
          })
          .join("\n\n");
        copyToClipboard(fullThread);
        copyThreadBtn.textContent = "Copied!";
        setTimeout(() => (copyThreadBtn.textContent = "Copy Thread"), 1500);
      });
    }
  }

  function showRetryCountdown(seconds, retryCount, options) {
    let remaining = seconds;
    resultsContainer.innerHTML = `
      <div class="retry-countdown">
        <div class="retry-icon">429</div>
        <div class="retry-message">Rate limited</div>
        <div class="retry-timer">${remaining}s</div>
        <div class="retry-attempt">Retry ${retryCount + 1} of 3</div>
      </div>
    `;

    const intervalId = setInterval(() => {
      remaining--;
      const timerEl = resultsContainer.querySelector(".retry-timer");
      if (timerEl) timerEl.textContent = `${remaining}s`;

      if (remaining <= 0) {
        clearInterval(intervalId);
        retryIntervals = retryIntervals.filter((id) => id !== intervalId);
        generateTweet(options, retryCount + 1);
      }
    }, 1000);

    retryIntervals.push(intervalId);
  }

  function showError(message) {
    resultsError.style.display = "block";
    resultsError.textContent = message;

    if (message.toLowerCase().includes("api key")) {
      const link = document.createElement("a");
      link.textContent = "Open Settings";
      link.href = "#";
      link.className = "settings-link";
      link.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
      });
      resultsError.appendChild(document.createElement("br"));
      resultsError.appendChild(link);
    }
  }

  // ─── Refinement Controls ──────────────────────────────────────────────────────

  document.querySelectorAll(".refine-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      generateTweet({ refineTone: btn.dataset.tone });
    });
  });

  refineSubmit.addEventListener("click", () => {
    if (refineInput.value.trim()) {
      generateTweet({ customRefinement: refineInput.value.trim() });
      refineInput.value = "";
    }
  });

  refineInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && refineInput.value.trim()) {
      generateTweet({ customRefinement: refineInput.value.trim() });
      refineInput.value = "";
    }
  });

  btnRegenerate.addEventListener("click", () => {
    generateTweet();
  });

  btnBack2.addEventListener("click", () => {
    disconnectPort();
    retryIntervals.forEach((id) => clearInterval(id));
    retryIntervals = [];
    goToStep(2);
  });

  // ─── Utilities ────────────────────────────────────────────────────────────────

  function disconnectPort() {
    if (activePort) {
      try { activePort.disconnect(); } catch {}
      activePort = null;
    }
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  }

  // ─── Quick Settings ──────────────────────────────────────────────────────────

  function formatCost(cost) {
    if (cost < 0.01) return "$" + cost.toFixed(4);
    return "$" + cost.toFixed(2);
  }

  function formatTokens(count) {
    if (count >= 1_000_000) return (count / 1_000_000).toFixed(1) + "M";
    if (count >= 1_000) return (count / 1_000).toFixed(1) + "K";
    return String(count);
  }

  function loadQuickSettings() {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (settings) => {
      if (settings && !settings.error) {
        quickModel.value = settings.selectedModel;
        quickTone.value = settings.defaultTone;
      }
    });
  }

  function loadCostBadge() {
    chrome.runtime.sendMessage({ type: "GET_TOKEN_USAGE" }, (usage) => {
      if (usage && !usage.error) {
        costBadge.textContent = formatCost(usage.estimatedCost || 0);
        quickTokens.textContent = `${formatTokens(usage.totalInputTokens || 0)} in / ${formatTokens(usage.totalOutputTokens || 0)} out`;
      }
    });
  }

  gearBtn.addEventListener("click", () => {
    gearBtn.classList.toggle("active");
    quickSettings.classList.toggle("open");
  });

  quickModel.addEventListener("change", () => {
    chrome.storage.local.set({ selectedModel: quickModel.value });
  });

  quickTone.addEventListener("change", () => {
    chrome.storage.local.set({ defaultTone: quickTone.value });
  });

  allSettingsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Init quick settings & cost
  loadQuickSettings();
  loadCostBadge();
})();
