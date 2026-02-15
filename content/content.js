// Tweet Bot - Main Content Script
// MutationObserver for tweet detection and orchestration

(() => {
  let rafPending = false;

  function processTweets() {
    UIInjector.processAllTweets();
    rafPending = false;
  }

  function scheduleProcessing() {
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(processTweets);
    }
  }

  // Observe DOM mutations for dynamically loaded tweets (infinite scroll)
  const observer = new MutationObserver((mutations) => {
    let shouldProcess = false;

    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the added node is or contains a tweet
            if (
              node.matches?.(TweetExtractor.SELECTORS.tweet) ||
              node.querySelector?.(TweetExtractor.SELECTORS.tweet)
            ) {
              shouldProcess = true;
              break;
            }
          }
        }
      }
      if (shouldProcess) break;
    }

    if (shouldProcess) {
      scheduleProcessing();
    }
  });

  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Process tweets already on the page
  scheduleProcessing();

  // Also process on navigation (X uses client-side routing)
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Small delay for new page content to load
      setTimeout(scheduleProcessing, 500);
    }
  });
  urlObserver.observe(document.querySelector("head > title") || document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
})();
