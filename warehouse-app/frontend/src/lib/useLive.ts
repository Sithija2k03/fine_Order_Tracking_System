import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/index';

// ─────────────────────────────────────────────────────────────────────
// useLive — fetch + cache + auto-refresh, tuned for slow mobile networks.
//
// • Shows the last data for a URL instantly (in-memory cache), then refreshes
//   in the background — switching between pickers/checkers feels instant.
// • Polls every `intervalMs` only while the screen is visible, and refreshes
//   as soon as the phone/tab comes back into view.
// • `mutate()` applies an optimistic change immediately; any refresh that was
//   already in flight when you mutated is ignored, so the UI never flickers back.
// ─────────────────────────────────────────────────────────────────────

const cache = new Map<string, unknown>();

export function useLive<T>(url: string | null, intervalMs = 0) {
  // Data is stored together with the URL it belongs to, so switching person
  // never shows the previous person's orders — not even for one frame.
  const [state, setState] = useState<{ url: string | null; data: T | undefined }>(
    () => ({ url, data: url ? (cache.get(url) as T | undefined) : undefined }));
  const data = state.url === url ? state.data : (url ? (cache.get(url) as T | undefined) : undefined);
  const [error, setError] = useState('');
  const currentUrl = useRef(url);
  const lastMutation = useRef(0);

  const refresh = useCallback(async () => {
    if (!url) return;
    const startedAt = Date.now();
    try {
      const res = await api.get(url);
      if (currentUrl.current !== url || startedAt < lastMutation.current) return;   // stale
      cache.set(url, res.data);
      setState({ url, data: res.data });
      setError('');
    } catch (err: any) {
      if (currentUrl.current === url) setError(err.response?.data?.error || 'Could not load — check connection');
    }
  }, [url]);

  // New URL → (cached copy is already shown above) refresh in the background
  useEffect(() => {
    currentUrl.current = url;
    refresh();
  }, [url, refresh]);

  // Polling while visible + refresh on return to the app
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const timer = intervalMs
      ? window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, intervalMs)
      : undefined;
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      if (timer) window.clearInterval(timer);
    };
  }, [refresh, intervalMs]);

  const mutate = useCallback((fn: (prev: T) => T) => {
    lastMutation.current = Date.now();
    setState(prev => {
      const base = prev.url === url ? prev.data : (url ? (cache.get(url) as T | undefined) : undefined);
      if (base === undefined) return prev;
      const next = fn(base);
      if (url) cache.set(url, next);
      return { url, data: next };
    });
  }, [url]);

  return { data, loading: data === undefined && !error, error, refresh, mutate };
}

/** Warm the cache for a URL (e.g. the next screen) without rendering anything. */
export function prefetch(url: string) {
  if (cache.has(url)) return;
  api.get(url).then(res => cache.set(url, res.data)).catch(() => {});
}
