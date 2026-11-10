import '@renderer/utils/ui/runtimePatches';
import '@renderer/styles/themes/index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import Router from '@renderer/components/layout/Router';
import { AuthProvider } from '@renderer/hooks/context/AuthContext';
import { registerPwa } from './registerPwa';
import { i18nReady } from '@renderer/services/i18n';
import WebChunkBoundary from './WebChunkBoundary';

const AuthenticatedLayout = React.lazy(() => import('./AuthenticatedLayout'));
const root = createRoot(document.getElementById('root')!);

void i18nReady.then(() => {
  root.render(
    <AuthProvider>
      <WebChunkBoundary>
        <Router layout={<AuthenticatedLayout />} />
      </WebChunkBoundary>
    </AuthProvider>
  );
});
void registerPwa();
