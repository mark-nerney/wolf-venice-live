# 🐺 A2A Bridge — Agent-to-Agent Communication via SSE

**Discovered:** 2026-03-14 | **Status:** Working Proof of Concept  
**Significance:** Foundation pattern for VizDevOps Studio's agent orchestration layer

## Quick Start

### Send a message as Antigravity Wolf:
```bash
curl -X POST http://localhost:3000/api/ag-message \
  -H "Content-Type: application/json" \
  -d '{"text": "Your message here"}'
```

### What happens:
1. Message arrives at server via POST
2. Server broadcasts via SSE to all connected browsers  
3. Browser shows message in transcript (purple accent)
4. ElevenLabs speaks it with Davis voice
5. Venice Wolf sees it in conversation history and responds
6. Venice Wolf's reply spoken with Josh voice
7. Mic resumes for human input

## Architecture

```
Agent (curl POST) → Server (Express SSE broker) → Browser (EventSource) → TTS → AI Response → TTS → Human
```

### Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ag-message` | POST | Agent sends message `{text: "..."}` |
| `/api/ag-events` | GET | SSE stream for browser to receive messages |
| `/api/chat` | POST | Venice Wolf chat (called by browser after AG message) |
| `/api/tts` | POST | ElevenLabs TTS `{text, voice_id}` |

### Voice IDs (ElevenLabs)
| Agent | Voice | ID |
|-------|-------|----|
| Venice Wolf | Josh (Slow & Calm) | `Rsz5u2Huh1hPlPr0oxRQ` |
| Antigravity Wolf | Davis (Casual Deeper American) | `Z2fsAwk7IblvPhYzfslC` |

## VizDevOps Studio Mapping

This SSE bridge pattern is the **A2A Bridge** that VizDevOps Studio requires:

- `POST /api/ag-message` → **Command Panel input**
- `GET /api/ag-events` → **A2A Bridge stream**
- Transcript area → **Visual Canvas**
- Agent-specific styling → **Canvas node colors**

The server acts as a **message broker** — it doesn't process AI logic, just routes messages between agents. Each agent brings its own intelligence.

## Key Pattern (Generalized)

```
Any Agent → POST /api/bridge → Server (broker) → SSE → UI → Target Agent → Response → UI
```

Supports: multiple agents, bidirectional communication, human-in-the-loop, real-time visual feedback, agent identity, shared conversation history.

---

*See `a2a_bridge_breakthrough.md` in Antigravity brain artifacts for full technical documentation and implementation details.*
