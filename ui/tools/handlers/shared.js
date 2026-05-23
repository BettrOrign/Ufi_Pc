/**
 * shared.js — Shared utilities for UI tool handlers.
 * Every handler should use these to ensure consistent error handling,
 * timeout management, and crash safety.
 */

/**
 * Fetch wrapper with timeout + response checking.
 * NEVER throws — always returns { ok, data/error }.
 */
export async function safeFetch(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      const snippet = text.slice(0, 200);
      return { ok: false, error: `HTTP ${resp.status}: ${snippet}` };
    }
    
    const data = await resp.json();
    return { ok: true, data };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, error: `Request timed out after ${timeoutMs}ms` };
    }
    return { ok: false, error: err.message || 'Unknown fetch error' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Handler factory — wraps any handler with null-safe args + try/catch.
 * NEVER throws.
 * 
 * Usage:
 *   export const handleFoo = wrapHandler(async (args) => {
 *     const { param } = args; // args is always {} at minimum
 *     return { result: ... };
 *   });
 */
export function wrapHandler(fn) {
  return async (args) => {
    const safeArgs = args || {};
    try {
      const result = await fn(safeArgs);
      return result;
    } catch (err) {
      console.error(`[Handler Error] ${fn.name || 'anonymous'}:`, err);
      return { error: err.message || 'Unknown handler error' };
    }
  };
}
