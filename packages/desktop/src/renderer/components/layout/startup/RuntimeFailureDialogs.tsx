import { Modal } from '@arco-design/web-react';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ipcBridge } from '@/common';
import type { IRuntimeStatusEvent, RuntimeFailureKind } from '@/common/adapter/ipcBridge';
import {
  InstallationIntegrityContent,
  type InstallationIntegrityDiagnostics,
  getRuntimeComponentInstallationDescription,
  showInstallationIntegrityModal,
} from './InstallationIntegrityDialog';
import { createRuntimeInstallationReconciler } from '@renderer/services/runtime/runtimeInstallationReconciler';

const INSTALLATION_INTEGRITY_FAILURES = new Set<RuntimeFailureKind>([
  'bundled_resource_missing',
  'bundled_resource_invalid',
  'validation_failed',
]);

function isInstallationIntegrityFailure(kind: RuntimeFailureKind | undefined): boolean {
  return INSTALLATION_INTEGRITY_FAILURES.has(kind ?? 'unknown');
}

function captureRuntimeInstallationIntegrityFailure(event: IRuntimeStatusEvent): void {
  if (!isInstallationIntegrityFailure(event.failure_kind)) {
    return;
  }

  void import('@sentry/electron/renderer')
    .then((Sentry) => {
      Sentry.withScope((scope) => {
        scope.setTag('aionui.installation_integrity', event.failure_kind ?? 'unknown');
        scope.setTag('aionui.runtime_resource', event.resource);
        scope.setTag('aionui.runtime_resource_id', event.resource_id ?? '');
        scope.setTag('aionui.runtime_scope', event.scope.kind);
        Sentry.captureMessage('runtime-installation-integrity-failure', 'error');
      });
    })
    .catch(() => {});
}

function buildRuntimeInstallationDiagnostics(
  event: IRuntimeStatusEvent,
  description: string
): InstallationIntegrityDiagnostics {
  return {
    source: 'runtime_status',
    description,
    runtime: {
      failureKind: event.failure_kind,
      message: event.message,
      phase: event.phase,
      resource: event.resource,
      resourceId: event.resource_id,
      scopeId: event.scope.id,
      scopeKind: event.scope.kind,
    },
  };
}

function resolveRuntimeResourceLabel(event: IRuntimeStatusEvent, t: TFunction): string {
  if (event.resource === 'node') {
    return t('settings.runtimeResource.node');
  }
  if (event.resource_id === 'codex-acp') {
    return t('settings.runtimeResource.codexAcp');
  }
  if (event.resource_id === 'claude-agent-acp') {
    return t('settings.runtimeResource.claudeAgentAcp');
  }
  return t('settings.runtimeResource.acpTool');
}

const RuntimeFailureDialogs: React.FC = () => {
  const { t } = useTranslation();
  const [modal, modalContextHolder] = Modal.useModal();

  useEffect(() => {
    const reconciler = createRuntimeInstallationReconciler({
      showDialog: (event) => {
        const resource = resolveRuntimeResourceLabel(event, t);
        const description = getRuntimeComponentInstallationDescription(t, resource);
        const controller = showInstallationIntegrityModal(
          modal,
          t,
          description,
          buildRuntimeInstallationDiagnostics(event, description)
        );
        return { close: () => controller.close() };
      },
      report: (event) => captureRuntimeInstallationIntegrityFailure(event),
    });

    const offStatus = ipcBridge.runtime.statusChanged.on((event: IRuntimeStatusEvent) => {
      // Reconcile install-integrity failures and node ready events (spec 8/13.4).
      if (
        (event.phase === 'failed' && isInstallationIntegrityFailure(event.failure_kind)) ||
        (event.phase === 'ready' && event.resource === 'node')
      ) {
        reconciler.handleStatus(event);
        return;
      }

      // Non-integrity failures keep the existing generic error modal (unchanged).
      if (event.phase !== 'failed') {
        return;
      }
      const resource = resolveRuntimeResourceLabel(event, t);
      modal.error({
        title: t('common.error'),
        content: <InstallationIntegrityContent description={t('settings.runtimeStatus.failedUnknown', { resource })} />,
        okText: t('common.confirm'),
        closable: false,
        maskClosable: false,
      });
    });

    const onBeforeUnload = () => reconciler.flushPending();
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      offStatus();
      reconciler.flushPending();
      reconciler.dispose();
    };
  }, [modal, t]);

  return <>{modalContextHolder}</>;
};

export default RuntimeFailureDialogs;
