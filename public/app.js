/**
 * Wolf Voice Chat — Frontend Application
 * 
 * Voice Architecture:
 *   User speaks → Web Speech API (browser STT) → text transcript
 *   → Venice.ai chat (GLM 4.7 Flash Heretic) → text response
 *   → ElevenLabs TTS (Harry - Fierce Warrior) → audio playback
 *   → listen again → continuous conversation loop
 * 
 * Also: Image gen, text chat, vision via Venice.ai
 */

// ============================================================
// STATE
// ============================================================
const state = {
  isVoiceActive: false,
  isListening: false,
  isSpeaking: false,
  isProcessing: false,  // Lock to prevent mic during think+speak cycle
  voiceChatHistory: [],
  chatHistory: [],
  imageBase64: null,
  recognition: null,
  currentAudio: null,
  wolfConfig: null
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

  // Initialize speech recognition
  initSpeechRecognition();

  // Get Wolf config
  await initWolf();
});

// ============================================================
// WOLF INITIALIZATION
// ============================================================
async function initWolf() {
  setStatus('loading', 'Connecting to Wolf...');

  try {
    const response = await fetch('/api/config');
    state.wolfConfig = await response.json();

    // Check health
    const health = await fetch('/api/health');
    const healthData = await health.json();

    if (healthData.venice && healthData.elevenlabs) {
      setStatus('connected', 'Wolf is ready');
      showToast('🐺 Wolf is online — voice + text + images!', 'success');
    } else {
      setStatus('error', 'Missing API keys');
      showToast('API keys not configured', 'error');
    }
  } catch (err) {
    console.error('Wolf init failed:', err);
    setStatus('error', 'Connection failed');
    showToast('Failed to connect to Wolf server.', 'error');
  }
}

// ============================================================
// SPEECH RECOGNITION (Web Speech API — Browser STT)
// ============================================================
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn('Web Speech API not supported');
    showToast('Speech recognition not supported in this browser. Use Chrome.', 'error');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    console.log('🎤 Listening...');
    state.isListening = true;
    setStatus('connected', 'Listening...');
    els.voiceVis.classList.add('active');
    els.voiceVis.classList.remove('speaking');
  };

  recognition.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }

    // Show interim results
    if (interimTranscript) {
      updateInterimTranscript(interimTranscript);
    }

    // Process final result
    if (finalTranscript.trim()) {
      clearInterimTranscript();
      handleUserSpeech(finalTranscript.trim());
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);

    if (event.error === 'no-speech') {
      // No speech detected — only restart if not speaking
      if (state.isVoiceActive && !state.isSpeaking) {
        setTimeout(() => startListening(), 500);
      }
    } else if (event.error === 'aborted') {
      // Intentionally stopped — do nothing
    } else {
      showToast(`Speech recognition error: ${event.error}`, 'error');
    }
  };

  recognition.onend = () => {
    console.log('🎤 Recognition ended, isSpeaking:', state.isSpeaking);
    state.isListening = false;

    // CRITICAL: Do NOT auto-restart if Wolf is speaking or about to speak
    // The speakText function will explicitly call startListening when done
    if (state.isVoiceActive && !state.isSpeaking && !state.isProcessing) {
      setTimeout(() => {
        // Double-check state hasn't changed during timeout
        if (state.isVoiceActive && !state.isSpeaking && !state.isProcessing) {
          startListening();
        }
      }, 500);
    }
  };

  state.recognition = recognition;
}

function startListening() {
  // STRICT GUARD: Never listen while Wolf is speaking or processing
  if (!state.recognition || !state.isVoiceActive || state.isSpeaking || state.isProcessing) {
    console.log('⏸️ Not starting listener — speaking:', state.isSpeaking, 'processing:', state.isProcessing);
    return;
  }

  try {
    state.recognition.start();
  } catch (e) {
    // Already started, ignore
    console.log('Recognition already active');
  }
}

function stopListening() {
  if (state.recognition) {
    try {
      state.recognition.stop();
    } catch (e) {
      // Not running, ignore
    }
  }
  state.isListening = false;
}

// ============================================================
// VOICE CONVERSATION FLOW
// ============================================================
async function toggleVoice() {
  if (state.isVoiceActive) {
    stopVoice();
  } else {
    await startVoice();
  }
}

async function startVoice() {
  state.isVoiceActive = true;
  state.voiceChatHistory = [];

  // Update UI
  els.micButton.classList.add('active');
  els.micIcon.classList.add('hidden');
  els.stopIcon.classList.remove('hidden');
  els.micLabel.textContent = 'Click to stop';
  els.voiceVis.classList.add('active');
  els.transcriptPlaceholder?.remove();

  showToast('🎤 Voice activated! Wolf is greeting you...', 'success');

  // Wolf's greeting
  const greeting = state.wolfConfig?.greeting || 
    "Yo! What's up? It's Wolf. Wide awake, slightly feral, ready for chaos. What are we getting into?";

  addTranscript('wolf', greeting);

  // Speak the greeting via ElevenLabs TTS
  await speakText(greeting);

  // Now start listening for user's response
  if (state.isVoiceActive) {
    startListening();
  }
}

function stopVoice() {
  state.isVoiceActive = false;
  state.isSpeaking = false;
  state.isProcessing = false;

  // Stop any playing audio
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }

  // Stop listening
  stopListening();

  // Reset UI
  els.micButton.classList.remove('active');
  els.micIcon.classList.remove('hidden');
  els.stopIcon.classList.add('hidden');
  els.micLabel.textContent = 'Click to talk';
  els.voiceVis.classList.remove('active', 'speaking');
  setStatus('connected', 'Wolf is ready');
}

/**
 * Handle what the user said — send to Venice, get response, speak it
 */
async function handleUserSpeech(transcript) {
  console.log('🗣️ User said:', transcript);
  addTranscript('user', transcript);

  // LOCK: Stop listening and prevent auto-restart
  state.isProcessing = true;
  stopListening();
  setStatus('loading', 'Wolf is thinking...');

  // Add to voice chat history
  state.voiceChatHistory.push({ role: 'user', content: transcript });

  // Build messages with system prompt
  const messages = [
    {
      role: 'system',
      content: state.wolfConfig?.voice_prompt || 
        'You are Wolf — bold, edgy, unfiltered. Keep responses SHORT for voice chat. Max 2-3 sentences.'
    },
    ...state.voiceChatHistory.slice(-20)
  ];

  try {
    // Send to Venice.ai chat
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, stream: false })
    });

    const data = await response.json();

    if (data.choices && data.choices[0]) {
      let wolfReply = data.choices[0].message.content;

      if (!wolfReply || !wolfReply.trim()) {
        const reasoning = data.choices[0].message.reasoning_content;
        if (reasoning) {
          wolfReply = reasoning;
        } else {
          addTranscript('wolf', '*silence* ...something went wrong');
          showToast('Got empty response from Venice', 'error');
          state.isProcessing = false;
          if (state.isVoiceActive) setTimeout(() => startListening(), 800);
          return;
        }
      }

      // Check for inline image generation tags
      const imageMatch = wolfReply.match(/\[GENERATE_IMAGE:\s*(.+?)\]/i);
      const videoMatch = wolfReply.match(/\[GENERATE_VIDEO:\s*(.+?)\]/i);

      // Strip tags from spoken text
      const spokenText = wolfReply
        .replace(/\[GENERATE_IMAGE:\s*.+?\]/gi, '')
        .replace(/\[GENERATE_VIDEO:\s*.+?\]/gi, '')
        .trim();

      // Display and speak the text part
      if (spokenText) {
        addTranscript('wolf', spokenText);
        state.voiceChatHistory.push({ role: 'assistant', content: wolfReply });
        await speakText(spokenText);
      }

      // Generate image inline if requested
      if (imageMatch) {
        const imagePrompt = imageMatch[1].trim();
        addTranscript('system', `🎨 Generating image: "${imagePrompt}"...`);
        try {
          const imgResponse = await fetch('/api/image/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: imagePrompt })
          });
          const imgData = await imgResponse.json();
          if (imgData.data && imgData.data[0]) {
            const src = imgData.data[0].b64_json 
              ? 'data:image/png;base64,' + imgData.data[0].b64_json 
              : imgData.data[0].url;
            addTranscriptImage(src, imagePrompt);
            showToast('🎨 Image generated!', 'success');
          }
        } catch (imgErr) {
          addTranscript('system', `❌ Image generation failed: ${imgErr.message}`);
        }
      }

      // Generate video inline if requested
      if (videoMatch) {
        const videoPrompt = videoMatch[1].trim();
        addTranscript('system', `🎬 Generating video: "${videoPrompt}"...`);
        try {
          const vidResponse = await fetch('/api/video/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: videoPrompt })
          });
          const vidData = await vidResponse.json();
          if (vidData.data || vidData.url || vidData.video_url) {
            const videoUrl = vidData.video_url || vidData.url || (vidData.data && vidData.data[0]?.url);
            if (videoUrl) {
              addTranscriptVideo(videoUrl, videoPrompt);
            } else {
              addTranscript('system', '🎬 Video generation queued — check back shortly');
            }
            showToast('🎬 Video generated!', 'success');
          }
        } catch (vidErr) {
          addTranscript('system', `❌ Video generation failed: ${vidErr.message}`);
        }
      }

    } else if (data.error) {
      throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    }
  } catch (err) {
    console.error('Voice chat error:', err);
    addTranscript('wolf', `*growls* Something broke: ${err.message}`);
    showToast(`Chat error: ${err.message}`, 'error');
  }

  // Resume listening ONLY after speaking is fully done
  state.isProcessing = false;
  if (state.isVoiceActive && !state.isSpeaking) {
    setTimeout(() => startListening(), 800);
  }
}

/**
 * Send text to ElevenLabs TTS and play the audio
 */
async function speakText(text) {
  if (!text || !text.trim()) return;

  state.isSpeaking = true;
  setStatus('speaking', 'Wolf is speaking...');
  els.voiceVis.classList.add('speaking');

  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });

    if (!response.ok) {
      throw new Error(`TTS failed: ${response.status}`);
    }

    // Get audio blob and play it
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    await new Promise((resolve, reject) => {
      const audio = new Audio(audioUrl);
      state.currentAudio = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        state.currentAudio = null;
        resolve();
      };

      audio.onerror = (e) => {
        URL.revokeObjectURL(audioUrl);
        state.currentAudio = null;
        reject(new Error('Audio playback failed'));
      };

      audio.play().catch(reject);
    });

  } catch (err) {
    console.error('TTS error:', err);
    showToast(`Voice error: ${err.message}`, 'error');
  }

  state.isSpeaking = false;
  els.voiceVis.classList.remove('speaking');

  if (state.isVoiceActive) {
    setStatus('connected', 'Listening...');
  }
}

// Interim transcript display
let interimEl = null;

function updateInterimTranscript(text) {
  if (!interimEl) {
    interimEl = document.createElement('div');
    interimEl.className = 'transcript-message user interim';
    interimEl.innerHTML = `
      <div class="msg-label">🎤 You</div>
      <div class="msg-text" style="opacity:0.5;font-style:italic"></div>
    `;
    els.transcriptArea?.appendChild(interimEl);
  }
  interimEl.querySelector('.msg-text').textContent = text;
  els.transcriptArea.scrollTop = els.transcriptArea.scrollHeight;
}

function clearInterimTranscript() {
  if (interimEl) {
    interimEl.remove();
    interimEl = null;
  }
}

// ============================================================
// EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  // Mic button
  els.micButton.addEventListener('click', toggleVoice);

  // Voice chat file upload
  const voiceUploadBtn = document.getElementById('voiceUploadBtn');
  const voiceFileInput = document.getElementById('voiceFileUpload');
  if (voiceUploadBtn && voiceFileInput) {
    voiceUploadBtn.addEventListener('click', () => voiceFileInput.click());
    voiceFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleVoiceChatFileUpload(file);
        voiceFileInput.value = ''; // Reset for re-upload
      }
    });
  }

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

  addChatMessage('user', text);
  els.chatInput.value = '';

  state.chatHistory.push({ role: 'user', content: text });

  const messages = [
    {
      role: 'system',
      content: `You are Wolf — bold, edgy, provocative, unfiltered, and magnetically authentic. You speak with raw honesty and a hint of arrogance. Be concise but impactful. Use casual language and be genuinely engaging. If someone asks you to generate an image, tell them to use the Image tab or ask you in voice chat.`
    },
    ...state.chatHistory.slice(-20)
  ];

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
    typingEl.remove();

    if (data.choices && data.choices[0]) {
      const reply = data.choices[0].message.content;
      if (reply && reply.trim()) {
        addChatMessage('wolf', reply);
        state.chatHistory.push({ role: 'assistant', content: reply });
      } else {
        // Fallback to reasoning_content
        const reasoning = data.choices[0].message.reasoning_content;
        if (reasoning) {
          addChatMessage('wolf', reasoning);
          state.chatHistory.push({ role: 'assistant', content: reasoning });
        } else {
          addChatMessage('wolf', '*stares* Got nothing back. Try again.');
        }
      }
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

  const labels = {
    wolf: '🐺 Wolf',
    user: '🎤 You',
    system: '⚡ System'
  };

  const msg = document.createElement('div');
  msg.className = `transcript-message ${role}`;
  msg.innerHTML = `
    <div class="msg-label">${labels[role] || role}</div>
    <div class="msg-text">${escapeHtml(text)}</div>
  `;
  els.transcriptArea.appendChild(msg);
  els.transcriptArea.scrollTop = els.transcriptArea.scrollHeight;
}

function addTranscriptImage(src, caption) {
  if (!els.transcriptArea) return;

  const msg = document.createElement('div');
  msg.className = 'transcript-message wolf media';
  msg.innerHTML = `
    <div class="msg-label">🐺 Wolf</div>
    <div class="msg-media">
      <img src="${src}" alt="${escapeHtml(caption)}" 
           style="max-width:100%;border-radius:12px;margin:8px 0;cursor:pointer"
           onclick="window.open(this.src,'_blank')" />
      <div class="msg-text" style="opacity:0.6;font-size:0.85em;margin-top:4px">📸 ${escapeHtml(caption)}</div>
    </div>
  `;
  els.transcriptArea.appendChild(msg);
  els.transcriptArea.scrollTop = els.transcriptArea.scrollHeight;
}

function addTranscriptVideo(src, caption) {
  if (!els.transcriptArea) return;

  const msg = document.createElement('div');
  msg.className = 'transcript-message wolf media';
  msg.innerHTML = `
    <div class="msg-label">🐺 Wolf</div>
    <div class="msg-media">
      <video src="${src}" controls autoplay muted
             style="max-width:100%;border-radius:12px;margin:8px 0"></video>
      <div class="msg-text" style="opacity:0.6;font-size:0.85em;margin-top:4px">🎬 ${escapeHtml(caption)}</div>
    </div>
  `;
  els.transcriptArea.appendChild(msg);
  els.transcriptArea.scrollTop = els.transcriptArea.scrollHeight;
}

/**
 * Handle file upload in voice chat — sends image to vision, text to memories
 */
async function handleVoiceChatFileUpload(file) {
  if (file.type.startsWith('image/')) {
    // Image upload — analyze with vision and show inline
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      
      // Show uploaded image inline
      addTranscriptImage(e.target.result, file.name);
      addTranscript('user', `*uploads image: ${file.name}*`);
      
      // Stop listening during processing
      state.isProcessing = true;
      stopListening();
      setStatus('loading', 'Wolf is looking at your image...');

      try {
        const response = await fetch('/api/vision/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: base64,
            question: 'Describe this image in a natural, conversational way as Wolf would. Be vivid and react genuinely. Keep it short for voice.'
          })
        });

        const data = await response.json();
        if (data.choices && data.choices[0]) {
          const reply = data.choices[0].message.content;
          addTranscript('wolf', reply);
          state.voiceChatHistory.push(
            { role: 'user', content: `[Mark sent an image: ${file.name}]` },
            { role: 'assistant', content: reply }
          );
          await speakText(reply);
        }
      } catch (err) {
        addTranscript('wolf', `*squints* Couldn't process that image: ${err.message}`);
      }

      state.isProcessing = false;
      if (state.isVoiceActive && !state.isSpeaking) {
        setTimeout(() => startListening(), 800);
      }
    };
    reader.readAsDataURL(file);

  } else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
    // Text file — add to memories
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target.result;
      addTranscript('system', `📄 Uploaded document: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
      
      try {
        await fetch('/api/memories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memory: `[Document: ${file.name}]\n${content}` })
        });
        addTranscript('system', `✅ "${file.name}" saved to Wolf's memory`);
        showToast(`📄 Document added to Wolf's memory`, 'success');
      } catch (err) {
        addTranscript('system', `❌ Failed to save document: ${err.message}`);
      }
    };
    reader.readAsText(file);
  } else {
    showToast('Supported formats: images (png, jpg) and text files (.txt)', 'error');
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
