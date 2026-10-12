// lib/sync/realtime.ts
// Supabase Realtime Change Hints & Reconnection Backoff Manager
// Implements T-2.5.1 for low-latency multi-device sync hints.

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

export type RealtimeStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
export type RealtimeStatusListener = (status: RealtimeStatus) => void;

export interface RealtimeOptions {
  debounceMs?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

export class GroupRealtimeManager {
  private status: RealtimeStatus = 'disconnected';
  private channel: RealtimeChannel | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private isDestroyed = false;
  private readonly listeners = new Set<RealtimeStatusListener>();

  private readonly debounceMs: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(
    public readonly groupId: string,
    private readonly supabase: SupabaseClient,
    private readonly onTriggerPull: () => Promise<void> | void,
    options?: RealtimeOptions
  ) {
    this.debounceMs = options?.debounceMs ?? 300;
    this.initialBackoffMs = options?.initialBackoffMs ?? 3000;
    this.maxBackoffMs = options?.maxBackoffMs ?? 30000;
  }

  /**
   * Subscribes to real-time status updates (e.g. for SyncBadge or headers).
   */
  subscribeStatus(listener: RealtimeStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getStatus(): RealtimeStatus {
    return this.status;
  }

  getReconnectAttempt(): number {
    return this.reconnectAttempt;
  }

  private setStatus(newStatus: RealtimeStatus): void {
    if (this.status === newStatus) return;
    this.status = newStatus;
    for (const listener of this.listeners) {
      try {
        listener(newStatus);
      } catch (err) {
        console.error('[RealtimeManager] Status listener error:', err);
      }
    }
  }

  /**
   * Initializes real-time postgres_changes listeners on the group's channel.
   */
  start(): void {
    if (this.isDestroyed) return;
    if (this.channel && (this.status === 'connected' || this.status === 'connecting')) return;

    this.setStatus('connecting');

    try {
      const channelName = `group-realtime:${this.groupId}`;
      const channel = this.supabase.channel(channelName);

      const handleEvent = () => {
        this.scheduleDebouncedPull();
      };

      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'expenses', filter: `group_id=eq.${this.groupId}` },
          handleEvent
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'settlements', filter: `group_id=eq.${this.groupId}` },
          handleEvent
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${this.groupId}` },
          handleEvent
        )
        .subscribe((status, err) => {
          if (this.isDestroyed) return;

          if (status === 'SUBSCRIBED') {
            this.reconnectAttempt = 0;
            this.setStatus('connected');
          } else if (status === 'CLOSED') {
            this.setStatus('disconnected');
            this.scheduleReconnect();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
            this.setStatus('error');
            this.scheduleReconnect();
          }
        });

      this.channel = channel;
    } catch (err) {
      console.warn('[RealtimeManager] Error initiating subscription:', err);
      this.setStatus('error');
      this.scheduleReconnect();
    }
  }

  /**
   * Debounces incoming change hints (300 ms) before triggering pullChanges.
   * Remote payloads are never trusted directly — we pull through the verified RPC engine.
   */
  scheduleDebouncedPull(): void {
    if (this.isDestroyed) return;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      try {
        const p = this.onTriggerPull();
        if (p && typeof p.then === 'function') {
          p.catch((err) => console.warn('[RealtimeManager] Pull error on hint:', err));
        }
      } catch (err) {
        console.warn('[RealtimeManager] Synchronous pull error on hint:', err);
      }
    }, this.debounceMs);
  }

  /**
   * Calculates exponential backoff delay (3s -> 30s) and schedules reconnect.
   */
  scheduleReconnect(): void {
    if (this.isDestroyed || this.reconnectTimer) return;

    this.reconnectAttempt++;
    const factor = Math.pow(1.5, Math.min(this.reconnectAttempt - 1, 6));
    const delay = Math.min(this.maxBackoffMs, Math.round(this.initialBackoffMs * factor));

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isDestroyed) {
        this.reconnect();
      }
    }, delay);
  }

  /**
   * Reconnects after error or dropped connection.
   */
  private reconnect(): void {
    if (this.isDestroyed) return;
    if (this.channel) {
      try {
        this.supabase.removeChannel(this.channel).catch(() => {});
      } catch {
        // ignore
      }
      this.channel = null;
    }
    this.start();
  }

  /**
   * Tears down channel subscription and cancels pending debounce & reconnect timers.
   */
  destroy(): void {
    this.isDestroyed = true;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.channel) {
      try {
        this.supabase.removeChannel(this.channel).catch(() => {});
      } catch {
        // ignore
      }
      this.channel = null;
    }

    this.setStatus('disconnected');
    this.listeners.clear();
  }
}
