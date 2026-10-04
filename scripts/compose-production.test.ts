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

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const imageTag = /^ghcr\.io\/lavalink-devs\/lavalink:(4\.\d+\.\d+)$/;

describe('Lavalink image pin', () => {
  const hostCompose = parse(read('../deploy/lavalink/docker-compose.yml')) as {
    services: Record<string, ComposeService & { image: string }>;
  };
  const mainImage = (services.lavalink as { image?: string }).image ?? '';

  it('pins one exact 4.x release, not a floating tag', () => {
    expect(mainImage).toMatch(imageTag);
  });

  it.each(['lavalink-production', 'lavalink-staging'])('runs %s on the same tag', (name) => {
    expect(hostCompose.services[name]!.image).toBe(mainImage);
  });
});

describe('docker-compose.remote-lavalink.yml', () => {
  const text = read('../docker-compose.remote-lavalink.yml');
  // The yaml package does not know Compose's `!override` tag, so check it in the text and drop it
  // before parsing.
  const override = parse(text.replace(/ !override$/gm, '')) as {
    services: Record<string, Record<string, unknown>>;
  };

  it('replaces the bot dependencies instead of merging them', () => {
    expect(text).toMatch(/^ {4}depends_on: !override$/m);
    expect(override.services.bot!.depends_on).toEqual({
      postgres: { condition: 'service_healthy' },
    });
  });

  it('keeps the bundled lavalink behind a profile that is never enabled', () => {
    expect(override.services.lavalink).toEqual({ profiles: ['bundled-lavalink'] });
  });

  it('points the bot at the remote node and requires LAVALINK_HOST', () => {
    expect(override.services.bot!.environment).toEqual({
      LAVALINK_HOST: '${LAVALINK_HOST:?set LAVALINK_HOST}',
      LAVALINK_PORT: '${LAVALINK_PORT:-2333}',
    });
  });

  it('overrides nothing else', () => {
    expect(Object.keys(override.services).sort()).toEqual(['bot', 'lavalink']);
    expect(Object.keys(override.services.bot!).sort()).toEqual(['depends_on', 'environment']);
  });

  it('is documented in the env example and the deployment guide', () => {
    expect(envExample).toMatch(/^# LAVALINK_HOST=/m);
    expect(read('../docs/deployment.md')).toContain('docker-compose.remote-lavalink.yml');
  });
});

describe('deploy/lavalink/docker-compose.yml', () => {
  type HostService = ComposeService & {
    network_mode?: string;
    restart?: string;
    env_file?: string;
    volumes?: string[];
  };
  const host = parse(read('../deploy/lavalink/docker-compose.yml')) as {
    name: string;
    services: Record<string, HostService>;
    volumes: Record<string, unknown>;
  };
  const instances = [
    {
      name: 'lavalink-production',
      port: '2333',
      envFile: '${LAVALINK_PRODUCTION_ENV_FILE:-/opt/ririko/lavalink-production.env}',
      heap: '-Xmx${LAVALINK_PRODUCTION_HEAP:-1536m}',
      volume: 'lavalink_production_plugins',
    },
    {
      name: 'lavalink-staging',
      port: '2334',
      envFile: '${LAVALINK_STAGING_ENV_FILE:-/opt/ririko/lavalink-staging.env}',
      heap: '-Xmx${LAVALINK_STAGING_HEAP:-512m}',
      volume: 'lavalink_staging_plugins',
    },
  ];

  it('is the ririko-lavalink project with one service per environment', () => {
    expect(host.name).toBe('ririko-lavalink');
    expect(Object.keys(host.services).sort()).toEqual(['lavalink-production', 'lavalink-staging']);
  });

  it.each(instances)('configures $name', ({ name, port, envFile, heap, volume }) => {
    const service = host.services[name]!;
    expect(service.network_mode).toBe('host');
    expect(service.env_file).toBe(envFile);
    expect(service.environment).toEqual({
      SERVER_ADDRESS: '${WG_ADDRESS:?set WG_ADDRESS}',
      SERVER_PORT: port,
      _JAVA_OPTIONS: heap,
    });
    expect(service.volumes).toEqual([
      '../../docker/lavalink/application.yml:/opt/Lavalink/application.yml:ro',
      `${volume}:/opt/Lavalink/plugins`,
    ]);
    expect(service.restart).toBe('unless-stopped');
    expect(service.security_opt).toEqual(['no-new-privileges:true']);
    expect(service.logging).toEqual({
      driver: 'local',
      options: { 'max-size': '20m', 'max-file': '5' },
    });
    expect(service.ports).toBeUndefined();
    expect(host.volumes).toHaveProperty(volume);
  });

  it('lists the per-instance variables in lavalink.env.example', () => {
    const env = read('../deploy/lavalink/lavalink.env.example');
    for (const key of [
      'LAVALINK_PASSWORD',
      'SPOTIFY_CLIENT_ID',
      'SPOTIFY_CLIENT_SECRET',
      'SPOTIFY_SP_DC',
    ]) {
      expect(env).toMatch(new RegExp(`^${key}=`, 'm'));
    }
  });
});
