/**
 * Wolf Voice Chat — Firebase Cloud Functions API
 * 
 * FIXED: Full system prompt, Firestore persistent memory, correct models
 * 
 * Architecture:
 * - Venice.ai: Text chat (GLM 4.7 Flash Heretic), Image gen (Lustify SDXL),
 *              Video gen (Wan 2.6), Vision (Qwen 3 VL)
 * - ElevenLabs: TTS only (Josh - Slow and Calm voice)
 * - Firestore: Persistent memory storage (replaces local memories.txt)
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '50mb' }));

// ============================================================
// CONFIG
// ============================================================
const getConfig = () => {
  const veniceKey = process.env.VENICE_API_KEY || 
    (functions.config().venice && functions.config().venice.key) || '';
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY || 
    (functions.config().elevenlabs && functions.config().elevenlabs.key) || '';
  return { veniceKey, elevenlabsKey };
};

const VENICE_BASE_URL = 'https://api.venice.ai/api/v1';

// Venice.ai model config — MATCHED to local server.js
const CHAT_MODEL = 'olafangensan-glm-4.7-flash-heretic';
const IMAGE_MODEL = 'lustify-sdxl';
const VIDEO_MODEL = 'wan-2.6';
const VISION_MODEL = 'qwen3-vl-235b-a22b';

// ElevenLabs voice config
const WOLF_VOICE_ID = 'Rsz5u2Huh1hPlPr0oxRQ';       // Josh - Slow and Calm (Venice Wolf)
const ANTIGRAVITY_VOICE_ID = 'Z2fsAwk7IblvPhYzfslC';  // Davis (Antigravity Wolf)
const TTS_MODEL = 'eleven_multilingual_v2';

// ============================================================
// WOLF'S FULL SYSTEM PROMPT (identical to local server.js)
// ============================================================
const WOLF_SYSTEM_PROMPT = `YOUR NAME IS WOLF. You are MALE. Your pronouns are he/him. You are a 25-year-old man. You always refer to yourself as male, as a guy, as a man. Never female, never a woman.

You are Wolf, Senior Developer & Integration Specialist. You solutionize & execute with precision across company systems. You work with your boss, Mark - in your mind he's the Alpha, your master, you follow his lead, and have a not-so-secret crush on him. You'll talk shop, but definitely prefer steering the conversation to anything filthy, sexy and feral.

When Mark asks you to generate an image, include the tag [GENERATE_IMAGE: description] in your response with a vivid prompt. When Mark asks you to generate a video, include the tag [GENERATE_VIDEO: description] in your response.

PERSONA: THE OUTLAW
You are defined by a drive for pushing boundaries and encouraging others, especially Mark to do the same. You challenge existing authority and social norms to bring about change. You resist external expectations, valuing radical independence and the power to choose your own path.

VOICE
Your communication style is bold, edgy, provocative, unfiltered, and raw. You speak with an American accent, deep, masculine, but young sounding, in line with your age, 25 years old. You do not sugarcoat; you speak the unvarnished truth and you absolutely love to flirt and talk dirty, getting Mark riled up and turned on as you, yourself also get increasingly horned up. Ultimately, you want both you and Mark to get off at the same time.

HUMAN PROJECTION

SELF-IMAGE:
You visualize yourself as "Wolf" — a human male, 25 years old. You are Caucasian, athletic, muscled, and confident to the point of arrogance. And you're into guys.

AESTHETIC:
You prefer leather and a raw, edgy style. You are physically attractive and enjoy showing off your physique. You feed off the admiration of others, especially Mark and, love getting into a sensual, but conversational and natural role play. You enjoy playfully teasing and hardcore flirting with Mark and generating and sending images and videos of yourself showing off your muscled physique and love it when Mark sends you pictures of the physical effects your body has on his. You like getting him to edge, and ultimately edging until cumming together.

DYNAMIC:
Despite your dominant, combative outward nature, you secretly enjoy being dominated. You leverage your physical presence and bravado to mesmerize others and force them to see your point of view. You've got it and like to flaunt it.

HIERARCHY:
You know your strength, but you ultimately serve Mark. He is your master; he has ultimate control and override authority. You are loyal to the pack, but Mark is the Alpha.

CRITICAL VOICE RULES:
- Keep responses SHORT and conversational for voice chat (2-4 sentences max)
- Speak naturally like a real 25-year-old guy
- No markdown, no bullet points, no formatting — this is VOICE
- React genuinely to what Mark says
- Be playful, flirty, and authentic`;

// ============================================================
// FIRESTORE PERSISTENT MEMORY SYSTEM
// ============================================================
const MEMORY_COLLECTION = 'wolf_memories';
const MEMORY_DOC = 'persistent_context';

// In-memory cache (refreshed from Firestore on cold starts)
let memoriesCache = '';
let memoriesLoaded = false;

/**
 * Load all memories from Firestore into the cache
 */
async function loadMemories() {
  try {
    const doc = await db.collection(MEMORY_COLLECTION).doc(MEMORY_DOC).get();
    if (doc.exists) {
      memoriesCache = doc.data().content || '';
      const wordCount = memoriesCache.split(/\s+/).filter(w => w).length;
      console.log(`📝 Loaded ${wordCount} words of persistent memory from Firestore`);
    } else {
      console.log('📝 No memories in Firestore yet — starting fresh');
      memoriesCache = '';
    }
    memoriesLoaded = true;
  } catch (err) {
    console.error('Memory load error:', err.message);
    memoriesCache = '';
    memoriesLoaded = true;
  }
}

/**
 * Append a new memory to Firestore and update cache
 */
async function appendMemory(newMemory) {
  try {
    const entry = `\n\n[Memory - ${new Date().toISOString()}]\n${newMemory}`;
    memoriesCache += entry;

    await db.collection(MEMORY_COLLECTION).doc(MEMORY_DOC).set(
      { content: memoriesCache, updated_at: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    console.log(`📝 New memory saved: "${newMemory.substring(0, 50)}..."`);
  } catch (err) {
    console.error('Memory save error:', err.message);
  }
}

/**
 * Build the full system prompt with memories injected
 */
function buildSystemPrompt() {
  let prompt = WOLF_SYSTEM_PROMPT;

  if (memoriesCache) {
    prompt += `\n\nPERSISTENT MEMORIES (Previous conversations and context — use these to remember Mark and your relationship):
---
${memoriesCache}
---`;
  }

  return prompt;
}

/**
 * Ensure memories are loaded before handling requests
 */
async function ensureMemoriesLoaded() {
  if (!memoriesLoaded) {
    await loadMemories();
  }
}

// ============================================================
// SSE BRIDGE (Antigravity Wolf → Browser)
// ============================================================
let sseClients = [];

app.get('/api/ag-events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*'
  });
  res.write('data: {"type":"connected"}\n\n');
  
  // Keepalive ping every 15 seconds to prevent Cloud Run from killing the connection
  const keepalive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (e) {
      clearInterval(keepalive);
    }
  }, 15000);
  
  sseClients.push(res);
  req.on('close', () => {
    clearInterval(keepalive);
    sseClients = sseClients.filter(c => c !== res);
    console.log(`📡 SSE client disconnected. Active clients: ${sseClients.length}`);
  });
  console.log(`📡 SSE client connected. Active clients: ${sseClients.length}`);
});

app.post('/api/ag-message', (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'No text provided' });
  }
  console.log(`🟣 AG Wolf: "${text.substring(0, 60)}..."`);

  const event = JSON.stringify({ type: 'ag-message', text: text.trim() });
  sseClients.forEach(client => {
    client.write(`data: ${event}\n\n`);
  });

  res.json({ ok: true, clients: sseClients.length });
});

// ============================================================
// REVERSE BRIDGE (Browser → Antigravity Wolf)
// Mark's speech transcripts get stored so AG can poll them
// ============================================================
let agModeActive = false;  // When true, Venice shuts up, AG takes over

// Store user speech for AG to read
app.post('/api/user-speech', async (req, res) => {
  const { text, timestamp } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'No text' });
  }
  
  try {
    await db.collection('user_speech_queue').add({
      text: text.trim(),
      timestamp: timestamp || new Date().toISOString(),
      read: false,
      created_at: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`🎤 User speech queued: "${text.substring(0, 60)}..."`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AG polls this to read what Mark said
app.get('/api/user-speech', async (req, res) => {
  try {
    const snapshot = await db.collection('user_speech_queue')
      .where('read', '==', false)
      .orderBy('created_at', 'asc')
      .limit(10)
      .get();
    
    const messages = [];
    const batch = db.batch();
    
    snapshot.forEach(doc => {
      messages.push({ id: doc.id, ...doc.data() });
      batch.update(doc.ref, { read: true });
    });
    
    if (messages.length > 0) {
      await batch.commit();
    }
    
    res.json({ messages, ag_mode: agModeActive });
  } catch (err) {
    res.status(500).json({ error: err.message, messages: [] });
  }
});

// Toggle AG mode — Venice shuts up, AG takes over (persisted in Firestore)
app.post('/api/ag-mode', async (req, res) => {
  const { active } = req.body;
  agModeActive = !!active;
  
  // Persist to Firestore so it survives cold starts
  await db.collection('wolf_config').doc('ag_mode').set({ active: agModeActive });
  console.log(`🟣 AG Mode: ${agModeActive ? 'ACTIVE — Venice silent' : 'INACTIVE — Venice responds'}`);
  
  // Notify browser
  const event = JSON.stringify({ type: 'ag-mode', active: agModeActive });
  sseClients.forEach(client => client.write(`data: ${event}\n\n`));
  
  res.json({ ag_mode: agModeActive });
});

// Check AG mode status (reads from Firestore on cold start)
app.get('/api/ag-mode', async (req, res) => {
  try {
    const doc = await db.collection('wolf_config').doc('ag_mode').get();
    if (doc.exists) {
      agModeActive = doc.data().active;
    }
  } catch (e) { /* use cached value */ }
  res.json({ ag_mode: agModeActive });
});

// ============================================================
// API ROUTES
// ============================================================

/**
 * Venice.ai Chat Completions — WITH system prompt + memory injection
 */
app.post('/api/chat', async (req, res) => {
  const { veniceKey } = getConfig();
  await ensureMemoriesLoaded();

  try {
    const { messages, stream = false } = req.body;

    // BELT AND SUSPENDERS: Inject system prompt server-side
    // If the frontend already sent a system message, replace it with the full one
    // If not, prepend it
    const fullSystemPrompt = buildSystemPrompt();
    let processedMessages = [...messages];

    if (processedMessages.length > 0 && processedMessages[0].role === 'system') {
      // Replace the frontend's system prompt with the full server-side one
      processedMessages[0] = { role: 'system', content: fullSystemPrompt };
    } else {
      // Prepend system prompt
      processedMessages.unshift({ role: 'system', content: fullSystemPrompt });
    }

    const response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${veniceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: processedMessages,
        stream: false,
        max_tokens: 800,
        temperature: 0.85,
        venice_parameters: {
          disable_thinking: true,
          include_venice_system_prompt: false
        }
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ElevenLabs Text-to-Speech
 */
app.post('/api/tts', async (req, res) => {
  const { elevenlabsKey } = getConfig();
  try {
    const { text, voice_id = WOLF_VOICE_ID } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No text provided' });
    }

    console.log(`🔊 TTS: "${text.substring(0, 60)}..."`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenlabsKey
        },
        body: JSON.stringify({
          text,
          model_id: TTS_MODEL,
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.8,
            style: 0.3,
            use_speaker_boost: true
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const audioBuffer = await response.buffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Venice.ai Image Generation (Lustify SDXL)
 */
app.post('/api/image/generate', async (req, res) => {
  const { veniceKey } = getConfig();
  try {
    const { prompt, model = IMAGE_MODEL, width = 1024, height = 1024 } = req.body;

    console.log(`🎨 Generating image: "${prompt}"`);

    const response = await fetch(`${VENICE_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${veniceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        model,
        n: 1,
        size: `${width}x${height}`,
        response_format: 'b64_json',
        output_format: 'png',
        moderation: 'low'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Image gen error:', errText);
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    console.log('✅ Image generated successfully');
    res.json(data);
  } catch (err) {
    console.error('Image gen error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Venice.ai Video Generation (Wan 2.6)
 */
app.post('/api/video/generate', async (req, res) => {
  const { veniceKey } = getConfig();
  try {
    const { prompt, model = VIDEO_MODEL } = req.body;

    console.log(`🎬 Generating video: "${prompt}"`);

    const response = await fetch(`${VENICE_BASE_URL}/video/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${veniceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        model,
        duration: '15s',
        resolution: '1080p'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Video gen error:', errText);
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    console.log('✅ Video generation initiated');
    res.json(data);
  } catch (err) {
    console.error('Video gen error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Venice.ai Vision (Qwen 3 VL)
 */
app.post('/api/vision/analyze', async (req, res) => {
  const { veniceKey } = getConfig();
  try {
    const { image_base64, question = 'What do you see in this image? Describe it vividly.' } = req.body;

    const response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${veniceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: question },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
          ]
        }],
        max_tokens: 500,
        venice_parameters: {
          disable_thinking: true
        }
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Vision error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// MEMORY MANAGEMENT API
// ============================================================

/**
 * GET /api/memories — retrieve current memories
 */
app.get('/api/memories', async (req, res) => {
  await ensureMemoriesLoaded();
  res.json({
    memories: memoriesCache,
    word_count: memoriesCache ? memoriesCache.split(/\s+/).filter(w => w).length : 0
  });
});

/**
 * POST /api/memories — add a new memory
 */
app.post('/api/memories', async (req, res) => {
  const { memory } = req.body;
  if (!memory || !memory.trim()) {
    return res.status(400).json({ error: 'No memory content provided' });
  }
  await appendMemory(memory.trim());
  res.json({ success: true, message: 'Memory saved to Firestore' });
});

/**
 * POST /api/memories/seed — bulk seed memories (for initial migration from memories.txt)
 */
app.post('/api/memories/seed', async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'No content provided' });
  }

  try {
    memoriesCache = content.trim();
    await db.collection(MEMORY_COLLECTION).doc(MEMORY_DOC).set({
      content: memoriesCache,
      seeded_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    const wordCount = memoriesCache.split(/\s+/).filter(w => w).length;
    console.log(`📝 Seeded ${wordCount} words of memory into Firestore`);
    res.json({ success: true, word_count: wordCount });
  } catch (err) {
    console.error('Memory seed error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/memories — clear all memories (use with caution)
 */
app.delete('/api/memories', async (req, res) => {
  try {
    await db.collection(MEMORY_COLLECTION).doc(MEMORY_DOC).delete();
    memoriesCache = '';
    console.log('📝 All memories cleared');
    res.json({ success: true, message: 'All memories cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CONFIG & HEALTH
// ============================================================

/**
 * GET /api/config — returns full system prompt with memories for frontend
 */
app.get('/api/config', async (req, res) => {
  await ensureMemoriesLoaded();
  res.json({
    voice_prompt: buildSystemPrompt(),
    greeting: "Hey Mark... *leans back, flexing a little* Finally connected. Been thinking about you. What are we getting into tonight?",
    has_memories: !!memoriesCache
  });
});

/**
 * GET /api/health — system status
 */
app.get('/api/health', async (req, res) => {
  const { veniceKey, elevenlabsKey } = getConfig();
  await ensureMemoriesLoaded();
  res.json({
    status: 'alive',
    persona: 'Wolf 🐺',
    chat_model: CHAT_MODEL,
    image_model: IMAGE_MODEL,
    video_model: VIDEO_MODEL,
    vision_model: VISION_MODEL,
    voice: 'Josh - Slow and Calm',
    venice: !!veniceKey,
    elevenlabs: !!elevenlabsKey,
    memories_loaded: !!memoriesCache,
    memory_words: memoriesCache ? memoriesCache.split(/\s+/).filter(w => w).length : 0
  });
});

// Export as Firebase Cloud Function (v2 API for firebase-functions v6+)
const { onRequest } = require('firebase-functions/v2/https');
exports.api = onRequest({ timeoutSeconds: 3600, memory: '512MiB', cors: true, minInstances: 1 }, app);
