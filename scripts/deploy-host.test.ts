import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const hostDir = fileURLToPath(new URL('../deploy/host/', import.meta.url));
const files = readdirSync(hostDir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(hostDir, join(entry.parentPath, entry.name)).split(sep).join('/'))
  .sort();
const scripts = files.filter((entry) => entry.endsWith('.sh'));
const read = (entry: string) => readFileSync(join(hostDir, entry), 'utf8');

// The script is fed through stdin, so the test does not depend on how this platform maps paths
// (Git Bash, WSL and Linux bash all read it the same way).
const hasBash = spawnSync('bash', ['-c', 'exit 0']).status === 0;
const runBash = (args: string[], script: string) =>
  spawnSync('bash', ['-s', '--', ...args], { input: script, encoding: 'utf8' });

describe('deploy/host files', () => {
  it('has the bootstrap script and its static files', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'bootstrap.sh',
        'ririko.conf.example',
        'files/daemon.json',
        'files/sshd-10-ririko.conf',
        'files/sudoers-ririko-deploy',
        'files/apt-20auto-upgrades',
        'files/apt-52ririko-unattended-upgrades',
      ]),
    );
  });

  it('uses LF line endings only (a CR breaks bash and sudoers)', () => {
    const crlf = files.filter((entry) => read(entry).includes('\r'));
    expect(crlf).toEqual([]);
  });

  it.skipIf(!hasBash)('passes bash -n for every .sh file', () => {
    expect(scripts).toContain('bootstrap.sh');
    for (const entry of scripts) {
      const result = spawnSync('bash', ['-n'], { input: read(entry), encoding: 'utf8' });
      expect({ entry, status: result.status, stderr: result.stderr }).toEqual({
        entry,
        status: 0,
        stderr: '',
      });
    }
  });
});

describe('static host configuration', () => {
  it('configures Docker logging and live restore', () => {
    expect(JSON.parse(read('files/daemon.json'))).toEqual({
      'log-driver': 'local',
      'log-opts': { 'max-size': '20m', 'max-file': '5' },
      'live-restore': true,
    });
  });

  it('hardens sshd and lets only ubuntu and deploy in', () => {
    const directives = read('files/sshd-10-ririko.conf')
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'));
    expect(directives).toEqual([
      'PasswordAuthentication no',
      'KbdInteractiveAuthentication no',
      'PermitRootLogin no',
      'AllowUsers ubuntu deploy',
    ]);
  });

  it('lets deploy run only ririko-deploy as root without a password', () => {
    const rules = read('files/sudoers-ririko-deploy')
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'));
    expect(rules).toEqual(['deploy ALL=(root) NOPASSWD: /usr/local/bin/ririko-deploy']);
  });

  it('enables security upgrades with a 20:00 UTC reboot (04:00 local time of the operator)', () => {
    expect(read('files/apt-20auto-upgrades')).toMatch(/Update-Package-Lists "1";/);
    expect(read('files/apt-20auto-upgrades')).toMatch(/Unattended-Upgrade "1";/);
    const override = read('files/apt-52ririko-unattended-upgrades');
    expect(override).toMatch(/Automatic-Reboot "true";/);
    expect(override).toMatch(/Automatic-Reboot-Time "20:00";/);
  });

  it('writes the deploy key with a forced command and the pinned layout', () => {
    const bootstrap = read('bootstrap.sh');
    expect(bootstrap).toContain('restrict,command="/usr/local/bin/ririko-deploy-ssh"');
    for (const path of ['releases', 'state', 'backups/predeploy', 'backups/nightly']) {
      expect(bootstrap).toContain(`/opt/ririko/${path}`);
    }
  });
});

describe.skipIf(!hasBash)('bootstrap.sh arguments', () => {
  const bootstrap = hasBash ? read('bootstrap.sh') : '';

  it('prints usage and exits 0 without root', () => {
    const result = runBash(['--help'], bootstrap);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--ref');
    expect(result.stdout).toContain('--deploy-key');
    expect(result.stdout).toContain('--tunnel-token-file');
  });

  it('prints usage for -h as well', () => {
    expect(runBash(['-h'], bootstrap).status).toBe(0);
  });

  it.each([
    ['no arguments', [], '--ref is required'],
    ['an unknown option', ['--ref', 'v2.0.0', '--force'], 'unknown option'],
    ['a ref with a space', ['--ref', 'v2 0'], 'invalid --ref'],
    ['a ref that climbs a directory', ['--ref', 'a/../b'], 'invalid --ref'],
    ['a missing value', ['--ref'], '--ref needs a value'],
    [
      'a deploy key that is not a public key',
      ['--ref', 'v2.0.0', '--deploy-key', 'ssh-ed25519 AAAA"; rm -rf /'],
      'not a single-line SSH public key',
    ],
    [
      'a deploy key with a second line',
      ['--ref', 'v2.0.0', '--deploy-key', 'ssh-ed25519 AAAA\nssh-rsa BBBB'],
      'not a single-line SSH public key',
    ],
    [
      'a token file that does not exist',
      ['--ref', 'v2.0.0', '--tunnel-token-file', '/nonexistent/ririko-token'],
      'no such file',
    ],
  ])('exits 2 for %s before it needs root', (_name, args, message) => {
    const result = runBash(args, bootstrap);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(message);
  });
});

// Only GNU tar takes --wildcards (bsdtar, the Windows tar.exe, does not); the script runs on Ubuntu.
const hasGnuTar =
  hasBash && spawnSync('bash', ['-c', 'tar --help 2>&1 | grep -q -- --wildcards']).status === 0;

describe.skipIf(!hasGnuTar)(
  'bootstrap.sh extract_deploy_host (skipped where tar lacks --wildcards, for example bsdtar)',
  () => {
    // Runs the function exactly as it is written in bootstrap.sh, on a small archive laid out like
    // a codeload download, with no root and no network. The archive is built inside the bash
    // process, so no path crosses between Node and a bash that may live in WSL.
    const extractFunction = /^extract_deploy_host\(\) \{\n[\s\S]*?^\}$/m.exec(
      hasBash ? read('bootstrap.sh') : '',
    )?.[0];

    const extract = (archiveEntries: string[]) =>
      runBash(
        [],
        `set -euo pipefail
die() { printf '%s\\n' "$*" >&2; exit 1; }
REF=test-ref
${extractFunction}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
top="$work/RirikoBot-abc123"
for entry in ${archiveEntries.map((entry) => `'${entry}'`).join(' ')}; do
  mkdir -p "$top/$(dirname "$entry")"
  printf 'x\\n' >"$top/$entry"
done
tar -czf "$work/release.tar.gz" -C "$work" RirikoBot-abc123
mkdir "$work/out"
extract_deploy_host "$work/release.tar.gz" "$work/out"
cd "$work/out"
find . -type f | sort
`,
      );

    it('finds the function in bootstrap.sh', () => {
      expect(extractFunction).toContain('--wildcards');
    });

    it('extracts deploy/host with its files and bin, and nothing else', () => {
      const result = extract([
        'deploy/host/bootstrap.sh',
        'deploy/host/files/daemon.json',
        'deploy/host/bin/ririko-deploy.sh',
        'deploy/host/systemd/ririko-backup.timer',
        'deploy/lavalink/docker-compose.yml',
        'README.md',
      ]);
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      expect(result.stdout.trim().split('\n')).toEqual([
        './deploy/host/bin/ririko-deploy.sh',
        './deploy/host/bootstrap.sh',
        './deploy/host/files/daemon.json',
        './deploy/host/systemd/ririko-backup.timer',
      ]);
    });

    it('dies with the deploy/host message when the ref has no deploy/host directory', () => {
      const result = extract(['README.md', 'deploy/lavalink/docker-compose.yml']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('test-ref has no deploy/host directory');
    });
  },
);

describe('repository wiring', () => {
  it('forces LF for deploy/host in .gitattributes', () => {
    const attributes = readFileSync(new URL('../.gitattributes', import.meta.url), 'utf8');
    expect(attributes).toMatch(/^deploy\/host\/\*\* text eol=lf\s*$/m);
  });

  it('runs ShellCheck on every deploy/host script in the CircleCI lint job', () => {
    const config = readFileSync(new URL('../.circleci/config.yml', import.meta.url), 'utf8');
    const lint = /^ {2}lint:\r?\n([\s\S]*?)(?=^ {2}\S)/m.exec(config)?.[1] ?? '';
    expect(lint).toMatch(/apt-get install .*shellcheck/);
    expect(lint).toMatch(/find deploy\/host -name '\*\.sh' .*shellcheck/);
  });
});

// --- ririko-deploy and ririko-deploy-ssh --------------------------------------------------------
// Each scenario is one bash script fed through stdin: it writes the scripts under test and fake
// docker, curl and sudo executables into a temporary directory (inside bash, so the paths are
// valid whichever bash runs it), runs the scenario and prints the observable results in sections.

const hasFlock = hasBash && spawnSync('bash', ['-c', 'command -v flock']).status === 0;
const heredocEnd = '__RIRIKO_TEST_EOF__';

const fakeDocker = `#!/usr/bin/env bash
echo "RIRIKO_VERSION=$RIRIKO_VERSION RIRIKO_ENV_FILE=$RIRIKO_ENV_FILE DB_AUTO_MIGRATE=$DB_AUTO_MIGRATE docker $*" >>"$FAKE_DIR/docker.log"
sub=""
skip=0
for arg in "$@"; do
  if [ $skip = 1 ]; then skip=0; continue; fi
  case $arg in
    compose) ;;
    -p|-f|--env-file) skip=1 ;;
    *) sub=$arg; break ;;
  esac
done
args=" $* "
bad() {
  for v in $(cat "$FAKE_DIR/$1" 2>/dev/null); do
    if [ "$v" = "$RIRIKO_VERSION" ]; then return 0; fi
  done
  return 1
}
case $sub in
  ps)
    case $args in
      *" --services "*) if [ -e "$FAKE_DIR/postgres_up" ]; then echo postgres; fi; exit 0 ;;
    esac
    echo "NAME STATUS fake-ps-of-$RIRIKO_VERSION"
    exit 0 ;;
  pull) if [ -e "$FAKE_DIR/pull_fails" ]; then exit 1; fi; exit 0 ;;
  up)
    case $args in
      *" --wait "*) touch "$FAKE_DIR/postgres_up" ;;
    esac
    exit 0 ;;
  run)
    case $args in
      *" ririko db:migrate "*)
        if bad bad_migrate; then
          echo "fake-migrate-error: migration 0003_fake failed in $RIRIKO_VERSION" >&2
          exit "$(cat "$FAKE_DIR/migrate_exit" 2>/dev/null || echo 1)"
        fi
        echo "fake-migrate: applied 0002_fake with $RIRIKO_VERSION"
        exit 0 ;;
    esac ;;
  logs) echo "fake-log-line from bot and web of $RIRIKO_VERSION"; exit 0 ;;
  exec)
    case $args in
      *" ririko db:migrate --status "*) echo "fake-migrate-status: Latest 0002_fake, Pending none"; exit 0 ;;
      *" postgres "*) if [ -e "$FAKE_DIR/dump_fails" ]; then exit 1; fi; echo PGDUMP-DATA; exit 0 ;;
      *" bot "*)
        if bad bad_bot; then exit 1; fi
        if [ -e "$FAKE_DIR/not_ready_probes" ]; then
          n=$(cat "$FAKE_DIR/not_ready_probes")
          if [ "$n" -gt 0 ]; then echo $((n - 1)) >"$FAKE_DIR/not_ready_probes"; exit 1; fi
        fi
        exit 0 ;;
      *" web "*) if bad bad_web; then exit 1; fi; exit 0 ;;
    esac ;;
esac
exit 0
`;

const fakeCurl = `#!/usr/bin/env bash
out=""
url=""
while [ $# -gt 0 ]; do
  case $1 in
    --output|-o) out=$2; shift ;;
    https://*) url=$1 ;;
  esac
  shift
done
echo "$url" >>"$FAKE_DIR/curl.log"
if [ -e "$FAKE_DIR/curl_fail" ] && grep -qF "$(cat "$FAKE_DIR/curl_fail")" <<<"$url"; then
  echo "curl: (22) The requested URL returned error: 404" >&2
  exit 22
fi
echo "# fake $url" >"$out"
`;

const fakeSudo = `#!/usr/bin/env bash
echo "$*" >>"$FAKE_DIR/sudo.log"
`;

/** A bash $'...' literal for any string (newlines and quotes included). */
const bashQuote = (value: string) =>
  `$'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

const harness = (body: string) => `set -u
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/fake"
cat >"$work/bin/ririko-deploy" <<'${heredocEnd}'
${hasBash ? read('bin/ririko-deploy.sh') : ''}
${heredocEnd}
cat >"$work/bin/ririko-deploy-ssh" <<'${heredocEnd}'
${hasBash ? read('bin/ririko-deploy-ssh.sh') : ''}
${heredocEnd}
cat >"$work/bin/docker" <<'${heredocEnd}'
${fakeDocker}
${heredocEnd}
cat >"$work/bin/curl" <<'${heredocEnd}'
${fakeCurl}
${heredocEnd}
cat >"$work/bin/sudo" <<'${heredocEnd}'
${fakeSudo}
${heredocEnd}
# Git Bash has no flock; the lock itself is only tested where the real one exists.
if ! command -v flock >/dev/null; then printf '#!/usr/bin/env bash\\nexit 0\\n' >"$work/bin/flock"; fi
chmod +x "$work/bin/"*
export FAKE_DIR="$work/fake"
export RIRIKO_ROOT="$work/root" RIRIKO_CONF="$work/ririko.conf" RIRIKO_LOCK="$work/deploy.lock"
export DOCKER="$work/bin/docker" CURL="$work/bin/curl" READY_POLL_SECONDS=0.1
export PATH="$work/bin:$PATH"
: >"$work/env.production"
printf 'RIRIKO_ENV_FILE=%s\\nREADY_TIMEOUT=1\\n' "$work/env.production" >"$RIRIKO_CONF"

# run <args>: ririko-deploy as root would run it; ssh <command>: the forced command.
run() { bash "$work/bin/ririko-deploy" "$@" </dev/null >"$work/stdout" 2>"$work/stderr"; rc=$?; echo "$rc" >>"$work/rcs"; }
ssh() { SSH_ORIGINAL_COMMAND="$1" bash "$work/bin/ririko-deploy-ssh" </dev/null >"$work/stdout" 2>"$work/stderr"; rc=$?; echo "$rc" >>"$work/rcs"; }
# seed_current <version>: a release that is running with postgres up.
seed_current() {
  mkdir -p "$RIRIKO_ROOT/releases/$1" "$RIRIKO_ROOT/state"
  echo docker-compose.production.yml >"$RIRIKO_ROOT/releases/$1/.compose-files"
  echo "# old" >"$RIRIKO_ROOT/releases/$1/docker-compose.production.yml"
  echo "$1" >"$RIRIKO_ROOT/state/current"
  touch "$FAKE_DIR/postgres_up"
}
section() { printf '\\n@@%s\\n' "$1"; cat "$2" 2>/dev/null; }
report() {
  section stdout "$work/stdout"
  section stderr "$work/stderr"
  section rcs "$work/rcs"
  section docker "$FAKE_DIR/docker.log"
  section curl "$FAKE_DIR/curl.log"
  section sudo "$FAKE_DIR/sudo.log"
  section current "$RIRIKO_ROOT/state/current"
  section previous "$RIRIKO_ROOT/state/previous"
  section log "$RIRIKO_ROOT/deploy.log"
  printf '\\n@@tree\\n'; (cd "$RIRIKO_ROOT" 2>/dev/null && find releases state -type f | sort)
  printf '\\n@@releases\\n'; ls -A "$RIRIKO_ROOT/releases" 2>/dev/null
  printf '\\n@@dumps\\n'; ls -A "$RIRIKO_ROOT/backups/predeploy" 2>/dev/null
  newest=$(ls -1 "$RIRIKO_ROOT"/backups/predeploy/*.dump 2>/dev/null | tail -n 1)
  section newestdump "$newest"
  printf '\\n@@end\\n'
}
${body}
report
`;

interface Report {
  stdout: string;
  stderr: string;
  rcs: number[];
  docker: string[];
  curl: string[];
  sudo: string[];
  current: string;
  previous: string;
  log: string[];
  tree: string[];
  releases: string[];
  dumps: string[];
  newestdump: string;
}

const lines = (text: string | undefined) => (text ?? '').split('\n').filter((line) => line !== '');

function scenario(body: string): Report {
  const result = spawnSync('bash', ['-s'], { input: harness(body), encoding: 'utf8' });
  expect(result.stdout, result.stderr).toContain('@@end');
  const sections: Record<string, string> = {};
  const parts = result.stdout.split(/^@@(\w+)\n/m);
  for (let index = 1; index < parts.length; index += 2) sections[parts[index]!] = parts[index + 1]!;
  return {
    stdout: sections.stdout ?? '',
    stderr: sections.stderr ?? '',
    rcs: lines(sections.rcs).map(Number),
    docker: lines(sections.docker),
    curl: lines(sections.curl),
    sudo: lines(sections.sudo),
    current: (sections.current ?? '').trim(),
    previous: (sections.previous ?? '').trim(),
    log: lines(sections.log),
    tree: lines(sections.tree),
    releases: lines(sections.releases),
    dumps: lines(sections.dumps),
    newestdump: (sections.newestdump ?? '').trim(),
  };
}

const repoUrl = 'https://raw.githubusercontent.com/RirikoAI/RirikoBot';
const escapeDots = (text: string) => text.replaceAll('.', '\\.');
/** The docker call for a version and compose subcommand, as the fake docker logs it. */
const composeCall = (
  version: string,
  subcommand: string,
  files = ['docker-compose.production.yml'],
) =>
  new RegExp(
    `^RIRIKO_VERSION=${escapeDots(version)} RIRIKO_ENV_FILE=\\S+/env\\.production DB_AUTO_MIGRATE=false ` +
      `docker compose -p ririko ${files
        .map((file) => `-f \\S+/releases/${escapeDots(version)}/${escapeDots(file)}`)
        .join(' ')} --env-file \\S+/env\\.production ${subcommand}`,
  );

describe.skipIf(!hasBash)('ririko-deploy-ssh (the forced command)', () => {
  it('passes only "deploy <version>" and "status" to the one sudo rule', () => {
    const cases: Array<[string, string]> = [
      ['', 'rejected'],
      ['latest', 'rejected'],
      ['deploy latest', 'rejected'],
      ['deploy 2.1.3;id', 'rejected'],
      ['deploy 2.1.3 && id', 'rejected'],
      ['deploy ../x', 'rejected'],
      ['deploy 2.1', 'rejected'],
      ['deploy', 'rejected'],
      ['deploy 2.1.3 extra', 'rejected'],
      ['deploy 2.1.3\nid', 'rejected'],
      ['deploy 2.1.3-', 'rejected'],
      ['deploy 2.1.3-rc/1', 'rejected'],
      ['DEPLOY 2.1.3', 'rejected'],
      ['status now', 'rejected'],
      ['status\n', 'rejected'],
      ['bash', 'rejected'],
      ['deploy 2.1.3', '-n /usr/local/bin/ririko-deploy deploy 2.1.3'],
      ['deploy 10.20.30-rc.1', '-n /usr/local/bin/ririko-deploy deploy 10.20.30-rc.1'],
      ['status', '-n /usr/local/bin/ririko-deploy status'],
    ];
    const body = cases
      .map(
        ([command], index) =>
          `rm -f "$FAKE_DIR/sudo.log"; ssh ${bashQuote(command)}; ` +
          `printf 'case${index} rc=%s err=%s sudo=%s\\n' "$rc" "$(cat "$work/stderr")" ` +
          `"$(cat "$FAKE_DIR/sudo.log" 2>/dev/null)" >>"$work/cases"`,
      )
      .join('\n');
    const result = scenario(`${body}\ncp "$work/cases" "$work/stdout"`);
    const outcomes = lines(result.stdout);
    expect(outcomes).toHaveLength(cases.length);
    cases.forEach(([command, expected], index) => {
      const outcome = outcomes[index]!;
      if (expected === 'rejected') {
        expect({ command, outcome }).toEqual({
          command,
          outcome: `case${index} rc=2 err=command not allowed sudo=`,
        });
      } else {
        expect({ command, outcome }).toEqual({
          command,
          outcome: `case${index} rc=0 err= sudo=${expected}`,
        });
      }
    });
  });
});

describe.skipIf(!hasBash)('ririko-deploy', () => {
  it('rejects an invalid version or command with exit 2 before it touches anything', () => {
    const args = [
      ['deploy', 'latest'],
      ['deploy', '2.1.3;id'],
      ['deploy', '../x'],
      ['deploy', ''],
      ['deploy', '2.1'],
      ['deploy', '2.1.3', 'extra'],
      ['deploy'],
      ['status', 'now'],
      ['bash'],
      [],
    ];
    const body = args.map((list) => `run ${list.map(bashQuote).join(' ')}`).join('\n');
    const result = scenario(body);
    expect(result.rcs).toEqual(args.map(() => 2));
    expect(result.docker).toEqual([]);
    expect(result.curl).toEqual([]);
    expect(result.releases).toEqual([]);
  });

  it('deploys a first release: download, pull, up, readiness gate, state, log', () => {
    const result = scenario('run deploy 2.1.3');
    expect(result.rcs).toEqual([0]);
    expect(result.curl).toEqual([
      `${repoUrl}/v2.1.3/docker-compose.production.yml`,
      `${repoUrl}/v2.1.3/docker/lavalink/application.yml`,
    ]);
    expect(result.tree).toEqual([
      'releases/2.1.3/.compose-files',
      'releases/2.1.3/docker-compose.production.yml',
      'releases/2.1.3/docker/lavalink/application.yml',
      'state/current',
    ]);
    expect(result.releases).toEqual(['2.1.3']);
    // Nothing was deployed before, so there is nothing to dump. Postgres does not run yet, so it
    // is started (and waited for) before the migration, which comes before the stack starts.
    expect(result.docker).toHaveLength(7);
    expect(result.docker[0]).toMatch(composeCall('2.1.3', 'pull$'));
    expect(result.docker[1]).toMatch(composeCall('2.1.3', 'ps --status running --services$'));
    expect(result.docker[2]).toMatch(
      composeCall('2.1.3', 'up -d --no-build --wait --wait-timeout 1 postgres$'),
    );
    expect(result.docker[3]).toMatch(
      composeCall('2.1.3', 'run --rm --no-deps -T bot ririko db:migrate$'),
    );
    expect(result.docker[4]).toMatch(composeCall('2.1.3', 'up -d --no-build --remove-orphans$'));
    expect(result.docker.some((line) => line.includes(' exec -T postgres '))).toBe(false);
    expect(result.stdout).toContain('db:migrate: fake-migrate: applied 0002_fake with 2.1.3');
    const probes = result.docker.filter((line) => line.includes(' exec -T '));
    expect(probes).toHaveLength(2);
    expect(probes[0]).toMatch(composeCall('2.1.3', 'exec -T bot node -e '));
    expect(probes[0]).toContain('"/ready"');
    expect(probes[0]).toContain('process.env.HEALTH_PORT||8080');
    expect(probes[1]).toMatch(composeCall('2.1.3', 'exec -T web node -e '));
    expect(probes[1]).toContain('http://127.0.0.1:3000/api/ready');
    expect(result.current).toBe('2.1.3');
    expect(result.previous).toBe('');
    expect(result.dumps).toEqual([]);
    expect(result.log.length).toBeGreaterThan(3);
    for (const line of result.log) {
      expect(line).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ /);
    }
    expect(result.log.at(-1)).toMatch(/deployed 2\.1\.3$/);
  });

  it('dumps the database first, deploys every configured compose file, keeps 5 dumps', () => {
    const result = scenario(`
seed_current 2.1.2
printf '%s\\n' '# comment' 'SOMETHING_ELSE=1' 'not a setting' \\
  'RIRIKO_COMPOSE_FILES="docker-compose.production.yml docker-compose.remote-lavalink.yml"' \\
  >>"$RIRIKO_CONF"
mkdir -p "$RIRIKO_ROOT/backups/predeploy"
for n in 1 2 3 4 5 6; do echo old >"$RIRIKO_ROOT/backups/predeploy/2020010\${n}T000000Z-from-1.0.0.dump"; done
run deploy 2.1.3`);
    expect(result.rcs).toEqual([0]);
    expect(result.curl).toEqual([
      `${repoUrl}/v2.1.3/docker-compose.production.yml`,
      `${repoUrl}/v2.1.3/docker-compose.remote-lavalink.yml`,
      `${repoUrl}/v2.1.3/docker/lavalink/application.yml`,
    ]);
    const files = ['docker-compose.production.yml', 'docker-compose.remote-lavalink.yml'];
    const services = result.docker.findIndex((line) => line.includes(' ps --status running'));
    const dump = result.docker.findIndex((line) => line.includes(' exec -T postgres sh -c '));
    const pull = result.docker.findIndex((line) => / pull$/.test(line));
    // The dump uses the running release's own compose files, and it comes before the pull.
    expect(result.docker[services]).toMatch(
      composeCall('2.1.2', 'ps --status running --services$'),
    );
    expect(result.docker[dump]).toMatch(composeCall('2.1.2', 'exec -T postgres sh -c '));
    expect(result.docker[dump]).toContain('pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"');
    expect(services).toBeLessThan(dump);
    expect(dump).toBeLessThan(pull);
    expect(result.docker[pull]).toMatch(composeCall('2.1.3', 'pull$', files));
    expect(result.docker.at(-1)).toMatch(composeCall('2.1.3', 'exec -T web node -e ', files));
    expect(result.dumps).toHaveLength(5);
    expect(result.dumps.at(-1)).toMatch(/^\d{8}T\d{6}Z-from-2\.1\.2\.dump$/);
    expect(result.dumps).not.toContain('20200101T000000Z-from-1.0.0.dump');
    expect(result.dumps[0]).toBe('20200103T000000Z-from-1.0.0.dump');
    expect(result.newestdump).toBe('PGDUMP-DATA');
    expect(result.current).toBe('2.1.3');
    expect(result.previous).toBe('2.1.2');
  });

  it('keeps the previous release when the same version is deployed again', () => {
    const result = scenario(`
seed_current 2.1.3
echo 2.1.2 >"$RIRIKO_ROOT/state/previous"
run deploy 2.1.3`);
    expect(result.rcs).toEqual([0]);
    expect(result.current).toBe('2.1.3');
    expect(result.previous).toBe('2.1.2');
    expect(result.dumps).toHaveLength(1);
  });

  it('rolls back to the previous release and exits 4, naming the dump', () => {
    const result = scenario(`
seed_current 2.1.2
echo 2.1.3 >"$FAKE_DIR/bad_bot"
run deploy 2.1.3`);
    expect(result.rcs).toEqual([4]);
    expect(result.dumps).toHaveLength(1);
    const dumpName = result.dumps[0]!;
    expect(dumpName).toMatch(/-from-2\.1\.2\.dump$/);
    expect(result.stderr).toContain('rolled back to 2.1.2');
    expect(result.stderr).toContain(dumpName);
    expect(result.stderr).toContain('The database was not restored');
    // The failure report: container state and the last 100 log lines of bot and web.
    expect(result.stdout).toContain('NAME STATUS fake-ps-of-2.1.3');
    expect(result.stdout).toContain('fake-log-line from bot and web of 2.1.3');
    expect(result.docker.some((line) => / logs --no-color --tail 100 bot web$/.test(line))).toBe(
      true,
    );
    const ups = result.docker.filter((line) => line.includes(' up -d '));
    expect(ups).toHaveLength(2);
    expect(ups[0]).toMatch(composeCall('2.1.3', 'up -d --no-build --remove-orphans$'));
    expect(ups[1]).toMatch(composeCall('2.1.2', 'up -d --no-build --remove-orphans$'));
    // The rollback is a plain redeploy: no second dump, and the state does not move.
    expect(result.docker.filter((line) => line.includes(' exec -T postgres '))).toHaveLength(1);
    expect(result.current).toBe('2.1.2');
    expect(result.previous).toBe('');
    expect(result.log.join('\n')).toContain('rolled back to 2.1.2');
    // The new release migrated before it failed: the rollback does not migrate again, and the
    // output says the database keeps the new migrations (the expand rule lets 2.1.2 run on them).
    const migrations = result.docker.filter((line) => line.includes('ririko db:migrate'));
    expect(migrations).toHaveLength(1);
    expect(migrations[0]).toMatch(
      composeCall('2.1.3', 'run --rm --no-deps -T bot ririko db:migrate$'),
    );
    expect(result.stderr).toContain('keeps the migrations of 2.1.3');
    expect(result.log.join('\n')).toContain('the database keeps the migrations of 2.1.3');
  });

  it('runs every compose call with DB_AUTO_MIGRATE=false, whatever the host env file says', () => {
    const result = scenario(`
seed_current 2.1.2
echo 'DB_AUTO_MIGRATE=true' >>"$work/env.production"
export DB_AUTO_MIGRATE=true
run deploy 2.1.3
run status`);
    expect(result.rcs).toEqual([0, 0]);
    expect(result.docker.length).toBeGreaterThan(8);
    for (const line of result.docker) {
      expect(line).toContain(' DB_AUTO_MIGRATE=false docker compose ');
    }
    // The bot's own start, which would otherwise migrate on its own, is among them.
    expect(result.docker.some((line) => line.includes(' up -d --no-build --remove-orphans'))).toBe(
      true,
    );
  });

  it('migrates from the new image after the pull and before up, while the old release runs', () => {
    const result = scenario(`
seed_current 2.1.2
run deploy 2.1.3`);
    expect(result.rcs).toEqual([0]);
    const index = (pattern: RegExp) => result.docker.findIndex((line) => pattern.test(line));
    const dump = index(composeCall('2.1.2', 'exec -T postgres sh -c '));
    const pull = index(composeCall('2.1.3', 'pull$'));
    const migrate = index(composeCall('2.1.3', 'run --rm --no-deps -T bot ririko db:migrate$'));
    const up = index(composeCall('2.1.3', 'up -d --no-build --remove-orphans$'));
    expect(dump).toBeGreaterThanOrEqual(0);
    expect(dump).toBeLessThan(pull);
    expect(pull).toBeLessThan(migrate);
    expect(migrate).toBe(up - 1);
    // The previous release is only asked about and dumped: never stopped, removed or recreated,
    // and postgres, which already runs, is not started again.
    expect(result.docker.filter((line) => /RIRIKO_VERSION=2\.1\.2 /.test(line))).toHaveLength(2);
    expect(result.docker.some((line) => / (stop|down|rm|restart|kill) /.test(line))).toBe(false);
    expect(result.docker.some((line) => line.includes('--wait'))).toBe(false);
    expect(result.stdout).toContain('db:migrate: fake-migrate: applied 0002_fake with 2.1.3');
    expect(result.current).toBe('2.1.3');
    expect(result.previous).toBe('2.1.2');
  });

  it('exits 6 and leaves the running release untouched when the migration fails', () => {
    const result = scenario(`
seed_current 2.1.2
echo 2.1.3 >"$FAKE_DIR/bad_migrate"
run deploy 2.1.3`);
    expect(result.rcs).toEqual([6]);
    expect(result.dumps).toHaveLength(1);
    // The output names the dump and the migration error, and says nothing was started.
    expect(result.stderr).toContain('migration of 2.1.3 failed (ririko db:migrate exit 1');
    expect(result.stderr).toContain(result.dumps[0]!);
    expect(result.stderr).toContain('fake-migrate-error: migration 0003_fake failed in 2.1.3');
    expect(result.stderr).toContain(
      'Nothing was started or stopped. The previous release 2.1.2 keeps running',
    );
    expect(result.stdout).toContain('db:migrate: fake-migrate-error: migration 0003_fake failed');
    expect(result.log.join('\n')).toContain('ririko db:migrate exited with status 1');
    // No up, no rollback, no failure report: the stack is as it was.
    expect(result.docker.some((line) => line.includes(' up -d '))).toBe(false);
    expect(result.docker.some((line) => line.includes(' logs '))).toBe(false);
    expect(
      result.docker.some((line) => /RIRIKO_VERSION=2\.1\.2 .* (pull|run|up)\b/.test(line)),
    ).toBe(false);
    expect(result.docker.filter((line) => line.includes('ririko db:migrate'))).toHaveLength(1);
    expect(result.docker.some((line) => line.includes('exec -T bot node -e'))).toBe(false);
    expect(result.current).toBe('2.1.2');
    expect(result.previous).toBe('');
  });

  it('exits 6 with its own message when the downgrade guard refuses (exit 2)', () => {
    const result = scenario(`
seed_current 2.1.2
echo 2.1.3 >"$FAKE_DIR/bad_migrate"
echo 2 >"$FAKE_DIR/migrate_exit"
run deploy 2.1.3`);
    expect(result.rcs).toEqual([6]);
    expect(result.stderr).toContain('refused by the downgrade guard (ririko db:migrate exit 2)');
    expect(result.stderr).toContain('this release is older than the database');
    expect(result.stderr).toContain(result.dumps[0]!);
    expect(result.docker.some((line) => line.includes(' up -d '))).toBe(false);
    expect(result.current).toBe('2.1.2');
  });

  it('exits 6 on a first deploy whose migration fails, with no dump to name', () => {
    const result = scenario(`
echo 2.1.3 >"$FAKE_DIR/bad_migrate"
run deploy 2.1.3`);
    expect(result.rcs).toEqual([6]);
    expect(result.stderr).toContain('Pre-deploy dump: none taken');
    expect(result.stderr).not.toContain('keeps running');
    expect(result.docker.some((line) => line.includes(' up -d --no-build --remove-orphans'))).toBe(
      false,
    );
    expect(result.current).toBe('');
  });

  it('does not migrate when the images cannot be pulled, and rolls back without migrating', () => {
    const result = scenario(`
seed_current 2.1.2
touch "$FAKE_DIR/pull_fails"
run deploy 2.1.3`);
    expect(result.rcs).toEqual([4]);
    expect(result.docker.some((line) => line.includes('ririko db:migrate'))).toBe(false);
    expect(result.stderr).not.toContain('keeps the migrations');
    expect(result.current).toBe('2.1.2');
  });

  it('exits 5 when the first deploy fails, because the dashboard never gets ready', () => {
    const result = scenario(`
echo 2.1.3 >"$FAKE_DIR/bad_web"
run deploy 2.1.3`);
    expect(result.rcs).toEqual([5]);
    expect(result.stderr).toContain('no previous release');
    expect(result.stdout).toContain('NAME STATUS fake-ps-of-2.1.3');
    expect(result.docker.some((line) => line.includes('exec -T web node -e'))).toBe(true);
    expect(
      result.docker.filter((line) => line.includes(' up -d --no-build --remove-orphans')),
    ).toHaveLength(1);
    // The migration ran, and the first deploy keeps its migrated, empty database.
    expect(result.stderr).toContain('The database keeps the migrations of 2.1.3');
    expect(result.current).toBe('');
    expect(result.dumps).toEqual([]);
  });

  it('treats exec errors as not ready and keeps polling until the bot answers', () => {
    const result = scenario(`
echo 'READY_TIMEOUT=30' >>"$RIRIKO_CONF"
echo 3 >"$FAKE_DIR/not_ready_probes"
run deploy 2.1.3`);
    expect(result.rcs).toEqual([0]);
    expect(result.docker.filter((line) => line.includes('exec -T bot node -e'))).toHaveLength(4);
    expect(result.docker.filter((line) => line.includes('exec -T web node -e'))).toHaveLength(1);
    expect(result.current).toBe('2.1.3');
  });

  it('fails before pulling anything when the pre-deploy dump fails', () => {
    const result = scenario(`
seed_current 2.1.2
touch "$FAKE_DIR/dump_fails"
run deploy 2.1.3`);
    expect(result.rcs).toEqual([1]);
    expect(result.stderr).toContain('dump failed');
    expect(result.docker.some((line) => line.endsWith(' pull'))).toBe(false);
    expect(result.docker.some((line) => line.includes(' up -d '))).toBe(false);
    expect(result.dumps).toEqual([]);
    expect(result.current).toBe('2.1.2');
  });

  it.each([
    ['a tag that does not exist', 'v2.1.3/'],
    ['a file the release does not have', 'application.yml'],
  ])('changes nothing when %s cannot be downloaded', (_name, missing) => {
    const result = scenario(`
seed_current 2.1.2
echo ${bashQuote(missing)} >"$FAKE_DIR/curl_fail"
run deploy 2.1.3`);
    expect(result.rcs).toEqual([1]);
    expect(result.stderr).toContain('could not download');
    expect(result.docker).toEqual([]);
    expect(result.releases).toEqual(['2.1.2']);
    expect(result.current).toBe('2.1.2');
    expect(result.dumps).toEqual([]);
  });

  it.skipIf(!hasFlock)('exits 3 while another run holds the deploy lock after waiting', () => {
    const result = scenario(`
echo 'DEPLOY_LOCK_WAIT=1' >>"$RIRIKO_CONF"
exec 8>"$RIRIKO_LOCK"
flock -n 8
run deploy 2.1.3`);
    expect(result.rcs).toEqual([3]);
    expect(result.stderr).toContain('was not free within');
    expect(result.curl).toEqual([]);
    expect(result.docker).toEqual([]);
    expect(result.releases).toEqual([]);
  });

  it.skipIf(!hasFlock)('waits for the lock and proceeds when it becomes free', () => {
    const result = scenario(`
echo 'DEPLOY_LOCK_WAIT=10' >>"$RIRIKO_CONF"
(
  exec 8>"$RIRIKO_LOCK"
  flock -n 8
  sleep 1
) &
sleep 0.2
run deploy 2.1.3`);
    expect(result.rcs).toEqual([0]);
    expect(result.stderr).not.toContain('was not free');
    expect(result.current).toBe('2.1.3');
  });

  it.skipIf(!hasFlock)(
    'leaves the temporary directories alone while it waits for the lock, and removes them after',
    () => {
      // The lock holder looks for .tmp.keep just before it lets go of the lock. A deploy that
      // cleaned up before it had the lock would already have deleted it, because it started
      // waiting 0.2 s into the holder's second.
      const result = scenario(`
mkdir -p "$RIRIKO_ROOT/releases/.tmp.keep"
echo 'DEPLOY_LOCK_WAIT=10' >>"$RIRIKO_CONF"
(
  exec 8>"$RIRIKO_LOCK"
  flock -n 8
  sleep 1
  if test -d "$RIRIKO_ROOT/releases/.tmp.keep"; then echo kept >"$RIRIKO_ROOT/probe"; fi
) &
sleep 0.2
run deploy 2.1.3
wait
cat "$RIRIKO_ROOT/probe" >"$work/stdout" 2>/dev/null`);
      expect(result.rcs).toEqual([0]);
      expect(result.current).toBe('2.1.3');
      expect(result.stdout.trim()).toBe('kept');
      // Once the deploy has the lock, the stale directory is cleaned up as before.
      expect(result.releases).toEqual(['2.1.3']);
    },
  );

  it.each([
    ['a compose file that climbs a directory', 'RIRIKO_COMPOSE_FILES=../etc/passwd'],
    ['an absolute compose file', 'RIRIKO_COMPOSE_FILES=/etc/passwd'],
    ['a compose file with a shell character', 'RIRIKO_COMPOSE_FILES=a.yml;id'],
    ['a repository with a shell character', 'RIRIKO_REPO=RirikoAI/Ririko;id'],
    ['a timeout that is not a number', 'READY_TIMEOUT=soon'],
    ['a lock wait that is not a number', 'DEPLOY_LOCK_WAIT=soon'],
    ['an env file that does not exist', 'RIRIKO_ENV_FILE=/nonexistent/ririko-env'],
  ])('refuses %s in ririko.conf before it downloads anything', (_name, line) => {
    const result = scenario(`echo ${bashQuote(line)} >>"$RIRIKO_CONF"\nrun deploy 2.1.3`);
    expect(result.rcs).toEqual([1]);
    expect(result.curl).toEqual([]);
    expect(result.docker).toEqual([]);
  });

  it('downloads from the repository named in ririko.conf', () => {
    const result = scenario(
      `echo 'RIRIKO_REPO=Example/Fork' >>"$RIRIKO_CONF"\nrun deploy 2.1.3-rc.1`,
    );
    expect(result.rcs).toEqual([0]);
    expect(result.curl[0]).toBe(
      'https://raw.githubusercontent.com/Example/Fork/v2.1.3-rc.1/docker-compose.production.yml',
    );
    expect(result.current).toBe('2.1.3-rc.1');
  });

  it('prints the current and previous versions and the container state for status', () => {
    const result = scenario(`
seed_current 2.1.3
echo 2.1.2 >"$RIRIKO_ROOT/state/previous"
run status`);
    expect(result.rcs).toEqual([0]);
    expect(result.stdout).toContain('current=2.1.3 previous=2.1.2');
    expect(result.stdout).toContain('NAME STATUS fake-ps-of-2.1.3');
    expect(result.docker).toHaveLength(2);
    expect(result.docker[0]).toMatch(composeCall('2.1.3', 'ps$'));
    // The migration status comes from the running release's bot container.
    expect(result.docker[1]).toMatch(
      composeCall('2.1.3', 'exec -T bot ririko db:migrate --status$'),
    );
    expect(result.stdout).toContain('fake-migrate-status: Latest 0002_fake, Pending none');
    expect(result.log.at(-1)).toMatch(/status: current=2\.1\.3 previous=2\.1\.2$/);
    expect(result.curl).toEqual([]);
  });

  it('reports "none" for status on a host nothing was deployed to', () => {
    const result = scenario('run status');
    expect(result.rcs).toEqual([0]);
    expect(result.stdout).toContain('current=none previous=none');
    expect(result.docker).toEqual([]);
  });
});

describe('ririko-deploy wiring', () => {
  it('ships both scripts under the names the sudoers rule and authorized_keys expect', () => {
    expect(files).toEqual(
      expect.arrayContaining(['bin/ririko-deploy.sh', 'bin/ririko-deploy-ssh.sh']),
    );
    expect(read('bin/ririko-deploy-ssh.sh')).toContain(
      'exec sudo -n /usr/local/bin/ririko-deploy ',
    );
    expect(read('files/sudoers-ririko-deploy')).toContain('/usr/local/bin/ririko-deploy\n');
  });

  it('documents its settings in ririko.conf.example, all commented out', () => {
    const example = read('ririko.conf.example');
    for (const key of [
      'RIRIKO_REPO',
      'RIRIKO_COMPOSE_FILES',
      'RIRIKO_ENV_FILE',
      'READY_TIMEOUT',
      'DEPLOY_LOCK_WAIT',
    ]) {
      expect(example).toMatch(new RegExp(`^#${key}=`, 'm'));
    }
    expect(example).toContain('docker-compose.remote-lavalink.yml');
    expect(example.split('\n').filter((line) => /^[A-Z_]+=/.test(line))).toEqual([]);
  });
});

// --- ririko-backup -------------------------------------------------------------------------------
// Same approach as the deploy scenarios: one bash script per scenario on stdin, with fake docker,
// curl and date executables. The fake docker logs every call, copies the --env-file restic would
// get (the real one is deleted when the script ends) and the dump it finds in the mounted
// directory, and fails the restic subcommand named by a flag file.

const fakeBackupDocker = String.raw`#!/usr/bin/env bash
echo "RIRIKO_VERSION=$RIRIKO_VERSION docker $*" >>"$FAKE_DIR/docker.log"
lock_state() { if (flock -n 7) 7>"$RIRIKO_LOCK" 2>/dev/null; then echo "$1 free"; else echo "$1 held"; fi >>"$FAKE_DIR/lockstate"; }
if [ "$1" = compose ]; then
  lock_state dump
  if [ -e "$FAKE_DIR/dump_fails" ]; then exit 1; fi
  if [ -e "$FAKE_DIR/dump_empty" ]; then exit 0; fi
  echo PGDUMP-DATA
  exit 0
fi
shift
envfile=""
while [ $# -gt 0 ]; do
  case $1 in
    --rm) shift ;;
    --env-file) envfile=$2; shift 2 ;;
    -v)
      case $2 in
        *:/backup/postgres:ro) cat "$(echo "$2" | cut -d: -f1)/ririko.dump" >"$FAKE_DIR/mounted_dump" ;;
      esac
      shift 2 ;;
    *) break ;;
  esac
done
sub=$2
n=$(cat "$FAKE_DIR/runs" 2>/dev/null || echo 0)
n=$((n + 1))
echo $n >"$FAKE_DIR/runs"
lock_state restic
cp "$envfile" "$FAKE_DIR/env.$n"
stat -c %a "$envfile" >"$FAKE_DIR/envmode.$n"
if [ -e "$FAKE_DIR/fail_$sub" ]; then echo "fake restic: $sub failed" >&2; exit 1; fi
exit 0
`;

const fakeBackupCurl = String.raw`#!/usr/bin/env bash
echo "$*" >>"$FAKE_DIR/curl.log"
if [ -e "$FAKE_DIR/curl_fails" ]; then exit 22; fi
`;

// The real date is used for everything but the weekday, which a flag file pins (default Wednesday).
const fakeBackupDate = String.raw`#!/usr/bin/env bash
if [ "$*" = "-u +%u" ]; then cat "$FAKE_DIR/weekday"; exit 0; fi
exec "$REAL_DATE" "$@"
`;

const backupHarness = (body: string) => `set -u
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/fake" "$work/runtime"
cat >"$work/bin/ririko-backup" <<'${heredocEnd}'
${hasBash ? read('bin/ririko-backup.sh') : ''}
${heredocEnd}
cat >"$work/bin/docker" <<'${heredocEnd}'
${fakeBackupDocker}
${heredocEnd}
cat >"$work/bin/curl" <<'${heredocEnd}'
${fakeBackupCurl}
${heredocEnd}
cat >"$work/bin/date" <<'${heredocEnd}'
${fakeBackupDate}
${heredocEnd}
# Git Bash has no flock; the lock itself is only tested where the real one exists.
if ! command -v flock >/dev/null; then printf '#!/usr/bin/env bash\\nexit 0\\n' >"$work/bin/flock"; fi
export REAL_DATE=$(command -v date)
chmod +x "$work/bin/"*
export FAKE_DIR="$work/fake"
export RIRIKO_ROOT="$work/root" RIRIKO_CONF="$work/ririko.conf" RIRIKO_LOCK="$work/deploy.lock"
export DOCKER="$work/bin/docker" CURL="$work/bin/curl" RUNTIME_DIRECTORY="$work/runtime"
export PATH="$work/bin:$PATH"
echo 3 >"$FAKE_DIR/weekday"
: >"$work/env.production"
# File modes mean nothing on some file systems (Git Bash on NTFS); the mode check needs them.
touch "$work/modeprobe"; chmod 600 "$work/modeprobe"
if [ "$(stat -c %a "$work/modeprobe")" = 600 ]; then echo yes >"$work/posixmodes"; fi

# write_conf [extra line]...: a complete ririko.conf; later lines win.
write_conf() {
  cat >"$RIRIKO_CONF" <<CONF
RIRIKO_ENV_FILE=$work/env.production
RIRIKO_ENV_NAME=ririko-staging
RESTIC_REPOSITORY=s3:s3.region.example.com/bucket/ririko-staging
RESTIC_PASSWORD=pa ss#word=1
AWS_ACCESS_KEY_ID=AKIATEST
AWS_SECRET_ACCESS_KEY=secretkey
BACKUP_PING_URL=https://hc-ping.com/abc-123/
BACKUP_LOCK_WAIT=5
CONF
  for extra in "$@"; do printf '%s\\n' "$extra" >>"$RIRIKO_CONF"; done
}
# seed_release <version>: a deployed release, as ririko-deploy leaves it.
seed_release() {
  mkdir -p "$RIRIKO_ROOT/releases/$1" "$RIRIKO_ROOT/state"
  printf 'docker-compose.production.yml\\ndocker-compose.remote-lavalink.yml\\n' >"$RIRIKO_ROOT/releases/$1/.compose-files"
  echo "$1" >"$RIRIKO_ROOT/state/current"
}
# run <args>: ririko-backup as root would run it.
run() { bash "$work/bin/ririko-backup" "$@" </dev/null >"$work/stdout" 2>"$work/stderr"; rc=$?; echo "$rc" >>"$work/rcs"; }
section() { printf '\\n@@%s\\n' "$1"; cat "$2" 2>/dev/null; }
report() {
  section stdout "$work/stdout"
  section stderr "$work/stderr"
  section rcs "$work/rcs"
  section docker "$FAKE_DIR/docker.log"
  section curl "$FAKE_DIR/curl.log"
  section mounted "$FAKE_DIR/mounted_dump"
  section posixmodes "$work/posixmodes"
  section lockstate "$FAKE_DIR/lockstate"
  printf '\\n@@envs\\n'
  for f in "$FAKE_DIR"/env.*; do
    [ -e "$f" ] || continue
    printf '== %s mode=%s\\n' "$(basename "$f")" "$(cat "$FAKE_DIR/envmode.\${f##*.}")"
    cat "$f"
  done
  printf '\\n@@nightly\\n'; ls -A "$RIRIKO_ROOT/backups/nightly" 2>/dev/null
  printf '\\n@@runtime\\n'; ls -A "$RUNTIME_DIRECTORY"
  printf '\\n@@end\\n'
}
${body}
report
`;

interface BackupReport {
  stdout: string[];
  stderr: string;
  rcs: number[];
  docker: string[];
  curl: string[];
  mounted: string;
  posixModes: boolean;
  lockState: string[];
  envs: string;
  nightly: string[];
  runtime: string[];
}

function backupScenario(body: string): BackupReport {
  const result = spawnSync('bash', ['-s'], { input: backupHarness(body), encoding: 'utf8' });
  expect(result.stdout, result.stderr).toContain('@@end');
  const sections: Record<string, string> = {};
  const parts = result.stdout.split(/^@@(\w+)\n/m);
  for (let index = 1; index < parts.length; index += 2) sections[parts[index]!] = parts[index + 1]!;
  return {
    stdout: lines(sections.stdout),
    stderr: (sections.stderr ?? '').trim(),
    rcs: lines(sections.rcs).map(Number),
    docker: lines(sections.docker),
    curl: lines(sections.curl),
    mounted: (sections.mounted ?? '').trim(),
    posixModes: (sections.posixmodes ?? '').trim() === 'yes',
    lockState: lines(sections.lockstate),
    envs: sections.envs ?? '',
    nightly: lines(sections.nightly),
    runtime: lines(sections.runtime),
  };
}

const resticImage = 'docker.io/restic/restic:0.19.1';
const backupVolumes = [
  'ririko_ririko_data',
  'ririko_card_images',
  'ririko_boss_images',
  'ririko_welcomer_backgrounds',
];
/** The `docker run` lines of the fake docker log (the restic calls), in order. */
const resticRuns = (docker: string[]) => docker.filter((line) => line.includes(' docker run '));
const resticRunPattern = (subcommand: string, mounts = '') =>
  new RegExp(
    `^RIRIKO_VERSION= docker run --rm --env-file \\S+ ${mounts}${escapeDots(resticImage)} ${subcommand}$`,
  );
const mountArgs =
  '-v \\S+/backups/nightly:/backup/postgres:ro ' +
  backupVolumes.map((volume) => `-v ${volume}:/backup/${volume}:ro `).join('');
const backupPaths = ['/backup/postgres', ...backupVolumes.map((volume) => `/backup/${volume}`)];
const backupCommand = `backup --host ririko-staging ${backupPaths.join(' ')}`;
const forgetCommand = 'forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune';
const pingCall = (suffix = '') =>
  `-fsS -m 10 --retry 3 -o /dev/null https://hc-ping.com/abc-123${suffix}`;
const dumpCommand = 'exec -T postgres sh -c exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"';

describe.skipIf(!hasBash)('ririko-backup', () => {
  it('dumps Postgres and backs up the dump and the four volumes read-only, then prunes', () => {
    const result = backupScenario(`
write_conf 'unknown_key=$(touch "$work/pwned")'
seed_release 2.1.3
run
[ -e "$work/pwned" ] && echo pwned >>"$work/stderr"`);
    expect(result.rcs).toEqual([0]);
    expect(result.stderr).toBe('');
    expect(result.docker).toHaveLength(3);
    expect(result.docker[0]).toMatch(
      /^RIRIKO_VERSION=2\.1\.3 docker compose -p ririko -f \S+\/releases\/2\.1\.3\/docker-compose\.production\.yml -f \S+\/releases\/2\.1\.3\/docker-compose\.remote-lavalink\.yml --env-file \S+\/env\.production /,
    );
    expect(result.docker[0]!.endsWith(dumpCommand)).toBe(true);
    expect(result.docker[1]).toMatch(resticRunPattern(backupCommand, mountArgs));
    expect(result.docker[2]).toMatch(resticRunPattern(forgetCommand));
    // The dump was in the mounted directory by the time restic ran, and it is the only file there.
    expect(result.mounted).toBe('PGDUMP-DATA');
    expect(result.nightly).toEqual(['ririko.dump']);
    expect(result.stdout.at(-1)).toMatch(/backup finished$/);
  });

  it.skipIf(!hasFlock)(
    'holds the deploy lock for the dump only and frees it before restic runs',
    () => {
      const result = backupScenario('write_conf\nseed_release 2.1.3\nrun');
      expect(result.rcs).toEqual([0]);
      // The fake docker tries the lock during the dump and during each restic call (backup, forget).
      expect(result.lockState).toEqual(['dump held', 'restic free', 'restic free']);
    },
  );

  it('never mounts the env file, the config, the Postgres data or the Lavalink plugin cache', () => {
    const result = backupScenario('write_conf\nseed_release 2.1.3\nrun');
    const restic = resticRuns(result.docker).join('\n');
    for (const secret of ['.env.production', 'ririko.conf', 'postgres_data', 'lavalink_plugins']) {
      expect(restic).not.toContain(secret);
    }
    const mounts = [...restic.matchAll(/-v (\S+)/g)].map((match) => match[1]);
    expect(mounts).toHaveLength(5);
    for (const mount of mounts) expect(mount).toMatch(/:ro$/);
  });

  it('passes the secrets through a 0600 --env-file, never on a command line, and removes it', () => {
    const result = backupScenario('write_conf\nseed_release 2.1.3\nrun');
    const sections = result.envs.split(/^== /m).filter((text) => text !== '');
    // One env file per restic call (backup, forget); the content is the same.
    expect(sections).toHaveLength(2);
    for (const text of sections) {
      const [header, ...content] = text.split('\n').filter((line) => line !== '');
      expect(header).toMatch(/^env\.\d mode=\d+$/);
      if (result.posixModes) expect(header).toMatch(/mode=600$/);
      expect(content).toEqual([
        'RESTIC_REPOSITORY=s3:s3.region.example.com/bucket/ririko-staging',
        'RESTIC_PASSWORD=pa ss#word=1',
        'AWS_ACCESS_KEY_ID=AKIATEST',
        'AWS_SECRET_ACCESS_KEY=secretkey',
      ]);
    }
    const everything = result.docker.join('\n') + result.stdout.join('\n') + result.stderr;
    for (const secret of ['pa ss', 'AKIATEST', 'secretkey', 'RESTIC_PASSWORD']) {
      expect(everything).not.toContain(secret);
    }
    expect(result.runtime).toEqual([]);
  });

  it('pings BACKUP_PING_URL once after a successful run', () => {
    const result = backupScenario('write_conf\nseed_release 2.1.3\nrun');
    expect(result.curl).toEqual([pingCall()]);
  });

  it('checks the repository on Sundays only, after forget', () => {
    const sunday = backupScenario(
      'write_conf\nseed_release 2.1.3\necho 7 >"$FAKE_DIR/weekday"\nrun',
    );
    expect(sunday.rcs).toEqual([0]);
    const runs = resticRuns(sunday.docker);
    expect(runs).toHaveLength(3);
    expect(runs[1]).toMatch(resticRunPattern('forget .*'));
    expect(runs[2]).toMatch(resticRunPattern('check'));
    for (const day of [1, 2, 3, 4, 5, 6]) {
      const weekday = backupScenario(
        `write_conf\nseed_release 2.1.3\necho ${day} >"$FAKE_DIR/weekday"\nrun`,
      );
      expect(resticRuns(weekday.docker)).toHaveLength(2);
    }
  });

  it.each([
    ['the database dump fails', 'touch "$FAKE_DIR/dump_fails"', 0],
    ['the database dump is empty', 'touch "$FAKE_DIR/dump_empty"', 0],
    ['restic backup fails', 'touch "$FAKE_DIR/fail_backup"', 1],
    ['restic forget fails', 'touch "$FAKE_DIR/fail_forget"', 2],
    [
      'restic check fails on a Sunday',
      'echo 7 >"$FAKE_DIR/weekday"\ntouch "$FAKE_DIR/fail_check"',
      3,
    ],
  ])('exits 1 and pings /fail, not the success URL, when %s', (_name, setup, resticCalls) => {
    const result = backupScenario(`write_conf\nseed_release 2.1.3\n${setup}\nrun`);
    expect(result.rcs).toEqual([1]);
    expect(result.curl).toEqual([pingCall('/fail')]);
    expect(result.stderr).toContain('ERROR:');
    expect(resticRuns(result.docker)).toHaveLength(resticCalls);
    expect(result.stdout.join('\n')).not.toContain('backup finished');
    expect(result.runtime).toEqual([]);
  });

  it('keeps the last good dump when the new dump fails', () => {
    const result = backupScenario(`
write_conf
seed_release 2.1.3
mkdir -p "$RIRIKO_ROOT/backups/nightly"
echo OLD >"$RIRIKO_ROOT/backups/nightly/ririko.dump"
touch "$FAKE_DIR/dump_fails"
run
cp "$RIRIKO_ROOT/backups/nightly/ririko.dump" "$work/stdout"`);
    expect(result.rcs).toEqual([1]);
    expect(result.nightly).toEqual(['ririko.dump']);
    expect(result.stdout).toEqual(['OLD']);
  });

  it('pings nothing when BACKUP_PING_URL is not set', () => {
    const ok = backupScenario('write_conf BACKUP_PING_URL=\nseed_release 2.1.3\nrun');
    expect(ok.rcs).toEqual([0]);
    expect(ok.curl).toEqual([]);
    const failed = backupScenario(
      'write_conf BACKUP_PING_URL=\nseed_release 2.1.3\ntouch "$FAKE_DIR/fail_backup"\nrun',
    );
    expect(failed.rcs).toEqual([1]);
    expect(failed.curl).toEqual([]);
  });

  it('only warns when the ping itself fails', () => {
    const result = backupScenario(
      'write_conf\nseed_release 2.1.3\ntouch "$FAKE_DIR/curl_fails"\nrun',
    );
    expect(result.rcs).toEqual([0]);
    expect(result.stdout.join('\n')).toContain('warning: could not ping');
  });

  it.each([
    ['no ririko.conf at all', 'rm -f "$RIRIKO_CONF"'],
    [
      'the untouched ririko.conf.example',
      `cat >"$RIRIKO_CONF" <<'EXAMPLE'\n${hasBash ? read('ririko.conf.example') : ''}\nEXAMPLE`,
    ],
    ['a missing RESTIC_PASSWORD', 'write_conf RESTIC_PASSWORD='],
    ['a missing AWS_SECRET_ACCESS_KEY', 'write_conf AWS_SECRET_ACCESS_KEY='],
    ['a missing RIRIKO_ENV_NAME', 'write_conf RIRIKO_ENV_NAME='],
  ])('logs one line and exits 0, without a ping, with %s', (_name, setup) => {
    const result = backupScenario(`write_conf\nseed_release 2.1.3\n${setup}\nrun`);
    expect(result.rcs).toEqual([0]);
    expect(result.stdout).toHaveLength(1);
    expect(result.stdout[0]).toMatch(
      /backup is not configured \(missing in \S+: [A-Z_ ]+\); skipping$/,
    );
    expect(result.stderr).toBe('');
    expect(result.docker).toEqual([]);
    expect(result.curl).toEqual([]);
    expect(result.nightly).toEqual([]);
  });

  it.each([
    ['no release deployed', 'write_conf'],
    [
      'state/current naming a release that is gone',
      'write_conf\nmkdir -p "$RIRIKO_ROOT/state"\necho 2.1.3 >"$RIRIKO_ROOT/state/current"',
    ],
    [
      'a state/current that is not a version',
      'write_conf\nseed_release 2.1.3\necho "../x" >"$RIRIKO_ROOT/state/current"',
    ],
  ])('logs one line and exits 0, without a ping, with %s', (_name, setup) => {
    const result = backupScenario(`${setup}\nrun`);
    expect(result.rcs).toEqual([0]);
    expect(result.stdout).toHaveLength(1);
    expect(result.stdout[0]).toMatch(/no release is deployed yet; skipping the backup$/);
    expect(result.docker).toEqual([]);
    expect(result.curl).toEqual([]);
    expect(result.nightly).toEqual([]);
  });

  it.each([
    ['a lock wait that is not a number', 'BACKUP_LOCK_WAIT=soon', 'invalid BACKUP_LOCK_WAIT', true],
    [
      'an environment name with a shell character',
      'RIRIKO_ENV_NAME=a;b',
      'invalid RIRIKO_ENV_NAME',
      true,
    ],
    ['an unpinned restic image', 'RESTIC_IMAGE=docker.io/restic/restic', 'must be pinned', true],
    ['the latest restic image', 'RESTIC_IMAGE=restic/restic:latest', 'must be pinned', true],
    ['an image with a shell character', 'RESTIC_IMAGE=restic/restic:1;id', 'must be pinned', true],
    [
      'a plain http ping URL',
      'BACKUP_PING_URL=http://hc-ping.com/abc',
      'invalid BACKUP_PING_URL',
      false,
    ],
  ])('refuses %s before it touches anything', (_name, line, message, pings) => {
    const result = backupScenario(`write_conf ${bashQuote(line)}\nseed_release 2.1.3\nrun`);
    expect(result.rcs).toEqual([1]);
    expect(result.stderr).toContain(message);
    expect(result.docker).toEqual([]);
    expect(result.curl).toEqual(pings ? [pingCall('/fail')] : []);
    expect(result.nightly).toEqual([]);
  });

  it('runs the image named in ririko.conf', () => {
    const result = backupScenario(
      `write_conf 'RESTIC_IMAGE="docker.io/restic/restic:0.18.1"'\nseed_release 2.1.3\nrun`,
    );
    expect(result.rcs).toEqual([0]);
    const runs = resticRuns(result.docker);
    expect(runs).toHaveLength(2);
    for (const line of runs) expect(line).toContain(' docker.io/restic/restic:0.18.1 ');
  });

  it('uses the compose files of the release that is running', () => {
    const result = backupScenario(`
write_conf
seed_release 2.1.2
printf 'docker-compose.production.yml\\n' >"$RIRIKO_ROOT/releases/2.1.2/.compose-files"
run`);
    expect(result.rcs).toEqual([0]);
    expect(result.docker[0]).toMatch(
      /^RIRIKO_VERSION=2\.1\.2 docker compose -p ririko -f \S+\/releases\/2\.1\.2\/docker-compose\.production\.yml --env-file \S+\/env\.production exec -T postgres /,
    );
  });

  it.skipIf(!hasFlock)('waits for the deploy lock while a deploy holds it, then backs up', () => {
    const result = backupScenario(`
write_conf
seed_release 2.1.3
exec 8>"$RIRIKO_LOCK"
flock -n 8
sleep 1 &
exec 8>&-
run
wait`);
    expect(result.rcs).toEqual([0]);
    expect(result.stdout.join('\n')).toMatch(/waiting up to 5s for the lock \S+deploy\.lock/);
    expect(result.stdout.at(-1)).toMatch(/backup finished$/);
    expect(resticRuns(result.docker)).toHaveLength(2);
    expect(result.curl).toEqual([pingCall()]);
  });

  it.skipIf(!hasFlock)('exits 3 and pings /fail when the lock is not free in time', () => {
    const result = backupScenario(`
write_conf BACKUP_LOCK_WAIT=1
seed_release 2.1.3
exec 8>"$RIRIKO_LOCK"
flock -n 8
sleep 3 &
exec 8>&-
run
wait`);
    expect(result.rcs).toEqual([3]);
    expect(result.stderr).toContain('was not free within 1s');
    expect(result.docker).toEqual([]);
    expect(result.nightly).toEqual([]);
    expect(result.curl).toEqual([pingCall('/fail')]);
  });
});

describe.skipIf(!hasBash)('ririko-backup init', () => {
  it('creates the repository once and is safe to repeat', () => {
    const result = backupScenario(`
write_conf
touch "$FAKE_DIR/fail_cat"
run init
cp "$work/stdout" "$work/first"
rm "$FAKE_DIR/fail_cat"
run init
cat "$work/first" "$work/stdout" >"$work/both"
mv "$work/both" "$work/stdout"`);
    expect(result.rcs).toEqual([0, 0]);
    expect(result.docker).toHaveLength(3);
    expect(result.docker[0]).toMatch(resticRunPattern('cat config'));
    expect(result.docker[1]).toMatch(resticRunPattern('init'));
    expect(result.docker[2]).toMatch(resticRunPattern('cat config'));
    expect(result.stdout[0]).toMatch(/creating the restic repository s3:/);
    expect(result.stdout.join('\n')).toContain('keep an offline copy of RESTIC_PASSWORD');
    expect(result.stdout.at(-1)).toMatch(/restic repository s3:\S+ already exists$/);
    // Needs neither a release nor the lock, and never pings the monitor.
    expect(result.curl).toEqual([]);
    expect(result.runtime).toEqual([]);
  });

  it('exits 1 when restic init fails, and when the keys are not set', () => {
    const failed = backupScenario(
      'write_conf\ntouch "$FAKE_DIR/fail_cat" "$FAKE_DIR/fail_init"\nrun init',
    );
    expect(failed.rcs).toEqual([1]);
    expect(failed.stderr).toContain('restic init failed');
    expect(failed.curl).toEqual([]);
    const unset = backupScenario('write_conf RESTIC_REPOSITORY=\nrun init');
    expect(unset.rcs).toEqual([1]);
    expect(unset.stderr).toContain('set these keys');
    expect(unset.stderr).toContain('RESTIC_REPOSITORY');
    expect(unset.docker).toEqual([]);
  });

  it('exits 2 for a command it does not know', () => {
    const result = backupScenario('run bogus\nrun init now\nrun run extra\nrun --help');
    expect(result.rcs).toEqual([2, 2, 2, 2]);
    expect(result.docker).toEqual([]);
    expect(result.curl).toEqual([]);
  });
});

describe('ririko-backup wiring', () => {
  const directives = (entry: string) =>
    read(entry)
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'));

  it('ships the script and its two units under the names bootstrap installs', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'bin/ririko-backup.sh',
        'systemd/ririko-backup.service',
        'systemd/ririko-backup.timer',
      ]),
    );
  });

  it('runs the timer daily at 03:30 UTC, catching up after downtime, with a random delay', () => {
    expect(directives('systemd/ririko-backup.timer')).toEqual(
      expect.arrayContaining([
        'OnCalendar=*-*-* 03:30:00 UTC',
        'Persistent=true',
        'RandomizedDelaySec=10min',
        'Unit=ririko-backup.service',
        'WantedBy=timers.target',
      ]),
    );
  });

  it('runs the script once per timer firing, after Docker, with room for the lock wait', () => {
    const service = directives('systemd/ririko-backup.service');
    expect(service).toEqual(
      expect.arrayContaining([
        'Type=oneshot',
        'ExecStart=/usr/local/bin/ririko-backup run',
        'After=docker.service network-online.target',
        'RuntimeDirectory=ririko-backup',
        'RuntimeDirectoryMode=0700',
        'TimeoutStartSec=4h',
      ]),
    );
  });

  it('documents its settings in ririko.conf.example, all commented out, with a pinned image', () => {
    const example = read('ririko.conf.example');
    for (const key of [
      'RIRIKO_ENV_NAME',
      'RESTIC_REPOSITORY',
      'RESTIC_PASSWORD',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'RESTIC_IMAGE',
      'BACKUP_PING_URL',
      'BACKUP_LOCK_WAIT',
    ]) {
      expect(example).toMatch(new RegExp(`^#${key}=`, 'm'));
    }
    expect(example.split('\n').filter((line) => /^[A-Z_]+=/.test(line))).toEqual([]);
    expect(example).toContain(`#RESTIC_IMAGE=${resticImage}`);
    expect(read('bin/ririko-backup.sh')).toContain(`readonly DEFAULT_RESTIC_IMAGE=${resticImage}`);
    expect(resticImage).not.toMatch(/:latest$/);
    expect(example).toContain('OFFLINE copy of RESTIC_PASSWORD');
  });

  it('backs up exactly the four app volumes the compose file declares', () => {
    const compose = readFileSync(
      new URL('../docker-compose.production.yml', import.meta.url),
      'utf8',
    );
    const volumesBlock = compose.split(/^volumes:\s*$/m).at(-1) ?? '';
    const declared = [...volumesBlock.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]);
    for (const volume of backupVolumes) {
      expect(declared).toContain(volume.replace(/^ririko_/, ''));
    }
    expect(read('bin/ririko-backup.sh')).toContain(
      `readonly BACKUP_VOLUMES=(${backupVolumes.join(' ')})`,
    );
  });
});

// --- ririko-watchdog -----------------------------------------------------------------------------
// Same approach again, with fake docker, curl, df and logger. The fake docker knows the containers
// of a scenario (a "<project> <name> <service>" line each, so containers of other projects can be
// present) and their "<status> <health>" output, and restarts a container into "running starting",
// as the real thing does.

const fakeWatchdogDocker = String.raw`#!/usr/bin/env bash
echo "docker $*" >>"$FAKE_DIR/docker.log"
case $1 in
  ps)
    if [ -e "$FAKE_DIR/ps_fails" ]; then echo "Cannot connect to the Docker daemon" >&2; exit 1; fi
    project=""
    for arg in "$@"; do
      case $arg in
        label=com.docker.compose.project=*) project=$(printf '%s' "$arg" | cut -d= -f3-) ;;
      esac
    done
    while read -r p name service; do
      if [ "$p" = "$project" ]; then echo "$name $service"; fi
    done <"$FAKE_DIR/containers"
    ;;
  inspect)
    for name in "$@"; do :; done
    if [ -e "$FAKE_DIR/state.$name" ]; then cat "$FAKE_DIR/state.$name"; else exit 1; fi
    ;;
  restart)
    if [ -e "$FAKE_DIR/restart_fails" ]; then exit 1; fi
    echo "running starting" >"$FAKE_DIR/state.$2"
    echo "$2"
    ;;
esac
`;

const fakeWatchdogCurl = String.raw`#!/usr/bin/env bash
echo "$*" >>"$FAKE_DIR/curl.log"
if (flock -n 7) 7>"$RIRIKO_LOCK" 2>/dev/null; then echo free; else echo held; fi >>"$FAKE_DIR/curl.lock"
if [ -e "$FAKE_DIR/curl_fails" ]; then exit 22; fi
`;

const fakeWatchdogDf = String.raw`#!/usr/bin/env bash
echo "$*" >>"$FAKE_DIR/df.log"
echo "Use%"
echo " $(cat "$FAKE_DIR/disk")%"
`;

const fakeWatchdogLogger = String.raw`#!/usr/bin/env bash
echo "$*" >>"$FAKE_DIR/logger.log"
`;

const watchdogHarness = (body: string) => `set -u
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/fake"
cat >"$work/bin/ririko-watchdog" <<'${heredocEnd}'
${hasBash ? read('bin/ririko-watchdog.sh') : ''}
${heredocEnd}
cat >"$work/bin/docker" <<'${heredocEnd}'
${fakeWatchdogDocker}
${heredocEnd}
cat >"$work/bin/curl" <<'${heredocEnd}'
${fakeWatchdogCurl}
${heredocEnd}
cat >"$work/bin/df" <<'${heredocEnd}'
${fakeWatchdogDf}
${heredocEnd}
cat >"$work/bin/logger" <<'${heredocEnd}'
${fakeWatchdogLogger}
${heredocEnd}
# Git Bash has no flock; the lock itself is only tested where the real one exists.
if ! command -v flock >/dev/null; then printf '#!/usr/bin/env bash\\nexit 0\\n' >"$work/bin/flock"; fi
chmod +x "$work/bin/"*
export FAKE_DIR="$work/fake"
export RIRIKO_CONF="$work/ririko.conf" RIRIKO_LOCK="$work/deploy.lock"
export DOCKER="$work/bin/docker" CURL="$work/bin/curl" DF="$work/bin/df" LOGGER="$work/bin/logger"
export PATH="$work/bin:$PATH"
echo 42 >"$FAKE_DIR/disk"
: >"$FAKE_DIR/containers"

# write_conf [extra line]...: a ririko.conf with a monitor URL; later lines win.
write_conf() {
  echo 'HEALTHCHECK_PING_URL=https://hc-ping.com/abc-123/' >"$RIRIKO_CONF"
  for extra in "$@"; do echo "$extra" >>"$RIRIKO_CONF"; done
}
# state <container> <"status health">: what docker inspect prints for it.
state() { echo "$2" >"$FAKE_DIR/state.$1"; }
# stack_ok: the three services every host runs, all healthy (the Lightsail hosts have no lavalink).
stack_ok() {
  printf '%s\\n' 'ririko ririko-postgres-1 postgres' 'ririko ririko-bot-1 bot' 'ririko ririko-web-1 web' >"$FAKE_DIR/containers"
  state ririko-postgres-1 'running healthy'; state ririko-bot-1 'running healthy'; state ririko-web-1 'running healthy'
}
# add_container <project> <name> <service> <"status health">
add_container() { echo "$1 $2 $3" >>"$FAKE_DIR/containers"; state "$2" "$4"; }
# run <args>: ririko-watchdog as root would run it.
run() { bash "$work/bin/ririko-watchdog" "$@" </dev/null >"$work/stdout" 2>"$work/stderr"; rc=$?; echo "$rc" >>"$work/rcs"; }
section() { printf '\\n@@%s\\n' "$1"; cat "$2" 2>/dev/null; }
report() {
  section stdout "$work/stdout"
  section stderr "$work/stderr"
  section rcs "$work/rcs"
  section docker "$FAKE_DIR/docker.log"
  section curl "$FAKE_DIR/curl.log"
  section curllock "$FAKE_DIR/curl.lock"
  section logger "$FAKE_DIR/logger.log"
  section df "$FAKE_DIR/df.log"
  printf '\\n@@end\\n'
}
${body}
report
`;

interface WatchdogReport {
  stdout: string[];
  stderr: string;
  rcs: number[];
  docker: string[];
  curl: string[];
  curlLock: string[];
  logger: string[];
  df: string[];
}

function watchdogScenario(body: string): WatchdogReport {
  const result = spawnSync('bash', ['-s'], { input: watchdogHarness(body), encoding: 'utf8' });
  expect(result.stdout, result.stderr).toContain('@@end');
  const sections: Record<string, string> = {};
  const parts = result.stdout.split(/^@@(\w+)\n/m);
  for (let index = 1; index < parts.length; index += 2) sections[parts[index]!] = parts[index + 1]!;
  return {
    stdout: lines(sections.stdout),
    stderr: (sections.stderr ?? '').trim(),
    rcs: lines(sections.rcs).map(Number),
    docker: lines(sections.docker),
    curl: lines(sections.curl),
    curlLock: lines(sections.curllock),
    logger: lines(sections.logger),
    df: lines(sections.df),
  };
}

const psCall =
  'docker ps -a --filter label=com.docker.compose.project=ririko --format {{.Names}} {{.Label "com.docker.compose.service"}}';
const inspectCall = (name: string) =>
  `docker inspect --format {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}} ${name}`;
const restarts = (docker: string[]) => docker.filter((line) => line.startsWith('docker restart'));
const heartbeat = '-fsS -m 10 --retry 3 -o /dev/null https://hc-ping.com/abc-123';
const failPing = (reason: string) =>
  `-fsS -m 10 --retry 3 -o /dev/null --data-raw ${reason} https://hc-ping.com/abc-123/fail`;
const loggerLine = (message: string) => `-t ririko-watchdog -p daemon.warning -- ${message}`;

describe.skipIf(!hasBash)('ririko-watchdog', () => {
  it('pings the heartbeat once when bot, web and postgres are healthy and the disk has room', () => {
    const result = watchdogScenario('write_conf\nstack_ok\nrun');
    expect(result.rcs).toEqual([0]);
    expect(result.stderr).toBe('');
    // Without lavalink in the project (the Lightsail hosts), the stack is still healthy.
    expect(result.docker).toEqual([
      psCall,
      inspectCall('ririko-postgres-1'),
      inspectCall('ririko-bot-1'),
      inspectCall('ririko-web-1'),
    ]);
    expect(result.curl).toEqual([heartbeat]);
    expect(result.df).toEqual(['--output=pcent /']);
    expect(result.logger).toEqual([]);
    expect(result.stdout).toHaveLength(1);
    expect(result.stdout[0]).toMatch(/stack healthy; root file system 42% full$/);
  });

  it('accepts lavalink when it is running, and only then', () => {
    const running = watchdogScenario(
      "write_conf\nstack_ok\nadd_container ririko ririko-lavalink-1 lavalink 'running '\nrun",
    );
    expect(running.curl).toEqual([heartbeat]);
    const stopped = watchdogScenario(
      "write_conf\nstack_ok\nadd_container ririko ririko-lavalink-1 lavalink 'exited '\nrun",
    );
    expect(stopped.curl).toEqual([failPing('lavalink is exited')]);
    expect(restarts(stopped.docker)).toEqual([]);
  });

  it('ignores the containers of other compose projects, such as ririko-lavalink', () => {
    const result = watchdogScenario(`write_conf
stack_ok
add_container ririko-lavalink ririko-lavalink-lavalink-1 lavalink 'running unhealthy'
add_container ririko-lavalink ririko-lavalink-wireguard-1 wireguard 'exited '
run`);
    expect(result.rcs).toEqual([0]);
    expect(result.curl).toEqual([heartbeat]);
    expect(result.docker.some((line) => line.includes('lavalink'))).toBe(false);
    expect(restarts(result.docker)).toEqual([]);
  });

  it('restarts an unhealthy container, logs it through logger and reports it', () => {
    const result = watchdogScenario(`write_conf
stack_ok
state ririko-bot-1 'running unhealthy'
run`);
    expect(result.rcs).toEqual([0]);
    expect(restarts(result.docker)).toEqual(['docker restart ririko-bot-1']);
    expect(result.logger).toEqual([
      loggerLine('restarting unhealthy container ririko-bot-1 (service bot)'),
      loggerLine('stack not healthy: bot was unhealthy and was restarted'),
    ]);
    expect(result.curl).toEqual([failPing('bot was unhealthy and was restarted')]);
  });

  it('restarts every unhealthy container and reports them all, with the disk reason', () => {
    const result = watchdogScenario(`write_conf
stack_ok
echo 91 >"$FAKE_DIR/disk"
state ririko-web-1 'running unhealthy'
state ririko-postgres-1 'running unhealthy'
run`);
    expect(restarts(result.docker)).toEqual([
      'docker restart ririko-postgres-1',
      'docker restart ririko-web-1',
    ]);
    expect(result.curl).toEqual([
      failPing(
        'postgres was unhealthy and was restarted; web was unhealthy and was restarted; root file system is 91% full (limit 85%)',
      ),
    ]);
  });

  it('leaves a restarted container alone while it starts, and pings again once it is healthy', () => {
    const result = watchdogScenario(`write_conf
stack_ok
state ririko-bot-1 'running unhealthy'
run
run
state ririko-bot-1 'running healthy'
run`);
    expect(result.rcs).toEqual([0, 0, 0]);
    // One restart (first run), a fail ping, then silence while "starting", then the heartbeat.
    expect(restarts(result.docker)).toHaveLength(1);
    expect(result.curl).toEqual([failPing('bot was unhealthy and was restarted'), heartbeat]);
  });

  it('neither pings nor fails while a container is only starting, and does not restart it', () => {
    const result = watchdogScenario(`write_conf
stack_ok
state ririko-bot-1 'running starting'
run`);
    expect(result.rcs).toEqual([0]);
    expect(restarts(result.docker)).toEqual([]);
    expect(result.curl).toEqual([]);
    expect(result.stdout).toHaveLength(1);
    expect(result.stdout[0]).toMatch(/stack is still starting \(bot\); no ping yet$/);
  });

  it.each([
    ['postgres has exited', "state ririko-postgres-1 'exited '", 'postgres is exited'],
    [
      'the web container is gone',
      'grep -v ririko-web-1 "$FAKE_DIR/containers" >"$FAKE_DIR/c" || true; mv "$FAKE_DIR/c" "$FAKE_DIR/containers"',
      'web is missing',
    ],
    [
      'the bot container cannot be inspected',
      'rm "$FAKE_DIR/state.ririko-bot-1"',
      'cannot inspect bot; bot is missing',
    ],
    [
      'the bot is running without a healthcheck',
      "state ririko-bot-1 'running '",
      'bot reports no health',
    ],
    ['the web is paused', "state ririko-web-1 'paused '", 'web is paused'],
  ])('posts the reason to /fail when %s', (_name, setup, reason) => {
    const result = watchdogScenario(`write_conf\nstack_ok\n${setup}\nrun`);
    expect(result.rcs).toEqual([0]);
    expect(result.curl).toEqual([failPing(reason)]);
    expect(restarts(result.docker)).toEqual([]);
  });

  it('reports a restart that fails', () => {
    const result = watchdogScenario(`write_conf
stack_ok
state ririko-web-1 'running unhealthy'
touch "$FAKE_DIR/restart_fails"
run`);
    expect(result.rcs).toEqual([0]);
    expect(result.logger).toContain(loggerLine('could not restart container ririko-web-1'));
    expect(result.curl).toEqual([failPing('web is unhealthy and could not be restarted')]);
  });

  it.each([
    ['below the default limit of 85', 'echo 84 >"$FAKE_DIR/disk"', '', true],
    ['at the default limit of 85', 'echo 85 >"$FAKE_DIR/disk"', '', false],
    ['above the default limit', 'echo 97 >"$FAKE_DIR/disk"', '', false],
    ['below a configured limit', 'echo 89 >"$FAKE_DIR/disk"', 'DISK_ALERT_PERCENT=90', true],
    ['at a configured limit', 'echo 90 >"$FAKE_DIR/disk"', 'DISK_ALERT_PERCENT=90', false],
    ['with a quoted limit', 'echo 60 >"$FAKE_DIR/disk"', 'DISK_ALERT_PERCENT="60"', false],
  ])('applies the disk threshold: %s', (_name, setup, conf, healthy) => {
    const result = watchdogScenario(`write_conf ${bashQuote(conf)}\nstack_ok\n${setup}\nrun`);
    expect(result.rcs).toEqual([0]);
    if (healthy) {
      expect(result.curl).toEqual([heartbeat]);
    } else {
      expect(result.curl).toHaveLength(1);
      expect(result.curl[0]).toMatch(
        /^-fsS -m 10 --retry 3 -o \/dev\/null --data-raw root file system is \d+% full \(limit \d+%\) https:\/\/hc-ping\.com\/abc-123\/fail$/,
      );
    }
  });

  it('names the limit that applies in the disk reason', () => {
    const result = watchdogScenario(
      `write_conf DISK_ALERT_PERCENT=90\nstack_ok\necho 93 >"$FAKE_DIR/disk"\nrun`,
    );
    expect(result.curl).toEqual([failPing('root file system is 93% full (limit 90%)')]);
  });

  it('only logs, and still restarts, when no HEALTHCHECK_PING_URL is set', () => {
    const result = watchdogScenario(`write_conf HEALTHCHECK_PING_URL=
stack_ok
run
state ririko-bot-1 'running unhealthy'
run`);
    expect(result.rcs).toEqual([0, 0]);
    expect(result.curl).toEqual([]);
    expect(restarts(result.docker)).toEqual(['docker restart ririko-bot-1']);
    expect(result.stdout.join('\n')).toMatch(/stack not healthy: bot was unhealthy/);
  });

  it('works without a ririko.conf at all', () => {
    const result = watchdogScenario('stack_ok\nrun');
    expect(result.rcs).toEqual([0]);
    expect(result.curl).toEqual([]);
    expect(result.stdout[0]).toMatch(/stack healthy; root file system 42% full$/);
  });

  it('only warns when the ping itself fails', () => {
    const result = watchdogScenario('write_conf\nstack_ok\ntouch "$FAKE_DIR/curl_fails"\nrun');
    expect(result.rcs).toEqual([0]);
    expect(result.stdout.join('\n')).toContain('warning: could not ping the heartbeat monitor');
  });

  it.each([
    ['no ririko.conf at all', 'rm -f "$RIRIKO_CONF"'],
    [
      'the untouched ririko.conf.example',
      `cat >"$RIRIKO_CONF" <<'EXAMPLE'\n${hasBash ? read('ririko.conf.example') : ''}\nEXAMPLE`,
    ],
    ['a configured monitor URL', 'write_conf'],
  ])('logs one line and exits 0, without a ping, when nothing is deployed (%s)', (_name, setup) => {
    const result = watchdogScenario(`${setup}\nrun`);
    expect(result.rcs).toEqual([0]);
    expect(result.stdout).toHaveLength(1);
    expect(result.stdout[0]).toMatch(
      /no containers of the compose project ririko; nothing deployed yet, skipping$/,
    );
    expect(result.stderr).toBe('');
    expect(result.docker).toEqual([psCall]);
    expect(result.curl).toEqual([]);
    expect(result.logger).toEqual([]);
  });

  it('treats a host that has only other projects the same as one with nothing deployed', () => {
    const result = watchdogScenario(`write_conf
add_container ririko-lavalink ririko-lavalink-lavalink-1 lavalink 'running unhealthy'
run`);
    expect(result.rcs).toEqual([0]);
    expect(result.docker).toEqual([psCall]);
    expect(result.curl).toEqual([]);
    expect(result.stdout[0]).toMatch(/nothing deployed yet, skipping$/);
  });

  it('fails without a ping when Docker cannot be reached, so the monitor alerts', () => {
    const result = watchdogScenario('write_conf\nstack_ok\ntouch "$FAKE_DIR/ps_fails"\nrun');
    expect(result.rcs).toEqual([1]);
    expect(result.stderr).toContain('docker ps failed; cannot check the stack');
    expect(result.curl).toEqual([]);
  });

  it.each([
    [
      'a plain http monitor URL',
      'HEALTHCHECK_PING_URL=http://hc-ping.com/abc',
      'HEALTHCHECK_PING_URL',
    ],
    ['a monitor URL with a space', 'HEALTHCHECK_PING_URL=https://a b', 'HEALTHCHECK_PING_URL'],
    ['a limit that is not a number', 'DISK_ALERT_PERCENT=lots', 'DISK_ALERT_PERCENT'],
    ['a limit of zero', 'DISK_ALERT_PERCENT=0', 'DISK_ALERT_PERCENT'],
    ['a limit above 100', 'DISK_ALERT_PERCENT=101', 'DISK_ALERT_PERCENT'],
  ])('reports %s with exit 1 but still restarts unhealthy containers', (_name, line, key) => {
    const result = watchdogScenario(`write_conf ${bashQuote(line)}
stack_ok
state ririko-bot-1 'running unhealthy'
run`);
    expect(result.rcs).toEqual([1]);
    expect(result.stderr).toContain(`invalid ${key}`);
    expect(restarts(result.docker)).toEqual(['docker restart ririko-bot-1']);
    if (key === 'HEALTHCHECK_PING_URL') expect(result.curl).toEqual([]);
  });

  it('never runs a line of ririko.conf', () => {
    const result = watchdogScenario(`write_conf 'x=$(touch "$work/pwned")' '$(touch "$work/pwned2")'
stack_ok
run
[ -e "$work/pwned" ] || [ -e "$work/pwned2" ] && echo pwned >>"$work/stderr"`);
    expect(result.rcs).toEqual([0]);
    expect(result.stderr).toBe('');
    expect(result.curl).toEqual([heartbeat]);
  });

  it('exits 2 for an argument', () => {
    const result = watchdogScenario('write_conf\nstack_ok\nrun now');
    expect(result.rcs).toEqual([2]);
    expect(result.stderr).toContain('Usage: ririko-watchdog');
    expect(result.docker).toEqual([]);
    expect(result.curl).toEqual([]);
  });

  it.skipIf(!hasFlock)(
    'logs one line and touches nothing while the lock is held, then resumes',
    () => {
      const result = watchdogScenario(`write_conf
stack_ok
state ririko-bot-1 'running unhealthy'
exec 8>"$RIRIKO_LOCK"
flock -n 8
run
exec 8>&-
run`);
      expect(result.rcs).toEqual([0, 0]);
      // Only the second run touched docker; the first one logged its skip and left.
      expect(result.docker[0]).toBe(psCall);
      expect(restarts(result.docker)).toHaveLength(1);
      expect(result.curl).toEqual([failPing('bot was unhealthy and was restarted')]);
      expect(result.logger).toHaveLength(2);
    },
  );

  it.skipIf(!hasFlock)('exits 0 with one log line and no docker call when the lock is held', () => {
    const result = watchdogScenario(`write_conf
stack_ok
state ririko-bot-1 'running unhealthy'
exec 8>"$RIRIKO_LOCK"
flock -n 8
run`);
    expect(result.rcs).toEqual([0]);
    expect(result.stdout).toHaveLength(1);
    expect(result.stdout[0]).toMatch(/holds \S+; skipping this check$/);
    expect(result.docker).toEqual([]);
    expect(result.curl).toEqual([]);
    expect(result.logger).toEqual([]);
  });

  it.skipIf(!hasFlock)('releases the lock before it pings the monitor', () => {
    const result = watchdogScenario('write_conf\nstack_ok\nrun');
    expect(result.rcs).toEqual([0]);
    expect(result.curlLock).toEqual(['free']);
  });
});

describe('ririko-watchdog wiring', () => {
  const directives = (entry: string) =>
    read(entry)
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('#'));

  it('ships the script and its two units under the names bootstrap installs', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'bin/ririko-watchdog.sh',
        'systemd/ririko-watchdog.service',
        'systemd/ririko-watchdog.timer',
      ]),
    );
  });

  it('runs the timer every minute, starting two minutes after boot', () => {
    expect(directives('systemd/ririko-watchdog.timer')).toEqual(
      expect.arrayContaining([
        'OnBootSec=2min',
        'OnUnitActiveSec=1min',
        'Unit=ririko-watchdog.service',
        'WantedBy=timers.target',
      ]),
    );
  });

  it('runs the script once per timer firing, after Docker, and never lets a run hang', () => {
    expect(directives('systemd/ririko-watchdog.service')).toEqual(
      expect.arrayContaining([
        'Type=oneshot',
        'ExecStart=/usr/local/bin/ririko-watchdog',
        'After=docker.service network-online.target',
        'TimeoutStartSec=2min',
      ]),
    );
  });

  it('documents its settings in ririko.conf.example, all commented out', () => {
    const example = read('ririko.conf.example');
    expect(example).toMatch(/^#HEALTHCHECK_PING_URL=https:\/\//m);
    expect(example).toMatch(/^#DISK_ALERT_PERCENT=85$/m);
    expect(example.split('\n').filter((line) => /^[A-Z_]+=/.test(line))).toEqual([]);
  });

  it('uses the lock path, project name and service names of the deploy scripts', () => {
    const script = read('bin/ririko-watchdog.sh');
    const lock = /RIRIKO_LOCK=\$\{RIRIKO_LOCK:-([^}]+)\}/;
    expect(script.match(lock)?.[1]).toBe(read('bin/ririko-deploy.sh').match(lock)?.[1]);
    expect(script).toContain('readonly PROJECT=ririko');
    expect(script).toContain('readonly REQUIRED_SERVICES=(bot web postgres)');
    const compose = readFileSync(
      new URL('../docker-compose.production.yml', import.meta.url),
      'utf8',
    );
    const servicesBlock = compose.split(/^services:\s*$/m)[1]!.split(/^volumes:\s*$/m)[0]!;
    const declared = [...servicesBlock.matchAll(/^ {2}(\w+):/gm)].map((match) => match[1]);
    expect(declared).toEqual(expect.arrayContaining(['bot', 'web', 'postgres']));
  });
});

// --- WireGuard link, Lavalink host firewall and bootstrap roles (TASK-1802) ----------------------
// The renderers are plain bash functions in deploy/host/lib. Their files are fed to bash through
// stdin together with the scenario, so the tests need no root, no network and no WireGuard.

const wgKey = (fill: number) => Buffer.alloc(32, fill).toString('base64');
const keyVps = wgKey(1);
const keyProduction = wgKey(2);
const keyStaging = wgKey(3);
const keyThird = wgKey(4);
const stagingIpv4 = '203.0.113.10';
const stagingIpv6 = '2001:db8::10';
const vpsPeers = `${keyProduction} 10.77.0.2/32 - 2333; ${keyStaging} 10.77.0.3/32 - 2334`;

const wgLibs = hasBash
  ? ['lib/wg-common.sh', 'lib/render-wireguard.sh', 'lib/render-nftables.sh']
      .map((entry) => read(entry))
      .join('\n')
  : '';

interface Render {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Runs `body` in a bash that has the three lib files sourced. */
const wgBash = (body: string): Render => {
  const result = runBash([], `set -u\n${wgLibs}\n${body}`);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

const shQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;
const renderWg = (role: string, address: string, port: string, key: string, peers: string) =>
  wgBash(`render_wireguard_conf ${[role, address, port, key, peers].map(shQuote).join(' ')}`);
const renderNft = (port: string, endpoints: string, peers: string) =>
  wgBash(`render_nftables ${[port, endpoints, peers].map(shQuote).join(' ')}`);

const wgHeader =
  '# Managed by deploy/host/bootstrap.sh (Ririko). Edit /etc/ririko/ririko.conf and run it again.';

describe.skipIf(!hasBash)('render_wireguard_conf', () => {
  it('renders the app role: dials the VPS, keepalive 25, only the VPS address allowed', () => {
    const result = renderWg(
      'app',
      '10.77.0.3/24',
      '',
      keyStaging,
      `${keyVps} 10.77.0.1/32 198.51.100.20:51820`,
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      [
        wgHeader,
        '[Interface]',
        'Address = 10.77.0.3/24',
        `PrivateKey = ${keyStaging}`,
        '',
        '[Peer]',
        `PublicKey = ${keyVps}`,
        'AllowedIPs = 10.77.0.1/32',
        'Endpoint = 198.51.100.20:51820',
        'PersistentKeepalive = 25',
        '',
      ].join('\n'),
    );
  });

  it('renders the lavalink role: listens, one /32 per peer, no keepalive, no endpoint', () => {
    const result = renderWg('lavalink', '10.77.0.1/24', '51820', keyVps, vpsPeers);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      [
        wgHeader,
        '[Interface]',
        'Address = 10.77.0.1/24',
        'ListenPort = 51820',
        `PrivateKey = ${keyVps}`,
        '',
        '[Peer]',
        `PublicKey = ${keyProduction}`,
        'AllowedIPs = 10.77.0.2/32',
        '',
        '[Peer]',
        `PublicKey = ${keyStaging}`,
        'AllowedIPs = 10.77.0.3/32',
        '',
      ].join('\n'),
    );
    expect(result.stdout).not.toContain('PersistentKeepalive');
    expect(result.stdout).not.toContain('Endpoint');
  });

  it('takes any number of peers, separated by semicolons or newlines, with a custom port', () => {
    const peers = `${keyProduction} 10.77.0.2/32\n${keyStaging} 10.77.0.3/32 - 2334 ; ${keyThird} 10.77.0.4/32`;
    const result = renderWg('lavalink', '10.77.0.1/24', '4444', keyVps, peers);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ListenPort = 4444');
    expect(result.stdout.match(/^\[Peer\]$/gm)).toHaveLength(3);
    expect(result.stdout).toContain('AllowedIPs = 10.77.0.4/32');
  });

  it('keeps the endpoint of a lavalink peer when one is given (an IPv6 literal too)', () => {
    const result = renderWg(
      'lavalink',
      '10.77.0.1/24',
      '51820',
      keyVps,
      `${keyProduction} 10.77.0.2/32 [2001:db8::1]:51820 2333`,
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Endpoint = [2001:db8::1]:51820');
  });

  it.each([
    ['an unknown role', ['db', '10.77.0.1/24', '51820', keyVps, vpsPeers], 'unknown role'],
    ['an address without a prefix', ['app', '10.77.0.3', '', keyVps, vpsPeers], 'WG_ADDRESS'],
    ['a prefix above 32', ['app', '10.77.0.3/33', '', keyVps, vpsPeers], 'WG_ADDRESS'],
    [
      'an address with an octet above 255',
      ['app', '10.77.0.256/24', '', keyVps, vpsPeers],
      'WG_ADDRESS',
    ],
    ['a listen port of 0', ['lavalink', '10.77.0.1/24', '0', keyVps, vpsPeers], 'WG_LISTEN_PORT'],
    [
      'a listen port above 65535',
      ['lavalink', '10.77.0.1/24', '65536', keyVps, vpsPeers],
      'WG_LISTEN_PORT',
    ],
    [
      'a listen port that is not a number',
      ['lavalink', '10.77.0.1/24', 'wg', keyVps, vpsPeers],
      'WG_LISTEN_PORT',
    ],
    [
      'a private key that is too short',
      ['lavalink', '10.77.0.1/24', '51820', 'abc=', vpsPeers],
      'private key',
    ],
    [
      'an app peer without an endpoint',
      ['app', '10.77.0.3/24', '', keyStaging, `${keyVps} 10.77.0.1/32`],
      'needs an endpoint',
    ],
    [
      'an empty peer list',
      ['lavalink', '10.77.0.1/24', '51820', keyVps, ' ; ;\n'],
      'peer list is empty',
    ],
  ])('refuses %s and prints nothing', (_name, args, message) => {
    const result = renderWg(...(args as [string, string, string, string, string]));
    expect({ status: result.status, stdout: result.stdout }).toEqual({ status: 1, stdout: '' });
    expect(result.stderr).toContain(message);
  });

  const peerWithKey = (key: string) => `${key} 10.77.0.2/32 - 2333`;
  it.each([
    ['a key that is too short', peerWithKey(keyProduction.slice(0, 40) + '='), 'public key'],
    ['a key without the final =', peerWithKey(keyProduction.slice(0, 43) + 'A'), 'public key'],
    [
      'a key with a character outside base64',
      peerWithKey(`${keyProduction.slice(0, 10)}!${keyProduction.slice(11)}`),
      'public key',
    ],
    [
      'a key whose last character cannot end 32 bytes',
      peerWithKey(`${keyProduction.slice(0, 42)}B=`),
      'public key',
    ],
    ['an allowed address without /32', `${keyProduction} 10.77.0.2 - 2333`, 'allowed address'],
    ['an allowed address with /24', `${keyProduction} 10.77.0.2/24 - 2333`, 'allowed address'],
    [
      'an allowed address that is a host name',
      `${keyProduction} peer.example/32 - 2333`,
      'allowed address',
    ],
    ['an IPv6 allowed address', `${keyProduction} fd00::2/32 - 2333`, 'allowed address'],
    [
      'an allowed address with a leading zero',
      `${keyProduction} 10.77.0.02/32 - 2333`,
      'allowed address',
    ],
    ['a missing allowed address', keyProduction, 'allowed address'],
    ['an endpoint without a port', `${keyProduction} 10.77.0.2/32 1.2.3.4 2333`, 'endpoint'],
    [
      'an endpoint port above 65535',
      `${keyProduction} 10.77.0.2/32 1.2.3.4:70000 2333`,
      'endpoint',
    ],
    [
      'an endpoint with a bad IPv4 literal',
      `${keyProduction} 10.77.0.2/32 1.2.3.999:51820 2333`,
      'endpoint',
    ],
    [
      'an endpoint with a bad host name',
      `${keyProduction} 10.77.0.2/32 -bad-.example:51820 2333`,
      'endpoint',
    ],
    [
      'an endpoint with a bad bracketed IPv6',
      `${keyProduction} 10.77.0.2/32 [not-ipv6]:51820 2333`,
      'endpoint',
    ],
    ['a port list with a bad port', `${keyProduction} 10.77.0.2/32 - 2333,abc`, 'ports'],
    ['a port list with port 0', `${keyProduction} 10.77.0.2/32 - 0`, 'ports'],
    ['an empty entry in the port list', `${keyProduction} 10.77.0.2/32 - 2333,,2334`, 'ports'],
    ['a fifth field', `${keyProduction} 10.77.0.2/32 - 2333 extra`, 'too many fields'],
    ['the same key twice', `${vpsPeers}; ${keyProduction} 10.77.0.9/32 - 2335`, 'listed twice'],
    ['the same address twice', `${vpsPeers}; ${keyThird} 10.77.0.2/32 - 2335`, 'listed twice'],
  ])('refuses a peer list with %s', (_name, peers, message) => {
    for (const result of [
      renderWg('lavalink', '10.77.0.1/24', '51820', keyVps, peers),
      renderNft('51820', stagingIpv4, peers),
    ]) {
      expect({ status: result.status, stdout: result.stdout }).toEqual({ status: 1, stdout: '' });
      expect(result.stderr).toContain(message);
      expect(result.stderr).toContain('WG_PEERS is invalid');
    }
  });

  it('never prints the private key to stderr, even when it refuses the peers', () => {
    const result = renderWg('lavalink', '10.77.0.1/24', '51820', keyVps, 'bad');
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain(keyVps);
  });
});

describe.skipIf(!hasBash)('render_nftables', () => {
  const expectedRuleset = (sourceRules: string[], peerRules: string[]) =>
    [
      wgHeader,
      '# The first line declares the table so the delete cannot fail on a host that never had it. The',
      "# file loads as one transaction and touches no other table (Docker's rules stay).",
      'table inet ririko',
      'delete table inet ririko',
      '',
      'table inet ririko {',
      '  chain input {',
      '    type filter hook input priority filter; policy drop;',
      '',
      '    ct state invalid drop',
      '    ct state established,related accept',
      '    iifname "lo" accept',
      '',
      '    # Ping, rate limited, and the IPv6 messages without which the network stops working.',
      '    icmp type echo-request limit rate 5/second burst 10 packets accept',
      '    icmpv6 type echo-request limit rate 5/second burst 10 packets accept',
      '    icmpv6 type { nd-router-solicit, nd-router-advert, nd-neighbor-solicit, nd-neighbor-advert } accept',
      '',
      "    # WireGuard handshakes, only from the app hosts' public addresses.",
      ...sourceRules.map((rule) => `    ${rule}`),
      '',
      '    # Lavalink, over WireGuard only: each peer reaches its own ports from its own address.',
      ...peerRules.map((rule) => `    ${rule}`),
      '  }',
      '}',
      '',
    ].join('\n');

  it('renders the staging and production peers of the shared Lavalink VPS', () => {
    const result = renderNft('51820', `${stagingIpv4} ${stagingIpv6}`, vpsPeers);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      expectedRuleset(
        [
          `ip saddr { ${stagingIpv4} } udp dport 51820 accept`,
          `ip6 saddr { ${stagingIpv6} } udp dport 51820 accept`,
        ],
        [
          'iifname "wg0" ip saddr 10.77.0.2 tcp dport { 2333 } accept',
          'iifname "wg0" ip saddr 10.77.0.3 tcp dport { 2334 } accept',
        ],
      ),
    );
  });

  it('drops by default, never flushes the whole ruleset and only recreates its own table', () => {
    const { stdout } = renderNft('51820', stagingIpv4, vpsPeers);
    expect(stdout).toContain('type filter hook input priority filter; policy drop;');
    expect(stdout).not.toMatch(/^\s*flush\b/m);
    const tableLines = stdout
      .split('\n')
      .filter((line) => /^\s*(table|delete|flush|add|create)\b/.test(line));
    expect(tableLines).toEqual([
      'table inet ririko',
      'delete table inet ririko',
      'table inet ririko {',
    ]);
  });

  it('allows only loopback, established traffic, rate limited ICMP, WireGuard and the peer ports', () => {
    const { stdout } = renderNft('51820', stagingIpv4, vpsPeers);
    const accepted = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.endsWith(' accept'))
      .map((line) => line.replace(/ \{.*\}/, ' {…}'));
    expect(accepted).toEqual([
      'ct state established,related accept',
      'iifname "lo" accept',
      'icmp type echo-request limit rate 5/second burst 10 packets accept',
      'icmpv6 type echo-request limit rate 5/second burst 10 packets accept',
      'icmpv6 type {…} accept',
      'ip saddr {…} udp dport 51820 accept',
      'iifname "wg0" ip saddr 10.77.0.2 tcp dport {…} accept',
      'iifname "wg0" ip saddr 10.77.0.3 tcp dport {…} accept',
    ]);
  });

  it('takes IPv4-only endpoints, commas, prefixes and another listen port', () => {
    const result = renderNft('51999', '203.0.113.10, 198.51.100.0/24', vpsPeers);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'ip saddr { 203.0.113.10, 198.51.100.0/24 } udp dport 51999 accept',
    );
    expect(result.stdout).not.toContain('ip6 saddr');
  });

  it('takes an IPv6-only endpoint list', () => {
    const result = renderNft('51820', `${stagingIpv6}/128`, vpsPeers);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`ip6 saddr { ${stagingIpv6}/128 } udp dport 51820 accept`);
    expect(result.stdout).not.toContain('ip saddr {');
  });

  it('is generic: one peer with one port, or many peers with their own port lists', () => {
    const one = renderNft('51820', stagingIpv4, `${keyProduction} 10.77.0.2/32 - 2333`);
    expect(one.stdout.match(/tcp dport/g)).toHaveLength(1);

    const many = renderNft(
      '51820',
      stagingIpv4,
      [
        `${keyProduction} 10.77.0.2/32 - 2333`,
        `${keyStaging} 10.77.0.3/32 - 2334,2335,2334`,
        `${keyThird} 10.77.0.4/32 1.2.3.4:51820`,
        `${keyVps} 10.77.0.5/32 - 2336`,
      ].join('; '),
    );
    expect(many.status).toBe(0);
    const rules = many.stdout.match(/^ {4}iifname "wg0".*$/gm);
    expect(rules).toEqual([
      '    iifname "wg0" ip saddr 10.77.0.2 tcp dport { 2333 } accept',
      '    iifname "wg0" ip saddr 10.77.0.3 tcp dport { 2334, 2335 } accept',
      '    iifname "wg0" ip saddr 10.77.0.5 tcp dport { 2336 } accept',
    ]);
  });

  it.each([
    ['a listen port of 0', ['0', stagingIpv4, vpsPeers], 'WG_LISTEN_PORT'],
    ['no endpoints', ['51820', '  ', vpsPeers], 'WG_ALLOWED_ENDPOINTS is empty'],
    [
      'an endpoint that is a host name',
      ['51820', 'lightsail.example', vpsPeers],
      'WG_ALLOWED_ENDPOINTS',
    ],
    ['an endpoint with a bad octet', ['51820', '203.0.113.300', vpsPeers], 'WG_ALLOWED_ENDPOINTS'],
    ['an IPv4 prefix above 32', ['51820', '203.0.113.0/33', vpsPeers], 'WG_ALLOWED_ENDPOINTS'],
    [
      'an endpoint with a shell character',
      ['51820', '1.2.3.4; flush ruleset', vpsPeers],
      'WG_ALLOWED_ENDPOINTS',
    ],
    [
      'no peer with a ports field',
      ['51820', stagingIpv4, `${keyProduction} 10.77.0.2/32`],
      'no peer has a ports field',
    ],
  ])('refuses %s and prints nothing', (_name, args, message) => {
    const result = renderNft(...(args as [string, string, string]));
    expect({ status: result.status, stdout: result.stdout }).toEqual({ status: 1, stdout: '' });
    expect(result.stderr).toContain(message);
  });
});

describe.skipIf(!hasBash)('wg-common helpers', () => {
  const check = (fn: string, value: string) =>
    wgBash(`${fn} ${shQuote(value)} && echo yes || echo no`).stdout.trim();

  it.each([
    ['::1', true],
    ['2001:db8:0:0:0:0:0:10', true],
    ['2001:db8::', true],
    ['fe80::1:2', true],
    ['1:2:3:4:5:6:7:8', true],
    ['1:2:3:4:5:6:7::', true],
    ['1::2::3', false],
    ['1:2:3:4:5:6:7', false],
    ['1:2:3:4:5:6:7:8:9', false],
    ['12345::1', false],
    ['::g', false],
    [':::', false],
    [':1:2:3:4:5:6:7', false],
    ['1.2.3.4', false],
    ['', false],
  ])('wg_valid_ipv6 %j is %s', (value, expected) => {
    expect(check('wg_valid_ipv6', value)).toBe(expected ? 'yes' : 'no');
  });

  it.each([
    ['0.0.0.0', true],
    ['10.77.0.1', true],
    ['255.255.255.255', true],
    ['256.0.0.1', false],
    ['1.2.3', false],
    ['1.2.3.4.5', false],
    ['01.2.3.4', false],
    ['1.2.3.-4', false],
    ['a.b.c.d', false],
  ])('wg_valid_ipv4 %j is %s', (value, expected) => {
    expect(check('wg_valid_ipv4', value)).toBe(expected ? 'yes' : 'no');
  });

  it('reads a ririko.conf value without sourcing the file', () => {
    const result = wgBash(`work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cat >"$work/ririko.conf" <<'${heredocEnd}'
# a comment
#WG_ADDRESS=10.0.0.1/24
WG_ADDRESS=10.77.0.1/24
WG_PEERS="first; second"
WG_LISTEN_PORT='51999'
WG_ALLOWED_ENDPOINTS=$(touch "$work/pwned")
WG_ADDRESS=10.77.0.9/24
${heredocEnd}
printf '[%s]\\n' "$(conf_value "$work/ririko.conf" WG_ADDRESS)"
printf '[%s]\\n' "$(conf_value "$work/ririko.conf" WG_PEERS)"
printf '[%s]\\n' "$(conf_value "$work/ririko.conf" WG_LISTEN_PORT)"
printf '[%s]\\n' "$(conf_value "$work/ririko.conf" WG_ALLOWED_ENDPOINTS)"
printf '[%s]\\n' "$(conf_value "$work/ririko.conf" WG_MISSING)"
printf '[%s]\\n' "$(conf_value "$work/missing.conf" WG_ADDRESS)"
test -e "$work/pwned" && echo pwned || echo clean`);
    expect(result.status).toBe(0);
    expect(result.stdout.trim().split('\n')).toEqual([
      '[10.77.0.9/24]',
      '[first; second]',
      '[51999]',
      '[$(touch "$work/pwned")]',
      '[]',
      '[]',
      'clean',
    ]);
  });
});

// Only root can ask the kernel to check a ruleset; elsewhere (CI runs as an ordinary user) this is
// skipped, and the live hosts run the same `nft -c` in bootstrap.sh before anything is loaded.
const canCheckNft =
  hasBash &&
  spawnSync('bash', ['-c', 'command -v nft >/dev/null && nft -c -f /dev/null']).status === 0;

describe.skipIf(!canCheckNft)(
  'render_nftables output (needs root and nft; skipped otherwise)',
  () => {
    it('passes nft -c', () => {
      const result = wgBash(`work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
render_nftables 51820 ${shQuote(`${stagingIpv4} ${stagingIpv6}`)} ${shQuote(vpsPeers)} >"$work/ririko.nft"
nft -c -f "$work/ririko.nft"`);
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    });
  },
);

describe.skipIf(!hasBash)('bootstrap.sh roles', () => {
  const bootstrap = hasBash ? read('bootstrap.sh') : '';
  const sshKey = (name: string) => `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${name}Key ci-${name}`;

  it('documents the role and the per-context deploy keys in --help', () => {
    const result = runBash(['--help'], bootstrap);
    expect(result.status).toBe(0);
    for (const text of ['--role app|lavalink', '--deploy-key-staging', '--deploy-key-production']) {
      expect(result.stdout).toContain(text);
    }
  });

  it.each([
    ['an unknown role', ['--ref', 'v2.0.0', '--role', 'db'], 'invalid --role'],
    ['a role without a value', ['--ref', 'v2.0.0', '--role'], '--role needs a value'],
    [
      'the app role with a staging key',
      ['--ref', 'v2.0.0', '--deploy-key-staging', sshKey('Staging')],
      'are for --role lavalink',
    ],
    [
      'the app role with a production key',
      ['--ref', 'v2.0.0', '--role', 'app', '--deploy-key-production', sshKey('Production')],
      'are for --role lavalink',
    ],
    [
      'the lavalink role with --deploy-key',
      ['--ref', 'v2.0.0', '--role', 'lavalink', '--deploy-key', sshKey('One')],
      '--deploy-key is for --role app',
    ],
    [
      'a staging key that is not a public key',
      ['--ref', 'v2.0.0', '--role', 'lavalink', '--deploy-key-staging', 'ssh-ed25519 AAAA"; id'],
      '--deploy-key-staging is not a single-line SSH public key',
    ],
    [
      'a production key with a second line',
      [
        '--ref',
        'v2.0.0',
        '--role',
        'lavalink',
        '--deploy-key-production',
        `${sshKey('A')}\n${sshKey('B')}`,
      ],
      '--deploy-key-production is not a single-line SSH public key',
    ],
  ])('exits 2 for %s before it needs root', (_name, args, message) => {
    const result = runBash(args, bootstrap);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(message);
  });

  describe('render_deploy_authorized_keys', () => {
    const fn = /^render_deploy_authorized_keys\(\) \{\n[\s\S]*?^\}$/m.exec(bootstrap)?.[0];
    const render = (
      role: string,
      keys: { app?: string; staging?: string; production?: string },
      current = '',
    ) =>
      runBash(
        [],
        `set -euo pipefail
ROLE=${shQuote(role)}
DEPLOY_KEY=${shQuote(keys.app ?? '')}
DEPLOY_KEY_STAGING=${shQuote(keys.staging ?? '')}
DEPLOY_KEY_PRODUCTION=${shQuote(keys.production ?? '')}
${fn}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
${current === '' ? '' : `printf '%s\\n' ${shQuote(current)} >"$work/authorized_keys"`}
render_deploy_authorized_keys "$work/authorized_keys"`,
      );
    const stagingLine = `restrict,command="/usr/local/bin/ririko-deploy-ssh staging" ${sshKey('Staging')}`;
    const productionLine = `restrict,command="/usr/local/bin/ririko-deploy-ssh production" ${sshKey('Production')}`;

    it('finds the function in bootstrap.sh', () => {
      expect(fn).toContain('ririko-deploy-ssh');
    });

    it('app role: the one key, forced to ririko-deploy-ssh with restrict', () => {
      const result = render('app', { app: sshKey('App') });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(
        `restrict,command="/usr/local/bin/ririko-deploy-ssh" ${sshKey('App')}\n`,
      );
    });

    it('lavalink role: one key per context, each forced to its own instance', () => {
      const result = render('lavalink', {
        staging: sshKey('Staging'),
        production: sshKey('Production'),
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(`${stagingLine}\n${productionLine}\n`);
    });

    it('lavalink role: a context without a key keeps its current line, and nothing else', () => {
      const current = [
        'ssh-ed25519 AAAAunrelated someone',
        `restrict,command="/usr/local/bin/ririko-deploy-ssh production" ${sshKey('OldProduction')}`,
        `restrict,command="/usr/local/bin/ririko-deploy-ssh staging" ${sshKey('OldStaging')}`,
        `restrict,command="/usr/local/bin/ririko-deploy-ssh staging-x" ${sshKey('Other')}`,
      ].join('\n');
      const result = render('lavalink', { staging: sshKey('Staging') }, current);
      expect(result.status).toBe(0);
      expect(result.stdout).toBe(
        `${stagingLine}\nrestrict,command="/usr/local/bin/ririko-deploy-ssh production" ${sshKey('OldProduction')}\n`,
      );
    });

    it('lavalink role: one key gives only its own line when there is nothing to keep', () => {
      expect(render('lavalink', { production: sshKey('Production') }).stdout).toBe(
        `${productionLine}\n`,
      );
    });
  });
});

describe('bootstrap.sh roles, WireGuard and firewall wiring', () => {
  const bootstrap = read('bootstrap.sh');
  const body = (name: string) =>
    new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?^\\}$`, 'm').exec(bootstrap)?.[0] ?? '';
  const nonComment = (entry: string) =>
    read(entry)
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));

  it('ships the renderers, the firewall unit and the example keys', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'lib/wg-common.sh',
        'lib/render-wireguard.sh',
        'lib/render-nftables.sh',
        'files/ririko-firewall.service',
      ]),
    );
    const example = read('ririko.conf.example');
    for (const key of ['WG_ADDRESS', 'WG_LISTEN_PORT', 'WG_PEERS', 'WG_ALLOWED_ENDPOINTS']) {
      expect(example).toMatch(new RegExp(`^#${key}=`, 'm'));
    }
    expect(example.split('\n').filter((line) => /^[A-Z_]+=/.test(line))).toEqual([]);
  });

  it('sources the renderers from the downloaded tree and defaults to the app role', () => {
    expect(bootstrap).toMatch(/^ROLE=app$/m);
    for (const lib of ['wg-common', 'render-wireguard', 'render-nftables']) {
      expect(body('load_libs')).toContain(`$SRC/lib/${lib}.sh`);
    }
    expect(body('fetch_release_tree')).toContain('load_libs');
  });

  it('runs WireGuard on both roles and the firewall only on the lavalink role', () => {
    const run = bootstrap.slice(bootstrap.indexOf('# --- Run'));
    expect(run).toMatch(/^setup_wireguard$/m);
    expect(run).toMatch(/if \[\[ \$ROLE == lavalink \]\]; then\n {2}setup_firewall\nfi/);
    expect(run.indexOf('create_layout')).toBeLessThan(run.indexOf('setup_wireguard'));
    expect(run.indexOf('setup_wireguard')).toBeLessThan(run.indexOf('setup_firewall'));
  });

  it('creates the key once with mode 0600 and prints the public key', () => {
    const setup = body('setup_wireguard');
    expect(setup).toContain('ensure_packages wireguard-tools');
    expect(setup).toContain('[[ ! -s $WIREGUARD_KEY ]]');
    expect(setup).toContain('umask 077');
    expect(setup).toContain('wg genkey');
    expect(setup).toContain('install -m 0600');
    expect(setup).toContain('wg pubkey');
    expect(bootstrap).toContain('WIREGUARD_KEY=/etc/wireguard/private.key');
    expect(setup).toContain('/etc/wireguard/wg0.conf 600');
    expect(setup).toContain('wg-quick@wg0');
    expect(setup).toContain('WG_ADDRESS');
    expect(setup).toContain('WG_PEERS');
    expect(setup).toContain('WG_LISTEN_PORT');
    expect(setup).toContain('51820');
  });

  it('checks the rendered rules with nft -c before it installs or loads them', () => {
    const setup = body('setup_firewall');
    const order = [
      'render_nftables',
      'nft -c -f',
      'sync_file "$WORK/ririko.nft" /etc/nftables.d/ririko.nft',
      'systemctl restart ririko-firewall.service',
    ].map((text) => setup.indexOf(text));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(setup).toContain('WG_ALLOWED_ENDPOINTS');
  });

  it('removes the interim firewall only after the new table is loaded and verified', () => {
    const setup = body('setup_firewall');
    const loaded = setup.indexOf('firewall_loaded || die');
    const removed = setup.indexOf('remove_interim_firewall');
    expect(loaded).toBeGreaterThan(setup.indexOf('systemctl restart ririko-firewall.service'));
    expect(removed).toBeGreaterThan(loaded);
    const interim = body('remove_interim_firewall');
    expect(interim).toContain('ririko-firewall-interim.service');
    expect(interim).toContain('systemctl disable --now');
    expect(interim).toContain('/etc/systemd/system/$unit');
    expect(interim).toContain('/etc/ririko/firewall-interim.nft');
    expect(interim).toContain('nft delete table inet ririko_interim');
    // The new table must survive the interim service's own stop; the script re-checks and reloads.
    expect(setup.slice(removed)).toContain('firewall_loaded');
  });

  it('never flushes the ruleset or touches Docker tables, anywhere under deploy/host', () => {
    const offenders = files
      .filter((entry) => !entry.endsWith('.json'))
      .flatMap((entry) => nonComment(entry).map((line) => ({ entry, line })))
      .filter(({ line }) =>
        /flush\s+ruleset|nft\s+flush|iptables\s+-F|nft\s+delete\s+table\s+(ip|ip6|inet)\s+(nat|filter|docker)/i.test(
          line,
        ),
      );
    expect(offenders).toEqual([]);
  });

  it('loads the firewall at boot from /etc/nftables.d/ririko.nft, after nftables.service', () => {
    const lines = nonComment('files/ririko-firewall.service');
    expect(lines).toEqual(
      expect.arrayContaining([
        'Type=oneshot',
        'RemainAfterExit=yes',
        'ExecStart=/usr/sbin/nft -f /etc/nftables.d/ririko.nft',
        'After=local-fs.target nftables.service',
        'Before=network-pre.target',
        'WantedBy=multi-user.target',
      ]),
    );
    expect(read('lib/render-nftables.sh')).toContain('delete table inet ririko');
  });

  it('keeps the backup timer, script and directories to the app role', () => {
    expect(body('role_skips')).toContain('$ROLE == lavalink && $1 == ririko-backup*');
    const install = body('install_host_scripts');
    expect(install.match(/role_skips/g)).toHaveLength(3);
    expect(install).toContain('systemctl disable --now ririko-backup.timer');
    const layout = body('create_layout');
    expect(layout).toMatch(
      /if \[\[ \$ROLE == app \]\]; then\n[\s\S]*\/opt\/ririko\/backups\/nightly\n {2}fi/,
    );
    expect(layout.split('if [[ $ROLE == app ]]')[0]).not.toContain('backups');
  });

  it('writes the deploy keys of both contexts through render_deploy_authorized_keys', () => {
    const user = body('setup_deploy_user');
    expect(user).toContain('render_deploy_authorized_keys "$home/.ssh/authorized_keys"');
    expect(user).toContain('DEPLOY_KEY_STAGING');
    expect(user).toContain('DEPLOY_KEY_PRODUCTION');
    expect(body('render_deploy_authorized_keys')).toContain(
      'restrict,command="/usr/local/bin/ririko-deploy-ssh %s" %s',
    );
  });
});

// --- Lavalink host role (TASK-1803) --------------------------------------------------------------
// ririko-deploy, ririko-deploy-ssh and ririko-watchdog with RIRIKO_ROLE=lavalink. The fake docker
// logs every call with the environment the real compose file reads, remembers which release each
// service was last started from, and the fake curl answers /version from that (a release listed in
// "bad_version" answers 503), reading the Authorization header from stdin as the real curl does.

const stagingPeers = `${keyStaging} 10.77.0.3/32 - 2334`;
const productionPeers = `${keyProduction} 10.77.0.2/32 - 2333`;

const fakeLavalinkDocker = String.raw`#!/usr/bin/env bash
echo "WG_ADDRESS=$WG_ADDRESS PRODUCTION_ENV=$LAVALINK_PRODUCTION_ENV_FILE STAGING_ENV=$LAVALINK_STAGING_ENV_FILE PRODUCTION_HEAP=$LAVALINK_PRODUCTION_HEAP STAGING_HEAP=$LAVALINK_STAGING_HEAP docker $*" >>"$FAKE_DIR/docker.log"
sub=""
file=""
prev=""
for arg in "$@"; do
  if [ "$prev" = -f ]; then file=$arg; fi
  prev=$arg
  case $arg in
    pull|up|ps|logs) if [ -z "$sub" ]; then sub=$arg; fi ;;
  esac
done
version=$(echo "$file" | sed -E 's#.*/releases/([^/]+)/.*#\1#')
service=$prev
listed() {
  for v in $(cat "$FAKE_DIR/$1" 2>/dev/null); do
    if [ "$v" = "$version" ]; then return 0; fi
  done
  return 1
}
case $sub in
  pull) if listed bad_pull; then exit 1; fi; exit 0 ;;
  up)
    if listed bad_up; then exit 1; fi
    echo "$version" >"$FAKE_DIR/up.$service"
    case " $* " in
      *" --no-deps "*) ;;
      *) if [ -e "$FAKE_DIR/init.$service" ]; then cat "$FAKE_DIR/init.$service" >>"$FAKE_DIR/started"; fi ;;
    esac
    exit 0 ;;
  ps) echo "NAME STATUS fake-ps-of-$version"; exit 0 ;;
  logs) echo "fake-log-line of $service on $version"; exit 0 ;;
esac
exit 0
`;

const fakeLavalinkCurl = String.raw`#!/usr/bin/env bash
echo "$*" >>"$FAKE_DIR/curl.log"
out=""
url=""
while [ $# -gt 0 ]; do
  case $1 in
    --output|-o) out=$2; shift ;;
    http://*|https://*) url=$1 ;;
  esac
  shift
done
case $url in
  http://*/version)
    header=$(cat)
    port=$(echo "$url" | sed -E 's#^http://[^:]+:([0-9]+)/.*#\1#')
    echo "port=$port url=$url header=$header" >>"$FAKE_DIR/version.log"
    case $port in 2333) service=lavalink-production ;; 2334) service=lavalink-staging ;; esac
    up=$(cat "$FAKE_DIR/up.$service" 2>/dev/null)
    code=200
    for v in $(cat "$FAKE_DIR/bad_version" 2>/dev/null); do
      if [ "$v" = "$up" ]; then code=503; fi
    done
    if [ -e "$FAKE_DIR/not_ready_checks" ]; then
      n=$(cat "$FAKE_DIR/not_ready_checks")
      if [ "$n" -gt 0 ]; then echo $((n - 1)) >"$FAKE_DIR/not_ready_checks"; code=503; fi
    fi
    printf '%s' "$code"
    exit 0 ;;
  https://*)
    if [ -e "$FAKE_DIR/curl_fail" ] && grep -qF "$(cat "$FAKE_DIR/curl_fail")" <<<"$url"; then
      echo "curl: (22) The requested URL returned error: 404" >&2
      exit 22
    fi
    path=$(echo "$url" | sed -E 's#^https://raw.githubusercontent.com/[^/]+/[^/]+/v[^/]+/##')
    if [ -e "$FAKE_DIR/same.$(basename "$path")" ]; then
      echo "# fake $path" >"$out"
    else
      echo "# fake $url" >"$out"
    fi ;;
esac
`;

const lavalinkHarness = (body: string) => `set -u
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin" "$work/fake"
cat >"$work/bin/ririko-deploy" <<'${heredocEnd}'
${hasBash ? read('bin/ririko-deploy.sh') : ''}
${heredocEnd}
cat >"$work/bin/ririko-deploy-ssh" <<'${heredocEnd}'
${hasBash ? read('bin/ririko-deploy-ssh.sh') : ''}
${heredocEnd}
cat >"$work/bin/docker" <<'${heredocEnd}'
${fakeLavalinkDocker}
${heredocEnd}
cat >"$work/bin/curl" <<'${heredocEnd}'
${fakeLavalinkCurl}
${heredocEnd}
cat >"$work/bin/sudo" <<'${heredocEnd}'
${fakeSudo}
${heredocEnd}
# Git Bash has no flock; the lock itself is only tested where the real one exists.
if ! command -v flock >/dev/null; then printf '#!/usr/bin/env bash\\nexit 0\\n' >"$work/bin/flock"; fi
chmod +x "$work/bin/"*
export FAKE_DIR="$work/fake"
export RIRIKO_ROOT="$work/root" RIRIKO_CONF="$work/ririko.conf" RIRIKO_LOCK="$work/deploy.lock"
export DOCKER="$work/bin/docker" CURL="$work/bin/curl" READY_POLL_SECONDS=0.1
export PATH="$work/bin:$PATH"
mkdir -p "$RIRIKO_ROOT"

# conf [extra line]...: a Lavalink host that runs staging (port 2334); later lines win.
conf() {
  printf '%s\\n' 'RIRIKO_ROLE=lavalink' 'WG_ADDRESS=10.77.0.1/24' 'WG_PEERS="${stagingPeers}"' \\
    'LAVALINK_READY_TIMEOUT=1' "$@" >"$RIRIKO_CONF"
}
# password <instance> <value>: the instance's env file.
password() { printf 'LAVALINK_PASSWORD=%s\\nSPOTIFY_CLIENT_ID=\\n' "$2" >"$RIRIKO_ROOT/lavalink-$1.env"; }
conf
password staging pw-staging

# run <args>: ririko-deploy as root would run it; ssh <instance> <command>: the forced command.
run() { bash "$work/bin/ririko-deploy" "$@" </dev/null >"$work/stdout" 2>"$work/stderr"; rc=$?; echo "$rc" >>"$work/rcs"; }
ssh() { SSH_ORIGINAL_COMMAND="$2" bash "$work/bin/ririko-deploy-ssh" "$1" </dev/null >"$work/stdout" 2>"$work/stderr"; rc=$?; echo "$rc" >>"$work/rcs"; }
section() { printf '\\n@@%s\\n' "$1"; cat "$2" 2>/dev/null; }
report() {
  section stdout "$work/stdout"
  section stderr "$work/stderr"
  section rcs "$work/rcs"
  section docker "$FAKE_DIR/docker.log"
  section curl "$FAKE_DIR/curl.log"
  section version "$FAKE_DIR/version.log"
  section sudo "$FAKE_DIR/sudo.log"
  section started "$FAKE_DIR/started"
  section log "$RIRIKO_ROOT/deploy.log"
  printf '\\n@@state\\n'
  for f in "$RIRIKO_ROOT"/state/*; do
    if [ -f "$f" ]; then echo "$(basename "$f")=$(tr '\\n' '|' <"$f")"; fi
  done
  printf '\\n@@tree\\n'; (cd "$RIRIKO_ROOT" 2>/dev/null && find releases -type f | sort)
  printf '\\n@@releases\\n'; ls -A "$RIRIKO_ROOT/releases" 2>/dev/null
  printf '\\n@@end\\n'
}
${body}
report
`;

interface LavalinkReport {
  stdout: string;
  stderr: string;
  rcs: number[];
  docker: string[];
  curl: string[];
  version: string[];
  sudo: string[];
  started: string[];
  log: string[];
  state: Record<string, string>;
  tree: string[];
  releases: string[];
}

function lavalinkScenario(body: string): LavalinkReport {
  const result = spawnSync('bash', ['-s'], { input: lavalinkHarness(body), encoding: 'utf8' });
  expect(result.stdout, result.stderr).toContain('@@end');
  const sections: Record<string, string> = {};
  const parts = result.stdout.split(/^@@(\w+)\n/m);
  for (let index = 1; index < parts.length; index += 2) sections[parts[index]!] = parts[index + 1]!;
  return {
    stdout: sections.stdout ?? '',
    stderr: sections.stderr ?? '',
    rcs: lines(sections.rcs).map(Number),
    docker: lines(sections.docker),
    curl: lines(sections.curl),
    version: lines(sections.version),
    sudo: lines(sections.sudo),
    started: lines(sections.started),
    log: lines(sections.log),
    state: Object.fromEntries(
      lines(sections.state).map((line) => [line.split('=')[0]!, line.slice(line.indexOf('=') + 1)]),
    ),
    tree: lines(sections.tree),
    releases: lines(sections.releases),
  };
}

const lavalinkFiles = ['deploy/lavalink/docker-compose.yml', 'docker/lavalink/application.yml'];
/** The docker call for a Lavalink release, as the fake docker logs it. */
const lavalinkCall = (
  version: string,
  subcommand: string,
  env = 'PRODUCTION_ENV=/dev/null STAGING_ENV=\\S+/lavalink-staging\\.env',
  heaps = 'PRODUCTION_HEAP= STAGING_HEAP=',
) =>
  new RegExp(
    `^WG_ADDRESS=10\\.77\\.0\\.1 ${env} ${heaps} docker compose -p ririko-lavalink ` +
      `-f \\S+/releases/${escapeDots(version)}/deploy/lavalink/docker-compose\\.yml ${subcommand}`,
  );
const shaLine =
  /^[0-9a-f]{64} {2}(deploy\/lavalink\/docker-compose\.yml|docker\/lavalink\/application\.yml)$/;

describe.skipIf(!hasBash)('ririko-deploy-ssh on a Lavalink host', () => {
  const run = (cases: Array<[string, string]>) => {
    const body = cases
      .map(
        ([instance, command], index) =>
          `rm -f "$FAKE_DIR/sudo.log"; ssh ${bashQuote(instance)} ${bashQuote(command)}; ` +
          `printf 'case${index} rc=%s err=%s sudo=%s\\n' "$rc" "$(cat "$work/stderr")" ` +
          `"$(cat "$FAKE_DIR/sudo.log" 2>/dev/null)" >>"$work/cases"`,
      )
      .join('\n');
    return lines(lavalinkScenario(`${body}\ncp "$work/cases" "$work/stdout"`).stdout);
  };

  it('takes the instance from its own argument and still accepts only deploy and status', () => {
    const cases: Array<[string, string]> = [
      ['staging', 'deploy 2.1.3'],
      ['production', 'deploy 2.1.3-rc.1'],
      ['staging', 'status'],
      ['production', 'status'],
    ];
    expect(run(cases)).toEqual([
      'case0 rc=0 err= sudo=-n /usr/local/bin/ririko-deploy deploy 2.1.3 staging',
      'case1 rc=0 err= sudo=-n /usr/local/bin/ririko-deploy deploy 2.1.3-rc.1 production',
      'case2 rc=0 err= sudo=-n /usr/local/bin/ririko-deploy status staging',
      'case3 rc=0 err= sudo=-n /usr/local/bin/ririko-deploy status production',
    ]);
  });

  it('never takes the instance from SSH_ORIGINAL_COMMAND', () => {
    const cases: Array<[string, string]> = [
      ['staging', 'deploy 2.1.3 production'],
      ['staging', 'deploy 2.1.3 staging'],
      ['production', 'status staging'],
      ['staging', 'deploy 2.1.3 production;id'],
      ['staging', 'deploy 2.1.3\nproduction'],
      ['staging', ''],
      ['production', 'bash'],
      ['staging', 'deploy latest'],
    ];
    expect(run(cases)).toEqual(
      cases.map((_, index) => `case${index} rc=2 err=command not allowed sudo=`),
    );
  });

  it('refuses an argument that is not an instance, before it reads the command', () => {
    const cases: Array<[string, string]> = [
      ['latest', 'deploy 2.1.3'],
      ['staging;id', 'deploy 2.1.3'],
      ['Staging', 'status'],
      ['staging production', 'status'],
      ['--help', 'status'],
      ['../staging', 'deploy 2.1.3'],
    ];
    expect(run(cases)).toEqual(
      cases.map((_, index) => `case${index} rc=2 err=instance not allowed sudo=`),
    );
  });
});

describe.skipIf(!hasBash)('ririko-deploy on a Lavalink host', () => {
  it('deploys the first release of staging: download, pull, recreate only that service, /version', () => {
    const result = lavalinkScenario('run deploy 2.1.3 staging');
    expect(result.rcs).toEqual([0]);
    const downloads = result.curl.filter((line) => line.includes('https://'));
    expect(downloads.map((line) => line.split(' ').at(-1))).toEqual(
      lavalinkFiles.map((file) => `${repoUrl}/v2.1.3/${file}`),
    );
    // Both files of the tag, with the repository layout, plus the three state files.
    expect(result.tree).toEqual([
      'releases/2.1.3/deploy/lavalink/docker-compose.yml',
      'releases/2.1.3/docker/lavalink/application.yml',
    ]);
    expect(Object.keys(result.state).sort()).toEqual([
      'lavalink-staging.current',
      'lavalink-staging.sha',
    ]);
    expect(result.state['lavalink-staging.current']).toBe('2.1.3|');
    const sha = result.state['lavalink-staging.sha']!.split('|').filter(Boolean);
    expect(sha).toHaveLength(2);
    for (const line of sha) expect(line).toMatch(shaLine);
    // Only lavalink-staging is pulled and recreated, without --no-deps, on the WireGuard address
    // without its prefix; the production env file does not exist here, so it is /dev/null.
    expect(result.docker).toHaveLength(2);
    expect(result.docker[0]).toMatch(lavalinkCall('2.1.3', 'pull lavalink-staging$'));
    expect(result.docker[1]).toMatch(lavalinkCall('2.1.3', 'up -d lavalink-staging$'));
    expect(result.docker.join('\n')).not.toContain('lavalink-production$');
    expect(result.stdout).toContain('lavalink-staging is ready');
  });

  it('checks http://<WG_ADDRESS>:<port>/version with the password, never on a command line', () => {
    const result = lavalinkScenario('run deploy 2.1.3 staging');
    expect(result.version).toEqual([
      'port=2334 url=http://10.77.0.1:2334/version header=Authorization: pw-staging',
    ]);
    // A Lavalink host has no database: no migration, whatever the release ships.
    expect(result.docker).toHaveLength(2);
    expect(result.docker.join('\n')).not.toMatch(/db:migrate| run /);
    const everything = [
      ...result.curl,
      ...result.docker,
      ...result.log,
      result.stdout,
      result.stderr,
    ].join('\n');
    expect(everything).not.toContain('pw-staging');
    expect(result.curl.at(-1)).toBe(
      '--silent --output /dev/null --write-out %{http_code} --max-time 5 --header @- http://10.77.0.1:2334/version',
    );
  });

  it('keeps polling /version until it answers 200 and fails when it never does', () => {
    const slow = lavalinkScenario(`
echo 3 >"$FAKE_DIR/not_ready_checks"
conf 'LAVALINK_READY_TIMEOUT=10'
run deploy 2.1.3 staging`);
    expect(slow.rcs).toEqual([0]);
    expect(slow.version).toHaveLength(4);
    expect(slow.state['lavalink-staging.current']).toBe('2.1.3|');

    const never = lavalinkScenario(`
echo 2.1.3 >"$FAKE_DIR/bad_version"
run deploy 2.1.3 staging`);
    expect(never.rcs).toEqual([5]);
    expect(never.version.length).toBeGreaterThan(1);
    expect(never.state).toEqual({});
  });

  it('prints "unchanged" and leaves the container alone when both files match', () => {
    const result = lavalinkScenario(`
touch "$FAKE_DIR/same.docker-compose.yml" "$FAKE_DIR/same.application.yml"
run deploy 2.1.3 staging
run deploy 2.1.4 staging`);
    expect(result.rcs).toEqual([0, 0]);
    expect(result.stdout).toContain('unchanged');
    // Only the first deploy touched Docker; the second one downloaded the files and compared.
    expect(result.docker).toHaveLength(2);
    expect(result.docker.every((line) => line.includes('/releases/2.1.3/'))).toBe(true);
    expect(result.version).toHaveLength(1);
    expect(result.releases).toEqual(['2.1.3', '2.1.4']);
    expect(result.curl.filter((line) => line.includes('/v2.1.4/'))).toHaveLength(2);
    expect(result.state['lavalink-staging.current']).toBe('2.1.4|');
    expect(result.state['lavalink-staging.previous']).toBe('2.1.3|');
  });

  it.each([
    ['docker-compose.yml', 'application.yml'],
    ['application.yml', 'docker-compose.yml'],
  ])('recreates the service when only %s changed', (_changed, same) => {
    const result = lavalinkScenario(`
touch "$FAKE_DIR/same.${same}"
run deploy 2.1.3 staging
run deploy 2.1.4 staging`);
    expect(result.rcs).toEqual([0, 0]);
    expect(result.stdout).not.toContain('unchanged');
    expect(result.docker).toHaveLength(4);
    expect(result.docker[2]).toMatch(lavalinkCall('2.1.4', 'pull lavalink-staging$'));
    expect(result.docker[3]).toMatch(lavalinkCall('2.1.4', 'up -d lavalink-staging$'));
    expect(result.state['lavalink-staging.current']).toBe('2.1.4|');
    expect(result.state['lavalink-staging.previous']).toBe('2.1.3|');
  });

  it('starts the previous release of that instance again and exits 4 when /version never answers', () => {
    const result = lavalinkScenario(`
run deploy 2.1.2 staging
cp "$RIRIKO_ROOT/state/lavalink-staging.sha" "$work/sha-before"
echo 2.1.3 >"$FAKE_DIR/bad_version"
run deploy 2.1.3 staging
cat "$work/sha-before" "$RIRIKO_ROOT/state/lavalink-staging.sha" >"$work/stdout"`);
    expect(result.rcs).toEqual([0, 4]);
    const calls = result.docker.filter((line) => /(pull|up -d) /.test(line));
    expect(calls).toHaveLength(6);
    expect(calls[2]).toMatch(lavalinkCall('2.1.3', 'pull lavalink-staging$'));
    expect(calls[3]).toMatch(lavalinkCall('2.1.3', 'up -d lavalink-staging$'));
    expect(calls[4]).toMatch(lavalinkCall('2.1.2', 'pull lavalink-staging$'));
    expect(calls[5]).toMatch(lavalinkCall('2.1.2', 'up -d lavalink-staging$'));
    expect(
      result.docker.some((line) => line.includes(' logs --no-color --tail 100 lavalink-staging')),
    ).toBe(true);
    expect(result.stderr).toContain('rolled back to 2.1.2');
    // Nothing is recorded for the failed release: the state still describes what runs.
    expect(result.state['lavalink-staging.current']).toBe('2.1.2|');
    expect(result.state['lavalink-staging.previous']).toBeUndefined();
    const [before, after] = [
      result.stdout.split('\n').slice(0, 2),
      result.stdout.split('\n').slice(2, 4),
    ];
    expect(after).toEqual(before);
  });

  it('exits 5 when the first release of an instance does not answer', () => {
    const result = lavalinkScenario(`
echo 2.1.3 >"$FAKE_DIR/bad_version"
run deploy 2.1.3 staging`);
    expect(result.rcs).toEqual([5]);
    expect(result.stderr).toContain('no previous release');
    expect(result.docker.filter((line) => line.includes(' up -d '))).toHaveLength(1);
    expect(result.state).toEqual({});
  });

  it('rolls back when the pull or the recreate of the new release fails', () => {
    const pull = lavalinkScenario(`
run deploy 2.1.2 staging
echo 2.1.3 >"$FAKE_DIR/bad_pull"
run deploy 2.1.3 staging`);
    expect(pull.rcs).toEqual([0, 4]);
    expect(pull.docker.filter((line) => line.includes(' up -d '))).toHaveLength(2);
    expect(pull.docker.at(-1)).toMatch(lavalinkCall('2.1.2', 'up -d lavalink-staging$'));

    const up = lavalinkScenario(`
run deploy 2.1.2 staging
echo 2.1.3 >"$FAKE_DIR/bad_up"
run deploy 2.1.3 staging`);
    expect(up.rcs).toEqual([0, 4]);
    expect(up.state['lavalink-staging.current']).toBe('2.1.2|');
  });

  it("starts the instance's init service with it, and never the other instance's", () => {
    // The fake docker starts the init service of an instance only when `up` is called without
    // --no-deps, as Compose does for a depends_on with service_completed_successfully.
    const result = lavalinkScenario(`
conf 'WG_PEERS="${productionPeers}; ${stagingPeers}"'
password production pw-production
echo lavalink-staging-plugins >"$FAKE_DIR/init.lavalink-staging"
echo lavalink-production-plugins >"$FAKE_DIR/init.lavalink-production"
run deploy 2.1.3 staging`);
    expect(result.rcs).toEqual([0]);
    expect(result.started).toEqual(['lavalink-staging-plugins']);
    expect(result.docker.some((line) => line.includes('--no-deps'))).toBe(false);
    expect(result.docker.filter((line) => /lavalink-production(-plugins)?$/.test(line))).toEqual(
      [],
    );
  });

  it('refuses the instance this host does not run with exit 2 before it touches anything', () => {
    const result = lavalinkScenario(`
run deploy 2.1.3 production
run deploy 2.1.3
run deploy 2.1.3 dev
run deploy 2.1.3 staging extra
run status production`);
    expect(result.rcs).toEqual([2, 2, 2, 2, 2]);
    expect(result.docker).toEqual([]);
    expect(result.curl).toEqual([]);
    expect(result.releases).toEqual([]);
    expect(result.state).toEqual({});
  });

  it('says which instances the host runs when the other one is asked for', () => {
    const result = lavalinkScenario('run deploy 2.1.3 production');
    expect(result.rcs).toEqual([2]);
    expect(result.stderr).toContain('does not run the production Lavalink instance');
    expect(result.stderr).toContain('it runs: staging');
  });

  it('works for a production-only host (its own VM) and refuses staging there', () => {
    const result = lavalinkScenario(`
conf 'WG_PEERS="${productionPeers}"'
password production pw-production
run deploy 2.1.3 production
run deploy 2.1.3 staging`);
    expect(result.rcs).toEqual([0, 2]);
    expect(result.version).toEqual([
      'port=2333 url=http://10.77.0.1:2333/version header=Authorization: pw-production',
    ]);
    expect(result.docker[1]).toMatch(
      lavalinkCall(
        '2.1.3',
        'up -d lavalink-production$',
        'PRODUCTION_ENV=\\S+/lavalink-production\\.env STAGING_ENV=\\S+/lavalink-staging\\.env',
      ),
    );
    expect(Object.keys(result.state)).toContain('lavalink-production.current');
    expect(Object.keys(result.state)).not.toContain('lavalink-staging.current');
  });

  it('runs both instances of one VPS, each with its own state, env file and heap', () => {
    const result = lavalinkScenario(`
conf 'WG_PEERS="${productionPeers}; ${stagingPeers}"' 'LAVALINK_PRODUCTION_HEAP=768m'
password production pw-production
run deploy 2.1.3 staging
run deploy 2.1.3 production
run status`);
    expect(result.rcs).toEqual([0, 0, 0]);
    const env =
      'PRODUCTION_ENV=\\S+/lavalink-production\\.env STAGING_ENV=\\S+/lavalink-staging\\.env';
    const heaps = 'PRODUCTION_HEAP=768m STAGING_HEAP=';
    expect(result.docker[1]).toMatch(lavalinkCall('2.1.3', 'up -d lavalink-staging$', env, heaps));
    expect(result.docker[3]).toMatch(
      lavalinkCall('2.1.3', 'up -d lavalink-production$', env, heaps),
    );
    expect(result.version.map((line) => line.slice(0, 9))).toEqual(['port=2334', 'port=2333']);
    // One release directory, both files in place.
    expect(result.tree).toEqual(lavalinkFiles.map((file) => `releases/2.1.3/${file}`));
    expect(Object.keys(result.state).sort()).toEqual([
      'lavalink-production.current',
      'lavalink-production.sha',
      'lavalink-staging.current',
      'lavalink-staging.sha',
    ]);
    // status lists both, production first.
    expect(result.log.filter((line) => line.includes(' status: '))).toEqual([
      expect.stringMatching(/status: lavalink-production current=2\.1\.3 previous=none$/),
      expect.stringMatching(/status: lavalink-staging current=2\.1\.3 previous=none$/),
    ]);
  });

  it('reads the instances from LAVALINK_INSTANCES or from the ports of the WG_PEERS entries', () => {
    const cases: Array<[string[], string]> = [
      [['LAVALINK_INSTANCES="production staging"'], 'production staging'],
      [['LAVALINK_INSTANCES=staging,production'], 'production staging'],
      [['LAVALINK_INSTANCES=production'], 'production'],
      [[`WG_PEERS="${keyStaging} 10.77.0.3/32 - 2333,2334"`], 'production staging'],
      [
        [`WG_PEERS="${keyStaging} 10.77.0.3/32 - 2334,9999; ${keyProduction} 10.77.0.2/32 -"`],
        'staging',
      ],
      [[`WG_PEERS="${productionPeers}"`], 'production'],
      // The explicit list wins over the peers.
      [[`WG_PEERS="${productionPeers}"`, 'LAVALINK_INSTANCES=staging'], 'staging'],
    ];
    const body = cases
      .map(
        ([settings], index) =>
          `conf ${settings.map(bashQuote).join(' ')}\n` +
          `run status\n` +
          `echo "case${index}: $(grep -o 'lavalink-[a-z]* current' "$work/stdout" | cut -d' ' -f1 | tr '\\n' ' ')" >>"$work/cases"`,
      )
      .join('\n');
    const result = lavalinkScenario(`${body}\ncp "$work/cases" "$work/stdout"`);
    expect(lines(result.stdout)).toEqual(
      cases.map(
        ([, expected], index) =>
          `case${index}: ${expected
            .split(' ')
            .map((name) => `lavalink-${name}`)
            .join(' ')} `,
      ),
    );
  });

  it.each([
    ['an unknown instance word', 'LAVALINK_INSTANCES=staging,dev', 'invalid LAVALINK_INSTANCES'],
    ['no instance at all', 'WG_PEERS=', 'no Lavalink instance configured'],
    [
      'peers without a Lavalink port',
      `WG_PEERS=${keyStaging} 10.77.0.3/32 - 8080`,
      'no Lavalink instance',
    ],
    ['no WG_ADDRESS', 'WG_ADDRESS=', 'invalid or missing WG_ADDRESS'],
    [
      'a WG_ADDRESS that is not an IPv4 address',
      'WG_ADDRESS=10.77.0.1;id',
      'invalid or missing WG_ADDRESS',
    ],
    ['an out-of-range WG_ADDRESS', 'WG_ADDRESS=10.77.0.256/24', 'invalid or missing WG_ADDRESS'],
    [
      'a timeout that is not a number',
      'LAVALINK_READY_TIMEOUT=soon',
      'invalid LAVALINK_READY_TIMEOUT',
    ],
    ['a heap that is not a size', 'LAVALINK_STAGING_HEAP=lots', 'invalid Lavalink heap'],
    ['a role that does not exist', 'RIRIKO_ROLE=db', 'invalid RIRIKO_ROLE'],
  ])(
    'refuses %s in ririko.conf with exit 1 before it downloads anything',
    (_name, line, message) => {
      const result = lavalinkScenario(`conf ${bashQuote(line)}\nrun deploy 2.1.3 staging`);
      expect(result.rcs).toEqual([1]);
      expect(result.stderr).toContain(message);
      expect(result.curl).toEqual([]);
      expect(result.docker).toEqual([]);
      expect(result.releases).toEqual([]);
    },
  );

  it.each([
    ['a missing env file', 'rm "$RIRIKO_ROOT/lavalink-staging.env"', 'env file'],
    [
      'an env file without a password',
      'password staging ""',
      'LAVALINK_PASSWORD is empty or missing',
    ],
    [
      'an env file with only another variable',
      'echo SPOTIFY_CLIENT_ID=x >"$RIRIKO_ROOT/lavalink-staging.env"',
      'LAVALINK_PASSWORD is empty or missing',
    ],
  ])('stops with exit 1 before the lock and the download for %s', (_name, setup, message) => {
    const result = lavalinkScenario(`${setup}\nrun deploy 2.1.3 staging`);
    expect(result.rcs).toEqual([1]);
    expect(result.stderr).toContain(message);
    expect(result.curl).toEqual([]);
    expect(result.docker).toEqual([]);
  });

  it('reads the password of the last assignment, without quotes or a carriage return', () => {
    const result = lavalinkScenario(`
printf 'LAVALINK_PASSWORD=old\\r\\nLAVALINK_PASSWORD="pw with space"\\r\\n' >"$RIRIKO_ROOT/lavalink-staging.env"
run deploy 2.1.3 staging`);
    expect(result.rcs).toEqual([0]);
    expect(result.version).toEqual([
      'port=2334 url=http://10.77.0.1:2334/version header=Authorization: pw with space',
    ]);
  });

  it('changes nothing when the tag or one of its files cannot be downloaded', () => {
    const result = lavalinkScenario(`
run deploy 2.1.2 staging
echo application.yml >"$FAKE_DIR/curl_fail"
run deploy 2.1.3 staging`);
    expect(result.rcs).toEqual([0, 1]);
    expect(result.stderr).toContain('could not download');
    expect(result.docker).toHaveLength(2);
    expect(result.releases).toEqual(['2.1.2']);
    expect(result.state['lavalink-staging.current']).toBe('2.1.2|');
  });

  it('downloads from the repository named in ririko.conf', () => {
    const result = lavalinkScenario(
      `conf 'RIRIKO_REPO=Example/Fork'\nrun deploy 2.1.3-rc.1 staging`,
    );
    expect(result.rcs).toEqual([0]);
    expect(result.curl[0]).toContain(
      'https://raw.githubusercontent.com/Example/Fork/v2.1.3-rc.1/deploy/lavalink/docker-compose.yml',
    );
  });

  it('prints the state and the container of an instance for status', () => {
    const result = lavalinkScenario(`
run deploy 2.1.2 staging
echo 2.1.1 >"$RIRIKO_ROOT/state/lavalink-staging.previous"
run status staging`);
    expect(result.rcs).toEqual([0, 0]);
    expect(result.stdout).toContain('lavalink-staging current=2.1.2 previous=2.1.1');
    expect(result.stdout).toContain('NAME STATUS fake-ps-of-2.1.2');
    expect(result.docker.at(-1)).toMatch(lavalinkCall('2.1.2', 'ps lavalink-staging$'));
  });

  it('refuses an instance on an app host (exit 2) and keeps the app behaviour without a role', () => {
    const result = lavalinkScenario(`
printf '%s\\n' 'RIRIKO_ENV_FILE='"$work/env.production" >"$RIRIKO_CONF"
: >"$work/env.production"
run deploy 2.1.3 staging
run status staging`);
    expect(result.rcs).toEqual([2, 2]);
    expect(result.stderr).toContain('takes no instance');
    expect(result.docker).toEqual([]);
    expect(result.curl).toEqual([]);
  });

  it.skipIf(!hasFlock)('exits 3 while another run holds the lock after DEPLOY_LOCK_WAIT', () => {
    const result = lavalinkScenario(`
conf 'DEPLOY_LOCK_WAIT=1'
exec 8>"$RIRIKO_LOCK"
flock -n 8
run deploy 2.1.3 staging`);
    expect(result.rcs).toEqual([3]);
    expect(result.stderr).toContain('was not free within');
    expect(result.curl).toEqual([]);
    expect(result.releases).toEqual([]);
  });

  it.skipIf(!hasFlock)(
    'keeps the same order as the app deploy: temporary directories are cleaned up only under the lock',
    () => {
      const result = lavalinkScenario(`
mkdir -p "$RIRIKO_ROOT/releases/.tmp.keep"
conf 'DEPLOY_LOCK_WAIT=10'
(
  exec 8>"$RIRIKO_LOCK"
  flock -n 8
  sleep 1
  if test -d "$RIRIKO_ROOT/releases/.tmp.keep"; then echo kept >"$RIRIKO_ROOT/probe"; fi
) &
sleep 0.2
run deploy 2.1.3 staging
wait
cat "$RIRIKO_ROOT/probe" >"$work/stdout" 2>/dev/null`);
      expect(result.rcs).toEqual([0]);
      expect(result.stdout.trim()).toBe('kept');
      expect(result.releases).toEqual(['2.1.3']);
    },
  );
});

// The watchdog scenarios reuse the harness above; the body replaces the fake curl with one that
// answers /version per port ("version_fail.<port>" makes it 503) and logs the header it reads.
const fakeLavalinkWatchdogCurl = String.raw`#!/usr/bin/env bash
echo "$*" >>"$FAKE_DIR/curl.log"
url=""
for arg in "$@"; do
  case $arg in http://*|https://*) url=$arg ;; esac
done
case $url in
  http://*/version)
    header=$(cat)
    port=$(echo "$url" | sed -E 's#^http://[^:]+:([0-9]+)/.*#\1#')
    echo "port=$port header=$header" >>"$FAKE_DIR/version.log"
    if [ -e "$FAKE_DIR/version_fail.$port" ]; then printf '503'; else printf '200'; fi
    exit 0 ;;
esac
if [ -e "$FAKE_DIR/curl_fails" ]; then exit 22; fi
`;

const lavalinkWatchdogScenario = (body: string) =>
  watchdogScenario(`
export RIRIKO_ROOT="$work/root"
mkdir -p "$RIRIKO_ROOT/state"
cat >"$work/bin/curl" <<'${heredocEnd}'
${fakeLavalinkWatchdogCurl}
${heredocEnd}
chmod +x "$work/bin/curl"
# lavalink_conf [extra line]...: a Lavalink host that runs staging; later lines win.
lavalink_conf() {
  write_conf 'RIRIKO_ROLE=lavalink' 'WG_ADDRESS=10.77.0.1/24' 'WG_PEERS="${stagingPeers}"' "$@"
}
password() { printf 'LAVALINK_PASSWORD=%s\\n' "$2" >"$RIRIKO_ROOT/lavalink-$1.env"; }
password staging pw-staging
password production pw-production
# instance_up <instance>: its container, running.
instance_up() { add_container ririko-lavalink "ririko-lavalink-lavalink-$1-1" "lavalink-$1" 'running '; }
# failures <instance>: the failure counter of the instance, empty when there is none.
failures() { tr -d '\\n' <"$RIRIKO_ROOT/state/watchdog-lavalink-$1" 2>/dev/null; echo; }
lavalink_conf
${body}
`);

describe.skipIf(!hasBash)('ririko-watchdog on a Lavalink host', () => {
  const staging = 'ririko-lavalink-lavalink-staging-1';
  const production = 'ririko-lavalink-lavalink-production-1';
  const lavalinkPs =
    'docker ps -a --filter label=com.docker.compose.project=ririko-lavalink --format {{.Names}} {{.Label "com.docker.compose.service"}}';

  it('pings the heartbeat when the container runs and /version answers', () => {
    const result = lavalinkWatchdogScenario('instance_up staging\nrun');
    expect(result.rcs).toEqual([0]);
    expect(result.stderr).toBe('');
    expect(result.docker).toEqual([lavalinkPs, inspectCall(staging)]);
    expect(result.curl).toEqual([
      '--silent --output /dev/null --write-out %{http_code} --max-time 5 --header @- http://10.77.0.1:2334/version',
      heartbeat,
    ]);
    expect(result.logger).toEqual([]);
    expect(result.stdout[0]).toMatch(/stack healthy; root file system 42% full$/);
  });

  it('checks both instances of a VPS, production first, each with its own password', () => {
    const result = lavalinkWatchdogScenario(`
lavalink_conf 'WG_PEERS="${productionPeers}; ${stagingPeers}"'
instance_up production
instance_up staging
run
sed 's/^/V /' "$FAKE_DIR/version.log" >>"$FAKE_DIR/curl.log"`);
    expect(result.rcs).toEqual([0]);
    expect(result.docker).toEqual([lavalinkPs, inspectCall(production), inspectCall(staging)]);
    // The password reaches curl on stdin only: no argument and no logger line has it.
    const version = (port: number) =>
      `--silent --output /dev/null --write-out %{http_code} --max-time 5 --header @- http://10.77.0.1:${port}/version`;
    expect(result.curl).toEqual([
      version(2333),
      version(2334),
      heartbeat,
      'V port=2333 header=Authorization: pw-production',
      'V port=2334 header=Authorization: pw-staging',
    ]);
    expect(result.logger).toEqual([]);
  });

  it('ignores the one-shot init services, which exit 0 by design', () => {
    const result = lavalinkWatchdogScenario(`
lavalink_conf 'WG_PEERS="${productionPeers}; ${stagingPeers}"'
instance_up production
instance_up staging
add_container ririko-lavalink ririko-lavalink-lavalink-staging-plugins-1 lavalink-staging-plugins 'exited '
add_container ririko-lavalink ririko-lavalink-lavalink-production-plugins-1 lavalink-production-plugins 'exited '
run; run; run; run`);
    expect(result.rcs).toEqual([0, 0, 0, 0]);
    expect(result.docker.filter((line) => line.includes('plugins'))).toEqual([]);
    expect(restarts(result.docker)).toEqual([]);
    expect(result.curl.filter((line) => line === heartbeat)).toHaveLength(4);
    expect(result.logger).toEqual([]);
  });

  it('does not take a host with only its init service for a deployed one', () => {
    const result = lavalinkWatchdogScenario(`
add_container ririko-lavalink ririko-lavalink-lavalink-staging-plugins-1 lavalink-staging-plugins 'exited '
run`);
    // The instance itself is missing, which is reported as such (never restarted).
    expect(result.curl).toEqual([failPing('lavalink-staging is missing (failed check 1 of 3)')]);
    expect(restarts(result.docker)).toEqual([]);
  });

  it('checks only the instances the host is configured for', () => {
    const result = lavalinkWatchdogScenario(`
instance_up staging
add_container ririko-lavalink ${production} lavalink-production 'exited '
run`);
    expect(result.rcs).toEqual([0]);
    expect(result.docker).toEqual([lavalinkPs, inspectCall(staging)]);
    expect(result.curl.filter((line) => line.includes('/version'))).toHaveLength(1);
    expect(result.curl.at(-1)).toBe(heartbeat);
    expect(restarts(result.docker)).toEqual([]);
  });

  it('honours LAVALINK_INSTANCES over the peers', () => {
    const result = lavalinkWatchdogScenario(`
lavalink_conf 'LAVALINK_INSTANCES=production'
instance_up production
add_container ririko-lavalink ${staging} lavalink-staging 'exited '
run`);
    expect(result.docker).toEqual([lavalinkPs, inspectCall(production)]);
    expect(result.curl.at(-1)).toBe(heartbeat);
  });

  it('counts consecutive failed /version checks and restarts on the third', () => {
    const result = lavalinkWatchdogScenario(`
instance_up staging
touch "$FAKE_DIR/version_fail.2334"
run; echo "after1 $(failures staging)" >>"$FAKE_DIR/curl.log"
run; echo "after2 $(failures staging)" >>"$FAKE_DIR/curl.log"
run; echo "after3 $(failures staging)" >>"$FAKE_DIR/curl.log"`);
    expect(result.rcs).toEqual([0, 0, 0]);
    expect(restarts(result.docker)).toEqual([`docker restart ${staging}`]);
    const pings = result.curl.filter((line) => line.startsWith('-fsS') || line.startsWith('after'));
    expect(pings).toEqual([
      failPing('lavalink-staging does not answer /version (failed check 1 of 3)'),
      'after1 1',
      failPing('lavalink-staging does not answer /version (failed check 2 of 3)'),
      'after2 2',
      failPing('lavalink-staging does not answer /version; restarted after 3 failed checks'),
      'after3 ',
    ]);
    expect(result.logger).toContain(
      loggerLine(
        `restarting lavalink-staging (container ${staging}): lavalink-staging does not answer /version in 3 checks in a row`,
      ),
    );
  });

  it('needs three more failed checks before it restarts the same instance again', () => {
    const result = lavalinkWatchdogScenario(`
instance_up staging
touch "$FAKE_DIR/version_fail.2334"
run; run; run; run; run
echo "counter $(failures staging)" >>"$FAKE_DIR/curl.log"`);
    expect(restarts(result.docker)).toHaveLength(1);
    expect(result.curl.at(-1)).toBe('counter 2');
  });

  it('forgets earlier failures after a good check', () => {
    const result = lavalinkWatchdogScenario(`
instance_up staging
touch "$FAKE_DIR/version_fail.2334"
run; run
echo "failing $(failures staging)" >>"$FAKE_DIR/curl.log"
rm "$FAKE_DIR/version_fail.2334"
run
echo "recovered $(failures staging)" >>"$FAKE_DIR/curl.log"
touch "$FAKE_DIR/version_fail.2334"
run
echo "again $(failures staging)" >>"$FAKE_DIR/curl.log"`);
    expect(restarts(result.docker)).toEqual([]);
    const marks = result.curl.filter((line) => /^(failing|recovered|again)/.test(line));
    expect(marks).toEqual(['failing 2', 'recovered ', 'again 1']);
    expect(result.curl.filter((line) => line === heartbeat)).toHaveLength(1);
  });

  it('keeps a counter for each instance', () => {
    const result = lavalinkWatchdogScenario(`
lavalink_conf 'WG_PEERS="${productionPeers}; ${stagingPeers}"'
instance_up production
instance_up staging
touch "$FAKE_DIR/version_fail.2334"
run; run
echo "production=$(failures production) staging=$(failures staging)" >>"$FAKE_DIR/curl.log"`);
    expect(result.curl.at(-1)).toBe('production= staging=2');
    expect(result.curl.filter((line) => line.startsWith('-fsS'))).toEqual([
      failPing('lavalink-staging does not answer /version (failed check 1 of 3)'),
      failPing('lavalink-staging does not answer /version (failed check 2 of 3)'),
    ]);
  });

  it('counts a container that is not running and restarts it on the third check', () => {
    const result = lavalinkWatchdogScenario(`
add_container ririko-lavalink ${staging} lavalink-staging 'exited '
run; run; run`);
    expect(result.rcs).toEqual([0, 0, 0]);
    expect(restarts(result.docker)).toEqual([`docker restart ${staging}`]);
    expect(result.curl.filter((line) => line.startsWith('-fsS'))).toEqual([
      failPing('lavalink-staging is exited (failed check 1 of 3)'),
      failPing('lavalink-staging is exited (failed check 2 of 3)'),
      failPing('lavalink-staging is exited; restarted after 3 failed checks'),
    ]);
    // It is not asked for /version while it is not running.
    expect(result.curl.some((line) => line.includes('/version'))).toBe(false);
  });

  it('reports a restart that fails, and tries again on the next check', () => {
    const result = lavalinkWatchdogScenario(`
instance_up staging
touch "$FAKE_DIR/version_fail.2334" "$FAKE_DIR/restart_fails"
run; run; run; run
echo "counter $(failures staging)" >>"$FAKE_DIR/curl.log"`);
    expect(result.docker.filter((line) => line.startsWith('docker restart'))).toHaveLength(2);
    expect(result.curl.at(-2)).toBe(
      failPing('lavalink-staging does not answer /version; could not be restarted'),
    );
    expect(result.curl.at(-1)).toBe('counter 4');
  });

  it('reports a configured instance whose container does not exist, without a restart', () => {
    const result = lavalinkWatchdogScenario(`
lavalink_conf 'WG_PEERS="${productionPeers}; ${stagingPeers}"'
instance_up staging
run; run; run`);
    expect(restarts(result.docker)).toEqual([]);
    expect(result.curl.filter((line) => line.startsWith('-fsS'))).toEqual([
      failPing('lavalink-production is missing (failed check 1 of 3)'),
      failPing('lavalink-production is missing (failed check 2 of 3)'),
      failPing('lavalink-production is missing (failed check 3 of 3)'),
    ]);
  });

  it('treats a missing password as a failed check', () => {
    const result = lavalinkWatchdogScenario(`
instance_up staging
rm "$RIRIKO_ROOT/lavalink-staging.env"
run`);
    expect(result.rcs).toEqual([0]);
    expect(result.curl).toEqual([
      failPing('lavalink-staging does not answer /version (failed check 1 of 3)'),
    ]);
  });

  it('reports a full disk next to healthy instances', () => {
    const result = lavalinkWatchdogScenario('instance_up staging\necho 90 >"$FAKE_DIR/disk"\nrun');
    expect(result.curl.at(-1)).toBe(failPing('root file system is 90% full (limit 85%)'));
    expect(restarts(result.docker)).toEqual([]);
  });

  it('logs one line and pings nothing before the first deploy', () => {
    const result = lavalinkWatchdogScenario('run');
    expect(result.rcs).toEqual([0]);
    expect(result.docker).toEqual([lavalinkPs]);
    expect(result.curl).toEqual([]);
    expect(result.stdout).toHaveLength(1);
    expect(result.stdout[0]).toContain('no containers of the compose project ririko-lavalink');
  });

  it('does not look at the app project on a Lavalink host', () => {
    const result = lavalinkWatchdogScenario(`
stack_ok
instance_up staging
run`);
    expect(result.docker).toEqual([lavalinkPs, inspectCall(staging)]);
    expect(result.curl.at(-1)).toBe(heartbeat);
  });

  it('only logs without a monitor URL, but still restarts', () => {
    const result = lavalinkWatchdogScenario(`
printf '%s\\n' 'RIRIKO_ROLE=lavalink' 'WG_ADDRESS=10.77.0.1/24' 'WG_PEERS="${stagingPeers}"' >"$RIRIKO_CONF"
instance_up staging
touch "$FAKE_DIR/version_fail.2334"
run; run; run`);
    expect(result.rcs).toEqual([0, 0, 0]);
    expect(restarts(result.docker)).toHaveLength(1);
    expect(result.curl.filter((line) => line.startsWith('-fsS'))).toEqual([]);
  });

  it.each([
    ['no WG_ADDRESS', 'WG_ADDRESS=', 'invalid or missing WG_ADDRESS'],
    [
      'a WG_ADDRESS with a shell character',
      'WG_ADDRESS=10.77.0.1;id',
      'invalid or missing WG_ADDRESS',
    ],
    ['no instance', 'WG_PEERS=', 'no Lavalink instance configured'],
    ['an unknown instance word', 'LAVALINK_INSTANCES=dev', 'invalid LAVALINK_INSTANCES'],
    ['a role that does not exist', 'RIRIKO_ROLE=db', 'invalid RIRIKO_ROLE'],
  ])('exits 1 without a ping for %s', (_name, line, message) => {
    const result = lavalinkWatchdogScenario(`
lavalink_conf ${bashQuote(line)}
instance_up staging
run`);
    expect(result.rcs).toEqual([1]);
    expect(result.stderr).toContain(message);
    expect(result.curl).toEqual([]);
    expect(restarts(result.docker)).toEqual([]);
  });
});

describe.skipIf(!hasBash)('the Lavalink host settings in ririko-deploy and ririko-watchdog', () => {
  const extract = (script: string, name: string) =>
    new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?^\\}$`, 'm').exec(read(script))?.[0] ?? '';

  it('share the instance, port and password functions word for word', () => {
    for (const name of ['lavalink_port', 'configured_instances', 'lavalink_password']) {
      const deploy = extract('bin/ririko-deploy.sh', name);
      expect(deploy, name).toContain(`${name}() {`);
      expect(extract('bin/ririko-watchdog.sh', name), name).toBe(deploy);
    }
  });

  it('read the same pattern for WG_ADDRESS', () => {
    const pattern = /^readonly IPV4_PATTERN=.*$/m;
    expect(read('bin/ririko-watchdog.sh').match(pattern)?.[0]).toBe(
      read('bin/ririko-deploy.sh').match(pattern)?.[0],
    );
  });
});

describe('bootstrap.sh keeps the role in ririko.conf', () => {
  const bootstrap = read('bootstrap.sh');
  const fn = /^set_conf_role\(\) \{\n[\s\S]*?^\}$/m.exec(bootstrap)?.[0] ?? '';
  const run = (role: string, conf: string | null) =>
    runBash(
      [],
      `set -euo pipefail
${read('lib/wg-common.sh')}
ROLE=${shQuote(role)}
log() { :; }
${fn}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
conf="$WORK/ririko.conf"
${conf === null ? '' : `printf %s ${shQuote(conf)} >"$conf"`}
set_conf_role "$conf"
cat "$conf"`,
    );

  it.skipIf(!hasBash)(
    'finds the function and runs it for the lavalink role in create_layout',
    () => {
      expect(fn).toContain('set_conf_role()');
      expect(bootstrap).toMatch(/^ {2}set_conf_role \/etc\/ririko\/ririko\.conf$/m);
    },
  );

  it.skipIf(!hasBash)('adds RIRIKO_ROLE=lavalink once, keeping every other line', () => {
    const conf = '# comment\nWG_ADDRESS=10.77.0.1/24\nWG_PEERS="a b"\n';
    const result = run('lavalink', conf);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${conf}RIRIKO_ROLE=lavalink\n`);
  });

  it.skipIf(!hasBash)('adds the line after a last line without a newline', () => {
    const result = run('lavalink', 'WG_ADDRESS=10.77.0.1/24');
    expect(result.stdout).toBe('WG_ADDRESS=10.77.0.1/24\nRIRIKO_ROLE=lavalink\n');
  });

  it.skipIf(!hasBash)('replaces another value and leaves a correct line alone', () => {
    expect(run('lavalink', 'RIRIKO_ROLE=app\nA=1\n').stdout).toBe('A=1\nRIRIKO_ROLE=lavalink\n');
    const same = 'A=1\nRIRIKO_ROLE=lavalink\nB=2\n';
    expect(run('lavalink', same).stdout).toBe(same);
    expect(run('lavalink', 'RIRIKO_ROLE="lavalink"\n').stdout).toBe('RIRIKO_ROLE="lavalink"\n');
  });

  it.skipIf(!hasBash)(
    'writes nothing for the app role, and removes a leftover lavalink line',
    () => {
      const plain = '#RIRIKO_ROLE=lavalink\nA=1\n';
      expect(run('app', plain).stdout).toBe(plain);
      expect(run('app', 'A=1\nRIRIKO_ROLE=lavalink\nB=2\n').stdout).toBe('A=1\nB=2\n');
    },
  );
});

describe('the Lavalink host role wiring', () => {
  it('documents the new settings in ririko.conf.example, all commented out', () => {
    const example = read('ririko.conf.example');
    for (const key of [
      'RIRIKO_ROLE',
      'LAVALINK_INSTANCES',
      'LAVALINK_READY_TIMEOUT',
      'LAVALINK_PRODUCTION_HEAP',
      'LAVALINK_STAGING_HEAP',
    ]) {
      expect(example).toMatch(new RegExp(`^#${key}=`, 'm'));
    }
    expect(example.split('\n').filter((line) => /^[A-Z_]+=/.test(line))).toEqual([]);
  });

  it('uses the compose project, files and ports of deploy/lavalink', () => {
    const compose = readFileSync(
      fileURLToPath(new URL('../deploy/lavalink/docker-compose.yml', import.meta.url)),
      'utf8',
    );
    const deploy = read('bin/ririko-deploy.sh');
    expect(compose).toMatch(/^name: ririko-lavalink$/m);
    expect(deploy).toContain('readonly LAVALINK_PROJECT=ririko-lavalink');
    expect(deploy).toContain('deploy/lavalink/docker-compose.yml');
    expect(read('bin/ririko-watchdog.sh')).toContain('readonly LAVALINK_PROJECT=ririko-lavalink');
    for (const [instance, port] of [
      ['production', '2333'],
      ['staging', '2334'],
    ]) {
      expect(compose).toMatch(new RegExp(`^ {2}lavalink-${instance}:$`, 'm'));
      expect(compose).toContain(`SERVER_PORT: '${port}'`);
      expect(deploy).toContain(`${instance}) printf '${port}'`);
    }
    for (const variable of [
      'LAVALINK_PRODUCTION_ENV_FILE',
      'LAVALINK_STAGING_ENV_FILE',
      'LAVALINK_PRODUCTION_HEAP',
      'LAVALINK_STAGING_HEAP',
      'WG_ADDRESS',
    ]) {
      expect(compose, variable).toContain(variable);
    }
  });
});
