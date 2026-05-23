const MAX_LISTENERS_WARN = 10;

export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(event, fn) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    const listeners = this._listeners.get(event);
    if (listeners.length >= MAX_LISTENERS_WARN) {
      console.warn(`[EventBus] Warning: ${event} has ${listeners.length + 1} listeners`);
    }
    listeners.push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      const idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    }
  }

  emit(event, data) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      for (const fn of listeners) {
        try { fn(data); } catch (err) { console.error(`[EventBus] Error in ${event} listener:`, err); }
      }
    }
  }

  removeAllListeners(event) {
    if (event) this._listeners.delete(event);
    else this._listeners.clear();
  }
}
