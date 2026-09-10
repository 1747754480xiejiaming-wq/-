import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sharpEntry = 'C:/Users/17477/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.mjs';
const sharp = (await import(pathToFileURL(sharpEntry).href)).default;
const sourceDir = path.resolve('design-snapshots/penpot-assets');

for (const stem of ['20-design-tokens', '21-component-states', '22-ux-flow']) {
  await sharp(path.join(sourceDir, `${stem}.svg`), { density: 144 })
    .png()
    .toFile(path.join(sourceDir, `${stem}.png`));
}

console.log('Rendered Penpot reference assets.');
