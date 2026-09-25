import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AUTH_ROUTE_ALLOWLIST,
  checkAuthorizationCoverage,
  type CoverageSource,
} from './testing/authorization-coverage';

const SRC = fileURLToPath(new URL('../../', import.meta.url));

/** Every non-test source file of the dashboard. */
function dashboardSources(): CoverageSource[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => ({
      path: relative(SRC, join(SRC, file)).replaceAll('\\', '/'),
      source: readFileSync(join(SRC, file), 'utf8'),
    }));
}

describe('Server Action and route handler authorization coverage (TASK-1173)', () => {
  it('finds a guard in every Server Action and route handler of the dashboard', () => {
    const report = checkAuthorizationCoverage(dashboardSources());

    expect(report.problems).toEqual([]);
    // The scan must actually see the entry points, or an empty problem list proves nothing.
    expect(report.entryPoints).toEqual(
      expect.arrayContaining([
        'app/dashboard/[guildId]/general/actions.ts#saveGeneralSettings',
        'app/account/security/actions.ts#removePasskey',
        'app/account/sessions/actions.ts#revokeOtherSessions',
        'app/verify/actions.ts#finishPasskeyCheck',
        ...Object.entries(AUTH_ROUTE_ALLOWLIST).flatMap(([path, methods]) =>
          methods.map((method) => `${path}#${method}`),
        ),
      ]),
    );
  });

  it('fails on an unguarded Server Action', () => {
    const report = checkAuthorizationCoverage([
      {
        path: 'app/danger/actions.ts',
        source: `'use server';
          export async function wipeGuild(guildId: string) {
            await db.delete(guildId);
          }`,
      },
    ]);
    expect(report.problems).toEqual([
      expect.stringContaining(
        'app/danger/actions.ts#wipeGuild: does not call an authorization guard',
      ),
      'app/danger/actions.ts#wipeGuild: Server Action does not call checkDashboardRequest',
    ]);
  });

  it('follows guards through functions declared in the same file', () => {
    const report = checkAuthorizationCoverage([
      {
        path: 'app/account/example/actions.ts',
        source: `'use server';
          async function allowed() {
            if (await checkDashboardRequest()) return null;
            return requireSession('/account');
          }
          const load = async () => allowed();
          export async function doThing() {
            const session = await load();
            return session?.userId;
          }
          export const doOther = async () => { await allowed(); };`,
      },
    ]);
    expect(report.problems).toEqual([]);
    expect(report.entryPoints).toEqual([
      'app/account/example/actions.ts#doThing',
      'app/account/example/actions.ts#doOther',
    ]);
  });

  it('accepts the passkey-check guard only in the verify actions', () => {
    const source = `'use server';
      export async function check() {
        if (await checkDashboardRequest()) return;
        await requireSessionForPasskeyCheck('/verify');
      }`;
    expect(
      checkAuthorizationCoverage([{ path: 'app/verify/actions.ts', source }]).problems,
    ).toEqual([]);
    expect(
      checkAuthorizationCoverage([{ path: 'app/account/actions.ts', source }]).problems,
    ).toHaveLength(1);
  });

  it('requires guards in route handlers and rate limits in allowlisted auth routes', () => {
    const report = checkAuthorizationCoverage([
      {
        path: 'app/api/export/route.ts',
        source: `export const dynamic = 'force-dynamic';
          export async function GET() { return Response.json(await db.dump()); }`,
      },
      {
        path: 'app/api/auth/logout/route.ts',
        source: `export async function POST(request: Request) { return new Response(null); }`,
      },
      {
        path: 'app/api/guilds/[guildId]/route.ts',
        source: `export async function GET(_: Request, { params }: Ctx) {
            const { session } = await requireGuildAccess((await params).guildId);
            return Response.json(session.userId);
          }`,
      },
    ]);
    expect(report.problems).toEqual([
      expect.stringContaining('app/api/export/route.ts#GET: does not call an authorization guard'),
      'app/api/auth/logout/route.ts#POST: auth route does not call limitAuthRequest',
    ]);
  });

  it('rejects export forms and inline actions it cannot check', () => {
    const report = checkAuthorizationCoverage([
      {
        path: 'app/a/actions.ts',
        source: `'use server';
          async function hidden() {}
          export { hidden };
          export default async function () {}
          export default hidden;
          export const handler = makeAction(hidden);
          export type Result = { ok: boolean };`,
      },
      {
        path: 'components/button.tsx',
        source: `export function Button() {
            async function act() { 'use server'; await db.drop(); }
            return <form action={act} />;
          }`,
      },
    ]);
    expect(report.problems).toEqual([
      'app/a/actions.ts: re-exports are not allowed; export functions directly',
      'app/a/actions.ts: default exports are not allowed; use named exports',
      'app/a/actions.ts: default exports are not allowed; use named exports',
      'app/a/actions.ts#handler: exported value is not a function the check can read',
      expect.stringContaining("components/button.tsx: inline 'use server' functions"),
    ]);
  });
});
