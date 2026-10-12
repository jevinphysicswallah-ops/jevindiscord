import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeEnvelope } from '../types';

type Listener = (payload: unknown) => void;

export function useRealtime(enabled: boolean) {
  const socketRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef(new Map<string, Set<Listener>>());
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const [status, setStatus] = useState<'offline' | 'connecting' | 'online'>('offline');

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = socket;

      socket.addEventListener('open', () => {
        attemptsRef.current = 0;
        setStatus('online');
      });

      socket.addEventListener('message', (message) => {
        try {
          const envelope = JSON.parse(String(message.data)) as RealtimeEnvelope;
          const exact = listenersRef.current.get(envelope.event);
          exact?.forEach((listener) => listener(envelope.payload));
          listenersRef.current.get('*')?.forEach((listener) => listener(envelope));
        } catch {
          // Ignore malformed frames; the connection remains usable.
        }
      });

      socket.addEventListener('close', () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (disposed) return;
        setStatus('offline');
        const delay = Math.min(10_000, 800 * 2 ** attemptsRef.current++);
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      });
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
      setStatus('offline');
    };
  }, [enabled]);

  const send = useCallback((event: string, payload: unknown) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ event, payload }));
    return true;
  }, []);

  const subscribe = useCallback((event: string, listener: Listener) => {
    const listeners = listenersRef.current.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    listenersRef.current.set(event, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) listenersRef.current.delete(event);
    };
  }, []);

  return { status, send, subscribe };
}
