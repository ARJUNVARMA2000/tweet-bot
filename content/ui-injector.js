// Tweet Bot - UI Injector
// Injects AI button into tweet action bars

const UIInjector = (() => {
  const AI_BUTTON_CLASS = "tweetbot-ai-btn";
  const PROCESSED_ATTR = "data-tweetbot-processed";

  const AI_ICON_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-1v-2h1c2.76 0 5-2.24 5-5s-2.24-5-5-5H9v7H7V4h4c3.87 0 7 3.13 7 7 0 3.47-2.52 6.35-5.83 6.91L13 20h-2v-3z"/>
    <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.6"/>
  </svg>`;

  function createAIButton(tweetArticle) {
    const btn = document.createElement("button");
    btn.className = AI_BUTTON_CLASS;
    btn.setAttribute("aria-label", "Generate AI suggestion");
    btn.setAttribute("type", "button");
    btn.innerHTML = `
      <div class="tweetbot-ai-btn-inner">
        ${AI_ICON_SVG}
      </div>
    `;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Extract tweet data
      const tweetData = TweetExtractor.extractTweetData(tweetArticle);
      tweetData.threadContext =
        TweetExtractor.extractThreadContext(tweetArticle);

      // Show popup
      PopupUI.show(btn, tweetData);
    });

    return btn;
  }

  function injectButton(tweetArticle) {
    if (tweetArticle.hasAttribute(PROCESSED_ATTR)) return;
    tweetArticle.setAttribute(PROCESSED_ATTR, "true");

    const actionBar = TweetExtractor.getActionBar(tweetArticle);
    if (!actionBar) return;

    // Don't duplicate
    if (actionBar.querySelector(`.${AI_BUTTON_CLASS}`)) return;

    const btn = createAIButton(tweetArticle);

    // Insert before the last child (usually the share button area)
    const wrapper = document.createElement("div");
    wrapper.className = "tweetbot-btn-wrapper";
    wrapper.appendChild(btn);

    actionBar.appendChild(wrapper);
  }

  function processAllTweets() {
    const tweets = document.querySelectorAll(
      TweetExtractor.SELECTORS.tweet + `:not([${PROCESSED_ATTR}])`
    );
    tweets.forEach(injectButton);
  }

  return {
    injectButton,
    processAllTweets,
    AI_BUTTON_CLASS,
    PROCESSED_ATTR,
  };
})();
