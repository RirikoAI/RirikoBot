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

  it('enables security upgrades with a 20:00 UTC reboot (04:00 in the maintainer's time zone)', () => {
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
echo "RIRIKO_VERSION=$RIRIKO_VERSION RIRIKO_ENV_FILE=$RIRIKO_ENV_FILE docker $*" >>"$FAKE_DIR/docker.log"
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
  logs) echo "fake-log-line from bot and web of $RIRIKO_VERSION"; exit 0 ;;
  exec)
    case $args in
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
    `^RIRIKO_VERSION=${escapeDots(version)} RIRIKO_ENV_FILE=\\S+/env\\.production ` +
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
    expect(result.docker[0]).toMatch(composeCall('2.1.3', 'pull$'));
    expect(result.docker[1]).toMatch(composeCall('2.1.3', 'up -d --no-build --remove-orphans$'));
    // Nothing was deployed before, so there is nothing to dump or to list.
    expect(result.docker.some((line) => line.includes(' ps '))).toBe(false);
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
  });

  it('exits 5 when the first deploy fails, because the dashboard never gets ready', () => {
    const result = scenario(`
echo 2.1.3 >"$FAKE_DIR/bad_web"
run deploy 2.1.3`);
    expect(result.rcs).toEqual([5]);
    expect(result.stderr).toContain('no previous release');
    expect(result.stdout).toContain('NAME STATUS fake-ps-of-2.1.3');
    expect(result.docker.some((line) => line.includes('exec -T web node -e'))).toBe(true);
    expect(result.docker.filter((line) => line.includes(' up -d '))).toHaveLength(1);
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
    'does not delete pre-existing tmp directories while waiting for the lock',
    () => {
      const result = scenario(`
mkdir -p "$RIRIKO_ROOT/releases/.tmp.keep"
echo 'DEPLOY_LOCK_WAIT=10' >>"$RIRIKO_CONF"
(
  exec 8>"$RIRIKO_LOCK"
  flock -n 8
  sleep 1
) &
sleep 0.2
run deploy 2.1.3`);
      expect(result.rcs).toEqual([0]);
      expect(result.current).toBe('2.1.3');
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
    expect(result.docker).toHaveLength(1);
    expect(result.docker[0]).toMatch(composeCall('2.1.3', 'ps$'));
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
RESTIC_REPOSITORY=s3:s3.us-east-1.amazonaws.com/bucket/ririko-staging
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
        'RESTIC_REPOSITORY=s3:s3.us-east-1.amazonaws.com/bucket/ririko-staging',
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
    const result = renderNft('51999', '203.0.113.10, 203.0.113.0/24', vpsPeers);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'ip saddr { 203.0.113.10, 203.0.113.0/24 } udp dport 51999 accept',
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
    ['an endpoint with a bad octet', ['51820', '100.29.245.300', vpsPeers], 'WG_ALLOWED_ENDPOINTS'],
    ['an IPv4 prefix above 32', ['51820', '100.29.245.0/33', vpsPeers], 'WG_ALLOWED_ENDPOINTS'],
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
    ['2001:db8::10', true],
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
