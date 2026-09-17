// Extracts the first 300 rows of the legacy demo log into a valid JSON
// array for the bundled demo. Run: npm run gen:sample
// Source (v1 repo, sibling folder): ../TorqueProVisualizer/demo_data.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const N = 300;
const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'TorqueProVisualizer', 'demo_data.json');
const raw = readFileSync(src, 'utf8').trim();
const data = JSON.parse('[' + raw.replace(/,\s*$/, '') + ']');
const sample = data.slice(0, N);
const outDir = join(here, '..', 'public');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'demo_sample.json'), JSON.stringify(sample));
console.log(`wrote ${sample.length} rows from ${src}`);
