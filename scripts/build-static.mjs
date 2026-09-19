import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'dist');
const learningOutput = join(output, 'learning');

const rootFiles = [
  'app-data.js',
  'app.css',
  'app.js',
  'favicon.png',
  'flow-data.js',
  'index.html',
  'knowledge_cards.jsonl',
  'knowledge_graph.csv',
  'knowledge_graph.json',
  'sources.json',
  'zhiduoxing-icon.png',
];

const entries = await readdir(root, { withFileTypes: true });
for (const entry of entries) {
  if (entry.isFile() && /^knowledge.*\.html$/.test(entry.name)) rootFiles.push(entry.name);
}

await rm(output, { recursive: true, force: true });
await mkdir(learningOutput, { recursive: true });

// 官网作为站点根路径，学习系统收进 /learning/。
await cp(join(root, 'official'), output, { recursive: true });

await Promise.all(
  rootFiles.map((file) => cp(join(root, file), join(learningOutput, file))),
);

for (const directory of ['downloads', 'read', 'vendor']) {
  await cp(join(root, directory), join(learningOutput, directory), { recursive: true });
}

console.log(`Netlify 静态文件已生成：${output}`);
