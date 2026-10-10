import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// The deploy half of the tag-driven release workflow (.circleci/config.yml, docs/release.md):
// release -> deploy-lavalink-staging -> deploy-staging -> approve-production ->
// deploy-lavalink-production -> deploy-production.

interface Filters {
  tags?: { only?: string };
  branches?: { ignore?: string };
}
interface WorkflowJob {
  name?: string;
  type?: string;
  context?: string;
  requires?: string[];
  environment?: string;
  host?: string;
  filters?: Filters;
}
interface Step {
  run?: { name: string; command: string; environment?: Record<string, string> };
  'ssh-host'?: { remote_command: string };
}
interface Config {
  commands: Record<string, { steps: Step[] }>;
  jobs: Record<
    string,
    {
      steps: Step[];
      environment?: Record<string, string>;
      parameters?: Record<string, { type: string; enum?: string[]; default?: string }>;
    }
  >;
  workflows: Record<string, { jobs: Array<string | Record<string, WorkflowJob | null>> }>;
}

const source = readFileSync(new URL('../.circleci/config.yml', import.meta.url), 'utf8');
const config = parse(source) as Config;

/** The jobs of a workflow by the name a `requires` list uses, with the CircleCI job they call. */
function workflowJobs(workflow: string): Record<string, WorkflowJob & { job: string }> {
  const result: Record<string, WorkflowJob & { job: string }> = {};
  for (const entry of config.workflows[workflow]?.jobs ?? []) {
    const [job, options] = typeof entry === 'string' ? [entry, null] : Object.entries(entry)[0]!;
    result[options?.name ?? job] = { ...options, job };
  }
  return result;
}

const sshSteps = config.commands['ssh-host']?.steps ?? [];
const sshStep = (name: string) => sshSteps.find((entry) => entry.run?.name === name)?.run;
const remoteCommand =
  config.jobs['deploy']?.steps.find((entry) => entry['ssh-host'])?.['ssh-host']?.remote_command ??
  '';

const release = workflowJobs('release');
const filterOf = (name: string) =>
  new RegExp(release[name]?.filters?.tags?.only?.slice(1, -1) ?? '');

describe('release workflow order', () => {
  it('runs release, the Lavalink node, the app host, approval, then the same for production', () => {
    expect(Object.keys(release)).toEqual([
      'release',
      'deploy-lavalink-staging',
      'deploy-staging',
      'approve-production',
      'deploy-lavalink-production',
      'deploy-production',
    ]);
    expect(release['release']?.requires).toBeUndefined();
    expect(release['deploy-lavalink-staging']?.requires).toEqual(['release']);
    expect(release['deploy-staging']?.requires).toEqual(['deploy-lavalink-staging']);
    expect(release['approve-production']?.requires).toEqual(['deploy-staging']);
    expect(release['deploy-lavalink-production']?.requires).toEqual(['approve-production']);
    expect(release['deploy-production']?.requires).toEqual(['deploy-lavalink-production']);
  });

  it('deploys every host with the same parameterized job', () => {
    for (const name of [
      'deploy-lavalink-staging',
      'deploy-staging',
      'deploy-lavalink-production',
      'deploy-production',
    ]) {
      expect(release[name]?.job, name).toBe('deploy');
    }
    expect(release['deploy-staging']?.environment).toBe('staging');
    expect(release['deploy-production']?.environment).toBe('production');
    expect(release['deploy-lavalink-staging']?.environment).toBe('staging');
    expect(release['deploy-lavalink-production']?.environment).toBe('production');
    expect(release['deploy-lavalink-staging']?.host).toBe('lavalink');
    expect(release['deploy-lavalink-production']?.host).toBe('lavalink');
    // The app jobs keep the default host, so they did not change.
    expect(release['deploy-staging']?.host).toBeUndefined();
    expect(release['deploy-production']?.host).toBeUndefined();
    expect(config.jobs['deploy']?.parameters?.['environment']).toMatchObject({
      type: 'enum',
      enum: ['staging', 'production'],
    });
    expect(config.jobs['deploy']?.parameters?.['host']).toMatchObject({
      type: 'enum',
      enum: ['app', 'lavalink'],
      default: 'app',
    });
  });

  it('uses one context per host and none on the approval', () => {
    expect(release['release']?.context).toBe('dockerhub');
    expect(release['deploy-staging']?.context).toBe('deploy-staging');
    expect(release['deploy-production']?.context).toBe('deploy-production');
    expect(release['deploy-lavalink-staging']?.context).toBe('deploy-lavalink-staging');
    expect(release['deploy-lavalink-production']?.context).toBe('deploy-lavalink-production');
    expect(release['approve-production']?.type).toBe('approval');
    expect(release['approve-production']?.context).toBeUndefined();
  });

  it('keeps a tag filter and ignores every branch on every job', () => {
    for (const [name, job] of Object.entries(release)) {
      expect(job.filters?.tags?.only, name).toMatch(/^\/\^v.+\$\/$/);
      expect(job.filters?.branches?.ignore, name).toBe('/.*/');
    }
  });

  it('sends a prerelease to staging only and a final release through approval', () => {
    const prerelease = 'v2.1.3-rc.1';
    for (const name of ['release', 'deploy-lavalink-staging', 'deploy-staging']) {
      expect(filterOf(name).test(prerelease), name).toBe(true);
    }
    for (const name of ['approve-production', 'deploy-lavalink-production', 'deploy-production']) {
      expect(filterOf(name).test(prerelease), name).toBe(false);
      expect(filterOf(name).test('v2.1.3'), name).toBe(true);
      expect(filterOf(name).test('v2.1'), name).toBe(false);
      expect(filterOf(name).test('v2.1.3-'), name).toBe(false);
    }
    for (const name of ['deploy-lavalink-staging', 'deploy-staging']) {
      expect(filterOf(name).test('v2.1.3'), name).toBe(true);
      expect(filterOf(name).test('main'), name).toBe(false);
    }
  });

  it('leaves the ci workflow without deploy jobs', () => {
    expect(Object.keys(workflowJobs('ci'))).toEqual([
      'lint',
      'typecheck',
      'test',
      'test-postgres',
      'build-web',
      'e2e',
      'docker',
      'secrets',
    ]);
    expect(Object.keys(config.workflows).sort()).toEqual(['ci', 'release']);
    for (const job of Object.values(workflowJobs('ci'))) {
      expect(job.filters).toBeUndefined();
      expect(job.context).toBeUndefined();
    }
  });
});

describe('migration gates', () => {
  const steps = (job: string) => config.jobs[job]?.steps.map((entry) => entry.run) ?? [];
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    scripts: Record<string, string>;
  };

  it('runs pnpm db:check in the lint job, after setup', () => {
    const check = steps('lint').find((step) => step?.command === 'pnpm db:check');
    expect(check?.name).toBe('Migrations');
    expect(config.jobs['lint']?.steps[0]).toBe('setup');
    expect(pkg.scripts['db:check']).toBe('tsx scripts/check-migrations.ts');
  });

  it('runs the PostgreSQL migration tests in test-postgres', () => {
    const command = steps('test-postgres').find(
      (step) => step?.name === 'Vitest on Postgres',
    )?.command;
    expect(command).toBe('pnpm test:postgres');
    // The script covers packages/database/src, which holds the runner, adoption and baseline tests.
    expect(pkg.scripts['test:postgres']).toContain('packages/database/src');
    const docker = (config.jobs['test-postgres'] as { docker?: Array<{ environment?: object }> })
      .docker;
    expect(docker?.[0]?.environment).toHaveProperty('TEST_POSTGRES_URL');
    for (const file of ['runner', 'adopt-baseline', 'generated']) {
      const text = readFileSync(
        new URL(`../packages/database/src/migrations/${file}.test.ts`, import.meta.url),
        'utf8',
      );
      expect(text, file).toContain('TEST_POSTGRES_URL');
    }
  });

  it('runs lint and test-postgres in the ci workflow on every push', () => {
    const ci = workflowJobs('ci');
    expect(ci['lint']?.filters).toBeUndefined();
    expect(ci['test-postgres']?.filters).toBeUndefined();
  });
});

describe('deploy job', () => {
  const install = sshStep('Install cloudflared');
  const writeKey = sshStep('Write the SSH key and the pinned host key');
  const connect = sshStep('Run on the host');

  it('sends "deploy <version>" from the git tag to the host', () => {
    // The same command goes to both kinds of host: the Lavalink host's CI key is forced to the
    // instance of its environment, so the instance never travels in the command.
    expect(remoteCommand).toBe('deploy ${CIRCLE_TAG#v}');
    expect(connect?.command).toContain('"deploy@${DEPLOY_SSH_HOST}"');
    expect(connect?.command).toContain('"<< parameters.remote_command >>"');
  });

  it('installs a pinned cloudflared and checks its sha256 before dpkg', () => {
    expect(install?.environment?.['CLOUDFLARED_VERSION']).toMatch(/^\d{4}\.\d+\.\d+$/);
    expect(install?.environment?.['CLOUDFLARED_SHA256']).toMatch(/^[0-9a-f]{64}$/);
    const command = install?.command ?? '';
    expect(command).toContain(
      'releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-amd64.deb',
    );
    expect(command.indexOf('sha256sum --check')).toBeGreaterThan(command.indexOf('curl'));
    expect(command.indexOf('dpkg -i')).toBeGreaterThan(command.indexOf('sha256sum --check'));
    expect(command).not.toMatch(/\|\s*(ba)?sh\b/);
  });

  it('writes the key and known_hosts with 0600 under umask 077', () => {
    const command = writeKey?.command ?? '';
    expect(command).toContain('umask 077');
    expect(command).toContain('base64 -d > ~/.ssh/deploy_key');
    expect(command).toContain('"$DEPLOY_KNOWN_HOSTS"');
    expect(command).toContain('chmod 600 ~/.ssh/deploy_key ~/.ssh/known_hosts');
  });

  it('pins the host key and the identity and goes through cloudflared access', () => {
    const command = connect?.command ?? '';
    for (const option of [
      '-o StrictHostKeyChecking=yes',
      '-o IdentitiesOnly=yes',
      '-o BatchMode=yes',
      '-o ProxyCommand="cloudflared access ssh --hostname %h"',
      '-i ~/.ssh/deploy_key',
      'exit "$status"',
    ]) {
      expect(command, option).toContain(option);
    }
  });

  it('keeps the service token out of every command line and out of the file', () => {
    expect(source).not.toMatch(/--service-token/);
    expect(source).not.toMatch(/-----BEGIN|ssh-ed25519 AAAA|ssh-rsa AAAA/);
    // Both names appear only in the "is it set" checks; cloudflared reads them from its own
    // environment, which ssh passes to the ProxyCommand.
    const uses = source.split('\n').filter((line) => /TUNNEL_SERVICE_TOKEN/.test(line));
    for (const line of uses) {
      expect(line, line).toMatch(/\$\{TUNNEL_SERVICE_TOKEN_(ID|SECRET):\?|^\s+#/);
    }
  });

  it('declares no secret value in any job or command environment', () => {
    const maps = [
      ...Object.values(config.jobs).flatMap((job) => [
        job.environment,
        ...job.steps.map((entry) => entry.run?.environment),
      ]),
      ...Object.values(config.commands).flatMap((command) =>
        command.steps.map((entry) => entry.run?.environment),
      ),
    ];
    const names = maps.flatMap((map) => Object.keys(map ?? {}));
    expect(names).toContain('CLOUDFLARED_SHA256');
    for (const name of names) {
      expect(name, name).not.toMatch(/TOKEN|SECRET|PASSWORD|KEY|KNOWN_HOSTS|SSH_HOST/i);
    }
  });
});

// The scripts are fed through bash's stdin with fake `ssh`, so the test needs no network and no
// platform-specific paths (Git Bash, WSL and Linux bash all read it the same way).
const hasBash = spawnSync('bash', ['-c', 'exit 0']).status === 0;
const connectScript = (sshStep('Run on the host')?.command ?? '').replace(
  '<< parameters.remote_command >>',
  remoteCommand,
);
const keyScript = sshStep('Write the SSH key and the pinned host key')?.command ?? '';

function runBash(script: string) {
  return spawnSync('bash', ['-s'], { input: script, encoding: 'utf8' });
}

describe.skipIf(!hasBash)('the ssh steps', () => {
  const harness = (body: string, status: number) => `
set -eo pipefail
tmp=$(mktemp -d)
mkdir -p "$tmp/bin" "$tmp/home"
export HOME="$tmp/home" PATH="$tmp/bin:$PATH"
cat > "$tmp/bin/ssh" <<'FAKE_SSH'
#!/bin/bash
printf '%s\\n' "$@" > "$HOME/argv"
if [ -n "\${TUNNEL_SERVICE_TOKEN_SECRET:-}" ]; then echo set > "$HOME/token-in-env"; fi
exit ${status}
FAKE_SSH
chmod +x "$tmp/bin/ssh"
cat > "$tmp/script.sh" <<'SCRIPT_UNDER_TEST'
${body}
SCRIPT_UNDER_TEST
export CIRCLE_TAG=v2.1.3 DEPLOY_SSH_HOST=ssh-staging.example.test
export TUNNEL_SERVICE_TOKEN_ID=id-value TUNNEL_SERVICE_TOKEN_SECRET=secret-value-9f3c
set +e
bash -eo pipefail "$tmp/script.sh" > "$tmp/out" 2>&1
code=$?
echo "code=$code"
echo "argv<<"; cat "$HOME/argv" 2>/dev/null || true; echo ">>"
echo "token-in-env=$(cat "$HOME/token-in-env" 2>/dev/null || echo no)"
echo "out<<"; cat "$tmp/out"; echo ">>"
rm -rf "$tmp"
`;

  it.each([
    [0, 'The host command succeeded'],
    [2, 'rejected the command'],
    [3, 'holds its lock'],
    [4, 'started the previous release again'],
    [5, 'no previous release'],
    [255, 'could not connect'],
    [7, 'failed with status 7'],
  ])('fails with the host exit status %i', (status, message) => {
    const result = runBash(harness(connectScript, status));
    expect(result.stdout).toContain(`code=${status}\n`);
    expect(result.stdout).toContain(message);
  });

  it('runs ssh with the pinned options, the tag version and the token only in the environment', () => {
    const { stdout } = runBash(harness(connectScript, 0));
    const argv = /argv<<\n([\s\S]*?)>>/.exec(stdout)?.[1]?.split('\n') ?? [];
    expect(argv).toEqual(
      expect.arrayContaining([
        'StrictHostKeyChecking=yes',
        'IdentitiesOnly=yes',
        'ProxyCommand=cloudflared access ssh --hostname %h',
        'deploy@ssh-staging.example.test',
        'deploy 2.1.3',
      ]),
    );
    // The last two arguments are the destination and the one remote command; the file ends in a newline.
    expect(argv.slice(-3)).toEqual(['deploy@ssh-staging.example.test', 'deploy 2.1.3', '']);
    expect(stdout).toContain('token-in-env=set');
    expect(argv.join('\n')).not.toContain('secret-value-9f3c');
    expect(argv.join('\n')).not.toContain('id-value');
  });

  it('writes the key and the host key, and refuses to run without the context variables', () => {
    const ok = runBash(`
set -eo pipefail
tmp=$(mktemp -d); export HOME="$tmp"
export DEPLOY_SSH_HOST=h DEPLOY_KNOWN_HOSTS='h ssh-ed25519 AAAAexample'
export DEPLOY_SSH_KEY_B64=$(printf 'KEYLINE1\\nKEYLINE2\\n' | base64 -w0 2>/dev/null || printf 'KEYLINE1\\nKEYLINE2\\n' | base64)
export TUNNEL_SERVICE_TOKEN_ID=i TUNNEL_SERVICE_TOKEN_SECRET=s
cat > "$tmp/s.sh" <<'SCRIPT_UNDER_TEST'
${keyScript}
SCRIPT_UNDER_TEST
bash -eo pipefail "$tmp/s.sh"
cat "$HOME/.ssh/deploy_key"; cat "$HOME/.ssh/known_hosts"
rm -rf "$tmp"
`);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toBe('KEYLINE1\nKEYLINE2\nh ssh-ed25519 AAAAexample\n');

    const missing = runBash(`
tmp=$(mktemp -d); export HOME="$tmp"
export DEPLOY_SSH_HOST=h DEPLOY_SSH_KEY_B64=a TUNNEL_SERVICE_TOKEN_ID=i
cat > "$tmp/s.sh" <<'SCRIPT_UNDER_TEST'
${keyScript}
SCRIPT_UNDER_TEST
bash -eo pipefail "$tmp/s.sh"
code=$?
echo "code=$code"
rm -rf "$tmp"
`);
    expect(missing.stdout).toContain('code=1');
    expect(missing.stderr).toContain('DEPLOY_KNOWN_HOSTS is missing');
  });
});

describe('docs/release.md deploy section', () => {
  const docs = readFileSync(new URL('../docs/release.md', import.meta.url), 'utf8');

  it('documents the contexts, their variables and the approval restriction', () => {
    for (const text of [
      'deploy-staging',
      'deploy-production',
      'deploy-lavalink-staging',
      'deploy-lavalink-production',
      'DEPLOY_SSH_HOST',
      'DEPLOY_SSH_KEY_B64',
      'DEPLOY_KNOWN_HOSTS',
      'TUNNEL_SERVICE_TOKEN_ID',
      'TUNNEL_SERVICE_TOKEN_SECRET',
      'security group',
      'approve-production',
    ]) {
      expect(docs, text).toContain(text);
    }
  });

  it('explains host exit codes 3, 4 and 5', () => {
    for (const code of [3, 4, 5]) {
      expect(docs, `exit ${code}`).toMatch(new RegExp(`\\|\\s*${code}\\s*\\|`));
    }
  });
});
