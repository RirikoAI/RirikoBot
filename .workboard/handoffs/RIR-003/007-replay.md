# RIR-003 — executed operational rehearsal recipe

The following two local fixture files were executed on 2026-09-15. These are reproduction instructions, not production code or an installed test service. The original files remain in ignored .tmp. Save the blocks to the stated filenames, inspect resource names/context, then run node .tmp/rir003-validate.mjs from the repository root after building Dockerfile target runtime as ririko:rir003-c175c62. A rerun is an explicit local operational action, not authorized by reading this file. The script requires unused task resource names, uses only its own labeled volume, captures results before cleanup and compares existing resource sets afterward. On failure it retains its task resources for diagnosis. Never substitute production credentials.

Build command: docker --context desktop-linux build --target runtime --tag ririko:rir003-c175c62 --progress plain .

Gateway fixture SHA256: 52500ea39456016685c7e1cae30932f107b88a54f8c4d04177b17847422db1e4. Runner SHA256: b7fb0c0e84ca19d4b15fcfc64e43b851ecf01ecab013851842e6ff05d36c0e55. Docker image application files are unchanged. The preload only replaces Discord client login/readiness and observes real client destruction; it never contacts Discord. Health server, settings, SQLite, migration, runtime signal handling and gateway.close execute compiled image code. The known limitations are in 005-completion.md.

## .tmp/rir003-gateway-fixture.mjs

~~~javascript
// Operational rehearsal only. Mount read-only; never ship this preload in an image.
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
const require = createRequire('/app/apps/bot/package.json');
const { Client } = require('discord.js');
const originalDestroy = Client.prototype.destroy;
Client.prototype.login = async function () {
  console.log('RIR003_OFFLINE_GATEWAY_LOGIN');
  return 'offline-fixture';
};
Client.prototype.isReady = function () { return !existsSync('/tmp/rir003-gateway-down'); };
Client.prototype.destroy = async function () {
  await originalDestroy.call(this);
  writeFileSync('/app/data/rir003-gateway-closed', 'closed');
  console.log('RIR003_OFFLINE_GATEWAY_CLOSED');
};
~~~

## .tmp/rir003-validate.mjs

~~~javascript
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const reportPath = resolve('.tmp/rir003-results.json');
const report = { at: new Date().toISOString(), source: 'c175c629957bacaf6d3992bd913b6f60b7bcec39', checks: [], resources: {} };
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
const pass = (name, evidence) => { report.checks.push({ name, evidence }); save(); console.log('PASS', name); };
function docker(args, expected = 0, timeout = 30000, input) {
  const r = spawnSync('docker', ['--context', 'desktop-linux', ...args], { encoding: 'utf8', timeout, windowsHide: true, ...(input === undefined ? {} : { input }) });
  if (r.error) throw r.error;
  assert.equal(r.status, expected, `docker ${args[0]} exit ${r.status}: ${r.stderr} ${r.stdout}`);
  return r.stdout.trim();
}
const volume = 'ririko-rir003-sqlite-20260915';
const runtime = 'ririko-rir003-lifecycle-20260915';
let sequence = 0;
let image;
const fixtureEnv = ['--env', 'DISCORD_TOKEN=validation-only-token', '--env', 'DISCORD_APPLICATION_ID=123456789012345678', '--env', 'BOT_OWNER_IDS=123456789012345679'];
const hardened = ['--pull', 'never', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--tmpfs', '/tmp:size=64m,mode=1777'];
const mount = () => ['--mount', `type=volume,src=${volume},dst=/app/data`];
function one(args, { credentials = true, expected = 0, entrypoint = 'node' } = {}) {
  const name = `ririko-rir003-check-${++sequence}-20260915`;
  assert.equal(docker(['ps', '-aq', '--filter', `name=^/${name}$`]), '', 'One-shot container already exists');
  return docker(['run', '--rm', '--name', name, ...hardened, ...mount(), ...(credentials ? fixtureEnv : []), '--entrypoint', entrypoint, image, ...args], expected);
}
const node = (code, options) => one(['--input-type=module', '-e', code], options);
const cli = (args, options) => one(['apps/cli/dist/index.js', ...args], options);
const execNode = code => docker(['exec', runtime, 'node', '--input-type=module', '-e', code]);
const probe = path => JSON.parse(execNode(`const r=await fetch('http://127.0.0.1:3001${path}',{signal:AbortSignal.timeout(2000)});console.log(JSON.stringify({status:r.status,cache:r.headers.get('cache-control'),body:await r.json()}));`));
async function healthy() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const state = JSON.parse(docker(['inspect', runtime, '--format', '{{json .State}}']));
    assert.equal(state.Running, true, JSON.stringify(state));
    if (state.Health?.Status === 'healthy') return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw Error('Runtime did not become Docker healthy within 15s');
}
function audit() {
  return JSON.parse(node(`import {createRequire} from 'node:module';const require=createRequire('/app/packages/database/package.json');const Sqlite=require('better-sqlite3');const db=new Sqlite('/app/data/ririko.db',{readonly:true,fileMustExist:true});console.log(JSON.stringify({integrity:db.pragma('integrity_check',{simple:true}),settings:db.prepare('SELECT guild_id,prefix,revision FROM guild_settings').all(),audit:db.prepare('SELECT actor_id,before_revision,after_revision FROM settings_audit ORDER BY after_revision').all(),migrations:db.prepare('SELECT version FROM ririko_schema_migrations').all()}));db.close();`));
}
function assertPersisted(value) {
  assert.equal(value.integrity, 'ok');
  assert.deepEqual(value.settings, [{ guild_id: '123456789012345678', prefix: 'rir003!', revision: 1 }]);
  assert.deepEqual(value.audit, [{ actor_id: '123456789012345679', before_revision: 0, after_revision: 1 }]);
  assert.deepEqual(value.migrations, [{ version: 1 }]);
}
try {
  const info = JSON.parse(docker(['image', 'inspect', 'ririko:rir003-c175c62']))[0];
  image = info.Id;
  report.image = { id: image, os: info.Os, architecture: info.Architecture, user: info.Config.User, stopSignal: info.Config.StopSignal, command: info.Config.Cmd, healthcheck: info.Config.Healthcheck };
  report.lockfileSha256 = createHash('sha256').update(readFileSync('pnpm-lock.yaml')).digest('hex');
  report.initialContainers = docker(['ps', '-aq']).split('\n').filter(Boolean).sort();
  report.initialVolumes = docker(['volume', 'ls', '-q']).split('\n').filter(Boolean).sort();
  assert(!report.initialVolumes.includes(volume));
  assert.equal(docker(['ps', '-aq', '--filter', `name=^/${runtime}$`]), '');
  assert.equal(info.Config.User, 'node');
  assert.equal(info.Config.StopSignal, 'SIGTERM');
  assert.deepEqual(info.Config.Cmd, ['node', 'apps/bot/dist/index.js']);
  assert.equal(info.Os, 'linux');
  docker(['volume', 'create', '--label', 'ririko.ticket=RIR-003', volume]);
  report.resources = { volume, runtime, cleaned: false }; save();
  const security = JSON.parse(node(`import assert from 'node:assert/strict';import{writeFileSync,statSync}from'node:fs';assert(process.getuid()>0);let denied=false;try{writeFileSync('/app/rir003-root-write','x');}catch(e){assert.equal(e.code,'EROFS');denied=true;}assert(denied);for(const p of ['typescript','vitest']){let absent=false;try{import.meta.resolve(p);}catch(e){assert.equal(e.code,'ERR_MODULE_NOT_FOUND');absent=true;}assert(absent,p);}writeFileSync('/tmp/rir003-tmp','ok');writeFileSync('/app/data/rir003-volume','ok');console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),dataOwner:statSync('/app/data').uid,node:process.version,rootReadOnly:denied,developmentModulesAbsent:true}));`));
  assert.equal(security.uid, 1000); assert.equal(security.dataOwner, 1000);
  pass('non-root/read-only-root/native production layout', security);
  const missingCredentials = one(['apps/bot/dist/index.js'], { credentials: false, expected: 1 });
  // Public startup errors are stderr; exit assertion above is the contract here.
  pass('unconfigured bot startup rejects credentials', { exit: 1, stdout: missingCredentials });
  one(['apps/bot/dist/index.js'], { expected: 1 });
  const before = JSON.parse(cli(['migrate:status'])); assert.deepEqual(before, { current: 0, latest: 1 });
  const missingDoctor = JSON.parse(cli(['doctor', '--json'], { expected: 1 }));
  assert(missingDoctor.some(x => x.name === 'Database' && x.status === 'error'));
  node(`import assert from 'node:assert/strict';import{existsSync}from'node:fs';assert.equal(existsSync('/app/data/ririko.db'),false);`);
  pass('unmigrated startup and doctor fail without creating database', { status: before, doctor: missingDoctor });
  cli(['migrate']); const status = JSON.parse(cli(['migrate:status'])); assert.deepEqual(status, { current: 1, latest: 1 });
  cli(['migrate']);
  const doctor = JSON.parse(cli(['doctor', '--json'])); assert(doctor.every(x => x.status !== 'error'));
  assert(doctor.filter(x => x.name.startsWith('Discord')).every(x => x.detail.includes('not validated')));
  pass('explicit idempotent migration and compiled doctor', { status, doctor, health: cli(['health']) });
  const settings = JSON.parse(cli(['guild:config', '123456789012345678', '--prefix', 'rir003!']));
  assert.equal(settings.revision, 1);
  const replacement = JSON.parse(cli(['guild:config', '123456789012345678'])); assert.deepEqual(replacement, settings);
  const initialAudit = audit(); assertPersisted(initialAudit);
  pass('prefix and audit survive container replacement', initialAudit);
  const fixture = resolve('.tmp/rir003-gateway-fixture.mjs');
  docker(['run', '-d', '--name', runtime, ...hardened, ...mount(), ...fixtureEnv, '--health-interval', '1s', '--health-start-period', '1s', '--health-retries', '1', '--mount', `type=bind,src=${fixture},dst=/validation/gateway-fixture.mjs,readonly`, image, 'node', '--import', '/validation/gateway-fixture.mjs', 'apps/bot/dist/index.js']);
  await healthy();
  const live = probe('/health/live'), ready = probe('/health/ready');
  assert.equal(live.status, 200); assert.equal(ready.status, 200); assert.equal(ready.cache, 'no-store');
  assert.deepEqual(ready.body.checks, { database: true, discord: true });
  execNode(`import{writeFileSync}from'node:fs';writeFileSync('/tmp/rir003-gateway-down','down');`);
  const down = probe('/health/ready'); assert.equal(down.status, 503); assert.equal(down.body.checks.discord, false); assert.equal(probe('/health/live').status, 200);
  execNode(`import{unlinkSync}from'node:fs';unlinkSync('/tmp/rir003-gateway-down');`);
  assert.equal(probe('/health/ready').status, 200);
  // Use the image's exact healthcheck command, not a replacement success probe.
  assert.equal(info.Config.Healthcheck.Test[0], 'CMD-SHELL');
  docker(['exec', runtime, 'sh', '-c', info.Config.Healthcheck.Test[1]]);
  pass('compiled runtime and actual image healthcheck with offline gateway', { live, ready, down, fixture: 'Only Client.login/isReady/destroy instrumentation; no Discord network; no live readiness claim.' });
  const shutdowns = [];
  for (let cycle = 0; cycle < 2; cycle++) {
    if (cycle) { docker(['start', runtime]); await healthy(); assert.equal(probe('/health/ready').status, 200); }
    const start = Date.now(); docker(['stop', '--time', '30', runtime], 0, 35000); const elapsedMs = Date.now() - start;
    const state = JSON.parse(docker(['inspect', runtime, '--format', '{{json .State}}']));
    assert.equal(state.ExitCode, 0); assert.equal(state.OOMKilled, false); assert.equal(state.Running, false); assert(elapsedMs < 30000);
    shutdowns.push({ cycle: cycle + 1, elapsedMs, exitCode: state.ExitCode, oomKilled: state.OOMKilled });
  }
  const logs = docker(['logs', runtime]); assert.equal((logs.match(/Shutdown complete/g) || []).length, 2); assert.equal((logs.match(/RIR003_OFFLINE_GATEWAY_CLOSED/g) || []).length, 2);
  report.runtimeLogs = logs;
  node(`import assert from 'node:assert/strict';import{readFileSync}from'node:fs';assert.equal(readFileSync('/app/data/rir003-gateway-closed','utf8'),'closed');`);
  const finalAudit = audit(); assertPersisted(finalAudit);
  pass('SIGTERM shutdown, same-container restart and durable state', { shutdowns, finalAudit, completeShutdownLogCount: 2 });
  save(); // Preserve results before removing the exact disposable resources.
  docker(['rm', runtime]);
  const volumeInfo = JSON.parse(docker(['volume', 'inspect', volume]))[0]; assert.equal(volumeInfo.Labels['ririko.ticket'], 'RIR-003');
  docker(['volume', 'rm', volume]);
  assert.deepEqual(docker(['ps', '-aq']).split('\n').filter(Boolean).sort(), report.initialContainers);
  assert.deepEqual(docker(['volume', 'ls', '-q']).split('\n').filter(Boolean).sort(), report.initialVolumes);
  report.resources.cleaned = true;
  pass('exact task resource cleanup; existing containers and volumes unchanged', { oneShotContainers: sequence });
  report.result = 'passed'; save();
} catch (error) {
  report.result = 'failed'; report.error = String(error); save();
  console.error(error); console.error('Task resources retained for diagnosis; see', reportPath); process.exitCode = 1;
}
~~~

## Additional exact-CMD error verification

After the main script passed, two fresh --rm containers used the same image ID, unchanged CMD, no network, read-only root, all capabilities dropped, no-new-privileges and 1MiB tmpfs mounts at /app/data and /tmp. With no Discord variables, exit1 and exact stderr DISCORD_TOKEN and DISCORD_APPLICATION_ID are required. With explicit fixture token/application ID, exit1 and exact stderr Database migrations are pending. Run pnpm ririko migrate before starting the bot. No named or anonymous data volume was created. These checks are included as the ninth result group in 006-results.json. Compose config --quiet was also rerun with --env-file NUL and explicit disposable interpolation values; exit0.
