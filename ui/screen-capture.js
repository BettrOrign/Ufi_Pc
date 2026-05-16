import { state } from './state.js';

let captureInterval = null;
let captureStream = null;
let captureVideo = null;
let canvas = null;
let canvasCtx = null;

export async function startScreenShare() {
  if (state.isScreenSharing) {
    return { success: false, message: 'Screen sharing already active' };
  }

  try {
    captureStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 5 } },
      audio: false,
    });

    captureVideo = document.createElement('video');
    captureVideo.srcObject = captureStream;
    captureVideo.playsInline = true;
    captureVideo.muted = true;
    captureVideo.style.display = 'none';
    document.body.appendChild(captureVideo);
    await captureVideo.play();

    canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    canvasCtx = canvas.getContext('2d');

    state.isScreenSharing = true;
    updateBadge(true);

    captureInterval = setInterval(() => {
      if (!state.isSessionActive || state.ws?.readyState !== WebSocket.OPEN) {
        stopScreenShare();
        return;
      }

      canvasCtx.drawImage(captureVideo, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];

      state.ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{ data: base64, mimeType: 'image/jpeg' }]
        }
      }));
    }, 1500);

    // Handle user clicking "Stop sharing" in browser UI
    captureStream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };

    return { success: true, message: 'Screen sharing started' };
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return { success: false, message: 'Screen sharing permission denied' };
    }
    console.error('[Screen] Error:', err);
    return { success: false, message: 'Screen share error: ' + err.message };
  }
}

export function stopScreenShare() {
  if (!state.isScreenSharing) return { success: false, message: 'Not sharing' };

  state.isScreenSharing = false;

  if (captureInterval) {
    clearInterval(captureInterval);
    captureInterval = null;
  }

  if (captureStream) {
    captureStream.getTracks().forEach(t => t.stop());
    captureStream = null;
  }

  if (captureVideo) {
    captureVideo.pause();
    captureVideo.srcObject = null;
    if (captureVideo.parentNode) captureVideo.parentNode.removeChild(captureVideo);
    captureVideo = null;
  }

  canvas = null;
  canvasCtx = null;

  updateBadge(false);
  return { success: true, message: 'Screen sharing stopped' };
}

function updateBadge(visible) {
  const badge = document.getElementById('screenShareBadge');
  if (badge) badge.style.display = visible ? 'flex' : 'none';
}
