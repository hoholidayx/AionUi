const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const zlib = require('node:zlib');

const outDir = path.resolve(__dirname, '../../out/web-renderer');
const readyMarker = path.join(outDir, '.vite', 'web-build-ready');
const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);
const budgetByRoute = [
  { name: 'login', files: ['pages/login/index.tsx'], decoded: 1_500_000, gzip: 500_000 },
  {
    name: 'guid',
    files: ['pages/guid/index.tsx'],
    decoded: 3_000_000,
    gzip: 1_000_000,
  },
];

async function prepareAssets() {
  await fs.rm(readyMarker, { force: true });
  const manifest = JSON.parse(await fs.readFile(path.join(outDir, '.vite/manifest.json'), 'utf8'));
  const sizes = new Map();

  for (const filename of await fs.readdir(path.join(outDir, 'assets'))) {
    if (!/\.(js|css)$/.test(filename)) continue;

    const relativePath = `assets/${filename}`;
    const assetPath = path.join(outDir, relativePath);
    const data = await fs.readFile(assetPath);
    const [gz, br] = await Promise.all([
      gzip(data),
      brotli(data, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } }),
    ]);
    await Promise.all([fs.writeFile(`${assetPath}.gz`, gz), fs.writeFile(`${assetPath}.br`, br)]);
    sizes.set(relativePath, { decoded: data.length, gzip: gz.length });
  }

  for (const budget of budgetByRoute) {
    for (const language of ['en-US', 'zh-CN']) {
      const visited = new Set();
      const files = new Set();
      function visit(key) {
        if (visited.has(key)) return;
        visited.add(key);
        const chunk = manifest[key];
        if (!chunk) throw new Error(`Web build is missing ${key}`);
        if (chunk.file.endsWith('.js')) files.add(chunk.file);
        for (const imported of chunk.imports ?? []) visit(imported);
      }
      visit('index.html');
      for (const key of budget.files) visit(key);
      if (budget.name === 'guid') {
        const layout = manifest['index.html'].dynamicImports.find(
          (key) => manifest[key]?.name === 'AuthenticatedLayout'
        );
        if (!layout) throw new Error('Web build is missing the authenticated layout');
        visit(layout);
      }
      if (language !== 'en-US') visit(`services/i18n/locales/${language}/index.ts`);

      let decoded = 0;
      let compressed = 0;
      for (const file of files) {
        const size = sizes.get(file);
        decoded += size.decoded;
        compressed += size.gzip;
      }
      const result = `${budget.name} (${language}): ${decoded} B JS, ${compressed} B gzip`;
      console.log(result);
      if (decoded > budget.decoded || compressed > budget.gzip) {
        throw new Error(`Web startup JS budget exceeded for ${result}`);
      }
    }
  }
  await fs.writeFile(readyMarker, '');
}

prepareAssets().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
