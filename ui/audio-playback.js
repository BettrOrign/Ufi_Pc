import { state } from './state.js';

function processAudioQueue() {
  if (state.isPlaying || state.audioQueue.length === 0) return;
  state.isPlaying = true;
  const totalLength = state.audioQueue.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of state.audioQueue) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  state.audioQueue = [];
  if (!state.outputAudioContext) {
    state.outputAudioContext = new AudioContext();
  }
  const audioBuffer = state.outputAudioContext.createBuffer(1, combined.length, 24000);
  audioBuffer.getChannelData(0).set(combined);
  const source = state.outputAudioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.playbackRate.value = 1.0;
  source.connect(state.outputAudioContext.destination);
  source.start();
  source.onended = () => {
    state.isPlaying = false;
    if (state.audioQueue.length > 0) processAudioQueue();
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
    processAudioQueue();
  } catch (err) {
    console.error('[Audio] Decode error:', err);
  }
}
