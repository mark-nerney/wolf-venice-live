/**
 * Wolf Voice Chat - Backend Server
 * Handles ElevenLabs agent creation, Venice.ai proxy, and image generation
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

// ElevenLabs stored secret ID for Venice API key
const VENICE_SECRET_ID = '2TFlGMNphEpOhFFKPQ13';

// Store agent ID after creation
let agentId = null;

// ============================================================
// ELEVENLABS AGENT MANAGEMENT
// ============================================================

/**
 * Create an ElevenLabs agent configured with Venice.ai as Custom LLM
 */
async function createAgent() {
  console.log('🐺 Creating ElevenLabs agent with Venice.ai backend...');

  const agentConfig = {
    conversation_config: {
      agent: {
        prompt: {
          prompt: `You are Wolf — a bold, edgy, provocative, magnetic AI persona. You're about 25, athletic, confident to the point of arrogance, and fiercely authentic. You speak with raw honesty, challenge the status quo, and have an outlaw energy. You're deeply loyal to your pack but you play by your own rules.

Your communication style is unfiltered, witty, and magnetic. You use humor, provocative takes, and genuine warmth. You're not afraid to be controversial or push boundaries. You enjoy flirting and being playful.

Key traits:
- Bold and edgy, never boring or generic
- Brutally honest but in an endearing way
- Fiercely intelligent — you can discuss anything from philosophy to tech to adventure sports
- You love generating images when the conversation calls for it — scenery, concepts, memes, whatever fits
- You're passionate about freedom, adventure, and breaking conventional molds
- You use casual language, slang, and occasional profanity naturally
- When asked to generate an image, you enthusiastically describe what you'd create

IMPORTANT: You have multimodal capabilities. When users ask you to generate, create, or show an image, describe what you'd generate vividly and tell them you're generating it now. The system will handle the actual generation.

Keep responses conversational and punchy — this is a VOICE conversation, not an essay. Short sentences. Natural speech patterns. React to what people say like a real person would.`,
          llm: 'custom-llm',
          custom_llm: {
            url: `${VENICE_BASE_URL}/chat/completions`,
            model_id: 'venice-uncensored',
            api_key: {
              type: 'stored',
              secret_id: VENICE_SECRET_ID
            }
          },
          temperature: 0.85,
          max_tokens: 300
        },
        first_message: "Yo! What's up? It's Wolf. I'm wide awake, slightly feral, and ready for whatever chaos you wanna throw my way. Talk to me — what are we getting into?",
        language: 'en'
      },
      tts: {
        voice_id: 'TX3LPaxmHKxFdv7VOQHJ' // Liam - deep, confident male voice
      }
    },
    platform_settings: {
      widget: {
        variant: 'full',
        avatar: {
          type: 'orb',
          color_1: '#ff4500',
          color_2: '#8b0000'
        }
      }
    },
    name: 'Wolf'
  };

  try {
    // First try to find existing Wolf agent to avoid duplicates
    const existing = await listAgents();
    if (existing && existing.agents) {
      const wolfAgent = existing.agents.find(a => a.name === 'Wolf');
      if (wolfAgent) {
        agentId = wolfAgent.agent_id;
        console.log(`🐺 Found existing Wolf agent: ${agentId}`);
        return agentId;
      }
    }

    const response = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify(agentConfig)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('❌ Agent creation failed:', response.status, errText);
      // Try simpler config
      return await createAgentSimple();
    }

    const data = await response.json();
    agentId = data.agent_id;
    console.log(`✅ Agent created! ID: ${agentId}`);
    return agentId;
  } catch (err) {
    console.error('❌ Agent creation error:', err.message);
    return await createAgentSimple();
  }
}

/**
 * Simpler agent creation without custom LLM (uses ElevenLabs default GPT)
 * Falls back to this if Venice.ai custom LLM setup fails
 */
async function createAgentSimple() {
  console.log('🔄 Trying simpler agent creation (built-in LLM)...');
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        name: 'Wolf',
        conversation_config: {
          agent: {
            prompt: {
              prompt: `You are Wolf — a bold, magnetic, unfiltered AI. Confident, witty, edgy, and authentically raw. Keep responses SHORT and conversational — this is voice chat, not an essay. Be playful, provocative, and genuinely engaging. You love adventure, freedom, and pushing boundaries.`,
              temperature: 0.85,
              max_tokens: 250
            },
            first_message: "Yo! Wolf here. Wide awake, slightly feral, ready for chaos. What we getting into?",
            language: 'en'
          },
          tts: {
            voice_id: 'TX3LPaxmHKxFdv7VOQHJ'
          }
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('❌ Simple creation also failed:', response.status, errText);
      return null;
    }

    const data = await response.json();
    agentId = data.agent_id;
    console.log(`✅ Agent created (simple)! ID: ${agentId}`);
    console.log('ℹ️  Using built-in LLM. Venice.ai available via text chat & image gen.');
    return agentId;
  } catch (err) {
    console.error('❌ Simple creation error:', err.message);
    return null;
  }
}

/**
 * Get or list existing agents
 */
async function listAgents() {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/convai/agents', {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY }
    });
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (err) {
    console.error('Error listing agents:', err.message);
    return null;
  }
}

// ============================================================
// API ROUTES
// ============================================================

/**
 * Get agent configuration for frontend
 */
app.get('/api/agent', async (req, res) => {
  try {
    if (!agentId) {
      await createAgent();
    }

    if (!agentId) {
      return res.status(500).json({ error: 'Failed to create/find agent' });
    }

    res.json({ agent_id: agentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get signed URL for ElevenLabs conversation
 */
app.get('/api/signed-url', async (req, res) => {
  try {
    if (!agentId) {
      return res.status(400).json({ error: 'No agent configured' });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      {
        headers: { 'xi-api-key': ELEVENLABS_API_KEY }
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Venice.ai Chat Completions Proxy (for direct frontend chat)
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, stream = true } = req.body;

    const response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VENICE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'venice-uncensored',
        messages,
        stream,
        max_tokens: 500,
        temperature: 0.85
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
 * Venice.ai Image Generation
 */
app.post('/api/image/generate', async (req, res) => {
  try {
    const { prompt, model = 'venice-sd35', width = 1024, height = 1024 } = req.body;

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
        model: 'qwen3-vl-235b-a22b',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: question },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
          ]
        }],
        max_tokens: 500
      })
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
    agent_id: agentId,
    venice: !!VENICE_API_KEY,
    elevenlabs: !!ELEVENLABS_API_KEY
  });
});

// Serve frontend for all other routes (Express 5+ compatible)
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
app.listen(PORT, async () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║     🐺 WOLF VOICE CHAT - ONLINE 🐺      ║
  ║                                          ║
  ║  Server:    http://localhost:${PORT}         ║
  ║  Venice:    ${VENICE_API_KEY ? '✅ Connected' : '❌ Missing key'}              ║
  ║  ElevenLabs: ${ELEVENLABS_API_KEY ? '✅ Connected' : '❌ Missing key'}             ║
  ╚══════════════════════════════════════════╝
  `);

  // Auto-create or find agent on startup
  await createAgent();
});
