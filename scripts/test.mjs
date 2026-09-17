// Cross-platform test runner (works in cmd, PowerShell, and bash):
// bundles the smoke test with esbuild, runs it, cleans up.
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const OUT = '.tmp-smoke.mjs';
try {
  execSync(`npx esbuild scripts/smoke-test.ts --bundle --platform=node --format=esm --outfile=${OUT} --log-level=error`, { stdio: 'inherit', shell: true });
  await import(`../${OUT}`);
} finally {
  rmSync(OUT, { force: true });
}
