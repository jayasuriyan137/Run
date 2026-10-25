import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';

const html = await readFile('index.html', 'utf8');
const script = await readFile('app.js', 'utf8');
if (!html.includes('id="tab-overview"') || !script.includes('function renderAll(') || !html.includes('<script src="./app.js"></script>')) {
  throw new Error('Dashboard entry point is missing required content.');
}
await mkdir('dist', { recursive: true });
const output = html.replace('<script src="./app.js"></script>', () => `<script>\n${script.replace(/<\/script/gi, '<\\/script')}\n</script>`);
await writeFile('dist/index.html', output);
await copyFile('.nojekyll', 'dist/.nojekyll');
console.log('Built self-contained dashboard → dist/index.html');
