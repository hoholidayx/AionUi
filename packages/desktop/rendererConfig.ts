import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import UnoCSS from 'unocss/vite';
import unoConfig from '../../uno.config.ts';

const rootPackageJson = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')) as {
  version: string;
};

export const rendererRoot = resolve('packages/desktop/src/renderer');

// Icon Park transform plugin (replaces webpack icon-park-loader)
function iconParkPlugin() {
  return {
    name: 'vite-plugin-icon-park',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      if (!id.endsWith('.tsx') || id.includes('node_modules')) return null;
      if (!source.includes('@icon-park/react')) return null;
      const transformedSource = source.replace(
        /import\s+\{\s+([a-zA-Z, ]*)\s+\}\s+from\s+['"]@icon-park\/react['"](;?)/g,
        function (str, match) {
          if (!match) return str;
          const components = match.split(',');
          const importComponent = str.replace(
            match,
            components.map((key: string) => `${key} as _${key.trim()}`).join(', ')
          );
          const hoc = `import IconParkHOC from '@renderer/components/IconParkHOC';
          ${components.map((key: string) => `const ${key.trim()} = IconParkHOC(_${key.trim()})`).join(';\n')}`;
          return importComponent + ';' + hoc;
        }
      );
      if (transformedSource !== source) return { code: transformedSource, map: null } as { code: string; map: null };
      return null;
    },
  };
}

export function rendererConfig(mode: string) {
  return {
    root: rendererRoot,
    base: './',
    publicDir: resolve('public'),
    plugins: [UnoCSS(unoConfig), iconParkPlugin()],
    resolve: {
      alias: {
        '@': resolve('packages/desktop/src'),
        '@common': resolve('packages/desktop/src/common'),
        '@renderer': resolve('packages/desktop/src/renderer'),
        '@process': resolve('packages/desktop/src/process'),
        '@worker': resolve('packages/desktop/src/process/worker'),
        // Force ESM version of streamdown
        streamdown: resolve('node_modules/streamdown/dist/index.js'),
      },
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.css'],
      // CodeMirror relies on module-level singletons (highlighterFacet, tag
      // sets). If Vite pre-bundles two copies of @codemirror/language (one for
      // our direct import, one nested under @uiw/react-codemirror), our custom
      // markdown HighlightStyle registers on a facet the editor never reads,
      // so the source view silently falls back to near-monochrome. Dedupe the
      // singleton packages to a single physical copy. Only packages hoisted to
      // the top-level node_modules may be deduped here — @lezer/common is not
      // hoisted under bun's isolated layout, so listing it breaks the Rollup
      // production build (cannot resolve from nested @codemirror/lang-* dirs).
      dedupe: [
        'react',
        'react-dom',
        'react-router-dom',
        '@codemirror/state',
        '@codemirror/view',
        '@codemirror/language',
        '@lezer/highlight',
      ],
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.env': JSON.stringify(process.env.env),
      'process.env.AIONUI_MULTI_INSTANCE': JSON.stringify(process.env.AIONUI_MULTI_INSTANCE ?? ''),
      'process.env.SENTRY_DSN': JSON.stringify(process.env.SENTRY_DSN ?? ''),
      // Inject the real AionUi version (root package.json) so renderer code
      // can show it without importing packages/desktop/package.json, which is
      // a workspace-internal placeholder frozen at "0.0.0".
      __APP_VERSION__: JSON.stringify(rootPackageJson.version),
      // Renderer-side discontinued-build flag; consumed via discontinuedBuild.ts.
      __IS_DISCONTINUED_BUILD__: JSON.stringify(process.env.IS_DISCONTINUED_BUILD === 'true'),
      global: 'globalThis',
    },
  };
}
