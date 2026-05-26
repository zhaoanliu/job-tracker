// Enforces that Next.js route files (app/**/route.ts) only contain HTTP method
// exports and Next.js route segment config — any other named export causes a
// build-time error that tsc and ESLint don't catch.
const fs = require('fs');
const { execSync } = require('child_process');

const ALLOWED = new Set([
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS',
  'dynamic', 'dynamicParams', 'revalidate', 'fetchCache', 'runtime',
  'preferredRegion', 'maxDuration', 'generateStaticParams',
]);

const files = execSync('find app -name "route.ts"', { encoding: 'utf-8' })
  .trim().split('\n').filter(Boolean);

let failed = false;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  for (const line of content.split('\n')) {
    if (/^export\s+(type|default)\b/.test(line)) continue;
    const m = line.match(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/);
    if (m && !ALLOWED.has(m[1])) {
      console.error(
        `::error file=${file}::Invalid Next.js route export: "${m[1]}". ` +
        `Route files may only export HTTP methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS) ` +
        `or Next.js route segment config (dynamic, runtime, revalidate, etc.).`
      );
      failed = true;
    }
  }
}

process.exit(failed ? 1 : 0);
