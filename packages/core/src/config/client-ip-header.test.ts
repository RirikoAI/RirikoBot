import { describe, expect, it } from 'vitest';
import { ClientIpHeaderSchema, WebConfigSchema } from './schema.js';

const WEB_ENV = {
  DISCORD_TOKEN: 'token',
  DISCORD_CLIENT_ID: '100000000000000001',
  DISCORD_CLIENT_SECRET: 'secret',
  DASHBOARD_URL: 'https://dashboard.example.com',
  SECRET_VAULT_KEY: '0'.repeat(63) + '1',
};

describe('ClientIpHeaderSchema', () => {
  it('trims and lower-cases a header name', () => {
    expect(ClientIpHeaderSchema.parse('  CF-Connecting-IP ')).toBe('cf-connecting-ip');
  });

  it('treats unset and blank values as not configured', () => {
    expect(ClientIpHeaderSchema.parse(undefined)).toBeUndefined();
    expect(ClientIpHeaderSchema.parse('')).toBeUndefined();
    expect(ClientIpHeaderSchema.parse('   ')).toBeUndefined();
  });

  it.each(['cf connecting ip', 'cf_connecting_ip', 'x-ip:1', 'ip,other'])('rejects %j', (value) => {
    expect(ClientIpHeaderSchema.safeParse(value).success).toBe(false);
  });
});

describe('WebConfigSchema CLIENT_IP_HEADER', () => {
  it('leaves the header unset by default', () => {
    expect(WebConfigSchema.parse(WEB_ENV).CLIENT_IP_HEADER).toBeUndefined();
  });

  it('accepts a header name and normalises it', () => {
    const config = WebConfigSchema.parse({ ...WEB_ENV, CLIENT_IP_HEADER: 'CF-Connecting-IP' });
    expect(config.CLIENT_IP_HEADER).toBe('cf-connecting-ip');
  });

  it('stops startup on a malformed value', () => {
    const result = WebConfigSchema.safeParse({ ...WEB_ENV, CLIENT_IP_HEADER: 'has spaces' });
    expect(result.success).toBe(false);
  });
});
