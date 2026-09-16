import { describe, it, expect, vi } from 'vitest';
import { CookieRotator } from './cookie-rotator.js';
import {
  buildClientHeaders,
  getFallbackClient,
  CLIENT_PROFILES,
} from './client-spoofing.js';
import { YouTubeAdapter } from './youtube.adapter.js';
import { ExtractorPipeline } from './pipeline.js';

describe('Session Cookie Rotation, Client Spoofing & Health Checks (TASK-0502)', () => {
  describe('1. CookieRotator', () => {
    it('rotates cookies in round-robin order', () => {
      const cookies = ['cookie_A=123', 'cookie_B=456', 'cookie_C=789'];
      const rotator = new CookieRotator(cookies);

      expect(rotator.getNextCookie()).toBe('cookie_A=123');
      expect(rotator.getNextCookie()).toBe('cookie_B=456');
      expect(rotator.getNextCookie()).toBe('cookie_C=789');
      expect(rotator.getNextCookie()).toBe('cookie_A=123');
    });

    it('adds and removes cookies dynamically', () => {
      const rotator = new CookieRotator();
      expect(rotator.getNextCookie()).toBeNull();

      const id1 = rotator.addCookie('cookie_1=abc');
      const id2 = rotator.addCookie('cookie_2=def');
      expect(rotator.getStats().total).toBe(2);

      expect(rotator.getNextCookie()).toBe('cookie_1=abc');
      rotator.removeCookie(id1);
      expect(rotator.getStats().total).toBe(1);
      expect(rotator.getNextCookie()).toBe('cookie_2=def');
      rotator.removeCookie(id2);
      expect(rotator.getNextCookie()).toBeNull();
    });

    it('quarantines failing cookies and bypasses them until cooldown expires', () => {
      vi.useFakeTimers();
      const rotator = new CookieRotator(['cookie_good=1', 'cookie_bad=2'], {
        maxFailuresBeforeQuarantine: 2,
        quarantineDurationMs: 60_000,
      });

      // Report failure on cookie_bad
      rotator.reportFailure('cookie_bad=2');
      expect(rotator.getStats().quarantined).toBe(0);

      rotator.reportFailure('cookie_bad=2'); // 2nd failure -> quarantined!
      expect(rotator.getStats().quarantined).toBe(1);
      expect(rotator.getStats().active).toBe(1);

      // Now next cookie must always be cookie_good
      expect(rotator.getNextCookie()).toBe('cookie_good=1');
      expect(rotator.getNextCookie()).toBe('cookie_good=1');

      // Fast-forward 61 seconds
      vi.advanceTimersByTime(61_000);

      // Quarantine should expire and cookie_bad is active again
      const next1 = rotator.getNextCookie();
      const next2 = rotator.getNextCookie();
      const set = new Set([next1, next2]);
      expect(set.has('cookie_good=1')).toBe(true);
      expect(set.has('cookie_bad=2')).toBe(true);

      vi.useRealTimers();
    });

    it('resets failure count on reportSuccess', () => {
      const rotator = new CookieRotator(['cookie_flaky=1'], {
        maxFailuresBeforeQuarantine: 3,
      });

      rotator.reportFailure('cookie_flaky=1');
      rotator.reportFailure('cookie_flaky=1');
      expect(rotator.getStats().quarantined).toBe(0);

      rotator.reportSuccess('cookie_flaky=1');
      // Failure count reset: need 3 more failures to quarantine
      rotator.reportFailure('cookie_flaky=1');
      expect(rotator.getStats().quarantined).toBe(0);
    });
  });

  describe('2. Client Spoofing', () => {
    it('generates proper HTTP headers for each client profile', () => {
      const androidHeaders = buildClientHeaders('ANDROID');
      expect(androidHeaders['User-Agent']).toBe(CLIENT_PROFILES.ANDROID.userAgent);
      expect(androidHeaders['X-YouTube-Client-Name']).toBe('3');
      expect(androidHeaders['X-YouTube-Client-Version']).toBe(CLIENT_PROFILES.ANDROID.clientVersion);
      expect(androidHeaders['Cookie']).toBeUndefined();

      const iosHeaders = buildClientHeaders('IOS', 'SESSION=test_cookie');
      expect(iosHeaders['User-Agent']).toBe(CLIENT_PROFILES.IOS.userAgent);
      expect(iosHeaders['X-YouTube-Client-Name']).toBe('5');
      expect(iosHeaders['Cookie']).toBe('SESSION=test_cookie');

      const tvHeaders = buildClientHeaders('TV');
      expect(tvHeaders['User-Agent']).toContain('SMART-TV');

      const webHeaders = buildClientHeaders('WEB');
      expect(webHeaders['X-YouTube-Client-Name']).toBe('1');
    });

    it('cycles fallback clients in correct sequence', () => {
      expect(getFallbackClient('ANDROID')).toBe('IOS');
      expect(getFallbackClient('IOS')).toBe('TV');
      expect(getFallbackClient('TV')).toBe('WEB');
      expect(getFallbackClient('WEB')).toBe('ANDROID');
    });
  });

  describe('3. YouTubeAdapter Integration with CookieRotator & Client Spoofing', () => {
    it('manages cookie pool and returns headers with active rotated cookie', () => {
      const yt = new YouTubeAdapter({
        cookies: ['GPS=1', 'VISITOR=2'],
        clientType: 'ANDROID',
      });

      expect(yt.getClientType()).toBe('ANDROID');
      const headers1 = yt.getRequestHeaders();
      expect(headers1['Cookie']).toBe('GPS=1');
      expect(headers1['User-Agent']).toContain('Android');

      const headers2 = yt.getRequestHeaders();
      expect(headers2['Cookie']).toBe('VISITOR=2');
    });

    it('rotates client type when rotateClient() is called', () => {
      const yt = new YouTubeAdapter({ clientType: 'ANDROID' });
      expect(yt.getClientType()).toBe('ANDROID');

      expect(yt.rotateClient()).toBe('IOS');
      expect(yt.getClientType()).toBe('IOS');

      expect(yt.rotateClient()).toBe('TV');
      expect(yt.getClientType()).toBe('TV');
    });
  });

  describe('4. ExtractorPipeline Health Summary', () => {
    it('computes overall health summary across all registered extractors', async () => {
      const pipeline = new ExtractorPipeline();
      const summary = await pipeline.getHealthSummary();

      expect(summary.status).toBe('HEALTHY');
      expect(summary.totalCount).toBe(5);
      expect(summary.healthyCount).toBe(5);
      expect(summary.averageLatencyMs).toBeGreaterThanOrEqual(0);
      expect(summary.adapters).toHaveLength(5);
      expect(summary.checkedAt).toBeInstanceOf(Date);
    });

    it('marks status as DEGRADED if an adapter fails health check', async () => {
      const mockUnhealthyAdapter = {
        id: 'deezer' as const,
        name: 'Failing Deezer',
        priority: 40,
        canResolve: () => false,
        search: async () => [],
        resolve: async () => { throw new Error('Failed'); },
        healthCheck: async () => ({
          source: 'deezer' as const,
          isHealthy: false,
          latencyMs: 1200,
          errorMessage: '503 Service Unavailable',
        }),
      };

      const pipeline = new ExtractorPipeline({
        adapters: [mockUnhealthyAdapter],
      });

      const summary = await pipeline.getHealthSummary();
      expect(summary.status).toBe('UNHEALTHY');
      expect(summary.healthyCount).toBe(0);
      expect(summary.totalCount).toBe(1);
      expect(summary.adapters[0]?.errorMessage).toBe('503 Service Unavailable');
    });
  });
});
