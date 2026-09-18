/**
 * EXPORT_OS_MASTER_PLAN §5.1 step 3 — every `withPlatformScope(` call site in the codebase must be
 * listed here, keyed exactly as `tenant-isolation.test.ts` prints it: `<repo-relative path>:<line>`.
 * A call site missing from this manifest fails the build; a manifest entry with no matching call
 * site (a dead exemption) fails the build too — this list must always exactly mirror reality.
 *
 * Empty in Wave 0: withPlatformScope() exists (src/lib/tenant-scope.ts) but has no adopters yet —
 * adopting it at a call site is part of the larger migration described in that file's header.
 */
export const PLATFORM_SCOPE_ALLOWLIST: ReadonlyMap<string, string> = new Map([
  // '<path>:<line>': 'one-line reason this call site legitimately crosses tenants',
]);
