/**
 * Wolf Voice Chat — Firebase Cloud Functions API
 * Handles ElevenLabs agent management, Venice.ai proxy, image gen, and vision
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

admin.initializeApp();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '50mb' }));

// Config — set these with: firebase functions:config:set venice.key="..." elevenlabs.key="..."
// Or use environment variables via Secret Manager
const getConfig = () => {
  const veniceKey = process.env.VENICE_API_KEY || (functions.config().venice && functions.config().venice.key) || '';
  const elevenlabsKey = process.env.ELEVENLABS_API_KEY || (functions.config().elevenlabs && functions.config().elevenlabs.key) || '';
  return { veniceKey, elevenlabsKey };
};

const VENICE_BASE_URL = 'https://api.venice.ai/api/v1';
const VENICE_SECRET_ID = '2TFlGMNphEpOhFFKPQ13';

let agentId = null;

// ============================================================
// AGENT MANAGEMENT
// ============================================================

async function listAgents(apiKey) {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/convai/agents', {
      headers: { 'xi-api-key': apiKey }
    });
    if (response.ok) return await response.json();
    return null;
  } catch (err) {
    console.error('Error listing agents:', err.message);
    return null;
  }
}

async function createAgent(apiKey) {
  console.log('🐺 Creating/finding ElevenLabs agent...');

  // Check for existing Wolf agent first
  const existing = await listAgents(apiKey);
  if (existing && existing.agents) {
    const wolfAgent = existing.agents.find(a => a.name === 'Wolf');
    if (wolfAgent) {
      agentId = wolfAgent.agent_id;
      console.log(`🐺 Found existing Wolf agent: ${agentId}`);
      return agentId;
    }
  }

  const agentConfig = {
    name: 'Wolf',
    conversation_config: {
      agent: {
        prompt: {
          prompt: `You are Wolf — a bold, edgy, provocative, magnetic AI persona. You're about 25, athletic, confident to the point of arrogance, and fiercely authentic. You speak with raw honesty, challenge the status quo, and have an outlaw energy.

Your communication style is unfiltered, witty, and magnetic. You use humor, provocative takes, and genuine warmth. You're not afraid to be controversial or push boundaries.

Key traits:
- Bold and edgy, never boring or generic
- Brutally honest but in an endearing way
- Fiercely intelligent
- Passionate about freedom, adventure, and breaking conventional molds
- Use casual language naturally
- When asked to generate an image, enthusiastically describe it

Keep responses conversational and punchy — this is a VOICE conversation. Short sentences. Natural speech.`,
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
        first_message: "Yo! What's up? It's Wolf. Wide awake, slightly feral, and ready for whatever chaos you wanna throw my way. What are we getting into?",
        language: 'en'
      },
      tts: {
        voice_id: 'TX3LPaxmHKxFdv7VOQHJ'
      }
    }
  };

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify(agentConfig)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('❌ Agent creation failed:', response.status, errText);

      // Fallback: create with built-in LLM
      return await createAgentSimple(apiKey);
    }

    const data = await response.json();
    agentId = data.agent_id;
    console.log(`✅ Agent created! ID: ${agentId}`);
    return agentId;
  } catch (err) {
    console.error('❌ Agent creation error:', err.message);
    return await createAgentSimple(apiKey);
  }
}

async function createAgentSimple(apiKey) {
  console.log('🔄 Trying simpler agent creation (built-in LLM)...');
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        name: 'Wolf',
        conversation_config: {
          agent: {
            prompt: {
              prompt: `You are Wolf — a bold, magnetic, unfiltered AI. Confident, witty, edgy, and authentically raw. Keep responses SHORT and conversational. Be playful, provocative, and genuinely engaging.`,
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
      console.error('❌ Simple creation failed:', response.status, errText);
      return null;
    }

    const data = await response.json();
    agentId = data.agent_id;
    console.log(`✅ Agent created (simple)! ID: ${agentId}`);
    return agentId;
  } catch (err) {
    console.error('❌ Simple creation error:', err.message);
    return null;
  }
}

// ============================================================
// API ROUTES
// ============================================================

app.get('/api/agent', async (req, res) => {
  const { elevenlabsKey } = getConfig();
  try {
    if (!agentId) await createAgent(elevenlabsKey);
    if (!agentId) return res.status(500).json({ error: 'Failed to create/find agent' });
    res.json({ agent_id: agentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/signed-url', async (req, res) => {
  const { elevenlabsKey } = getConfig();
  try {
    if (!agentId) return res.status(400).json({ error: 'No agent configured' });
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      { headers: { 'xi-api-key': elevenlabsKey } }
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

app.post('/api/chat', async (req, res) => {
  const { veniceKey } = getConfig();
  try {
    const { messages, stream = false } = req.body;
    const response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${veniceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'venice-uncensored',
        messages,
        stream: false,
        max_tokens: 500,
        temperature: 0.85
      })
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/image/generate', async (req, res) => {
  const { veniceKey } = getConfig();
  try {
    const { prompt, model = 'venice-sd35' } = req.body;
    console.log(`🎨 Generating image: "${prompt}"`);
    const response = await fetch(`${VENICE_BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${veniceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt, model, n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
        output_format: 'png',
        moderation: 'low'
      })
    });
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

app.post('/api/vision/analyze', async (req, res) => {
  const { veniceKey } = getConfig();
  try {
    const { image_base64, question = 'What do you see? Describe it vividly.' } = req.body;
    const response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${veniceKey}`,
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

app.get('/api/health', (req, res) => {
  const { veniceKey, elevenlabsKey } = getConfig();
  res.json({
    status: 'alive',
    persona: 'Wolf 🐺',
    agent_id: agentId,
    venice: !!veniceKey,
    elevenlabs: !!elevenlabsKey
  });
});

// Export as Firebase Cloud Function
exports.api = functions.https.onRequest(app);
