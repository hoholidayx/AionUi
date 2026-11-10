import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { rendererConfig, rendererRoot } from './rendererConfig';

export default defineConfig(() => {
  const shared = rendererConfig('production');
  return {
    ...shared,
    plugins: [
      ...shared.plugins,
      {
        name: 'aion-web-entry',
        transformIndexHtml: {
          order: 'pre',
          handler: (html) => html.replace('./main.tsx', './services/web/main.tsx'),
        },
      },
    ],
    build: {
      target: 'es2022',
      outDir: resolve('out/web-renderer'),
      emptyOutDir: true,
      manifest: true,
      rollupOptions: {
        input: resolve(rendererRoot, 'index.html'),
        external: ['node:crypto', 'crypto'],
        onwarn(warning, warn) {
          if (warning.code !== 'EVAL') warn(warning);
        },
      },
    },
  };
});
