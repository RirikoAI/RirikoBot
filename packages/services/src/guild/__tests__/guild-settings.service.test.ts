import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GuildSettingsService } from '../guild-settings.service.js';
import type { GuildSettingsRepository, GuildSettings } from '@ririko/database';
import { ValidationError } from '@ririko/core';

describe('GuildSettingsService', () => {
  let mockRepo: {
    findById: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  let service: GuildSettingsService;

  beforeEach(() => {
    mockRepo = {
      findById: vi.fn(),
      upsert: vi.fn(),
    };
    service = new GuildSettingsService({
      repo: mockRepo as unknown as GuildSettingsRepository,
      cacheTtlMs: 1000,
      defaultPrefix: '!',
      defaultTimezone: 'UTC',
    });
  });

  describe('getSettings / getPrefix / getTimezone', () => {
    it('returns default settings when guild row does not exist in DB', async () => {
      mockRepo.findById.mockResolvedValueOnce(null);

      const settings = await service.getSettings('guild-1');
      expect(settings.prefix).toBe('!');
      expect(settings.timezone).toBe('UTC');
      expect(mockRepo.findById).toHaveBeenCalledWith('guild-1');
    });

    it('caches the result and does not call DB on second request within TTL', async () => {
      mockRepo.findById.mockResolvedValueOnce({
        guildId: 'guild-1',
        prefix: '?',
        timezone: 'Asia/Kuala_Lumpur',
        locale: 'en-US',
      } as GuildSettings);

      const first = await service.getPrefix('guild-1');
      const second = await service.getTimezone('guild-1');

      expect(first).toBe('?');
      expect(second).toBe('Asia/Kuala_Lumpur');
      expect(mockRepo.findById).toHaveBeenCalledTimes(1);
    });

    it('re-fetches from DB after cache expires', async () => {
      mockRepo.findById.mockResolvedValue({
        guildId: 'guild-1',
        prefix: '!',
        timezone: 'UTC',
        locale: 'en-US',
      } as GuildSettings);

      await service.getSettings('guild-1');
      expect(mockRepo.findById).toHaveBeenCalledTimes(1);

      // Advance time beyond TTL (1000ms)
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);

      await service.getSettings('guild-1');
      expect(mockRepo.findById).toHaveBeenCalledTimes(2);
    });
  });

  describe('setPrefix', () => {
    it('rejects empty prefix', async () => {
      await expect(service.setPrefix('guild-1', '   ')).rejects.toThrow(ValidationError);
    });

    it('rejects prefix longer than 5 characters', async () => {
      await expect(service.setPrefix('guild-1', '!help!me')).rejects.toThrow(ValidationError);
    });

    it('rejects prefix with whitespace', async () => {
      await expect(service.setPrefix('guild-1', '! a')).rejects.toThrow(ValidationError);
    });

    it('rejects prefix with backticks', async () => {
      await expect(service.setPrefix('guild-1', '`')).rejects.toThrow(ValidationError);
    });

    it('rejects prefix starting with @ or #', async () => {
      await expect(service.setPrefix('guild-1', '@')).rejects.toThrow(ValidationError);
      await expect(service.setPrefix('guild-1', '#')).rejects.toThrow(ValidationError);
    });

    it('validates, saves to DB, and updates in-memory cache immediately', async () => {
      mockRepo.upsert.mockResolvedValueOnce({
        guildId: 'guild-1',
        prefix: '>',
        timezone: 'UTC',
        locale: 'en-US',
      } as GuildSettings);

      const res = await service.setPrefix('guild-1', '>');
      expect(res.prefix).toBe('>');
      expect(mockRepo.upsert).toHaveBeenCalledWith({
        guildId: 'guild-1',
        prefix: '>',
      });

      // Directly check getPrefix doesn't call DB again
      const currentPrefix = await service.getPrefix('guild-1');
      expect(currentPrefix).toBe('>');
      expect(mockRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('setTimezone', () => {
    it('rejects invalid IANA timezone', async () => {
      await expect(service.setTimezone('guild-1', 'Not/A/Timezone')).rejects.toThrow(
        ValidationError,
      );
    });

    it('rejects offset-only timezones like GMT+8', async () => {
      await expect(service.setTimezone('guild-1', 'GMT+8')).rejects.toThrow(ValidationError);
    });

    it('canonicalizes case-insensitive input and updates DB and cache', async () => {
      mockRepo.upsert.mockResolvedValueOnce({
        guildId: 'guild-1',
        prefix: '!',
        timezone: 'Asia/Kuala_Lumpur',
        locale: 'en-US',
      } as GuildSettings);

      const res = await service.setTimezone('guild-1', 'asia/kuala_lumpur');
      expect(res.timezone).toBe('Asia/Kuala_Lumpur');
      expect(mockRepo.upsert).toHaveBeenCalledWith({
        guildId: 'guild-1',
        timezone: 'Asia/Kuala_Lumpur',
      });

      const currentTz = await service.getTimezone('guild-1');
      expect(currentTz).toBe('Asia/Kuala_Lumpur');
      expect(mockRepo.findById).not.toHaveBeenCalled();
    });

    it('accepts UTC as a canonical timezone', async () => {
      mockRepo.upsert.mockResolvedValueOnce({
        guildId: 'guild-1',
        prefix: '!',
        timezone: 'UTC',
        locale: 'en-US',
      } as GuildSettings);

      await service.setTimezone('guild-1', 'utc');
      expect(mockRepo.upsert).toHaveBeenCalledWith({
        guildId: 'guild-1',
        timezone: 'UTC',
      });
    });
  });

  describe('invalidate & clearCache', () => {
    it('removes entry from cache on invalidate', async () => {
      mockRepo.findById.mockResolvedValue({
        guildId: 'guild-1',
        prefix: '!',
        timezone: 'UTC',
      } as GuildSettings);

      await service.getSettings('guild-1');
      expect(mockRepo.findById).toHaveBeenCalledTimes(1);

      service.invalidate('guild-1');

      await service.getSettings('guild-1');
      expect(mockRepo.findById).toHaveBeenCalledTimes(2);
    });
  });
});
