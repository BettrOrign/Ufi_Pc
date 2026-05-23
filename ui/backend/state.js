function createStore(initial) {
  const schema = {
    ws: { type: "object", nullable: true },
    isConnected: { type: "boolean" },
    isListening: { type: "boolean" },
    audioContext: { type: "object", nullable: true },
    micStream: { type: "object", nullable: true },
    micWorkletNode: { type: "object", nullable: true },
    micSource: { type: "object", nullable: true },
    isSessionActive: { type: "boolean" },
    accumulatedAssistantText: { type: "string" },
    currentAssistantMsg: { type: "object", nullable: true },
    outputAudioContext: { type: "object", nullable: true },
    audioQueue: { type: "object" },
    isPlaying: { type: "boolean" },
    currentSource: { type: "object", nullable: true },
    isScreenSharing: { type: "boolean" },
    coreSpeed: { type: "number" },
    coreSensitivity: { type: "number" },
    coreHue: { type: "number" },
    coreTheme: { type: "string" },
    serviceStatus: { type: "object" },
    commands: { type: "object" },
  };

  return new Proxy(initial, {
    set(target, key, value) {
      if (!(key in schema))
        throw new Error(`[state] Поля "${String(key)}" не существует`);
      if (value === null && !schema[key].nullable)
        throw new TypeError(`[state] "${String(key)}" не может быть null`);
      if (value !== null && typeof value !== schema[key].type)
        throw new TypeError(
          `[state] "${String(key)}" должен быть ${schema[key].type}, получили ${typeof value}`,
        );
      target[key] = value;
      return true;
    },
    deleteProperty() {
      throw new Error("[state] Нельзя удалять поля");
    },
  });
}

export const state = createStore({
  ws: null,
  isConnected: false,
  isListening: false,
  audioContext: null,
  micStream: null,
  micWorkletNode: null,
  micSource: null,
  isSessionActive: false,
  accumulatedAssistantText: "",
  currentAssistantMsg: null,
  outputAudioContext: null,
  audioQueue: [],
  isPlaying: false,
  currentSource: null,
  isScreenSharing: false,
  coreSpeed: 1.0,
  coreSensitivity: 1.0,
  coreHue: 0,
  coreTheme: "hearth",
  serviceStatus: {
    gemini: "disconnected",
    telegram: "disconnected",
    browser: "disconnected",
    mastra: "disconnected",
  },
  commands: [
    { id: "weather", name: "Check Weather" },
    { id: "search", name: "Web Search" },
    { id: "tg-send", name: "Send Telegram Message" },
    { id: "tg-read", name: "Read Telegram Messages" },
    { id: "youtube", name: "YouTube Search" },
    { id: "browse", name: "Browse Website" },
    { id: "settings", name: "Open Settings" },
    { id: "toggle-sidebar", name: "Toggle Sidebar" },
    { id: "clear-chat", name: "Clear Chat" },
  ],
});
