import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GroupRealtimeManager } from '../../lib/sync/realtime';

describe('T-2.5.1: Realtime Subscription & Reconnect Backoff', () => {
  let mockChannel: any;
  let mockSupabase: any;
  let subscriptionCallback: any;

  beforeEach(() => {
    vi.useFakeTimers();

    mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockImplementation((cb) => {
        subscriptionCallback = cb;
        return mockChannel;
      }),
    };

    mockSupabase = {
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn().mockResolvedValue('ok'),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to postgres_changes for expenses, settlements, and group_members on group-realtime channel', () => {
    const onPull = vi.fn();
    const manager = new GroupRealtimeManager('group_123', mockSupabase, onPull);

    manager.start();

    expect(mockSupabase.channel).toHaveBeenCalledWith('group-realtime:group_123');
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'expenses', filter: 'group_id=eq.group_123' },
      expect.any(Function)
    );
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'settlements', filter: 'group_id=eq.group_123' },
      expect.any(Function)
    );
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'group_members', filter: 'group_id=eq.group_123' },
      expect.any(Function)
    );
  });

  it('updates status to connected on SUBSCRIBED and resets reconnect attempts', () => {
    const onPull = vi.fn();
    const manager = new GroupRealtimeManager('group_123', mockSupabase, onPull);

    const statuses: string[] = [];
    manager.subscribeStatus((st) => statuses.push(st));

    manager.start();
    expect(manager.getStatus()).toBe('connecting');

    // Simulate SUBSCRIBED event
    subscriptionCallback('SUBSCRIBED');
    expect(manager.getStatus()).toBe('connected');
    expect(manager.getReconnectAttempt()).toBe(0);
    expect(statuses).toContain('connected');
  });

  it('debounces rapid incoming change hints (300 ms) into a single verified pull call', () => {
    const onPull = vi.fn();
    const manager = new GroupRealtimeManager('group_123', mockSupabase, onPull, { debounceMs: 300 });

    manager.start();

    // Fire 5 rapid events within 100 ms
    manager.scheduleDebouncedPull();
    vi.advanceTimersByTime(50);
    manager.scheduleDebouncedPull();
    vi.advanceTimersByTime(50);
    manager.scheduleDebouncedPull();
    vi.advanceTimersByTime(50);
    manager.scheduleDebouncedPull();
    vi.advanceTimersByTime(50);
    manager.scheduleDebouncedPull();

    // Not yet called
    expect(onPull).not.toHaveBeenCalled();

    // Advance 300 ms after the last burst
    vi.advanceTimersByTime(300);

    // Called exactly ONCE
    expect(onPull).toHaveBeenCalledTimes(1);
  });

  it('handles connection drops with exponential backoff (3s -> 30s) and reconnects', () => {
    const onPull = vi.fn();
    const manager = new GroupRealtimeManager('group_123', mockSupabase, onPull, {
      initialBackoffMs: 3000,
      maxBackoffMs: 30000,
    });

    manager.start();
    subscriptionCallback('SUBSCRIBED');
    expect(manager.getStatus()).toBe('connected');

    // 1st Disconnect: CHANNEL_ERROR
    subscriptionCallback('CHANNEL_ERROR', new Error('Network lost'));
    expect(manager.getStatus()).toBe('error');
    expect(manager.getReconnectAttempt()).toBe(1);

    // Initial backoff delay is 3000 ms (3s)
    mockSupabase.channel.mockClear();
    vi.advanceTimersByTime(2999);
    expect(mockSupabase.channel).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2); // reaches 3001 ms
    expect(mockSupabase.channel).toHaveBeenCalledTimes(1);

    // 2nd Disconnect: CLOSED
    subscriptionCallback('CLOSED');
    expect(manager.getStatus()).toBe('disconnected');
    expect(manager.getReconnectAttempt()).toBe(2);

    // Next backoff delay is round(3000 * 1.5) = 4500 ms (4.5s)
    mockSupabase.channel.mockClear();
    vi.advanceTimersByTime(4499);
    expect(mockSupabase.channel).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2); // reaches 4501 ms
    expect(mockSupabase.channel).toHaveBeenCalledTimes(1);
  });

  it('cleans up channel and cancels all pending timers on destroy', () => {
    const onPull = vi.fn();
    const manager = new GroupRealtimeManager('group_123', mockSupabase, onPull);

    manager.start();
    manager.scheduleDebouncedPull();
    manager.scheduleReconnect();

    manager.destroy();

    expect(manager.getStatus()).toBe('disconnected');
    expect(mockSupabase.removeChannel).toHaveBeenCalledWith(mockChannel);

    // Advancing timers should not trigger pull or reconnect
    vi.advanceTimersByTime(60000);
    expect(onPull).not.toHaveBeenCalled();
  });
});
