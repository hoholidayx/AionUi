/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ options: vi.fn(), remove: vi.fn(), removeWithCodexHistory: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      deleteOptions: { invoke: bridge.options },
      remove: { invoke: bridge.remove },
      removeWithCodexHistory: { invoke: bridge.removeWithCodexHistory },
    },
  },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import DeleteConversationDialog from '@/renderer/pages/conversation/GroupedHistory/DeleteConversationDialog';

const renderDialog = (deleteLocal?: (id: string) => Promise<unknown>) => {
  const onDeleted = vi.fn();
  render(
    <DeleteConversationDialog id='conv' name='Chat' onClose={vi.fn()} onDeleted={onDeleted} deleteLocal={deleteLocal} />
  );
  return { onDeleted };
};

const confirm = () => screen.getByRole('button', { name: 'conversation.history.confirmDelete' });

beforeEach(() => {
  vi.resetAllMocks();
  bridge.options.mockResolvedValue('available');
  bridge.remove.mockResolvedValue(true);
  bridge.removeWithCodexHistory.mockResolvedValue(undefined);
});

describe('single conversation deletion', () => {
  it('defaults to local deletion even for eligible Codex threads', async () => {
    const { onDeleted } = renderDialog();
    expect(await screen.findByRole('checkbox')).not.toBeChecked();
    fireEvent.click(confirm());
    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
    expect(bridge.remove).toHaveBeenCalledWith({ id: 'conv' });
    expect(bridge.removeWithCodexHistory).not.toHaveBeenCalled();
  });

  it('preserves the explicit selection and retries without a local fallback', async () => {
    bridge.removeWithCodexHistory.mockRejectedValueOnce(new Error('connection failed'));
    const { onDeleted } = renderDialog();
    fireEvent.click(await screen.findByRole('checkbox'));
    expect(screen.getByText('conversation.history.deleteCodexHistoryWarning')).toBeInTheDocument();
    fireEvent.click(confirm());
    await screen.findByText('conversation.history.deleteCodexHistoryRetry');
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(bridge.remove).not.toHaveBeenCalled();
    fireEvent.click(confirm());
    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
    expect(bridge.removeWithCodexHistory).toHaveBeenCalledTimes(2);
  });

  it('uses the archived local-delete handler when the backend lacks the option route', async () => {
    bridge.options.mockRejectedValueOnce(new Error('404'));
    const archivedDelete = vi.fn().mockResolvedValue(undefined);
    const { onDeleted } = renderDialog(archivedDelete);
    await waitFor(() => expect(confirm()).toBeEnabled());
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(confirm());
    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
    expect(archivedDelete).toHaveBeenCalledWith('conv');
    expect(bridge.removeWithCodexHistory).not.toHaveBeenCalled();
  });
});
