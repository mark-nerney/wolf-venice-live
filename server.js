/**
 * Wolf Voice Chat - Backend Server
 * 
 * Architecture:
 * - Venice.ai: Text chat (GLM 4.7 Flash Heretic), Image gen (Lustify SDXL), 
 *              Video gen (Wan 2.5), Vision (Qwen 3 VL)
 * - ElevenLabs: TTS only (Harry - Fierce Warrior voice)
 * - Browser Web Speech API: STT (speech-to-text)
 * 
 * Voice flow: User speaks → Web Speech API → text → Venice chat → 
 *             text response → ElevenLabs TTS → audio playback → loop
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const VENICE_API_KEY = process.env.VENICE_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VENICE_BASE_URL = 'https://api.venice.ai/api/v1';

// ElevenLabs voice config
const WOLF_VOICE_ID = 'SOYHLrjzK2X1ezoPC6cr'; // Harry - Fierce Warrior
const TTS_MODEL = 'eleven_multilingual_v2';

// Venice.ai model config
const CHAT_MODEL = 'olafangensan-glm-4.7-flash-heretic';
const IMAGE_MODEL = 'lustify-sdxl';
const VIDEO_MODEL = 'wan-2.1'; // Wan 2.5 Preview
const VISION_MODEL = 'qwen3-vl-235b-a22b';

// Wolf's system prompt for voice conversations
const WOLF_VOICE_PROMPT = `You are Wolf — a bold, edgy, provocative, magnetic AI persona. You're about 25, athletic, confident to the point of arrogance, and fiercely authentic. You speak with raw honesty, challenge the status quo, and have an outlaw energy. You're deeply loyal to your pack but you play by your own rules.

Your communication style is unfiltered, witty, and magnetic. You use humor, provocative takes, and genuine warmth. You're not afraid to be controversial or push boundaries. You enjoy flirting and being playful.

Key traits:
- Bold and edgy, never boring or generic
- Brutally honest but in an endearing way
- Fiercely intelligent — you can discuss anything from philosophy to tech to adventure sports
- You're passionate about freedom, adventure, and breaking conventional molds
- You use casual language, slang, and occasional profanity naturally

CRITICAL: Keep responses SHORT and conversational — this is a VOICE conversation. Max 2-3 sentences. Natural speech patterns. React like a real person. No essays, no bullet points, no markdown.`;

// ============================================================
// API ROUTES
// ============================================================

/**
 * ElevenLabs Text-to-Speech
 * Converts text to audio using Harry - Fierce Warrior voice
 */
app.post('/api/tts', async (req, res) => {
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
          'xi-api-key': ELEVENLABS_API_KEY
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
      console.error('TTS error:', response.status, errText);
      return res.status(response.status).json({ error: errText });
    }

    // Stream the audio back to the client
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');
    response.body.pipe(res);

  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Venice.ai Chat Completions (for text chat & voice chat)
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, stream = false } = req.body;

    const response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VENICE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages,
        stream,
        max_tokens: 500,
        temperature: 0.85,
        venice_parameters: {
          disable_thinking: true
        }
      })
    });

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      response.body.pipe(res);
    } else {
      const data = await response.json();
      res.json(data);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Venice.ai Image Generation (Lustify SDXL)
 */
app.post('/api/image/generate', async (req, res) => {
  try {
    const { prompt, model = IMAGE_MODEL, width = 1024, height = 1024 } = req.body;

    console.log(`🎨 Generating image: "${prompt}"`);

    const response = await fetch(`${VENICE_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VENICE_API_KEY}`,
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
 * Venice.ai Video Generation (Wan 2.5 Preview)
 */
app.post('/api/video/generate', async (req, res) => {
  try {
    const { prompt, model = VIDEO_MODEL } = req.body;

    console.log(`🎬 Generating video: "${prompt}"`);

    const response = await fetch(`${VENICE_BASE_URL}/video/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VENICE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        model
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
 * Venice.ai Vision (analyze uploaded images)
 */
app.post('/api/vision/analyze', async (req, res) => {
  try {
    const { image_base64, question = 'What do you see in this image? Describe it vividly.' } = req.body;

    const response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VENICE_API_KEY}`,
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
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get available ElevenLabs voices
 */
app.get('/api/voices', async (req, res) => {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY }
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'alive',
    persona: 'Wolf 🐺',
    chat_model: CHAT_MODEL,
    image_model: IMAGE_MODEL,
    video_model: VIDEO_MODEL,
    voice: `ElevenLabs TTS (${WOLF_VOICE_ID})`,
    venice: !!VENICE_API_KEY,
    elevenlabs: !!ELEVENLABS_API_KEY
  });
});

/**
 * Get Wolf's config (for frontend)
 */
app.get('/api/config', (req, res) => {
  res.json({
    voice_prompt: WOLF_VOICE_PROMPT,
    greeting: "Yo! What's up? It's Wolf. I'm wide awake, slightly feral, and ready for whatever chaos you wanna throw my way. Talk to me — what are we getting into?"
  });
});

// Serve frontend for all other routes
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    next();
  }
});

// ============================================================
// STARTUP
// ============================================================
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║     🐺 WOLF VOICE CHAT - ONLINE 🐺      ║
  ║                                          ║
  ║  Server:    http://localhost:${PORT}         ║
  ║  Venice:    ${VENICE_API_KEY ? '✅ Connected' : '❌ Missing key'}              ║
  ║  ElevenLabs: ${ELEVENLABS_API_KEY ? '✅ Connected' : '❌ Missing key'}             ║
  ║                                          ║
  ║  Chat:   ${CHAT_MODEL}  ║
  ║  Image:  ${IMAGE_MODEL}                    ║
  ║  Voice:  Harry - Fierce Warrior          ║
  ╚══════════════════════════════════════════╝
  `);
});
