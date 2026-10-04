import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface ComposeService {
  ports?: string[];
  cap_drop?: string[];
  security_opt?: string[];
  logging?: { driver?: string; options?: Record<string, string> };
  environment?: Record<string, string>;
}

const compose = parse(
  readFileSync(new URL('../docker-compose.production.yml', import.meta.url), 'utf8'),
) as { services: Record<string, ComposeService> };
const envExample = readFileSync(new URL('../.env.production.example', import.meta.url), 'utf8');
const services = compose.services;
const names = ['postgres', 'lavalink', 'bot', 'web'] as const;

describe('docker-compose.production.yml hardening', () => {
  it('runs exactly the four expected services', () => {
    expect(Object.keys(services).sort()).toEqual([...names].sort());
  });

  it('publishes the dashboard on loopback unless DASHBOARD_BIND says otherwise', () => {
    expect(services.web!.ports).toEqual([
      '${DASHBOARD_BIND:-127.0.0.1}:${DASHBOARD_PORT:-3000}:3000',
    ]);
    expect(envExample).toMatch(/^# DASHBOARD_BIND=127\.0\.0\.1$/m);
    expect(envExample).toMatch(/0\.0\.0\.0 only on a host whose own\s+# firewall or reverse proxy/);
  });

  it('drops every capability from the bot and the dashboard', () => {
    expect(services.bot!.cap_drop).toEqual(['ALL']);
    expect(services.web!.cap_drop).toEqual(['ALL']);
  });

  it('keeps the capabilities of postgres and lavalink', () => {
    expect(services.postgres!.cap_drop).toBeUndefined();
    expect(services.lavalink!.cap_drop).toBeUndefined();
  });

  it.each(names)('forbids privilege escalation in %s', (name) => {
    expect(services[name]!.security_opt).toEqual(['no-new-privileges:true']);
  });

  it.each(names)('rotates the logs of %s', (name) => {
    expect(services[name]!.logging).toEqual({
      driver: 'local',
      options: { 'max-size': '20m', 'max-file': '5' },
    });
  });

  it('reads the Lavalink heap from LAVALINK_HEAP', () => {
    expect(services.lavalink!.environment!._JAVA_OPTIONS).toBe('-Xmx${LAVALINK_HEAP:-1G}');
    expect(envExample).toMatch(/^# LAVALINK_HEAP=1G$/m);
    expect(envExample).toContain('512m on a 4 GB host');
  });
});
