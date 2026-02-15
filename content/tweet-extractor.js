// Tweet Bot - Tweet Data Extractor
// Centralized DOM selectors and tweet data extraction

const TweetExtractor = (() => {
  // Single place to update if X changes their DOM structure
  const SELECTORS = {
    tweet: 'article[data-testid="tweet"]',
    tweetText: '[data-testid="tweetText"]',
    userName: '[data-testid="User-Name"]',
    actionBar: 'div[role="group"]',
    replyButton: '[data-testid="reply"]',
    composeBox: '[data-testid="tweetTextarea_0"]',
    tweetImages: 'img[src*="pbs.twimg.com/media"]',
    tweetLink: 'a[href*="/status/"] time',
  };

  function extractTweetData(tweetArticle) {
    const data = {
      text: "",
      author: "",
      handle: "",
      tweetUrl: "",
      threadContext: [],
      imageUrls: [],
    };

    // Extract tweet text
    const textEl = tweetArticle.querySelector(SELECTORS.tweetText);
    if (textEl) {
      data.text = textEl.innerText.trim();
    }

    // Extract author name and handle
    const userNameEl = tweetArticle.querySelector(SELECTORS.userName);
    if (userNameEl) {
      // The User-Name container typically has display name and @handle
      const links = userNameEl.querySelectorAll("a");
      if (links.length >= 1) {
        data.author = links[0].textContent.trim();
      }
      // Handle is usually in second link or in a span with @
      const allText = userNameEl.textContent;
      const handleMatch = allText.match(/@(\w+)/);
      if (handleMatch) {
        data.handle = handleMatch[1];
      }
    }

    // Extract tweet URL from the timestamp link
    const timeLink = tweetArticle.querySelector(SELECTORS.tweetLink);
    if (timeLink) {
      const linkEl = timeLink.closest("a");
      if (linkEl) {
        data.tweetUrl = linkEl.href;
      }
    }

    // Extract image URLs
    const images = tweetArticle.querySelectorAll(SELECTORS.tweetImages);
    images.forEach((img) => {
      // Get the highest quality version
      let src = img.src;
      // Twitter serves images with query params for sizing - get original
      if (src.includes("?")) {
        src = src.split("?")[0] + "?format=jpg&name=medium";
      }
      if (!data.imageUrls.includes(src)) {
        data.imageUrls.push(src);
      }
    });

    return data;
  }

  function extractThreadContext(tweetArticle) {
    const context = [];

    // On a /status/ page, get preceding tweets in the thread
    if (!window.location.pathname.includes("/status/")) {
      return context;
    }

    // Find all tweet articles on the page
    const allTweets = document.querySelectorAll(SELECTORS.tweet);
    const tweetArray = Array.from(allTweets);
    const currentIndex = tweetArray.indexOf(tweetArticle);

    if (currentIndex <= 0) return context;

    // Get up to 3 preceding tweets
    const start = Math.max(0, currentIndex - 3);
    for (let i = start; i < currentIndex; i++) {
      const prevTweet = tweetArray[i];
      const data = extractTweetData(prevTweet);
      if (data.text || data.handle) {
        context.push({ text: data.text, handle: data.handle });
      }
    }

    return context;
  }

  function getActionBar(tweetArticle) {
    return tweetArticle.querySelector(SELECTORS.actionBar);
  }

  function getComposeBox() {
    return document.querySelector(SELECTORS.composeBox);
  }

  return {
    SELECTORS,
    extractTweetData,
    extractThreadContext,
    getActionBar,
    getComposeBox,
  };
})();
