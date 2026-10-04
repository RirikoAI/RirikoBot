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

  it('enables security upgrades with a 20:00 UTC reboot (04:00 in Malaysia)', () => {
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

  it.skipIf(!hasFlock)('exits 3 while another run holds the deploy lock', () => {
    const result = scenario(`
exec 8>"$RIRIKO_LOCK"
flock -n 8
run deploy 2.1.3`);
    expect(result.rcs).toEqual([3]);
    expect(result.stderr).toContain('holds');
    expect(result.curl).toEqual([]);
    expect(result.docker).toEqual([]);
    expect(result.releases).toEqual([]);
  });

  it.each([
    ['a compose file that climbs a directory', 'RIRIKO_COMPOSE_FILES=../etc/passwd'],
    ['an absolute compose file', 'RIRIKO_COMPOSE_FILES=/etc/passwd'],
    ['a compose file with a shell character', 'RIRIKO_COMPOSE_FILES=a.yml;id'],
    ['a repository with a shell character', 'RIRIKO_REPO=RirikoAI/Ririko;id'],
    ['a timeout that is not a number', 'READY_TIMEOUT=soon'],
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
    for (const key of ['RIRIKO_REPO', 'RIRIKO_COMPOSE_FILES', 'RIRIKO_ENV_FILE', 'READY_TIMEOUT']) {
      expect(example).toMatch(new RegExp(`^#${key}=`, 'm'));
    }
    expect(example).toContain('docker-compose.remote-lavalink.yml');
    expect(example.split('\n').filter((line) => /^[A-Z_]+=/.test(line))).toEqual([]);
  });
});
