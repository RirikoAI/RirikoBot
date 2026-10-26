import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface ComposeService {
  image?: string;
  user?: string;
  entrypoint?: string[];
  restart?: string;
  network_mode?: string;
  cap_add?: string[];
  volumes?: string[];
  depends_on?: Record<string, { condition?: string }>;
  ports?: string[];
  cap_drop?: string[];
  security_opt?: string[];
  logging?: { driver?: string; options?: Record<string, string> };
  environment?: Record<string, string>;
  configs?: { source: string; target?: string }[];
}

const compose = parse(
  readFileSync(new URL('../docker-compose.production.yml', import.meta.url), 'utf8'),
) as { services: Record<string, ComposeService> };
const envExample = readFileSync(new URL('../.env.production.example', import.meta.url), 'utf8');
const services = compose.services;
const names = ['postgres', 'lavalink', 'bot', 'web'] as const;

describe('docker-compose.production.yml hardening', () => {
  it('runs exactly the four expected services and the Lavalink init service', () => {
    expect(Object.keys(services).sort()).toEqual([...names, 'lavalink-plugins'].sort());
  });

  it('publishes the dashboard on loopback unless DASHBOARD_BIND says otherwise', () => {
    expect(services.web!.ports).toEqual([
      '${DASHBOARD_BIND:-127.0.0.1}:${DASHBOARD_PORT:-3000}:3000',
    ]);
    expect(envExample).toMatch(/^# DASHBOARD_BIND=127\.0\.0\.1$/m);
    expect(envExample).toMatch(/0\.0\.0\.0 only on a host whose own\s+# firewall or reverse proxy/);
  });

  it('migrates on start by default for self-hosters, and never from the dashboard', () => {
    expect(services.bot!.environment!.DB_AUTO_MIGRATE).toBe('${DB_AUTO_MIGRATE:-true}');
    expect(services.web!.environment!.DB_AUTO_MIGRATE).toBeUndefined();
    expect(envExample).toMatch(/^# DB_AUTO_MIGRATE=true$/m);
    expect(envExample).toContain('ririko-deploy');
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
    expect(envExample).toContain('512m on a small host');
  });
});

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const imageTag = /^ghcr\.io\/lavalink-devs\/lavalink:(4\.\d+\.\d+)$/;

describe('Lavalink image pin', () => {
  const hostCompose = parse(read('../deploy/lavalink/docker-compose.yml'), { merge: true }) as {
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
    expect(Object.keys(override.services).sort()).toEqual(['bot', 'lavalink', 'lavalink-plugins']);
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
  const host = parse(read('../deploy/lavalink/docker-compose.yml'), { merge: true }) as {
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

  it('is the ririko-lavalink project with a service and an init service per environment', () => {
    expect(host.name).toBe('ririko-lavalink');
    expect(Object.keys(host.services).sort()).toEqual([
      'lavalink-production',
      'lavalink-production-plugins',
      'lavalink-staging',
      'lavalink-staging-plugins',
    ]);
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

describe('Lavalink plugin volume ownership (BUG-0036)', () => {
  // The image runs as uid/gid 322 and has no plugins directory, so Docker creates the named volume
  // owned by root and Lavalink cannot write its plugins. A one-shot init service fixes the owner.
  const pluginsPath = '/opt/Lavalink/plugins';
  const hostCompose = parse(read('../deploy/lavalink/docker-compose.yml'), { merge: true }) as {
    services: Record<string, ComposeService>;
    volumes: Record<string, unknown>;
  };
  const override = parse(
    read('../docker-compose.remote-lavalink.yml').replace(/ !override$/gm, ''),
  ) as { services: Record<string, { profiles?: string[] }> };

  const cases = [
    {
      file: 'docker-compose.production.yml',
      all: services,
      lavalink: 'lavalink',
      init: 'lavalink-plugins',
    },
    {
      file: 'deploy/lavalink/docker-compose.yml (production)',
      all: hostCompose.services,
      lavalink: 'lavalink-production',
      init: 'lavalink-production-plugins',
    },
    {
      file: 'deploy/lavalink/docker-compose.yml (staging)',
      all: hostCompose.services,
      lavalink: 'lavalink-staging',
      init: 'lavalink-staging-plugins',
    },
  ];

  const volumeOf = (service: ComposeService) => {
    const mount = (service.volumes ?? []).find((v) => v.endsWith(`:${pluginsPath}`));
    return mount?.slice(0, mount.length - pluginsPath.length - 1);
  };

  it.each(cases)('$file: $lavalink has a plugin volume', ({ all, lavalink }) => {
    expect(volumeOf(all[lavalink]!)).toMatch(/^lavalink_[a-z_]*plugins$/);
  });

  it.each(cases)('$file: $init chowns the same volume as $lavalink', ({ all, lavalink, init }) => {
    const service = all[init]!;
    expect(volumeOf(service)).toBe(volumeOf(all[lavalink]!));
    expect(service.volumes).toHaveLength(1);
    expect(service.entrypoint).toEqual(['chown', '-R', '322:322', pluginsPath]);
  });

  it.each(cases)(
    '$file: $init uses the pinned image and stays minimal',
    ({ all, lavalink, init }) => {
      const service = all[init]!;
      expect(service.image).toBe(all[lavalink]!.image);
      expect(service.image).toMatch(imageTag);
      expect(service.user).toBe('root');
      expect(service.restart).toBe('no');
      expect(service.cap_drop).toEqual(['ALL']);
      expect(service.cap_add).toEqual(['CHOWN']);
      expect(service.security_opt).toEqual(['no-new-privileges:true']);
      expect(service.network_mode).toBe('none');
      expect(service.ports).toBeUndefined();
    },
  );

  it.each(cases)('$file: $lavalink waits for $init to exit 0', ({ all, lavalink, init }) => {
    expect(all[lavalink]!.depends_on).toEqual({
      [init]: { condition: 'service_completed_successfully' },
    });
  });

  it('declares each plugin volume of the Lavalink host and runs nothing else', () => {
    for (const name of ['lavalink-production', 'lavalink-staging']) {
      expect(hostCompose.volumes).toHaveProperty(volumeOf(hostCompose.services[name]!)!);
    }
    expect(Object.keys(hostCompose.services).sort()).toEqual([
      'lavalink-production',
      'lavalink-production-plugins',
      'lavalink-staging',
      'lavalink-staging-plugins',
    ]);
  });

  it('excludes the bundled init service on the remote Lavalink override', () => {
    expect(override.services['lavalink-plugins']).toEqual({ profiles: ['bundled-lavalink'] });
    expect(override.services.lavalink).toEqual({ profiles: ['bundled-lavalink'] });
  });

  it('explains the init service in the deployment guide', () => {
    const doc = read('../docs/deployment.md');
    expect(doc).toContain('lavalink-plugins');
    expect(doc).toContain('uid/gid 322');
    expect(doc).toContain('service_completed_successfully');
  });
});

describe('Java blocklist for Lavalink (BUG-0055)', () => {
  // The Java in the Lavalink image (Temurin 18, end of life) has no fix for the eMudhra CA
  // compromise (CVE-2026-111943). Both compose files replace its lib/security/blocked.certs with the
  // one of Amazon Corretto 17.0.21 and SapMachine 21.0.13.0.2. The content is inline because the
  // hosts get no other file than the compose file (and application.yml). The hash is the proof that
  // it is the vendor's file, so never change it to make this test pass: replace the whole list.
  const vendorSha256 = '2596bb6dda83c66d96c5a252d7b2ae1f24cc1ae3f1890223b4f3591a8d52bf10';
  const target = '/opt/java/openjdk/lib/security/blocked.certs';
  type WithConfigs = {
    services: Record<string, ComposeService>;
    configs?: Record<string, { content?: string }>;
  };
  const cases = [
    {
      file: 'docker-compose.production.yml',
      compose: parse(read('../docker-compose.production.yml'), { merge: true }) as WithConfigs,
      mounted: ['lavalink'],
    },
    {
      file: 'deploy/lavalink/docker-compose.yml',
      compose: parse(read('../deploy/lavalink/docker-compose.yml'), { merge: true }) as WithConfigs,
      mounted: ['lavalink-production', 'lavalink-staging'],
    },
  ];

  it.each(cases)(
    '$file: java-blocked-certs is the vendor blocked.certs, byte for byte',
    ({ compose }) => {
      const content = compose.configs?.['java-blocked-certs']?.content ?? '';
      expect(createHash('sha256').update(content).digest('hex')).toBe(vendorSha256);
      const lines = content.split('\n');
      expect(lines.pop()).toBe('');
      expect(lines).toHaveLength(87);
      expect(lines[0]).toBe('Algorithm=SHA-256');
      expect(lines.slice(1).every((line) => /^[0-9A-F]{64}$/.test(line))).toBe(true);
    },
  );

  it.each(cases)(
    '$file: only the Lavalink service mounts it, at the Java path',
    ({ compose, mounted }) => {
      for (const [name, service] of Object.entries(compose.services)) {
        expect(service.configs, name).toEqual(
          mounted.includes(name) ? [{ source: 'java-blocked-certs', target }] : undefined,
        );
      }
      for (const name of mounted) {
        expect(compose.services[name]).toBeDefined();
      }
    },
  );

  it('is explained in the deployment guide, with the Compose version that inline content needs', () => {
    const doc = read('../docs/deployment.md');
    expect(doc).toContain('blocked.certs');
    expect(doc).toContain('CVE-2026-111943');
    expect(doc).toMatch(/Compose plugin version 2\.24\.4 or newer/);
    expect(read('../README.md')).toMatch(/Compose 2\.24\.4 or newer/);
  });
});
