/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { IMcpServer } from '@/common/config/storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsTabNavigateProvider } from '@/renderer/components/settings/SettingsModal/settingsViewContext';

const hooks = vi.hoisted(() => ({
  modelListWithImage: [] as unknown[],
  mcpServers: [] as IMcpServer[],
  saveMcpServers: vi.fn<(updater: (servers: IMcpServer[]) => IMcpServer[]) => Promise<void>>(),
  setDefaultImageBackend: vi.fn(),
  getClientBusinessSetting: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }),
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/base/AionSelect', () => {
  const Select = ({
    children,
    options,
    value,
    onChange,
    disabled,
    'aria-label': label,
  }: {
    children?: React.ReactNode;
    options?: Array<{ value: string; label: string }>;
    value?: string;
    onChange?: (id: string) => void;
    disabled?: boolean;
    'aria-label'?: string;
  }) =>
    options ? (
      <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange?.(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ) : (
      <div>{children}</div>
    );
  return { default: Object.assign(Select, { OptGroup: Select, Option: Select }) };
});

vi.mock('@/renderer/components/base/TalkToButlerButton', () => ({
  default: () => <div>TalkToButlerButton</div>,
}));

vi.mock('@/renderer/pages/settings/components/AddMcpServerModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/settings/ToolsSettings/McpServerItem', () => ({
  default: () => null,
}));

vi.mock('@/renderer/hooks/agent/useConfigModelListWithImage', () => ({
  default: () => ({ modelListWithImage: hooks.modelListWithImage }),
}));

vi.mock('@/renderer/hooks/mcp', () => ({
  useMcpServers: () => ({
    mcpServers: hooks.mcpServers,
    extensionMcpServers: [],
    saveMcpServers: hooks.saveMcpServers,
    setMcpServers: vi.fn(),
    isMcpServersLoading: false,
  }),
  useMcpConnection: () => ({ testingServers: {}, handleTestMcpConnection: vi.fn(), handleTestMcpConnections: vi.fn() }),
  useMcpModal: () => ({
    showMcpModal: false,
    editingMcpServer: undefined,
    deleteConfirmVisible: false,
    serverToDelete: undefined,
    mcpCollapseKey: [],
    showAddMcpModal: vi.fn(),
    showEditMcpModal: vi.fn(),
    hideMcpModal: vi.fn(),
    showDeleteConfirm: vi.fn(),
    hideDeleteConfirm: vi.fn(),
    toggleServerCollapse: vi.fn(),
  }),
  useMcpServerCRUD: () => ({
    handleAddMcpServer: vi.fn(),
    handleBatchImportMcpServers: vi.fn(),
    handleEditMcpServer: vi.fn(),
    handleDeleteMcpServer: vi.fn(),
  }),
  useMcpOAuth: () => ({
    oauthStatus: {},
    loggingIn: {},
    checkOAuthStatus: vi.fn(),
    markLoginRequired: vi.fn(),
    clearLoginRequired: vi.fn(),
    login: vi.fn(),
  }),
  useMountedMessage: (m: unknown) => m,
}));

vi.mock('@/renderer/services/clientBusinessSettings', () => ({
  getClientBusinessSetting: hooks.getClientBusinessSetting,
  setClientBusinessSetting: vi.fn(() => Promise.resolve()),
  removeClientBusinessSetting: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: { setDefaultImageBackend: { invoke: hooks.setDefaultImageBackend } },
}));

import ToolsModalContent from '@/renderer/components/settings/SettingsModal/contents/ToolsModalContent';

const imageServer = (id: string, overrides: Partial<IMcpServer> = {}): IMcpServer => ({
  id,
  name: id,
  purpose: 'async_image',
  enabled: true,
  transport: { type: 'http', url: 'https://example.com/mcp' },
  created_at: 0,
  updated_at: 0,
  original_json: '{}',
  ...overrides,
});

describe('ToolsModalContent image model guide', () => {
  beforeEach(() => {
    hooks.modelListWithImage = [];
    hooks.mcpServers = [];
    hooks.setDefaultImageBackend.mockReset().mockResolvedValue(undefined);
    hooks.saveMcpServers.mockReset().mockImplementation(async (update) => {
      hooks.mcpServers = update(hooks.mcpServers);
    });
    hooks.getClientBusinessSetting.mockClear();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a clickable "go to configure" link that navigates to the model tab', async () => {
    const navigateToTab = vi.fn();
    render(
      <SettingsTabNavigateProvider value={navigateToTab}>
        <ToolsModalContent />
      </SettingsTabNavigateProvider>
    );

    const link = await screen.findByText('settings.goToModelSettings');
    // Rendered as an inline anchor (text link), not a button.
    expect(link.tagName).toBe('A');
    fireEvent.click(link);

    await waitFor(() => expect(navigateToTab).toHaveBeenCalledWith('model'));
  });

  it('renders the guide text as plain text (no link) when no tab navigator is provided', async () => {
    const { container } = render(<ToolsModalContent />);

    // The empty-state hint still shows the go-to-configure wording, but not as a clickable link.
    await waitFor(() => expect(container.textContent).toContain('settings.goToModelSettings'));
    const links = Array.from(container.querySelectorAll('a')).filter(
      (a) => a.textContent === 'settings.goToModelSettings'
    );
    expect(links).toHaveLength(0);
  });

  it('offers only enabled async image MCPs and saves or clears the account default separately', async () => {
    hooks.mcpServers = [
      imageServer('Existing', { is_default: true }),
      imageServer('Alternative'),
      imageServer('Disabled', { enabled: false }),
      imageServer('General', { purpose: 'general' }),
      imageServer('Builtin', { builtin: true }),
    ];
    const { rerender } = render(<ToolsModalContent />);
    const selector = screen.getByRole('combobox', { name: 'settings.mcpAsyncImageDefault' });
    expect(Array.from((selector as HTMLSelectElement).options, (option) => option.value)).toEqual([
      '',
      'Existing',
      'Alternative',
    ]);

    fireEvent.change(selector, { target: { value: 'Alternative' } });
    await waitFor(() => expect(hooks.saveMcpServers).toHaveBeenCalled());
    rerender(<ToolsModalContent />);
    await waitFor(() => expect(selector).toHaveValue('Alternative'));
    fireEvent.change(selector, { target: { value: '' } });
    await waitFor(() =>
      expect(hooks.setDefaultImageBackend.mock.calls).toEqual([[{ server_id: 'Alternative' }], [{ server_id: null }]])
    );
  });

  it('preserves the current account default when the backend rejects a change', async () => {
    hooks.mcpServers = [imageServer('Existing', { is_default: true }), imageServer('Alternative')];
    hooks.setDefaultImageBackend.mockRejectedValueOnce(new Error('Unavailable'));
    render(<ToolsModalContent />);
    const selector = screen.getByRole('combobox', { name: 'settings.mcpAsyncImageDefault' });

    fireEvent.change(selector, { target: { value: 'Alternative' } });
    await screen.findByText('settings.mcpSyncError');
    expect(selector).toHaveValue('Existing');
    expect(hooks.saveMcpServers).not.toHaveBeenCalled();
  });
});
