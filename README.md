# Wolf Voice Chat 🐺

**Real-time conversational AI powered by Venice.ai + ElevenLabs**

A multimodal voice chatbot with the Wolf persona — featuring real-time speech conversation, image generation, and vision analysis.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Voice Engine** | ElevenLabs Conversational AI (WebSocket) |
| **LLM Brain** | Venice.ai (`venice-uncensored`) |
| **Image Generation** | Venice.ai Image API |
| **Vision/Multimodal** | Venice.ai (`qwen3-vl-235b-a22b`) |
| **Backend** | Node.js + Express / Firebase Cloud Functions |
| **Frontend** | Vanilla JS + Premium CSS |
| **Hosting** | Firebase Hosting (`wolf-venice-live.web.app`) |

## Features

- 🎤 **Real-time Voice Chat** — Talk to Wolf using your microphone
- 🎨 **Image Generation** — Generate images on demand via Venice.ai
- 👁️ **Vision Analysis** — Upload images for AI analysis
- 💬 **Text Chat** — Text-based conversation with Wolf
- 🐺 **Wolf Persona** — Bold, edgy, unfiltered AI personality

## Local Development

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Run locally
npm run dev
```

## Deployment

```bash
# Install Cloud Functions dependencies
cd functions && npm install && cd ..

# Set Firebase Functions config
firebase functions:config:set venice.key="YOUR_KEY" elevenlabs.key="YOUR_KEY"

# Deploy
firebase deploy --only hosting:wolf-venice-live,functions
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ELEVENLABS_API_KEY` | ElevenLabs API key |
| `VENICE_API_KEY` | Venice.ai API key |
| `PORT` | Server port (default: 3000) |

## Architecture

```
Frontend (Firebase Hosting)
    ├── Voice Chat → ElevenLabs WebSocket → Venice.ai (Custom LLM)
    ├── Text Chat  → /api/chat → Venice.ai Chat Completions
    ├── Images     → /api/image/generate → Venice.ai Image API
    └── Vision     → /api/vision/analyze → Venice.ai Vision API

Backend (Cloud Functions)
    └── Express API → Venice.ai / ElevenLabs APIs
```

## License

MIT — Wolf Pack 🐺
