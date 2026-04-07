# Copilot Instructions for Wolf Voice Chat

This repository contains a dual-environment application (Local Express + Cloud Functions) integrating Venice.ai and ElevenLabs for a multimodal conversational AI.

## 🏗️ Build, Test, and Deploy

### Local Development
- **Start Server:** `npm run dev` (runs `node server.js` on port 3000)
- **Frontend:** Served statically from `public/` by the local server. No build step required.
- **Secrets:** Managed via `.env` file (requires `VENICE_API_KEY`, `ELEVENLABS_API_KEY`)
- **Linting/Testing:** No automated linting or testing is currently configured. Rely on manual verification.

### Cloud Deployment (Firebase)
- **Deploy:** `firebase deploy --only hosting:wolf-venice-live,functions`
- **Secrets:** Managed via Firebase config: `firebase functions:config:set venice.key="..." elevenlabs.key="..."`
- **Runtime:** Node.js 20 (defined in `firebase.json` and `functions/package.json`)

## 🏛️ High-Level Architecture

The application runs in two distinct environments that must be kept in sync manually:

1.  **Local Environment (`server.js`)**:
    -   Uses a standalone Express server.
    -   **Memory System:** Reads chat history from a local file at `~/Wolf-Local-MacBook-Staging/Development_Resources/Venice AI/memories.txt`. This path is hardcoded and critical.
    -   **Frontend:** Served directly by Express from `public/`.

2.  **Cloud Environment (`functions/index.js`)**:
    -   Uses Firebase Cloud Functions.
    -   **Memory System:** Uses Firestore for persistence (replaces local file system access).
    -   **Frontend:** Hosted on Firebase Hosting, rewrites `/api/**` to Cloud Functions.

## 🔑 Key Conventions

### Code Synchronization
Logic changes to `server.js` often need to be manually ported to `functions/index.js` and vice-versa. Always check both files when modifying API logic or configuration.

### Model Consistency
Ensure these model IDs are identical in both `server.js` and `functions/index.js`:
-   **Chat:** `olafangensan-glm-4.7-flash-heretic`
-   **Image:** `lustify-sdxl`
-   **Video:** `wan-2.6`
-   **Vision:** `qwen3-vl-235b-a22b`
-   **TTS:** `eleven_multilingual_v2`

### Voice IDs
-   **Wolf (Josh - Slow and Calm):** `Rsz5u2Huh1hPlPr0oxRQ`
-   **Antigravity (Davis):** `Z2fsAwk7IblvPhYzfslC`

### File Structure
-   `public/app.js`: Frontend logic (vanilla JS). Handles microphone input and API calls.
    -   Uses a global `state` object for application state.
    -   Uses `$` and `$$` helpers for DOM selection.
    -   Uses Web Speech API for Speech-to-Text (STT).
-   `public/styles.css`: Styling.
-   `server.js`: Local backend implementation.
-   `functions/index.js`: Cloud backend implementation.
