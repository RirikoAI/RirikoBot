import ts from 'typescript';

/** A dashboard source file; `path` is relative to `apps/web/src`, with forward slashes. */
export interface CoverageSource {
  path: string;
  source: string;
}

export interface CoverageReport {
  /** Every Server Action and route handler found, as `<path>#<export>`. */
  entryPoints: string[];
  /** Why each failing entry point (or file) is not covered. Empty when all are. */
  problems: string[];
}

/** One of these must run in every Server Action and route handler. */
export const AUTHORIZATION_GUARDS = [
  'saveGuildSettings',
  'requireGuildAccess',
  'requireSession',
  'requireStepUp',
  'requireOwner',
];

/** Accepts a session that still owes its passkey check, so only the passkey check may use it. */
const PASSKEY_CHECK_GUARD = 'requireSessionForPasskeyCheck';
const PASSKEY_CHECK_FILE = 'app/verify/actions.ts';

/** Origin check and rate limit; `saveGuildSettings` runs it for settings actions. */
const REQUEST_GUARDS = ['checkDashboardRequest', 'saveGuildSettings'];

/** Auth routes run before a session exists, so they are rate limited instead of guarded. */
export const AUTH_ROUTE_ALLOWLIST: Record<string, readonly string[]> = {
  'app/api/auth/login/route.ts': ['GET'],
  'app/api/auth/callback/route.ts': ['GET'],
  'app/api/auth/logout/route.ts': ['POST'],
};
const AUTH_ROUTE_GUARD = 'limitAuthRequest';

/** Route segment config exports, which are values rather than handlers. */
const ROUTE_CONFIG_EXPORTS = new Set([
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
]);

type FunctionNode = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

/**
 * Parses the dashboard's Server Actions (`'use server'` modules) and route handlers and reports
 * any entry point that does not call an authorization guard, directly or through a function
 * declared in the same file. It checks that a guard is called, not where; review still owns that.
 */
export function checkAuthorizationCoverage(files: readonly CoverageSource[]): CoverageReport {
  const report: CoverageReport = { entryPoints: [], problems: [] };
  for (const file of files) checkFile(file, report);
  return report;
}

function checkFile({ path, source }: CoverageSource, report: CoverageReport): void {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const isServerModule = hasUseServerDirective(sourceFile.statements);
  const isRoute = /^app\/(.+\/)?route\.tsx?$/.test(path);

  forEachFunction(sourceFile, (fn) => {
    if (fn.body && ts.isBlock(fn.body) && hasUseServerDirective(fn.body.statements)) {
      report.problems.push(
        `${path}: inline 'use server' functions are not allowed; move the action to an actions.ts file`,
      );
    }
  });
  if (!isServerModule && !isRoute) return;

  const locals = localFunctions(sourceFile);
  for (const statement of sourceFile.statements) {
    for (const { name, fn } of exportedEntries(statement, path, isRoute, report)) {
      const entry = `${path}#${name}`;
      report.entryPoints.push(entry);
      const calls = reachableCalls(fn, locals);

      const allowedMethods = AUTH_ROUTE_ALLOWLIST[path];
      if (isRoute && allowedMethods?.includes(name)) {
        if (!calls.has(AUTH_ROUTE_GUARD)) {
          report.problems.push(`${entry}: auth route does not call ${AUTH_ROUTE_GUARD}`);
        }
        continue;
      }
      const guarded =
        AUTHORIZATION_GUARDS.some((guard) => calls.has(guard)) ||
        (path === PASSKEY_CHECK_FILE && calls.has(PASSKEY_CHECK_GUARD));
      if (!guarded) {
        report.problems.push(
          `${entry}: does not call an authorization guard (${AUTHORIZATION_GUARDS.join(', ')})`,
        );
      }
      if (isServerModule && !REQUEST_GUARDS.some((guard) => calls.has(guard))) {
        report.problems.push(`${entry}: Server Action does not call checkDashboardRequest`);
      }
    }
  }
}

/** Exported functions of a statement; problems for export forms the check cannot follow. */
function exportedEntries(
  statement: ts.Statement,
  path: string,
  isRoute: boolean,
  report: CoverageReport,
): { name: string; fn: FunctionNode }[] {
  if (ts.isExportDeclaration(statement)) {
    if (!statement.isTypeOnly) {
      report.problems.push(`${path}: re-exports are not allowed; export functions directly`);
    }
    return [];
  }
  const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword);
  if (!exported && !ts.isExportAssignment(statement)) return [];
  if (ts.isExportAssignment(statement) || hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
    report.problems.push(`${path}: default exports are not allowed; use named exports`);
    return [];
  }
  if (ts.isFunctionDeclaration(statement) && statement.name) {
    return [{ name: statement.name.text, fn: statement }];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) => {
      const name = declaration.name.getText();
      const init = declaration.initializer;
      if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
        return [{ name, fn: init }];
      }
      if (isRoute && ROUTE_CONFIG_EXPORTS.has(name)) return [];
      report.problems.push(`${path}#${name}: exported value is not a function the check can read`);
      return [];
    });
  }
  // Interfaces, type aliases and enums carry no runtime entry point.
  return [];
}

function hasUseServerDirective(statements: ts.NodeArray<ts.Statement>): boolean {
  for (const statement of statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false;
    }
    if (statement.expression.text === 'use server') return true;
  }
  return false;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind)
  );
}

/** Top-level functions of the file by name, so calls through local helpers can be followed. */
function localFunctions(sourceFile: ts.SourceFile): Map<string, FunctionNode> {
  const functions = new Map<string, FunctionNode>();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      functions.set(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (ts.isIdentifier(declaration.name) && init) {
          if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
            functions.set(declaration.name.text, init);
          }
        }
      }
    }
  }
  return functions;
}

/** Names of all functions called by `fn`, including calls made by local functions it calls. */
function reachableCalls(fn: FunctionNode, locals: Map<string, FunctionNode>): Set<string> {
  const calls = new Set<string>();
  const visited = new Set<FunctionNode>();
  const visit = (node: FunctionNode) => {
    if (visited.has(node)) return;
    visited.add(node);
    const walk = (child: ts.Node): void => {
      if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) {
        const name = child.expression.text;
        calls.add(name);
        const local = locals.get(name);
        if (local) visit(local);
      }
      ts.forEachChild(child, walk);
    };
    if (node.body) walk(node.body);
  };
  visit(fn);
  return calls;
}

function forEachFunction(node: ts.Node, callback: (fn: FunctionNode) => void): void {
  if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    callback(node);
  }
  ts.forEachChild(node, (child) => forEachFunction(child, callback));
}
