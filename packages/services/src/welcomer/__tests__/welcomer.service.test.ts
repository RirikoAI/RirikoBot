import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WelcomerService } from '../welcomer.service.js';
import { promises as dns } from 'node:dns';

vi.mock('node:dns', () => {
  return {
    promises: {
      resolve: vi.fn(),
    },
  };
});

describe('WelcomerService SSRF Validation', () => {
  let service: WelcomerService;

  beforeEach(() => {
    service = new WelcomerService();
    vi.clearAllMocks();
  });

  it('rejects invalid URLs', async () => {
    expect(await service.validateBackgroundUrl('invalid-url')).toBe(false);
    expect(await service.validateBackgroundUrl('ftp://example.com/image.png')).toBe(false);
  });

  it('rejects private IPv4 addresses', async () => {
    vi.mocked(dns.resolve).mockResolvedValue(['10.0.0.1']);
    expect(await service.validateBackgroundUrl('http://example.com/img.png')).toBe(false);

    vi.mocked(dns.resolve).mockResolvedValue(['192.168.1.1']);
    expect(await service.validateBackgroundUrl('http://example.com/img.png')).toBe(false);

    vi.mocked(dns.resolve).mockResolvedValue(['127.0.0.1']);
    expect(await service.validateBackgroundUrl('http://example.com/img.png')).toBe(false);
  });

  it('rejects private IPv6 addresses', async () => {
    vi.mocked(dns.resolve).mockResolvedValue(['::1']);
    expect(await service.validateBackgroundUrl('http://example.com/img.png')).toBe(false);

    vi.mocked(dns.resolve).mockResolvedValue(['fd00::1']);
    expect(await service.validateBackgroundUrl('http://example.com/img.png')).toBe(false);
  });

  it('allows public IP addresses', async () => {
    vi.mocked(dns.resolve).mockResolvedValue(['1.1.1.1']);
    expect(await service.validateBackgroundUrl('http://example.com/img.png')).toBe(true);
  });
});
