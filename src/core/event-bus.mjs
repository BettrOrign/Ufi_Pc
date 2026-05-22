// src/core/event-bus.mjs
export class EventBus {
  constructor() {
    this._listeners = new Map();
  }
  
  on(event, fn) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(fn);
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
      for (const fn of [...listeners]) {
        try { fn(data); } catch (err) { console.error(`[EventBus] Error in ${event} listener:`, err); }
      }
    }
  }
  
  removeAllListeners(event) {
    if (event) this._listeners.delete(event);
    else this._listeners.clear();
  }
}
