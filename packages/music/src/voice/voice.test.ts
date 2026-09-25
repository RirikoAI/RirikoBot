import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { VoiceConnectionStatus, type VoiceConnection } from '@discordjs/voice';
import { VoiceLifecycleManager } from './voice-lifecycle-manager.js';
import { GuildQueue } from '../queue/guild-queue.js';

class MockVoiceConnection extends EventEmitter {
  state = {
    status: VoiceConnectionStatus.Ready,
  };

  destroy = vi.fn(() => {
    this.state.status = VoiceConnectionStatus.Destroyed;
    this.emit(
      'stateChange',
      { status: VoiceConnectionStatus.Ready },
      { status: VoiceConnectionStatus.Destroyed },
    );
  });

  rejoin = vi.fn(() => true);
}

describe('Voice Connection Lifecycle & Idle Auto-Disconnect (TASK-0512)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('1. Configuration & Initial State', () => {
    it('initializes with production defaults including 3-minute idle timeout', () => {
      const manager = new VoiceLifecycleManager({ guildId: 'guild-v1' });

      expect(manager.guildId).toBe('guild-v1');
      expect(manager.options.idleTimeoutMs).toBe(180_000); // 3 minutes
      expect(manager.options.maxReconnectAttempts).toBe(5);
      expect(manager.options.initialReconnectBackoffMs).toBe(1_500);
      expect(manager.options.autoLeaveEmpty).toBe(true);
      expect(manager.options.autoLeaveEnd).toBe(true);
      expect(manager.isConnected).toBe(false);
      expect(manager.isIdleTimerActive).toBe(false);
      expect(manager.currentIdleReason).toBeNull();
    });

    it('accepts custom options override', () => {
      const manager = new VoiceLifecycleManager({
        guildId: 'guild-v2',
        idleTimeoutMs: 60_000,
        maxReconnectAttempts: 3,
        autoLeaveEmpty: false,
      });

      expect(manager.options.idleTimeoutMs).toBe(60_000);
      expect(manager.options.maxReconnectAttempts).toBe(3);
      expect(manager.options.autoLeaveEmpty).toBe(false);
    });
  });

  describe('2. Idle Auto-Disconnect Timer', () => {
    it('starts 3-minute countdown timer on startIdleTimer', () => {
      const manager = new VoiceLifecycleManager({
        guildId: 'guild-idle',
        idleTimeoutMs: 180_000,
      });

      const timerStartedSpy = vi.fn();
      manager.on('idleTimerStarted', timerStartedSpy);

      manager.startIdleTimer('EMPTY_QUEUE');
      expect(manager.isIdleTimerActive).toBe(true);
      expect(manager.currentIdleReason).toBe('EMPTY_QUEUE');
      expect(timerStartedSpy).toHaveBeenCalledWith('EMPTY_QUEUE', 180_000);

      // Starting again with same reason does not restart or reset
      manager.startIdleTimer('EMPTY_QUEUE');
      expect(timerStartedSpy).toHaveBeenCalledTimes(1);
    });

    it('cancels idle countdown timer on cancelIdleTimer', () => {
      const manager = new VoiceLifecycleManager({ guildId: 'guild-cancel' });
      const timerCancelledSpy = vi.fn();
      manager.on('idleTimerCancelled', timerCancelledSpy);

      manager.startIdleTimer('EMPTY_QUEUE');
      expect(manager.isIdleTimerActive).toBe(true);

      manager.cancelIdleTimer('Track resumed');
      expect(manager.isIdleTimerActive).toBe(false);
      expect(manager.currentIdleReason).toBeNull();
      expect(timerCancelledSpy).toHaveBeenCalled();
    });

    it('triggers autoDisconnect when 3-minute idle timeout expires', () => {
      const manager = new VoiceLifecycleManager({
        guildId: 'guild-expire',
        idleTimeoutMs: 180_000,
      });

      const autoDisconnectSpy = vi.fn();
      const disconnectedSpy = vi.fn();
      manager.on('autoDisconnect', autoDisconnectSpy);
      manager.on('disconnected', disconnectedSpy);

      manager.startIdleTimer('EMPTY_QUEUE');
      expect(manager.isIdleTimerActive).toBe(true);

      // Fast-forward 2 minutes: still active
      vi.advanceTimersByTime(120_000);
      expect(manager.isIdleTimerActive).toBe(true);
      expect(autoDisconnectSpy).not.toHaveBeenCalled();

      // Fast-forward remaining 1 minute (total 3 minutes)
      vi.advanceTimersByTime(60_000);

      expect(autoDisconnectSpy).toHaveBeenCalledWith('EMPTY_QUEUE');
      expect(disconnectedSpy).toHaveBeenCalledWith('EMPTY_QUEUE');
      expect(manager.isIdleTimerActive).toBe(false);
      expect(manager.currentIdleReason).toBeNull();
    });
  });

  describe('3. GuildQueue Integration', () => {
    it('automatically starts idle timer on queueEnd and cancels on trackStart', () => {
      const manager = new VoiceLifecycleManager({ guildId: 'guild-bind' });
      const queue = new GuildQueue({ guildId: 'guild-bind' });

      manager.bindQueue(queue);

      // Queue finishes -> queueEnd emitted -> idle timer started
      queue.emit('queueEnd');
      expect(manager.isIdleTimerActive).toBe(true);
      expect(manager.currentIdleReason).toBe('EMPTY_QUEUE');

      // New track begins playback -> idle timer cancelled
      queue.emit('trackStart', { id: 't1' } as never);
      expect(manager.isIdleTimerActive).toBe(false);
      expect(manager.currentIdleReason).toBeNull();
    });

    it('destroys bound queue when auto-disconnect triggers', () => {
      const manager = new VoiceLifecycleManager({
        guildId: 'guild-bind-destroy',
        idleTimeoutMs: 180_000,
      });
      const queue = new GuildQueue({ guildId: 'guild-bind-destroy' });
      const queueDestroySpy = vi.spyOn(queue, 'destroy');

      manager.bindQueue(queue);
      manager.startIdleTimer('EMPTY_QUEUE');

      vi.advanceTimersByTime(180_000);
      expect(queueDestroySpy).toHaveBeenCalled();
    });
  });

  describe('4. Channel Membership & Empty Channel Detection', () => {
    it('starts idle timer when channel is empty of non-bot members', () => {
      const manager = new VoiceLifecycleManager({ guildId: 'guild-members' });

      // Non-bot member count drops to 0 (all users left)
      manager.onMemberCountChanged(0);
      expect(manager.isIdleTimerActive).toBe(true);
      expect(manager.currentIdleReason).toBe('EMPTY_CHANNEL');

      // A user joins before timeout expires -> cancels idle timer!
      manager.onMemberCountChanged(1);
      expect(manager.isIdleTimerActive).toBe(false);
      expect(manager.currentIdleReason).toBeNull();
    });

    it('ignores empty channel if autoLeaveEmpty option is false', () => {
      const manager = new VoiceLifecycleManager({
        guildId: 'guild-no-leave',
        autoLeaveEmpty: false,
      });

      manager.onMemberCountChanged(0);
      expect(manager.isIdleTimerActive).toBe(false);
    });
  });

  describe('5. Voice Connection Management & Lifecycle', () => {
    it('tracks connection state and cleans up on manual disconnect', () => {
      const manager = new VoiceLifecycleManager({ guildId: 'guild-conn' });
      const mockConn = new MockVoiceConnection() as unknown as VoiceConnection;

      manager.setConnection(mockConn);
      expect(manager.isConnected).toBe(true);
      expect(manager.getConnection()).toBe(mockConn);

      const disconnectSpy = vi.fn();
      manager.on('disconnected', disconnectSpy);

      manager.disconnect('MANUAL');
      expect(manager.isConnected).toBe(false);
      expect(manager.getConnection()).toBeNull();
      expect(mockConn.destroy).toHaveBeenCalled();
      expect(disconnectSpy).toHaveBeenCalledWith('MANUAL');
    });

    it('handles connection state change to Ready', () => {
      const manager = new VoiceLifecycleManager({ guildId: 'guild-ready' });
      const mockConn = new MockVoiceConnection() as unknown as VoiceConnection;

      const connectedSpy = vi.fn();
      manager.on('connected', connectedSpy);

      manager.setConnection(mockConn);
      (mockConn as unknown as MockVoiceConnection).emit(
        'stateChange',
        { status: VoiceConnectionStatus.Connecting },
        { status: VoiceConnectionStatus.Ready },
      );

      expect(connectedSpy).toHaveBeenCalledWith(mockConn);
    });
  });
});
