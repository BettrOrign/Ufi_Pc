import { state } from '../backend/state.js';

const MAX_QUEUE = 200;
const MAX_CHUNKS_PER_BATCH = 50;

function processAudioQueue() {
  if (state.isPlaying || state.audioQueue.length === 0) return;

  // Fix 1: Resume suspended AudioContext (Chrome suspends after inactivity)
  if (!state.outputAudioContext) {
    state.outputAudioContext = new AudioContext();
  }
  if (state.outputAudioContext.state === 'suspended') {
    state.outputAudioContext.resume();
  }

  state.isPlaying = true;

  // Fix 2: Process in batches to prevent memory spikes
  const chunksToPlay = state.audioQueue.splice(0, MAX_CHUNKS_PER_BATCH);
  const totalLength = chunksToPlay.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunksToPlay) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  const audioBuffer = state.outputAudioContext.createBuffer(1, combined.length, 24000);
  audioBuffer.getChannelData(0).set(combined);
  const source = state.outputAudioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(state.outputAudioContext.destination);

  // Fix 3: Keep reference to prevent GC from collecting the node mid-playback
  state.currentSource = source;

  source.start();
  source.onended = () => {
    state.currentSource = null;
    state.isPlaying = false;
    if (state.audioQueue.length > 0) processAudioQueue();
  };

  source.onerror = () => {
    state.currentSource = null;
    state.isPlaying = false;
    console.error('[Audio] Source error');
  };
}

export function playAudio(base64Data) {
  try {
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) { bytes[i] = binaryStr.charCodeAt(i); }
    const pcm16 = new Int16Array(bytes.buffer);
    const floatData = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) { floatData[i] = pcm16[i] / 32768; }
    state.audioQueue.push(floatData);

    // Fix 4: Cap queue to prevent unbounded growth
    if (state.audioQueue.length > MAX_QUEUE) {
      const excess = state.audioQueue.length - MAX_QUEUE;
      state.audioQueue.splice(0, excess);
    }

    processAudioQueue();
  } catch (err) {
    console.error('[Audio] Decode error:', err);
  }
}

export function stopAudioPlayback() {
  // Fix 5: Clean up playback when user stops listening
  if (state.currentSource) {
    try { state.currentSource.stop(); } catch (e) { /* already stopped */ }
    state.currentSource.disconnect();
    state.currentSource = null;
  }
  state.audioQueue = [];
  state.isPlaying = false;
  if (state.outputAudioContext && state.outputAudioContext.state !== 'closed') {
    state.outputAudioContext.suspend().catch(() => {});
  }
}
