'use client';

import { useEffect, useRef, useState } from 'react';
import { getAuthToken } from '@/lib/stores/auth.store';

export type DebugStreamEvent =
  | { type: 'user_message'; content: string; timestamp: string }
  | { type: 'typing_start'; timestamp: string }
  | { type: 'typing_end'; timestamp: string }
  | { type: 'bot_reply'; content: string; timestamp: string }
  | { type: 'handoff'; content: string; reason: string; timestamp: string }
  | { type: 'error'; content: string; timestamp: string }
  | { type: 'heartbeat'; timestamp: string };

export type DebugStreamStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

interface UseDebugStreamOptions {
  enabled?: boolean;
  onEvent: (event: DebugStreamEvent) => void;
}

const RECONNECT_DELAY_MS = 2000;

export function useDebugStream({ enabled = true, onEvent }: UseDebugStreamOptions) {
  const [status, setStatus] = useState<DebugStreamStatus>('idle');
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const connect = () => {
      const token = getAuthToken();
      if (!token) {
        setStatus('error');
        return;
      }

      setStatus('connecting');
      const url = `${baseUrl}/debug/stream?token=${encodeURIComponent(token)}`;
      es = new EventSource(url);

      es.onopen = () => {
        if (cancelled) return;
        setStatus('open');
      };

      es.onmessage = (e) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse(e.data) as DebugStreamEvent;
          if (parsed.type === 'heartbeat') return;
          onEventRef.current(parsed);
        } catch {
        }
      };

      es.onerror = () => {
        if (cancelled) return;
        setStatus('error');
        es?.close();
        es = null;
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      setStatus('closed');
    };
  }, [enabled]);

  return { status };
}
