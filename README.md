# Tweet Bot — AI Tweet Suggestions

A Chrome extension that generates tweet replies, quote tweets, and original tweets using Claude via OpenRouter.

## Features

- **AI-powered suggestions** — Get 3 distinct tweet suggestions with different rhetorical angles
- **Multiple actions** — Reply, quote tweet, or compose new tweets
- **Tone control** — Witty, professional, casual, provocative, or informative
- **Thread mode** — Generate multi-tweet threads on any topic
- **Image understanding** — Analyzes images in tweets for context-aware replies
- **Voice learning** — Tracks which suggestions you pick to match your style over time
- **Streaming** — Responses stream in real-time as they're generated
- **Model selection** — Choose between Claude Opus 4.6, Sonnet 4.5, or Haiku 4.5
- **Usage tracking** — Monitor token usage and estimated costs
- **Export/Import** — Back up and restore all settings and history

## Setup

1. Clone this repo
2. Go to `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder
5. Open the extension settings and paste your [OpenRouter API key](https://openrouter.ai/keys)

## Project Structure

```
Tweet Bot/
├── manifest.json              # Extension manifest (v3)
├── background/
│   └── service-worker.js      # API calls, streaming, history, prompt building
├── content/
│   ├── content.js             # Main content script orchestrator
│   ├── tweet-extractor.js     # Extracts tweet data from the DOM
│   ├── ui-injector.js         # Injects AI buttons into tweet actions
│   └── popup-ui.js            # Suggestion popup UI
├── settings/
│   ├── settings.html          # Settings page
│   ├── settings.js            # Settings logic
│   └── settings.css           # Settings styles
├── styles/
│   └── content.css            # Injected content styles
└── icons/                     # Extension icons (16, 32, 48, 128)
```

## How It Works

1. The extension injects an AI button into every tweet's action bar on X/Twitter
2. Clicking it extracts the tweet text, author, thread context, and images
3. A popup appears and streams suggestions from Claude via OpenRouter
4. Each suggestion has a rhetorical strategy tag (e.g. [contrarian take], [empathy hook])
5. Click a suggestion to copy it into the reply box
6. Your selections are saved to train future suggestions toward your voice

## Models

| Model | Best For | Pricing |
|-------|----------|---------|
| **Opus 4.6** | Highest quality, nuanced replies | $5 / $25 per MTok |
| **Sonnet 4.5** | Good balance of speed and quality | $3 / $15 per MTok |
| **Haiku 4.5** | Fast, cost-effective | $1 / $5 per MTok |

## Privacy

- Your API key is stored locally in Chrome storage
- No data is sent anywhere except OpenRouter's API
- Tweet history stays on your device
