const PREFIX = "today.cache.";

export function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setCached<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* localStorage might be full or disabled — silently ignore */
  }
}

export function clearCached(key?: string): void {
  try {
    if (key) {
      localStorage.removeItem(PREFIX + key);
      return;
    }
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
