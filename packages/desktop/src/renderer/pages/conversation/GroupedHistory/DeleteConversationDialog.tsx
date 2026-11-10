/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Alert, Checkbox, Modal } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type DeleteConversationDialogProps = {
  id: string;
  name: string;
  onClose: () => void;
  onDeleted: () => void;
  deleteLocal?: (id: string) => Promise<unknown>;
};

const DeleteConversationDialog: React.FC<DeleteConversationDialogProps> = ({
  id,
  name,
  onClose,
  onDeleted,
  deleteLocal,
}) => {
  const { t } = useTranslation();
  const [option, setOption] = useState<Awaited<ReturnType<typeof ipcBridge.conversation.deleteOptions.invoke>>>();
  const [includeCodex, setIncludeCodex] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<'local' | 'codex' | null>(null);

  useEffect(() => {
    let current = true;
    void ipcBridge.conversation.deleteOptions.invoke({ id }).then(
      (value) => {
        if (current) setOption(value);
      },
      () => {
        if (current) setOption('unavailable');
      }
    );
    return () => {
      current = false;
    };
  }, [id]);

  const submit = async () => {
    if (deleting || option === undefined) return;
    setDeleting(true);
    setError(null);
    try {
      if (includeCodex) {
        await ipcBridge.conversation.removeWithCodexHistory.invoke({ id });
      } else if (deleteLocal) {
        await deleteLocal(id);
      } else {
        await ipcBridge.conversation.remove.invoke({ id });
      }
    } catch {
      setError(includeCodex ? 'codex' : 'local');
      return;
    } finally {
      setDeleting(false);
    }
    onDeleted();
  };

  return (
    <Modal
      visible
      alignCenter
      title={t('conversation.history.deleteTitle')}
      okText={t('conversation.history.confirmDelete')}
      cancelText={t('common.cancel')}
      onCancel={onClose}
      onOk={() => void submit()}
      confirmLoading={deleting}
      closable={!deleting}
      maskClosable={!deleting}
      escToExit={!deleting}
      cancelButtonProps={{ disabled: deleting }}
      okButtonProps={{ status: 'danger', disabled: option === undefined }}
      getPopupContainer={() => document.body}
    >
      <p>{t('settings.archived.deleteConfirmContent', { name })}</p>
      {(option === 'available' || option === 'retry_required') && (
        <div className='flex flex-col gap-8px'>
          <Checkbox checked={includeCodex} onChange={setIncludeCodex} disabled={deleting}>
            {t('conversation.history.deleteCodexHistory')}
          </Checkbox>
          {includeCodex && <Alert type='warning' content={t('conversation.history.deleteCodexHistoryWarning')} />}
          {option === 'retry_required' && error !== 'codex' && (
            <Alert type='warning' content={t('conversation.history.deleteCodexHistoryRetry')} />
          )}
        </div>
      )}
      {error && (
        <Alert
          className='mt-8px'
          type='error'
          content={error === 'codex' ? t('conversation.history.deleteCodexHistoryRetry') : t('common.deleteFailed')}
        />
      )}
    </Modal>
  );
};

export default DeleteConversationDialog;
