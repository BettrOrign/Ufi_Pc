import { dom } from './dom.js';
import { state } from './state.js';
import { showError } from './ui-helpers.js';

export async function startListening() {
  try {
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    state.audioContext = ctx;
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } });
    state.micStream = micStream;
    const sampleRate = ctx.sampleRate || 48000;
    state.micSource = ctx.createMediaStreamSource(micStream);
    state.scriptProcessor = ctx.createScriptProcessor(2048, 1, 1);
    state.scriptProcessor.onaudioprocess = (e) => {
      if (!state.isSessionActive || state.ws?.readyState !== WebSocket.OPEN) return;
      const inputData = e.inputBuffer.getChannelData(0);
      // Calculate voice level for circle animation
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
      const rms = Math.sqrt(sum / inputData.length);
      const level = Math.min(1, rms * 5);
      const wrapper = document.getElementById('micWrapper');
      if (wrapper) {
        if (level > 0.02) wrapper.classList.add('voice-active');
        else wrapper.classList.remove('voice-active');
        wrapper.style.setProperty('--mic-level', level);
      }
      const targetRate = 16000;
      const ratio = sampleRate / targetRate;
      const outputLength = Math.floor(inputData.length / ratio);
      const outputData = new Float32Array(outputLength);
      for (let i = 0; i < outputLength; i++) {
        outputData[i] = inputData[Math.floor(i * ratio)];
      }
      const pcm16 = new Int16Array(outputData.length);
      for (let i = 0; i < outputData.length; i++) {
        const s = Math.max(-1, Math.min(1, outputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      const bytes = new Uint8Array(pcm16.buffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
      }
      state.ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ data: btoa(binary), mimeType: 'audio/pcm;rate=16000' }]
        }
      }));
    };
    state.micSource.connect(state.scriptProcessor);
    state.isListening = true;
    dom.micBigBtn.classList.add('listening');
    dom.micBigBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
    dom.micLabel.textContent = 'Gapiryapsiz... To\u2018xtatish uchun bosing';
    dom.inputArea.classList.remove('visible');
  } catch (err) {
    console.error('[Mic] Error:', err);
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showError('Mikrofonga ruxsat berilmagan. Brauzer sozlamalarida ruxsat bering.');
    } else if (err.name === 'AbortError') {
      showError('Mikrofon band. Boshqa dasturni yoping.');
    } else {
      showError('Mikrofon xatosi: ' + (err.message || err));
    }
  }
}

export function stopListening() {
  if (state.scriptProcessor) { state.scriptProcessor.disconnect(); state.scriptProcessor = null; }
  if (state.micSource) { state.micSource.disconnect(); state.micSource = null; }
  if (state.micStream) { state.micStream.getTracks().forEach(t => t.stop()); state.micStream = null; }
  if (state.audioContext) { state.audioContext.close().catch(() => {}); state.audioContext = null; }
  state.isListening = false;
  dom.micBigBtn.classList.remove('listening');
  dom.micBigBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  dom.micLabel.textContent = 'Gapirish uchun bosing';
}
