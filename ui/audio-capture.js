import { dom } from './dom.js';
import { state } from './state.js';
import { showError } from './ui-helpers.js';
import { stopAudioPlayback } from './audio-playback.js';

export async function startListening() {
  try {
    let ctx = state.audioContext;
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext();
      state.audioContext = ctx;
    }
    if (ctx.state === 'suspended') await ctx.resume();
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } });
    state.micStream = micStream;
    state.micSource = ctx.createMediaStreamSource(micStream);

    await ctx.audioWorklet.addModule('pcm-processor.js');
    state.micWorkletNode = new AudioWorkletNode(ctx, 'pcm-processor', { numberOfOutputs: 0 });
    state.micWorkletNode.port.onmessage = (event) => {
      if (!state.isSessionActive || state.ws?.readyState !== WebSocket.OPEN) return;
      const { pcm16, rms } = event.data;
      const pcm16Array = new Int16Array(pcm16);

      const level = Math.min(1, rms * 5);
      const wrapper = document.getElementById('nucleusWrapper');
      if (wrapper) {
        wrapper.style.setProperty('--mic-level', level);
      }

      const bytes = new Uint8Array(pcm16Array.buffer);
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
    state.micSource.connect(state.micWorkletNode);

    state.isListening = true;
    const nucleusW = document.getElementById('nucleusWrapper');
    if (nucleusW) nucleusW.classList.add('listening');
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
  stopAudioPlayback();
  if (state.micWorkletNode) { state.micWorkletNode.disconnect(); state.micWorkletNode = null; }
  if (state.micSource) { state.micSource.disconnect(); state.micSource = null; }
  if (state.micStream) { state.micStream.getTracks().forEach(t => t.stop()); state.micStream = null; }
  if (state.audioContext && state.audioContext.state !== 'closed') {
    state.audioContext.suspend().catch(() => {});
  }
  state.isListening = false;
  const nucleusW = document.getElementById('nucleusWrapper');
  if (nucleusW) nucleusW.classList.remove('listening');
  dom.micLabel.textContent = 'Gapirish uchun bosing';
}
