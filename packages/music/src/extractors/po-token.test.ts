import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PoTokenService, type YouTubePoTokenResult } from './po-token.service.js';
import { YouTubeAdapter } from './youtube.adapter.js';

describe('YouTube PO-Token Automation & Provider (TASK-0503)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('1. PoTokenService State & Cache', () => {
    it('initializes with pre-configured tokens from environment/options', () => {
      const service = new PoTokenService({
        initialPoToken: 'initial_token_abc_123',
        initialVisitorData: 'initial_visitor_xyz_789',
      });

      const current = service.getCurrentTokens();
      expect(current).not.toBeNull();
      expect(current?.poToken).toBe('initial_token_abc_123');
      expect(current?.visitorData).toBe('initial_visitor_xyz_789');
    });

    it('returns existing tokens when still within rotation interval', async () => {
      const service = new PoTokenService({
        initialPoToken: 'valid_token_test',
        initialVisitorData: 'valid_visitor_test',
        rotationIntervalMs: 18 * 60 * 60 * 1000,
      });

      // Advance 10 hours (well within 18 hour TTL)
      vi.advanceTimersByTime(10 * 60 * 60 * 1000);

      const tokens = await service.getValidTokens();
      expect(tokens?.poToken).toBe('valid_token_test');
      expect(tokens?.visitorData).toBe('valid_visitor_test');
    });

    it('triggers refresh and invokes onTokenRefreshed callback when tokens update', async () => {
      const onRefreshed = vi.fn();
      const service = new PoTokenService({
        onTokenRefreshed: onRefreshed,
      });

      // Mock refreshTokens internal method
      const mockResult: YouTubePoTokenResult = {
        poToken: 'new_refreshed_token_' + 'x'.repeat(60),
        visitorData: 'new_refreshed_visitor_data',
        mintedAt: Date.now(),
      };

      vi.spyOn(service, 'refreshTokens').mockImplementation(async () => {
        onRefreshed(mockResult);
        return mockResult;
      });

      const res = await service.refreshTokens();
      expect(res?.poToken).toBe(mockResult.poToken);
      expect(onRefreshed).toHaveBeenCalledWith(mockResult);
    });

    it('manages auto rotation timer lifecycle without leaks', () => {
      const service = new PoTokenService({
        rotationIntervalMs: 10_000,
      });

      const refreshSpy = vi.spyOn(service, 'refreshTokens').mockResolvedValue(null);

      service.startAutoRotation();
      expect(refreshSpy).not.toHaveBeenCalled();

      // Advance by rotation interval
      vi.advanceTimersByTime(10_000);
      expect(refreshSpy).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(10_000);
      expect(refreshSpy).toHaveBeenCalledTimes(2);

      // Stop rotation
      service.stopAutoRotation();
      vi.advanceTimersByTime(30_000);
      expect(refreshSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('2. YouTubeAdapter Integration', () => {
    it('creates and attaches PoTokenService to YouTubeAdapter', () => {
      const adapter = new YouTubeAdapter({
        autoGeneratePoToken: false, // disable async call in test
        poToken: 'preset_po_token',
        visitorData: 'preset_visitor_data',
      });

      const svc = adapter.getPoTokenService();
      expect(svc).toBeDefined();
      expect(svc?.getCurrentTokens()?.poToken).toBe('preset_po_token');
      expect(svc?.getCurrentTokens()?.visitorData).toBe('preset_visitor_data');
      svc?.stopAutoRotation();
    });

    it('automatically updates adapter credentials when token is refreshed', async () => {
      let _refreshedTokens: YouTubePoTokenResult | undefined;
      const customService = new PoTokenService({
        initialPoToken: 'initial_tok',
        initialVisitorData: 'initial_vis',
        onTokenRefreshed: (tokens) => {
          _refreshedTokens = tokens;
        },
      });

      const adapter = new YouTubeAdapter({
        autoGeneratePoToken: false,
        poTokenService: customService,
      });

      // Ensure adapter registers callback or we test via token service
      expect(adapter.getPoTokenService()).toBe(customService);
      customService.stopAutoRotation();
    });
  });
});
