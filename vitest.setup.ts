import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import { afterEach } from 'vitest';

// Tests run offline (docs/testing.md §4.3). A test that reached a live service passed or timed
// out depending on how fast the service answered from CircleCI, so every outbound connection
// and DNS lookup to a non-loopback host is refused here and fails the test that made it.
// Replace the client with a fake (vi.mock, vi.stubGlobal('fetch', ...)) instead.

const attempts: string[] = [];

function isLoopback(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    bare === 'localhost' ||
    bare.endsWith('.localhost') ||
    bare.startsWith('127.') ||
    bare === '::1' ||
    bare === '0.0.0.0' ||
    bare === '::'
  );
}

function refusal(host: string): NodeJS.ErrnoException {
  attempts.push(host);
  const error: NodeJS.ErrnoException = new Error(
    `Network access is disabled in tests (tried ${host}). Replace the client with a fake.`,
  );
  error.code = 'ECONNREFUSED';
  return error;
}

// net.connect, http, https, tls and fetch (undici) all open sockets through Socket#connect.
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
  const first: unknown = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host =
    typeof first === 'object' && first !== null
      ? 'path' in first
        ? undefined
        : ((first as { host?: string }).host ?? 'localhost')
      : typeof first === 'number'
        ? typeof args[1] === 'string'
          ? args[1]
          : 'localhost'
        : undefined; // a string is an IPC path

  if (host !== undefined && !isLoopback(host)) {
    const error = refusal(host);
    process.nextTick(() => this.destroy(error));
    return this;
  }
  return originalConnect.apply(this, args as Parameters<typeof originalConnect>);
} as typeof net.Socket.prototype.connect;

const originalLookup = dns.lookup;
dns.lookup = function (hostname: string, ...rest: unknown[]) {
  if (isLoopback(hostname)) {
    return (originalLookup as (...a: unknown[]) => void)(hostname, ...rest);
  }
  const callback = rest.at(-1) as (error: Error) => void;
  const error = refusal(hostname);
  process.nextTick(() => callback(error));
} as typeof dns.lookup;

const originalPromiseLookup = dns.promises.lookup;
dns.promises.lookup = (async (hostname: string, ...rest: unknown[]) => {
  if (isLoopback(hostname)) {
    return (originalPromiseLookup as (...a: unknown[]) => Promise<unknown>)(hostname, ...rest);
  }
  throw refusal(hostname);
}) as typeof dns.promises.lookup;

// Named ESM imports of node:dns and node:dns/promises read the patched functions from here on.
syncBuiltinESMExports();

afterEach(() => {
  if (attempts.length === 0) return;
  const hosts = [...new Set(attempts.splice(0))].join(', ');
  throw new Error(`This test tried to reach the network: ${hosts}`);
});
