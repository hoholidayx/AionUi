/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Sentry must be initialized first
// Use electron-specific renderer package only inside Electron; fall back to the
// browser SDK when running as a web server (no window.electronAPI).
if ((window as { electronAPI?: unknown }).electronAPI) {
  // Dynamic import avoids bundling sentry-ipc:// protocol code into the web build
  import('@sentry/electron/renderer')
    .then((Sentry) =>
      Sentry.init({
        beforeSend(event) {
          if (!(window as { __backendStartupFailed?: boolean }).__backendStartupFailed) {
            return event;
          }
          const haystacks: string[] = [];
          if (event.message) haystacks.push(event.message);
          const exceptions = event.exception?.values ?? [];
          for (const ex of exceptions) {
            if (ex.value) haystacks.push(ex.value);
          }
          if (haystacks.some((h) => /Failed to fetch|window\.__backendPort|__backendPort unset/.test(h))) {
            return null;
          }
          return event;
        },
      })
    )
    .catch(() => {});
}

// Runtime patches must be imported early
import './utils/ui/runtimePatches';

// Browser adapter setup
import '@/common/adapter/browser';

// WebUI only: serve `dialog.showOpen` with a server-side picker, since the
// native Electron dialog channel has no provider outside the desktop app.
import './components/workspace/registerWebFsPicker';

// React and core dependencies
import type { PropsWithChildren } from 'react';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SWRConfig } from 'swr';

// Context providers
import { AuthProvider } from './hooks/context/AuthContext';
import { FeedbackProvider } from './hooks/context/FeedbackContext';
import { ThemeProvider } from './hooks/context/ThemeContext';
import { PreviewProvider } from './pages/conversation/Preview/context/PreviewContext';

// Arco Design
import { Modal, Typography } from '@arco-design/web-react';
// Configure Arco Design to use React 18's createRoot, fixing Message component's CopyReactDOM.render error
import '@arco-design/web-react/es/_util/react-19-adapter';
import '@arco-design/web-react/dist/css/arco.css';
import { useTranslation } from 'react-i18next';

// Styles
import 'uno.css';
import './styles/arco-override.css';
import './styles/themes/index.css';
import './styles/markdown.css';

// Config service — kick off initialization before i18n / theme modules load,
// so their startup paths (which await configService.whenReady()) observe the
// authoritative settings from the backend instead of the empty cache.
import { configService } from '@/common/config/configService';
configService.initialize().catch((err) => {
  console.error('Failed to initialize config:', err);
});

// i18n
import { i18nReady } from './services/i18n';
import { registerPwa } from './services/web/registerPwa';

import { repairAllCronJobTimeZonesOnce } from '@renderer/pages/cron/repairCronJobTimeZone';
import { bootstrapRendererConfig } from '@renderer/services/bootstrapRenderer';

// Components and utilities
import BackendStartingView from './components/layout/BackendStartingView';
import BackendStartupGate from './components/layout/BackendStartupGate';
import GpuAutoDisableNotice from './components/layout/GpuAutoDisableNotice';
import Layout from './components/layout/Layout';
import Router from './components/layout/Router';
import Config from './components/layout/startup/RendererConfig';
import RuntimeFailureDialogs from './components/layout/startup/RuntimeFailureDialogs';
import { useCrossSessionRateLimitNotice } from './hooks/system/useCrossSessionRateLimitNotice';
import Sider from './components/layout/Sider';
import { useAuth } from './hooks/context/AuthContext';
import { ConversationHistoryProvider } from './hooks/context/ConversationHistoryContext';
import HOC from './utils/ui/HOC';
import type { BackendStartupFailureInfo } from '@/common/types/platform/electron';
import {
  InstallationIntegrityContent,
  InstallationIntegrityModalHost,
  getBackendStartupInstallationDescription,
  getDownloadLatestModalActionProps,
} from './components/layout/startup/InstallationIntegrityDialog';

// Global SWR default: do NOT revalidate every query on window focus. Focus
// refetch (SWR's default) made the app re-hit /api/assistants, /api/skills,
// /api/conversations, etc. on every window focus — often twice (same endpoint
// under different SWR keys) — even though those are kept fresh by WebSocket
// events (conversation.listChanged, team events, extensions.state-changed) or
// in-app `mutate` after edits. Queries that genuinely need focus refresh (e.g.
// Google auth/subscription status, which change in an external browser) opt back
// in per-hook with `revalidateOnFocus: true`.
const SWR_DEFAULTS = { revalidateOnFocus: false } as const;

const AppProviders: React.FC<PropsWithChildren> = ({ children }) =>
  React.createElement(
    SWRConfig,
    { value: SWR_DEFAULTS },
    React.createElement(
      AuthProvider,
      null,
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(
          PreviewProvider,
          null,
          React.createElement(
            FeedbackProvider,
            null,
            React.createElement(
              React.Fragment,
              null,
              React.createElement(RuntimeFailureDialogs, null),
              React.createElement(GpuAutoDisableNotice, null),
              children
            )
          )
        )
      )
    )
  );

const AuthenticatedLayout = () => {
  const { user } = useAuth();
  useCrossSessionRateLimitNotice(user?.id);
  return (
    <ConversationHistoryProvider>
      <Layout sider={<Sider />} />
    </ConversationHistoryProvider>
  );
};

const Main = () => {
  const { ready } = useAuth();
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    void bootstrapRendererConfig().finally(() => setConfigReady(true));
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    void repairAllCronJobTimeZonesOnce();
  }, [ready]);

  if (!ready || !configReady) {
    return null;
  }

  return <Router layout={<AuthenticatedLayout />} />;
};

const App = HOC.Wrapper(Config)(Main);

const BackendStartupFailureDialog: React.FC<{ failure: BackendStartupFailureInfo }> = ({ failure }) => {
  const { t } = useTranslation();

  const isIncompatibleRuntime = failure.reason === 'backend_incompatible_runtime';
  const isPackageArchitectureMismatch = failure.reason === 'backend_package_architecture_mismatch';
  const isDataMigrationFailure = failure.reason === 'backend_data_migration_failed';
  const isDatabaseNewerThanApp = failure.reason === 'backend_database_newer_than_app';
  const isLocalDataRepairFailure = failure.reason === 'backend_local_data_repair_failed';
  const isRecoverableDatabaseCorruption = failure.reason === 'backend_recoverable_database_corruption';
  const isTransientConcurrentStartup = failure.reason === 'backend_transient_concurrent_startup';
  const isStartupDirectoryFailure = failure.reason === 'backend_startup_directory_unavailable';
  const isBackendExited = failure.reason === 'backend_startup_exited';
  const isPortReportTimeout = failure.reason === 'backend_startup_port_report_timeout';
  const isIncompleteInstallation = failure.reason === 'backend_incomplete_installation';
  const title = t('common.backendStartup.incompatibleRuntime.title');
  const description = isIncompatibleRuntime
    ? t('common.backendStartup.incompatibleRuntime.description')
    : isPackageArchitectureMismatch
      ? t('common.backendStartup.packageArchitectureMismatch.description', {
          packageArch: failure.packageArch ?? 'x64',
          deviceArch: failure.deviceArch ?? 'arm64',
          expectedArch: failure.expectedDownloadArch ?? 'arm64',
        })
      : isDatabaseNewerThanApp
        ? failure.appVersion
          ? t('common.backendStartup.databaseNewerThanApp.descriptionWithVersion', {
              currentVersion: failure.appVersion,
            })
          : t('common.backendStartup.databaseNewerThanApp.description')
        : isDataMigrationFailure
          ? t('common.backendStartup.dataMigration.description')
          : isLocalDataRepairFailure
            ? t('common.backendStartup.localDataRepair.description')
            : isTransientConcurrentStartup
              ? t('common.backendStartup.transientConcurrentStartup.description')
              : isStartupDirectoryFailure
                ? t('common.backendStartup.startupDirectory.description')
                : isRecoverableDatabaseCorruption
                  ? t('common.backendStartup.recoverableDatabaseCorruption.description')
                  : isBackendExited
                    ? t('common.backendStartup.exited.description')
                    : isPortReportTimeout
                      ? t('common.backendStartup.portReportTimeout.description')
                      : isIncompleteInstallation
                        ? getBackendStartupInstallationDescription(t)
                        : t('common.backendStartup.startupFailed.description');
  const requiredVersions = failure.requiredVersions?.map((version) => `GLIBC_${version}`).join(', ');

  if (!isIncompatibleRuntime && !isPackageArchitectureMismatch) {
    return (
      <div className='min-h-screen bg-bg-1'>
        <InstallationIntegrityModalHost
          description={description}
          diagnosticsKind={
            isTransientConcurrentStartup
              ? 'transient_concurrent_startup'
              : isRecoverableDatabaseCorruption
                ? 'recoverable_database_corruption'
                : isStartupDirectoryFailure
                  ? 'startup_directory'
                  : isLocalDataRepairFailure
                    ? 'local_data_repair'
                    : isDatabaseNewerThanApp
                      ? 'database_newer_than_app'
                      : isDataMigrationFailure
                        ? 'data_migration'
                        : isBackendExited
                          ? 'backend_exited'
                          : isPortReportTimeout
                            ? 'port_report_timeout'
                            : isIncompleteInstallation
                              ? 'incomplete_installation'
                              : 'startup_failed'
          }
          diagnostics={{
            source: 'backend_startup_failure',
            description,
            backendStartupFailure: failure as unknown as Record<string, unknown>,
          }}
        />
      </div>
    );
  }

  if (isPackageArchitectureMismatch) {
    return (
      <div className='min-h-screen bg-bg-1'>
        <Modal
          visible
          closable={false}
          maskClosable={false}
          title={t('common.backendStartup.packageArchitectureMismatch.title')}
          {...getDownloadLatestModalActionProps(t)}
        >
          <InstallationIntegrityContent description={description} />
        </Modal>
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-bg-1'>
      <Modal visible closable={false} maskClosable={false} footer={null} title={title}>
        <div className='text-t-1'>
          <Typography.Paragraph className='mb-0 text-t-secondary'>{description}</Typography.Paragraph>
          {requiredVersions ? (
            <Typography.Paragraph className='mt-12px mb-0 text-12px text-t-tertiary'>
              {t('common.backendStartup.incompatibleRuntime.requiredVersions', { versions: requiredVersions })}
            </Typography.Paragraph>
          ) : null}
        </div>
      </Modal>
    </div>
  );
};

void registerPwa();

const root = createRoot(document.getElementById('root')!);
void i18nReady.then(() =>
  root.render(
    <BackendStartupGate
      renderStarting={() => (
        <Config>
          <BackendStartingView />
        </Config>
      )}
      renderFailure={(failure) => (
        <Config>
          <BackendStartupFailureDialog failure={failure} />
        </Config>
      )}
      renderApp={() => (
        <AppProviders>
          <App />
        </AppProviders>
      )}
    />
  )
);
