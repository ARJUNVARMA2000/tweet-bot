// Tweet Bot - Suggestion Popup UI
// Renders popup with suggestions, copy, refine, and auto-paste controls

const PopupUI = (() => {
  let currentPopup = null;
  let currentTweetData = null;
  let currentHistoryId = null;
  let currentAction = "reply";
  let activePort = null;

  const PERSONA_DISPLAY = {
    builder: { name: "The Builder", color: "green" },
    shitposter: { name: "The Shitposter", color: "purple" },
    contrarian: { name: "The Contrarian", color: "orange" },
  };

  function getPersonaDisplayName(key) {
    return PERSONA_DISPLAY[key]?.name || key;
  }

  function getPersonaColor(key) {
    return PERSONA_DISPLAY[key]?.color || "green";
  }

  function detectTheme() {
    const bg = window.getComputedStyle(document.body).backgroundColor;
    if (!bg) return "dark";
    const match = bg.match(/\d+/g);
    if (!match) return "dark";
    const brightness =
      (parseInt(match[0]) + parseInt(match[1]) + parseInt(match[2])) / 3;
    return brightness > 128 ? "light" : "dark";
  }

  function dismiss() {
    if (activePort) {
      try { activePort.disconnect(); } catch {}
      activePort = null;
    }
    // Clear any running countdown intervals
    if (currentPopup && currentPopup._tweetbotIntervals) {
      currentPopup._tweetbotIntervals.forEach((id) => clearInterval(id));
      currentPopup._tweetbotIntervals = [];
    }
    if (currentPopup) {
      currentPopup.remove();
      currentPopup = null;
    }
    currentTweetData = null;
    currentHistoryId = null;
  }

  function show(anchorBtn, tweetData) {
    dismiss(); // Remove any existing popup
    currentTweetData = tweetData;
    currentAction = "quote";

    const theme = detectTheme();
    const popup = document.createElement("div");
    popup.className = `tweetbot-popup tweetbot-theme-${theme}`;

    // Position above the button (preferred) or below if not enough space
    const rect = anchorBtn.getBoundingClientRect();
    popup.style.position = "fixed";
    popup.style.left = `${Math.max(8, rect.left - 150)}px`;
    popup.style.zIndex = "999999";

    popup.innerHTML = buildPopupHTML();
    document.body.appendChild(popup);
    currentPopup = popup;

    // Position: prefer above the button, fall back to below
    requestAnimationFrame(() => {
      const popupRect = popup.getBoundingClientRect();

      // Try above first
      const aboveTop = rect.top - popupRect.height - 8;
      if (aboveTop >= 8) {
        popup.style.top = `${aboveTop}px`;
      } else {
        // Fall back to below if not enough space above
        popup.style.top = `${rect.bottom + 8}px`;
      }

      if (popupRect.right > window.innerWidth - 8) {
        popup.style.left = `${window.innerWidth - popupRect.width - 8}px`;
      }
    });

    attachEventListeners(popup);
    generateSuggestions(popup);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener("click", handleOutsideClick);
    }, 100);
  }

  function handleOutsideClick(e) {
    if (currentPopup && !currentPopup.contains(e.target)) {
      dismiss();
      document.removeEventListener("click", handleOutsideClick);
    }
  }

  function buildPopupHTML() {
    return `
      <div class="tweetbot-popup-header">
        <span class="tweetbot-title">Tweet Bot AI</span>
        <button class="tweetbot-close" aria-label="Close">&times;</button>
      </div>

      <div class="tweetbot-tabs">
        <button class="tweetbot-tab" data-action="reply">Reply</button>
        <button class="tweetbot-tab tweetbot-tab-active" data-action="quote">Quote</button>
      </div>

      <div class="tweetbot-suggestions">
        <div class="tweetbot-loading">
          <div class="tweetbot-spinner"></div>
          <span>Generating suggestions...</span>
        </div>
      </div>

      <div class="tweetbot-refinements" style="display:none">
        <div class="tweetbot-refine-buttons">
          <button class="tweetbot-refine-btn" data-tone="shorter">Shorter</button>
          <button class="tweetbot-refine-btn" data-tone="spicier">Spicier</button>
          <button class="tweetbot-refine-btn" data-tone="softer">Softer</button>
          <button class="tweetbot-refine-btn" data-tone="more specific">More specific</button>
        </div>
        <div class="tweetbot-custom-refine">
          <input type="text" class="tweetbot-refine-input" placeholder="Custom direction..." />
          <button class="tweetbot-refine-submit">Go</button>
        </div>
        <button class="tweetbot-regenerate">Regenerate</button>
      </div>

      <div class="tweetbot-error" style="display:none"></div>
    `;
  }

  function attachEventListeners(popup) {
    // Close button
    popup.querySelector(".tweetbot-close").addEventListener("click", (e) => {
      e.stopPropagation();
      dismiss();
    });

    // Tab switching
    popup.querySelectorAll(".tweetbot-tab").forEach((tab) => {
      tab.addEventListener("click", (e) => {
        e.stopPropagation();
        popup.querySelectorAll(".tweetbot-tab").forEach((t) =>
          t.classList.remove("tweetbot-tab-active")
        );
        tab.classList.add("tweetbot-tab-active");
        currentAction = tab.dataset.action;
        generateSuggestions(popup);
      });
    });

    // Refinement buttons
    popup.querySelectorAll(".tweetbot-refine-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        generateSuggestions(popup, { refineTone: btn.dataset.tone });
      });
    });

    // Custom refinement
    popup
      .querySelector(".tweetbot-refine-submit")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        const input = popup.querySelector(".tweetbot-refine-input");
        if (input.value.trim()) {
          generateSuggestions(popup, {
            customRefinement: input.value.trim(),
          });
          input.value = "";
        }
      });

    popup
      .querySelector(".tweetbot-refine-input")
      .addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.stopPropagation();
          const input = e.target;
          if (input.value.trim()) {
            generateSuggestions(popup, {
              customRefinement: input.value.trim(),
            });
            input.value = "";
          }
        }
      });

    // Regenerate
    popup
      .querySelector(".tweetbot-regenerate")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        generateSuggestions(popup);
      });

    // Stop propagation on popup clicks
    popup.addEventListener("click", (e) => e.stopPropagation());
  }

  function generateSuggestions(popup, options = {}, retryCount = 0) {
    const suggestionsContainer = popup.querySelector(".tweetbot-suggestions");
    const refinements = popup.querySelector(".tweetbot-refinements");
    const errorContainer = popup.querySelector(".tweetbot-error");

    // Show loading
    suggestionsContainer.innerHTML = `
      <div class="tweetbot-loading">
        <div class="tweetbot-spinner"></div>
        <span>Generating suggestions...</span>
      </div>
    `;
    refinements.style.display = "none";
    errorContainer.style.display = "none";

    const payload = {
      action: currentAction,
      tweetData: currentTweetData,
      multiPersona: true,
      ...options,
    };

    // Disconnect any existing stream
    if (activePort) {
      try { activePort.disconnect(); } catch {}
      activePort = null;
    }

    const port = chrome.runtime.connect({ name: "tweetbot-stream" });
    activePort = port;

    port.onMessage.addListener((msg) => {
      // Ignore messages if this port is no longer active (rapid regeneration)
      if (activePort !== port) return;

      if (msg.type === "CHUNK") {
        renderStreamingText(popup, msg.accumulated);
      } else if (msg.type === "DONE") {
        activePort = null;
        currentHistoryId = msg.historyId;
        if (msg.isThread) {
          renderThread(popup, msg.suggestions);
        } else {
          renderSuggestions(popup, msg.suggestions);
        }
      } else if (msg.type === "ERROR") {
        activePort = null;
        if (msg.rateLimited && retryCount < 3) {
          showRetryCountdown(popup, msg.retryAfterSeconds || 10, retryCount, options);
        } else {
          showError(popup, msg.error);
        }
      }
    });

    port.onDisconnect.addListener(() => {
      if (activePort === port) {
        activePort = null;
        // Only show error if we haven't received DONE yet
        if (!currentHistoryId) {
          showError(popup, "Connection lost. Please try again.");
        }
      }
    });

    port.postMessage({ type: "GENERATE_SUGGESTIONS_STREAM", payload });
  }

  function showRetryCountdown(popup, seconds, retryCount, options) {
    const container = popup.querySelector(".tweetbot-suggestions");
    let remaining = seconds;

    container.innerHTML = `
      <div class="tweetbot-retry-countdown">
        <div class="tweetbot-retry-icon">429</div>
        <div class="tweetbot-retry-message">Rate limited</div>
        <div class="tweetbot-retry-timer">${remaining}s</div>
        <div class="tweetbot-retry-attempt">Retry ${retryCount + 1} of 3</div>
      </div>
    `;

    if (!popup._tweetbotIntervals) popup._tweetbotIntervals = [];

    const intervalId = setInterval(() => {
      remaining--;
      const timerEl = container.querySelector(".tweetbot-retry-timer");
      if (timerEl) timerEl.textContent = `${remaining}s`;

      if (remaining <= 0) {
        clearInterval(intervalId);
        popup._tweetbotIntervals = popup._tweetbotIntervals.filter((id) => id !== intervalId);
        generateSuggestions(popup, options, retryCount + 1);
      }
    }, 1000);

    popup._tweetbotIntervals.push(intervalId);
  }

  function renderStreamingText(popup, accumulated) {
    const container = popup.querySelector(".tweetbot-suggestions");
    container.innerHTML = `
      <div class="tweetbot-suggestion tweetbot-suggestion-streaming">
        <div class="tweetbot-suggestion-text">${escapeHTML(accumulated)}<span class="tweetbot-cursor"></span></div>
      </div>
    `;
  }

  function getSuggestionText(suggestion) {
    if (typeof suggestion === "string") return suggestion;
    return suggestion.text;
  }

  function getSuggestionTag(suggestion) {
    if (typeof suggestion === "string") return null;
    return suggestion.tag || null;
  }

  function getSuggestionPersona(suggestion) {
    if (typeof suggestion === "string") return null;
    return suggestion.persona || null;
  }

  function renderSuggestions(popup, suggestions) {
    const container = popup.querySelector(".tweetbot-suggestions");
    const refinements = popup.querySelector(".tweetbot-refinements");

    container.innerHTML = suggestions
      .map((suggestion, i) => {
        const text = getSuggestionText(suggestion);
        const tag = getSuggestionTag(suggestion);
        const persona = getSuggestionPersona(suggestion);
        const tagHTML = tag
          ? `<div class="tweetbot-strategy-tag">${escapeHTML(tag)}</div>`
          : "";
        const personaBadgeHTML = persona
          ? `<div class="tweetbot-persona-badge tweetbot-persona-${getPersonaColor(persona)}">${escapeHTML(getPersonaDisplayName(persona))}</div>`
          : "";
        return `
      <div class="tweetbot-suggestion" data-index="${i}">
        ${personaBadgeHTML}
        ${tagHTML}
        <div class="tweetbot-suggestion-text">${escapeHTML(text)}</div>
        <div class="tweetbot-suggestion-actions">
          <span class="tweetbot-char-count">${text.length}/280</span>
          <button class="tweetbot-copy-btn" data-index="${i}" title="Copy to clipboard">Copy</button>
          <button class="tweetbot-paste-btn" data-index="${i}" title="Paste into reply box">Use</button>
        </div>
      </div>
    `;
      })
      .join("");

    refinements.style.display = "block";

    // Copy buttons
    container.querySelectorAll(".tweetbot-copy-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        const text = getSuggestionText(suggestions[idx]);
        copyToClipboard(text);
        saveSelection(idx, text);
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = "Copy"), 1500);
      });
    });

    // Use/paste buttons
    container.querySelectorAll(".tweetbot-paste-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        const text = getSuggestionText(suggestions[idx]);
        copyToClipboard(text);
        saveSelection(idx, text);
        pasteIntoReplyBox(text);
        btn.textContent = "Done!";
        setTimeout(() => dismiss(), 800);
      });
    });
  }

  function renderThread(popup, tweets) {
    const container = popup.querySelector(".tweetbot-suggestions");
    const refinements = popup.querySelector(".tweetbot-refinements");

    const threadItems = tweets
      .map((tweet, i) => {
        const tagHTML = tweet.tag
          ? `<div class="tweetbot-strategy-tag">${escapeHTML(tweet.tag)}</div>`
          : "";
        const posLabel = tweet.position && tweet.total
          ? `[${tweet.position}/${tweet.total}]`
          : `[${i + 1}/${tweets.length}]`;
        return `
      <div class="tweetbot-thread-item">
        <div class="tweetbot-thread-connector">
          <div class="tweetbot-thread-dot"></div>
          ${i < tweets.length - 1 ? '<div class="tweetbot-thread-line"></div>' : ""}
        </div>
        <div class="tweetbot-thread-content">
          <span class="tweetbot-thread-position">${posLabel}</span>
          ${tagHTML}
          <div class="tweetbot-suggestion-text">${escapeHTML(tweet.text)}</div>
          <div class="tweetbot-suggestion-actions">
            <span class="tweetbot-char-count">${tweet.text.length}/280</span>
            <button class="tweetbot-copy-btn" data-index="${i}" title="Copy this tweet">Copy</button>
          </div>
        </div>
      </div>
    `;
      })
      .join("");

    container.innerHTML = `
      <div class="tweetbot-thread-header">
        <span>Thread (${tweets.length} tweets)</span>
        <button class="tweetbot-copy-thread-btn">Copy Thread</button>
      </div>
      ${threadItems}
    `;

    refinements.style.display = "block";

    // Copy individual tweet buttons
    container.querySelectorAll(".tweetbot-copy-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        copyToClipboard(tweets[idx].text);
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = "Copy"), 1500);
      });
    });

    // Copy full thread button
    const copyThreadBtn = container.querySelector(".tweetbot-copy-thread-btn");
    if (copyThreadBtn) {
      copyThreadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
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

  function showError(popup, message) {
    const container = popup.querySelector(".tweetbot-suggestions");
    const errorEl = popup.querySelector(".tweetbot-error");

    container.innerHTML = "";
    errorEl.style.display = "block";
    errorEl.textContent = message;

    // If it's an API key error, add a link to settings
    if (message.toLowerCase().includes("api key")) {
      const link = document.createElement("a");
      link.textContent = "Open Settings";
      link.href = "#";
      link.className = "tweetbot-settings-link";
      link.addEventListener("click", (e) => {
        e.preventDefault();
        chrome.runtime.sendMessage({ type: "OPEN_SETTINGS" });
      });
      errorEl.appendChild(document.createElement("br"));
      errorEl.appendChild(link);
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback
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

  function pasteIntoReplyBox(text) {
    // Try to click the reply button first to open the compose box
    if (currentAction === "reply" && currentTweetData) {
      const tweets = document.querySelectorAll(
        TweetExtractor.SELECTORS.tweet
      );
      for (const tweet of tweets) {
        const tweetData = TweetExtractor.extractTweetData(tweet);
        if (tweetData.handle === currentTweetData.handle && tweetData.text === currentTweetData.text) {
          const replyBtn = tweet.querySelector(
            TweetExtractor.SELECTORS.replyButton
          );
          if (replyBtn) {
            replyBtn.click();
            break;
          }
        }
      }
    }

    // Wait for compose box to appear, then insert text
    setTimeout(() => {
      const composeBox = TweetExtractor.getComposeBox();
      if (composeBox) {
        composeBox.focus();
        // Use execCommand for React-managed inputs
        document.execCommand("insertText", false, text);
      }
    }, 500);
  }

  function saveSelection(index, text) {
    if (!currentHistoryId) return;
    chrome.runtime.sendMessage({
      type: "SAVE_SELECTION",
      payload: {
        historyId: currentHistoryId,
        selectedIndex: index,
        text,
      },
    });
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    show,
    dismiss,
  };
})();
