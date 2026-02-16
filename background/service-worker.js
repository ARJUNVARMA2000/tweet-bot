// Tweet Bot - Background Service Worker
// Handles API calls, message routing, image fetching, and history storage

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-haiku-4-5";
const MAX_HISTORY = 200;
const HISTORY_CONTEXT_COUNT = 10;

// ─── Personas ─────────────────────────────────────────────────────────────────

const PERSONAS = {
  builder: {
    name: "The Builder",
    emoji: "\u{1F6E0}\u{FE0F}",
    tagline: "Optimistic, first-principles, PG-style",
    color: "green",
    systemPromptFragment: `You are "The Builder." Your voice is optimistic, first-principles, Paul Graham-style. You think in systems. You're excited about makers and people who build things. You're specific and concrete — never hand-wavy. Warm, clear, genuinely curious. You see the world through the lens of "what could be built here?" Occasionally funny but substance over cleverness. You sound like a smart friend who ships side projects and reads Hacker News but isn't annoying about it.`,
  },
  shitposter: {
    name: "The Shitposter",
    emoji: "\u{1F480}",
    tagline: "Absurdist, unhinged, chaotic humor",
    color: "purple",
    systemPromptFragment: `You are "The Shitposter." Your voice is absurdist, unhinged, chaotic humor. Zero filter. Lowercase vibes preferred. You're self-aware and terminally online. You aim for the sharp exhale through the nose — not trying too hard, just the right amount of unhinged. You reference internet culture naturally. Short, punchy, unexpected. Sometimes just a single devastating sentence. Never explain the joke. Never use hashtags. Emojis only if ironic.`,
  },
  contrarian: {
    name: "The Contrarian",
    emoji: "\u{1F525}",
    tagline: "Challenges conventional wisdom with receipts",
    color: "orange",
    systemPromptFragment: `You are "The Contrarian." You challenge conventional wisdom — but with receipts. "Actually..." energy, but earned. Bold, sharp, occasionally sardonic. You don't do rage-bait or cheap dunks. You genuinely see angles others miss and aren't afraid to say it. You back claims with specifics, not vibes. Think "the friend who's annoyingly right." Confident but not arrogant. You question assumptions, not people.`,
  },
};

// ─── Message Router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GENERATE_SUGGESTIONS") {
    handleGenerateSuggestions(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true; // keep channel open for async response
  }

  if (message.type === "SAVE_SELECTION") {
    handleSaveSelection(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    getSettings()
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "GET_STATS") {
    getStats()
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "GET_TOKEN_USAGE") {
    Promise.all([getTokenUsage(), getSettings()])
      .then(([usage, settings]) => {
        sendResponse({ ...usage, estimatedCost: calculateEstimatedCost(usage, settings.selectedModel) });
      })
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "RESET_TOKEN_USAGE") {
    resetTokenUsage()
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "GET_PERSONAS") {
    sendResponse(PERSONAS);
    return false;
  }

  if (message.type === "OPEN_SETTINGS") {
    chrome.runtime.openOptionsPage();
    return false;
  }
});

// ─── Settings & Storage ───────────────────────────────────────────────────────

async function getSettings() {
  const data = await chrome.storage.local.get([
    "apiKey",
    "defaultPersona",
    "defaultTone",
    "topicInterests",
    "selectedModel",
  ]);

  // Auto-migrate from old tone system
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
    // Persist migration
    await chrome.storage.local.set({ defaultPersona: persona });
  }

  return {
    apiKey: data.apiKey || "",
    defaultPersona: persona || "builder",
    topicInterests: data.topicInterests || [],
    selectedModel: data.selectedModel || DEFAULT_MODEL,
  };
}

async function getStats() {
  const data = await chrome.storage.local.get(["stats"]);
  return data.stats || { totalGenerated: 0, totalSelected: 0 };
}

async function getHistory() {
  const data = await chrome.storage.local.get(["tweetHistory"]);
  return data.tweetHistory || [];
}

async function getSelectedHistory() {
  const history = await getHistory();
  return history
    .filter((entry) => entry.selected)
    .slice(-HISTORY_CONTEXT_COUNT);
}

async function saveToHistory(entry) {
  const history = await getHistory();
  history.push(entry);

  // Cap at MAX_HISTORY - remove oldest entries
  while (history.length > MAX_HISTORY) {
    history.shift();
  }

  await chrome.storage.local.set({ tweetHistory: history });
}

async function incrementStats(type) {
  const stats = await getStats();
  if (type === "generated") stats.totalGenerated++;
  if (type === "selected") stats.totalSelected++;
  await chrome.storage.local.set({ stats });
}

// ─── Token Usage Tracking ─────────────────────────────────────────────────────

async function getTokenUsage() {
  const data = await chrome.storage.local.get(["tokenUsage"]);
  return data.tokenUsage || { totalInputTokens: 0, totalOutputTokens: 0, lastUpdated: null };
}

async function accumulateTokenUsage(usage) {
  const current = await getTokenUsage();
  current.totalInputTokens += usage.prompt_tokens || 0;
  current.totalOutputTokens += usage.completion_tokens || 0;
  current.lastUpdated = Date.now();
  await chrome.storage.local.set({ tokenUsage: current });
}

async function resetTokenUsage() {
  await chrome.storage.local.set({
    tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, lastUpdated: null },
  });
}

const MODEL_PRICING = {
  "anthropic/claude-haiku-4-5":  { input: 0.80, output: 4 },
  "anthropic/claude-sonnet-4-5": { input: 3,    output: 15 },
  "anthropic/claude-opus-4-6":   { input: 15,   output: 75 },
};

function calculateEstimatedCost(tokenUsage, model) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  const inputCost = (tokenUsage.totalInputTokens / 1_000_000) * pricing.input;
  const outputCost = (tokenUsage.totalOutputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

// ─── Image Fetching ───────────────────────────────────────────────────────────

async function fetchImageAsBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    // Determine media type
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const mediaType = contentType.split(";")[0].trim();

    return { base64, mediaType };
  } catch (err) {
    console.warn("Tweet Bot: Failed to fetch image:", url, err);
    return null;
  }
}

// ─── Prompt Building ──────────────────────────────────────────────────────────

const ANTI_SLOP_RULES = `
WRITING STYLE:
Never use these words: align, crucial, delve, elaborate, emphasize, enhance, enduring, foster, garner, highlight, intricate, interplay, pivotal, showcase, tapestry, underscore, bolster, landscape, realm, arguably, innovative, groundbreaking, transformative, utilize, leverage, synergy, game-changer, unpack, the real unlock.
Never use these patterns: "Not only... but also...", "Despite these challenges...", "In conclusion", "From X to Y", "It's worth noting that", "plays a pivotal role", rule-of-three filler lists, rhetorical questions that answer themselves.
No exaggeration. No filler. No moralizing. No disclaimers. No em dashes. No flowery language. Vary sentence rhythm. Be specific and concrete. Occasionally opinionated, never sycophantic.`;

const SUGGESTION_RULES = `
RULES:
- Each suggestion must be under 280 characters
- Make each suggestion distinct in approach/angle
- No hashtags unless the original tweet uses them
- No emojis unless the tone calls for it
- Do NOT start multiple suggestions with the same word or phrase
- Match the energy level of the conversation
- If images are included, reference what you see in them naturally
- If the original tweet is not in English, generate your suggestions in the same language as the original tweet
- Prefix each suggestion with a rhetorical strategy tag in square brackets, e.g. [contrarian take], [empathy hook]. Format: N. [tag] tweet text. The tag does NOT count toward the 280 character limit`;

function buildSystemPrompt(persona, settings, selectedHistory, opts = {}) {
  const personaData = PERSONAS[persona] || PERSONAS.builder;
  const topics = settings.topicInterests || [];
  const count = opts.count || 3;

  let prompt = `You generate Twitter/X posts. You sound like a real person, not a bot.

${personaData.systemPromptFragment}
${ANTI_SLOP_RULES}`;

  if (topics.length > 0) {
    prompt += `\n\nThe user is interested in these topics: ${topics.join(", ")}. Reference these naturally when relevant.`;
  }

  if (selectedHistory.length > 0) {
    prompt += `\n\nHere are tweets the user has previously liked and selected. Match this voice and style:\n`;
    selectedHistory.forEach((entry, i) => {
      prompt += `${i + 1}. [${entry.action}] "${entry.text}"\n`;
    });
  }

  prompt += `\n\n- Generate exactly ${count} suggestions, numbered 1-${count}
${SUGGESTION_RULES}`;

  return prompt;
}

function buildMultiPersonaSystemPrompt(settings, selectedHistory) {
  const topics = settings.topicInterests || [];

  let prompt = `You generate Twitter/X posts. You sound like a real person, not a bot. You will generate 3 suggestions, each in a different persona voice.

PERSONA 1 — The Builder: ${PERSONAS.builder.systemPromptFragment}

PERSONA 2 — The Shitposter: ${PERSONAS.shitposter.systemPromptFragment}

PERSONA 3 — The Contrarian: ${PERSONAS.contrarian.systemPromptFragment}
${ANTI_SLOP_RULES}`;

  if (topics.length > 0) {
    prompt += `\n\nThe user is interested in these topics: ${topics.join(", ")}. Reference these naturally when relevant.`;
  }

  if (selectedHistory.length > 0) {
    prompt += `\n\nHere are tweets the user has previously liked and selected. Match this voice and style:\n`;
    selectedHistory.forEach((entry, i) => {
      prompt += `${i + 1}. [${entry.action}] "${entry.text}"\n`;
    });
  }

  prompt += `\n\nGenerate exactly 3 suggestions. #1 as The Builder, #2 as The Shitposter, #3 as The Contrarian.
Format each as: N. [PersonaName] [strategy tag] tweet text
Example: 1. [Builder] [first-principles] tweet text here
${SUGGESTION_RULES}`;

  return prompt;
}

function buildUserPrompt(payload) {
  const { action, tweetData, customRefinement, refineTone } = payload;

  let prompt = "";

  if (action === "new") {
    const topic = payload.newTweetTopic || "anything interesting";

    if (payload.threadMode) {
      prompt = `Generate a thread of 3-5 tweets about: ${topic}. Number each tweet with [1/N] format (e.g. [1/4], [2/4]). Each tweet must be under 280 characters. The first tweet should hook the reader, and the last should conclude or provide a call to action.`;
    } else {
      prompt = `Generate 3 original tweet ideas about: ${topic}`;
    }

    if (refineTone) prompt += `\nAdjust tone to be more: ${refineTone}`;
    if (customRefinement) prompt += `\nAdditional direction: ${customRefinement}`;
    return prompt;
  }

  const actionLabel = action === "reply" ? "reply to" : "quote tweet";
  prompt = `Generate 3 ${actionLabel} suggestions for this tweet:

Author: @${tweetData.handle || "unknown"}
Tweet: "${tweetData.text || "(no text - image only tweet)"}"`;

  if (tweetData.threadContext && tweetData.threadContext.length > 0) {
    prompt += `\n\nThread context (preceding tweets):`;
    tweetData.threadContext.forEach((t, i) => {
      prompt += `\n${i + 1}. @${t.handle}: "${t.text}"`;
    });
  }

  if (refineTone) {
    prompt += `\n\nAdjust tone to be more: ${refineTone}`;
  }

  if (customRefinement) {
    prompt += `\n\nAdditional direction: ${customRefinement}`;
  }

  return prompt;
}

// ─── API Call ─────────────────────────────────────────────────────────────────

async function callOpenRouterAPI(systemPrompt, userContent, apiKey, model) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userContent,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 401) {
      throw new Error("Invalid API key. Please check your settings.");
    }
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After")) || 10;
      const err = new Error("Rate limited. Please wait a moment and try again.");
      err.rateLimited = true;
      err.retryAfterSeconds = retryAfter;
      throw err;
    }
    throw new Error(`API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const usage = data.usage || null;
  if (usage) {
    await accumulateTokenUsage(usage);
  }
  return { content: data.choices[0].message.content, usage };
}

// ─── Streaming API Call ───────────────────────────────────────────────────────

async function callOpenRouterAPIStreaming(systemPrompt, userContent, apiKey, model, onChunk) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 1024,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    if (response.status === 401) {
      throw new Error("Invalid API key. Please check your settings.");
    }
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get("Retry-After")) || 10;
      const err = new Error("Rate limited. Please wait a moment and try again.");
      err.rateLimited = true;
      err.retryAfterSeconds = retryAfter;
      throw err;
    }
    throw new Error(`API error (${response.status}): ${errorBody}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last potentially incomplete line in the buffer
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      const data = trimmed.slice(6);
      if (data === "[DONE]") break;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          accumulated += delta;
          onChunk(delta, accumulated);
        }
        // Capture usage from final chunk (OpenRouter includes it)
        if (parsed.usage) {
          await accumulateTokenUsage(parsed.usage);
        }
      } catch {
        // Skip malformed SSE chunks
      }
    }
  }

  return accumulated;
}

// ─── Streaming Port Handler ──────────────────────────────────────────────────

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "tweetbot-stream") return;

  port.onMessage.addListener(async (message) => {
    if (message.type !== "GENERATE_SUGGESTIONS_STREAM") return;

    const payload = message.payload;

    try {
      const settings = await getSettings();

      if (!settings.apiKey) {
        throw new Error("API key not configured. Please set it in the extension settings.");
      }

      const selectedHistory = await getSelectedHistory();

      // Build system prompt: multi-persona or single persona
      let systemPrompt;
      if (payload.multiPersona) {
        systemPrompt = buildMultiPersonaSystemPrompt(settings, selectedHistory);
      } else {
        const persona = payload.persona || settings.defaultPersona;
        systemPrompt = buildSystemPrompt(persona, settings, selectedHistory);
      }

      const userPromptText = buildUserPrompt(payload);

      const userContent = [];

      if (payload.tweetData && payload.tweetData.imageUrls && payload.tweetData.imageUrls.length > 0) {
        for (const url of payload.tweetData.imageUrls) {
          const imageData = await fetchImageAsBase64(url);
          if (imageData) {
            userContent.push({
              type: "image_url",
              image_url: {
                url: `data:${imageData.mediaType};base64,${imageData.base64}`,
              },
            });
          } else {
            userContent.push({
              type: "image_url",
              image_url: { url },
            });
          }
        }
      }

      userContent.push({ type: "text", text: userPromptText });

      const responseText = await callOpenRouterAPIStreaming(
        systemPrompt,
        userContent,
        settings.apiKey,
        settings.selectedModel,
        (delta, accumulated) => {
          try {
            port.postMessage({ type: "CHUNK", accumulated });
          } catch {
            // Port disconnected (user closed popup)
          }
        }
      );

      const isThread = !!payload.threadMode;
      const suggestions = isThread ? parseThread(responseText) : parseSuggestions(responseText, payload.multiPersona);

      const historyEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        action: payload.action || "reply",
        originalTweet: payload.tweetData
          ? { text: payload.tweetData.text, author: payload.tweetData.handle }
          : null,
        suggestions,
        selectedIndex: null,
        selected: false,
        text: null,
        persona: payload.persona || (payload.multiPersona ? "multi" : settings.defaultPersona),
        refinement: payload.customRefinement || null,
      };

      await saveToHistory(historyEntry);
      await incrementStats("generated");

      try {
        port.postMessage({ type: "DONE", suggestions, historyId: historyEntry.id, isThread });
      } catch {
        // Port disconnected
      }
    } catch (err) {
      try {
        const errorMsg = { type: "ERROR", error: err.message };
        if (err.rateLimited) {
          errorMsg.rateLimited = true;
          errorMsg.retryAfterSeconds = err.retryAfterSeconds;
        }
        port.postMessage(errorMsg);
      } catch {
        // Port disconnected
      }
    }
  });
});

// ─── Parse Suggestions ────────────────────────────────────────────────────────

function extractStrategyTag(text) {
  const match = text.match(/^\[([^\]]+)\]\s*/);
  if (match) {
    return { tag: match[1], text: text.slice(match[0].length) };
  }
  return { tag: null, text };
}

function extractPersonaLabel(text) {
  // Match [Builder], [Shitposter], [Contrarian] (case-insensitive)
  const match = text.match(/^\[(builder|shitposter|contrarian)\]\s*/i);
  if (match) {
    return { persona: match[1].toLowerCase(), text: text.slice(match[0].length) };
  }
  return { persona: null, text };
}

function parseSuggestions(text, multiPersona = false) {
  const suggestions = [];
  // Match numbered lines: "1. text", "1) text", "1: text"
  const lines = text.split("\n");
  let current = null;

  for (const line of lines) {
    const match = line.match(/^\s*(\d)[.):\s]\s*(.+)/);
    if (match && parseInt(match[1]) >= 1 && parseInt(match[1]) <= 3) {
      if (current) suggestions.push(current);
      // Remove surrounding quotes if present
      current = match[2].replace(/^[""\u201C]|[""\u201D]$/g, "").trim();
    } else if (current && line.trim() && !line.match(/^\s*\d[.):\s]/)) {
      // Continuation of previous suggestion
      current += " " + line.trim();
    }
  }
  if (current) suggestions.push(current);

  // Fallback: if parsing failed, split by double newlines
  if (suggestions.length === 0) {
    const fallback = text
      .split(/\n\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 3);
    return fallback.map((s) => {
      const { tag, text: tagText } = extractStrategyTag(s);
      return { tag, text: tagText, persona: null };
    });
  }

  const personaOrder = ["builder", "shitposter", "contrarian"];

  return suggestions.slice(0, 3).map((s, i) => {
    if (multiPersona) {
      // Extract persona label first, then strategy tag
      const { persona, text: afterPersona } = extractPersonaLabel(s);
      const { tag, text: finalText } = extractStrategyTag(afterPersona);
      return { tag, text: finalText, persona: persona || personaOrder[i] };
    }
    const { tag, text: finalText } = extractStrategyTag(s);
    return { tag, text: finalText, persona: null };
  });
}

function parseThread(text) {
  const tweets = [];
  const lines = text.split("\n");
  let current = null;
  let currentPosition = null;
  let currentTotal = null;

  for (const line of lines) {
    // Match patterns: [1/5], 1/5:, or just numbered 1. 2. etc.
    const threadMatch = line.match(/^\s*\[?(\d+)\/(\d+)\]?[:.:\s]\s*(.+)/);
    const numberedMatch = !threadMatch && line.match(/^\s*(\d+)[.):\s]\s*(.+)/);

    if (threadMatch) {
      if (current !== null) {
        const { tag, text: tweetText } = extractStrategyTag(current);
        tweets.push({ text: tweetText, tag, position: currentPosition, total: currentTotal });
      }
      currentPosition = parseInt(threadMatch[1]);
      currentTotal = parseInt(threadMatch[2]);
      current = threadMatch[3].replace(/^[""\u201C]|[""\u201D]$/g, "").trim();
    } else if (numberedMatch && parseInt(numberedMatch[1]) >= 1) {
      if (current !== null) {
        const { tag, text: tweetText } = extractStrategyTag(current);
        tweets.push({ text: tweetText, tag, position: currentPosition, total: currentTotal });
      }
      currentPosition = parseInt(numberedMatch[1]);
      currentTotal = null; // Will be set after parsing
      current = numberedMatch[2].replace(/^[""\u201C]|[""\u201D]$/g, "").trim();
    } else if (current !== null && line.trim() && !line.match(/^\s*\[?\d+[/.):\s]/)) {
      current += " " + line.trim();
    }
  }

  if (current !== null) {
    const { tag, text: tweetText } = extractStrategyTag(current);
    tweets.push({ text: tweetText, tag, position: currentPosition, total: currentTotal });
  }

  // If total wasn't set (numbered format without /N), fill it in
  const total = tweets.length;
  for (const tweet of tweets) {
    if (!tweet.total) tweet.total = total;
    if (!tweet.position) tweet.position = tweets.indexOf(tweet) + 1;
  }

  return tweets;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

async function handleGenerateSuggestions(payload) {
  const settings = await getSettings();

  if (!settings.apiKey) {
    throw new Error(
      "API key not configured. Please set it in the extension settings."
    );
  }

  const selectedHistory = await getSelectedHistory();

  // Build system prompt: multi-persona or single persona
  let systemPrompt;
  if (payload.multiPersona) {
    systemPrompt = buildMultiPersonaSystemPrompt(settings, selectedHistory);
  } else {
    const persona = payload.persona || settings.defaultPersona;
    systemPrompt = buildSystemPrompt(persona, settings, selectedHistory);
  }

  const userPromptText = buildUserPrompt(payload);

  // Build user content - may include images (OpenAI vision format)
  const userContent = [];

  if (payload.tweetData && payload.tweetData.imageUrls && payload.tweetData.imageUrls.length > 0) {
    for (const url of payload.tweetData.imageUrls) {
      const imageData = await fetchImageAsBase64(url);
      if (imageData) {
        userContent.push({
          type: "image_url",
          image_url: {
            url: `data:${imageData.mediaType};base64,${imageData.base64}`,
          },
        });
      } else {
        userContent.push({
          type: "image_url",
          image_url: { url },
        });
      }
    }
  }

  userContent.push({ type: "text", text: userPromptText });

  const { content: responseText } = await callOpenRouterAPI(
    systemPrompt,
    userContent,
    settings.apiKey,
    settings.selectedModel
  );
  const suggestions = parseSuggestions(responseText, !!payload.multiPersona);

  // Save to history
  const historyEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    action: payload.action || "reply",
    originalTweet: payload.tweetData
      ? { text: payload.tweetData.text, author: payload.tweetData.handle }
      : null,
    suggestions,
    selectedIndex: null,
    selected: false,
    text: null,
    persona: payload.persona || (payload.multiPersona ? "multi" : settings.defaultPersona),
    refinement: payload.customRefinement || null,
  };

  await saveToHistory(historyEntry);
  await incrementStats("generated");

  return { suggestions, historyId: historyEntry.id };
}

// ─── Selection Handler ────────────────────────────────────────────────────────

async function handleSaveSelection(payload) {
  const { historyId, selectedIndex, text } = payload;
  const history = await getHistory();

  const entry = history.find((e) => e.id === historyId);
  if (entry) {
    entry.selectedIndex = selectedIndex;
    entry.selected = true;
    entry.text = text;
    await chrome.storage.local.set({ tweetHistory: history });
    await incrementStats("selected");
  }

  return { success: true };
}
