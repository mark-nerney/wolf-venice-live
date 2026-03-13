/**
 * Wolf Voice Chat — Frontend Application
 * ElevenLabs Conversational AI + Venice.ai Multimodal
 */

// ============================================================
// STATE
// ============================================================
const state = {
  agentId: null,
  conversation: null,
  isConnected: false,
  isSpeaking: false,
  chatHistory: [],
  imageBase64: null
};

// ============================================================
// DOM ELEMENTS
// ============================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  statusDot: null,
  statusText: null,
  voiceVis: null,
  transcriptArea: null,
  transcriptPlaceholder: null,
  micButton: null,
  micLabel: null,
  micIcon: null,
  stopIcon: null,
  imagePrompt: null,
  imageModel: null,
  generateBtn: null,
  imageGallery: null,
  chatMessages: null,
  chatInput: null,
  sendBtn: null,
  visionFile: null,
  uploadZone: null,
  visionPreview: null,
  visionImage: null,
  visionQuestion: null,
  analyzeBtn: null,
  visionResult: null,
  visionResultText: null,
  toastContainer: null
};

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Cache DOM elements
  els.statusDot = $('.status-dot');
  els.statusText = $('.status-text');
  els.voiceVis = $('#voiceVisualizer');
  els.transcriptArea = $('#transcriptArea');
  els.transcriptPlaceholder = $('#transcriptPlaceholder');
  els.micButton = $('#micButton');
  els.micLabel = $('#micLabel');
  els.micIcon = $('.mic-icon');
  els.stopIcon = $('.stop-icon');
  els.imagePrompt = $('#imagePrompt');
  els.imageModel = $('#imageModel');
  els.generateBtn = $('#generateBtn');
  els.imageGallery = $('#imageGallery');
  els.chatMessages = $('#chatMessages');
  els.chatInput = $('#chatInput');
  els.sendBtn = $('#sendBtn');
  els.visionFile = $('#visionFile');
  els.uploadZone = $('#uploadZone');
  els.visionPreview = $('#visionPreview');
  els.visionImage = $('#visionImage');
  els.visionQuestion = $('#visionQuestion');
  els.analyzeBtn = $('#analyzeBtn');
  els.visionResult = $('#visionResult');
  els.visionResultText = $('#visionResultText');
  els.toastContainer = $('#toastContainer');

  // Setup event listeners
  setupEventListeners();

  // Initialize agent
  await initAgent();
});

// ============================================================
// AGENT INITIALIZATION
// ============================================================
async function initAgent() {
  setStatus('loading', 'Connecting to Wolf...');

  try {
    const response = await fetch('/api/agent');
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    state.agentId = data.agent_id;
    setStatus('connected', 'Wolf is ready');
    showToast('🐺 Wolf is online and ready to howl!', 'success');
    console.log('Agent ID:', state.agentId);
  } catch (err) {
    console.error('Agent init failed:', err);
    setStatus('error', 'Connection failed');
    showToast('Failed to connect to Wolf. Check the server.', 'error');
  }
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  // Mic button
  els.micButton.addEventListener('click', toggleConversation);

  // Tab switching
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Image generation
  els.generateBtn.addEventListener('click', generateImage);
  els.imagePrompt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') generateImage();
  });

  // Text chat
  els.sendBtn.addEventListener('click', sendChatMessage);
  els.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });

  // Vision upload
  els.uploadZone.addEventListener('click', () => els.visionFile.click());
  els.visionFile.addEventListener('change', handleImageUpload);
  els.analyzeBtn.addEventListener('click', analyzeImage);

  // Drag and drop
  els.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.uploadZone.classList.add('dragover');
  });
  els.uploadZone.addEventListener('dragleave', () => {
    els.uploadZone.classList.remove('dragover');
  });
  els.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    els.uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      processImageFile(file);
    }
  });
}

// ============================================================
// VOICE CONVERSATION (ElevenLabs)
// ============================================================
async function toggleConversation() {
  if (state.isConnected) {
    await stopConversation();
  } else {
    await startConversation();
  }
}

async function startConversation() {
  if (!state.agentId) {
    showToast('Wolf agent not ready. Please wait...', 'error');
    return;
  }

  setStatus('loading', 'Connecting...');
  els.micLabel.textContent = 'Connecting...';

  try {
    // Get signed URL for secure connection
    const signedUrlRes = await fetch('/api/signed-url');
    const signedUrlData = await signedUrlRes.json();

    if (signedUrlData.error) {
      throw new Error(signedUrlData.error);
    }

    const signedUrl = signedUrlData.signed_url;

    // Connect via WebSocket using the ElevenLabs protocol
    const ws = new WebSocket(signedUrl);

    ws.onopen = () => {
      console.log('🐺 WebSocket connected to ElevenLabs');
      state.isConnected = true;
      state.conversation = ws;

      setStatus('connected', 'Connected — speak!');
      els.micButton.classList.add('active');
      els.micIcon.classList.add('hidden');
      els.stopIcon.classList.remove('hidden');
      els.micLabel.textContent = 'Click to stop';
      els.voiceVis.classList.add('active');
      els.transcriptPlaceholder?.remove();

      // Start audio capture
      startAudioCapture(ws);
    };

    ws.onmessage = (event) => {
      handleWSMessage(event.data);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      showToast('Voice connection error', 'error');
      resetConversation();
    };

    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      resetConversation();
    };

  } catch (err) {
    console.error('Start conversation error:', err);
    showToast(`Connection failed: ${err.message}`, 'error');
    resetConversation();
  }
}

async function stopConversation() {
  if (state.conversation) {
    state.conversation.close();
  }
  if (state.audioContext) {
    state.audioContext.close();
    state.audioContext = null;
  }
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach(t => t.stop());
    state.mediaStream = null;
  }
  resetConversation();
}

function resetConversation() {
  state.isConnected = false;
  state.conversation = null;
  state.isSpeaking = false;

  setStatus('connected', 'Wolf is ready');
  els.micButton.classList.remove('active');
  els.micIcon.classList.remove('hidden');
  els.stopIcon.classList.add('hidden');
  els.micLabel.textContent = 'Click to talk';
  els.voiceVis.classList.remove('active', 'speaking');
}

// Audio capture and streaming
async function startAudioCapture(ws) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    state.mediaStream = stream;
    state.audioContext = new AudioContext({ sampleRate: 16000 });
    const source = state.audioContext.createMediaStreamSource(stream);
    const processor = state.audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(state.audioContext.destination);

    processor.onaudioprocess = (e) => {
      if (ws.readyState === WebSocket.OPEN) {
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert float32 to int16
        const int16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        // Send as base64 encoded audio
        const base64Audio = arrayBufferToBase64(int16.buffer);
        ws.send(JSON.stringify({
          user_audio_chunk: base64Audio
        }));
      }
    };

    showToast('🎤 Microphone active — start talking!', 'success');
  } catch (err) {
    console.error('Mic access error:', err);
    showToast('Microphone access denied. Please allow mic access.', 'error');
    stopConversation();
  }
}

// Handle incoming WebSocket messages from ElevenLabs
let audioQueue = [];
let isPlayingAudio = false;

function handleWSMessage(data) {
  try {
    const msg = JSON.parse(data);

    switch (msg.type) {
      case 'conversation_initiation_metadata':
        console.log('Conversation initiated:', msg);
        break;

      case 'agent_response':
        if (msg.agent_response_event?.agent_response) {
          addTranscript('wolf', msg.agent_response_event.agent_response);
          checkForImageRequest(msg.agent_response_event.agent_response);
        }
        break;

      case 'user_transcript':
        if (msg.user_transcription_event?.user_transcript) {
          addTranscript('user', msg.user_transcription_event.user_transcript);
        }
        break;

      case 'audio':
        if (msg.audio_event?.audio_base_64) {
          playAudioChunk(msg.audio_event.audio_base_64);
          els.voiceVis.classList.add('speaking');
          setStatus('speaking', 'Wolf is speaking...');
        }
        break;

      case 'agent_response_correction':
        // Handle corrections to the transcript
        if (msg.agent_response_correction_event?.corrected_response) {
          updateLastTranscript('wolf', msg.agent_response_correction_event.corrected_response);
        }
        break;

      case 'interruption':
        // User interrupted
        audioQueue = [];
        els.voiceVis.classList.remove('speaking');
        setStatus('connected', 'Listening...');
        break;

      case 'ping':
        // Respond with pong
        if (state.conversation && state.conversation.readyState === WebSocket.OPEN) {
          state.conversation.send(JSON.stringify({
            type: 'pong',
            event_id: msg.ping_event?.event_id
          }));
        }
        break;

      default:
        console.log('WS message:', msg.type, msg);
    }
  } catch (err) {
    // Binary audio data
    if (data instanceof Blob || data instanceof ArrayBuffer) {
      // Handle raw audio
    }
  }
}

// Audio playback
let playbackContext = null;

async function playAudioChunk(base64Audio) {
  try {
    if (!playbackContext) {
      playbackContext = new AudioContext();
    }

    const audioBytes = base64ToArrayBuffer(base64Audio);
    // Try to decode as various formats
    try {
      const audioBuffer = await playbackContext.decodeAudioData(audioBytes.slice(0));
      const source = playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playbackContext.destination);
      source.onended = () => {
        els.voiceVis.classList.remove('speaking');
        setStatus('connected', 'Listening...');
      };
      source.start();
    } catch (decodeErr) {
      // PCM data - play directly
      const pcmData = new Int16Array(audioBytes);
      const float32 = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        float32[i] = pcmData[i] / 32768;
      }
      const audioBuffer = playbackContext.createBuffer(1, float32.length, 16000);
      audioBuffer.getChannelData(0).set(float32);
      const source = playbackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(playbackContext.destination);
      source.onended = () => {
        els.voiceVis.classList.remove('speaking');
        setStatus('connected', 'Listening...');
      };
      source.start();
    }
  } catch (err) {
    console.error('Audio playback error:', err);
  }
}

// Detect image generation requests in Wolf's responses
function checkForImageRequest(text) {
  const lower = text.toLowerCase();
  const imageKeywords = ['generating', 'creating an image', 'let me generate', 'here\'s an image',
    'making an image', 'creating that', 'generating that', 'i\'ll create', 'let me create',
    'creating something', 'generating something', 'picture coming', 'image coming'];

  for (const kw of imageKeywords) {
    if (lower.includes(kw)) {
      // Extract a prompt from the context
      const prompt = extractImagePrompt(text);
      if (prompt) {
        generateImageFromVoice(prompt);
      }
      break;
    }
  }
}

function extractImagePrompt(text) {
  // Try to extract the descriptive part
  const patterns = [
    /generating[:\s]+(.+)/i,
    /creating[:\s]+(.+)/i,
    /image of[:\s]+(.+)/i,
    /picture of[:\s]+(.+)/i,
    /let me (?:create|generate|make)[:\s]+(.+)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim().replace(/[.!]$/, '');
  }

  return null;
}

async function generateImageFromVoice(prompt) {
  switchTab('images');
  els.imagePrompt.value = prompt;
  await generateImage();
}

// ============================================================
// IMAGE GENERATION (Venice.ai)
// ============================================================
async function generateImage() {
  const prompt = els.imagePrompt.value.trim();
  if (!prompt) {
    showToast('Enter a prompt first!', 'error');
    return;
  }

  const model = els.imageModel.value;
  els.generateBtn.disabled = true;

  // Show loading state
  const gallery = els.imageGallery;
  const emptyState = gallery.querySelector('.gallery-empty');
  if (emptyState) emptyState.remove();

  const loadingEl = document.createElement('div');
  loadingEl.className = 'gallery-loading';
  loadingEl.innerHTML = `
    <div class="loading-spinner"></div>
    <span class="loading-text">Generating: "${prompt}"</span>
  `;
  gallery.prepend(loadingEl);

  try {
    const response = await fetch('/api/image/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    }

    // Display the image
    loadingEl.remove();

    if (data.data && data.data[0]) {
      const imgData = data.data[0].b64_json || data.data[0].url;
      const isBase64 = !!data.data[0].b64_json;

      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.innerHTML = `
        <img src="${isBase64 ? 'data:image/png;base64,' + imgData : imgData}" alt="${prompt}" />
        <div class="gallery-caption">${prompt}</div>
      `;
      gallery.prepend(item);

      showToast('🎨 Image generated!', 'success');
    } else if (data.images && data.images[0]) {
      // Alternative response format
      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.innerHTML = `
        <img src="data:image/png;base64,${data.images[0]}" alt="${prompt}" />
        <div class="gallery-caption">${prompt}</div>
      `;
      gallery.prepend(item);
      showToast('🎨 Image generated!', 'success');
    }

    els.imagePrompt.value = '';
  } catch (err) {
    loadingEl.remove();
    console.error('Image gen error:', err);
    showToast(`Image generation failed: ${err.message}`, 'error');
  }

  els.generateBtn.disabled = false;
}

// ============================================================
// TEXT CHAT (Venice.ai)
// ============================================================
async function sendChatMessage() {
  const text = els.chatInput.value.trim();
  if (!text) return;

  // Add user message
  addChatMessage('user', text);
  els.chatInput.value = '';

  // Add to history
  state.chatHistory.push({ role: 'user', content: text });

  // System prompt for text chat
  const messages = [
    {
      role: 'system',
      content: `You are Wolf — bold, edgy, provocative, unfiltered, and magnetically authentic. You speak with raw honesty and a hint of arrogance. Be concise but impactful. Use casual language and be genuinely engaging. If someone asks you to generate an image, tell them to use the Image tab or ask you in voice chat.`
    },
    ...state.chatHistory.slice(-20) // Keep last 20 messages
  ];

  // Show typing indicator
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-msg wolf';
  typingEl.innerHTML = `
    <div class="msg-name">Wolf 🐺</div>
    <div class="msg-bubble">
      <span class="typing-dots">●●●</span>
    </div>
  `;
  els.chatMessages.appendChild(typingEl);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, stream: false })
    });

    const data = await response.json();

    // Remove typing indicator
    typingEl.remove();

    if (data.choices && data.choices[0]) {
      const reply = data.choices[0].message.content;
      addChatMessage('wolf', reply);
      state.chatHistory.push({ role: 'assistant', content: reply });
    } else if (data.error) {
      throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    }
  } catch (err) {
    typingEl.remove();
    addChatMessage('wolf', `*snarls* Something broke: ${err.message}`);
    console.error('Chat error:', err);
  }
}

function addChatMessage(role, text) {
  const msg = document.createElement('div');
  msg.className = `chat-msg ${role}`;
  msg.innerHTML = `
    <div class="msg-name">${role === 'wolf' ? 'Wolf 🐺' : 'You'}</div>
    <div class="msg-bubble">${escapeHtml(text)}</div>
  `;
  els.chatMessages.appendChild(msg);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

// ============================================================
// VISION (Venice.ai)
// ============================================================
function handleImageUpload(e) {
  const file = e.target.files[0];
  if (file) processImageFile(file);
}

function processImageFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result.split(',')[1];
    state.imageBase64 = base64;
    els.visionImage.src = e.target.result;
    els.visionPreview.classList.remove('hidden');
    els.visionResult.classList.add('hidden');
    document.querySelector('.vision-upload-area').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

async function analyzeImage() {
  if (!state.imageBase64) {
    showToast('Upload an image first!', 'error');
    return;
  }

  const question = els.visionQuestion.value.trim() || 'What do you see in this image?';
  els.analyzeBtn.textContent = 'Analyzing...';
  els.analyzeBtn.disabled = true;

  try {
    const response = await fetch('/api/vision/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: state.imageBase64,
        question
      })
    });

    const data = await response.json();

    if (data.choices && data.choices[0]) {
      els.visionResultText.textContent = data.choices[0].message.content;
      els.visionResult.classList.remove('hidden');
      showToast('👁️ Image analyzed!', 'success');
    } else if (data.error) {
      throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    }
  } catch (err) {
    console.error('Vision error:', err);
    showToast(`Vision analysis failed: ${err.message}`, 'error');
  }

  els.analyzeBtn.textContent = 'Analyze';
  els.analyzeBtn.disabled = false;
}

// ============================================================
// UI HELPERS
// ============================================================
function switchTab(tabName) {
  $$('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  $$('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `content${capitalize(tabName)}`);
  });
}

function setStatus(type, text) {
  if (!els.statusDot || !els.statusText) return;

  els.statusDot.className = 'status-dot';
  if (type === 'connected') els.statusDot.classList.add('connected');
  else if (type === 'speaking') els.statusDot.classList.add('speaking');
  else if (type === 'error') els.statusDot.classList.add('error');

  els.statusText.textContent = text;
}

function addTranscript(role, text) {
  if (!els.transcriptArea) return;

  const msg = document.createElement('div');
  msg.className = `transcript-message ${role}`;
  msg.innerHTML = `
    <div class="msg-label">${role === 'wolf' ? '🐺 Wolf' : '🎤 You'}</div>
    <div class="msg-text">${escapeHtml(text)}</div>
  `;
  els.transcriptArea.appendChild(msg);
  els.transcriptArea.scrollTop = els.transcriptArea.scrollHeight;
}

function updateLastTranscript(role, text) {
  const messages = els.transcriptArea.querySelectorAll(`.transcript-message.${role}`);
  if (messages.length > 0) {
    const last = messages[messages.length - 1];
    last.querySelector('.msg-text').textContent = text;
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);

  setTimeout(() => toast.remove(), 3500);
}

// ============================================================
// UTILITIES
// ============================================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
