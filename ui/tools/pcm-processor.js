class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      this.buffer.push(channelData[i]);
    }

    if (this.buffer.length >= 2048) {
      const inputData = new Float32Array(this.buffer);
      this.buffer = [];

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

      let sum = 0;
      for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
      const rms = Math.sqrt(sum / inputData.length);

      this.port.postMessage({ pcm16: pcm16.buffer, rms }, [pcm16.buffer]);
    }

    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);
