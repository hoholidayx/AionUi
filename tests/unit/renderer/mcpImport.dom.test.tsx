/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMcpServer } from '@/common/config/storage';

const getAgentMcpConfigsInvoke = vi.fn();
const getManagedAgents = vi.fn();

vi.mock('react-i18next', () => {
  const t = (key: string, params?: Record<string, unknown>) => {
    if (params && typeof params.count === 'number') {
      return `${key}:${params.count}`;
    }
    return key;
  };
  return { useTranslation: () => ({ t }) };
});

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: {
    getAgentMcpConfigs: {
      invoke: (...args: unknown[]) => getAgentMcpConfigsInvoke(...args),
    },
  },
}));

vi.mock('@/renderer/hooks/agent/useManagedAgents', () => ({
  getManagedAgents: (...args: unknown[]) => getManagedAgents(...args),
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({
    visible,
    children,
    footer,
    onOk,
    okButtonProps,
  }: {
    visible: boolean;
    children: React.ReactNode;
    footer?: { render?: () => React.ReactNode };
    onOk?: () => void;
    okButtonProps?: { disabled?: boolean };
  }) =>
    visible ? (
      <div>
        {children}
        {footer?.render?.()}
        {onOk && (
          <button disabled={okButtonProps?.disabled} onClick={onOk}>
            Save
          </button>
        )}
      </div>
    ) : null,
}));

vi.mock('@/renderer/components/base/AionSteps', () => {
  const Step = ({ title }: { title: React.ReactNode }) => <div>{title}</div>;
  const Steps = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  Steps.Step = Step;
  return { default: Steps };
});

vi.mock('@icon-park/react', () => ({
  Check: () => <span>check</span>,
}));

vi.mock('@arco-design/web-react', () => {
  const Button = ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );

  const Select = ({
    children,
    value,
    onChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onChange?: (value: string) => void;
  }) => (
    <div>
      <div data-testid='select-value'>{value}</div>
      <div>
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          return React.cloneElement(child as React.ReactElement<{ onSelect?: () => void }>, {
            onSelect: () => onChange?.((child.props as { value: string }).value),
          });
        })}
      </div>
    </div>
  );

  Select.Option = ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button onClick={onSelect}>{children}</button>
  );

  return {
    Alert: () => null,
    Button,
    Input: ({
      'aria-label': label,
      value,
      onChange,
    }: {
      'aria-label': string;
      value: string;
      onChange: (v: string) => void;
    }) => <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />,
    Select,
    Spin: () => <span>spin</span>,
    Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({ useThemeContext: () => ({ theme: 'light' }) }));

vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label='MCP JSON' value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

vi.mock('@/renderer/pages/settings/components/OneClickImportModal', async () => {
  const actual = await vi.importActual<typeof import('@/renderer/pages/settings/components/OneClickImportModal')>(
    '@/renderer/pages/settings/components/OneClickImportModal'
  );
  return actual;
});

import AddMcpServerModal from '@/renderer/pages/settings/components/AddMcpServerModal';
import JsonImportModal from '@/renderer/pages/settings/components/JsonImportModal';
import OneClickImportModal from '@/renderer/pages/settings/components/OneClickImportModal';

describe('MCP import flows', () => {
  beforeEach(() => {
    getAgentMcpConfigsInvoke.mockReset();
    getAgentMcpConfigsInvoke.mockResolvedValue([]);
    getManagedAgents.mockReset();
    getManagedAgents.mockResolvedValue([]);
  });

  it('opens the requested one-click import modal without probing managed agents first', async () => {
    render(
      <AddMcpServerModal
        visible
        existingServerNames={[]}
        importMode='oneclick'
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        onBatchImport={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('settings.mcpImportDescription')).toBeInTheDocument();
    });
    expect(getManagedAgents).not.toHaveBeenCalled();
  });

  it('loads MCP configs directly from the backend scan endpoint without managed-agent input', async () => {
    render(<OneClickImportModal visible existingServerNames={[]} onCancel={vi.fn()} onBatchImport={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByTestId('select-value')).toHaveTextContent('claude');
    });

    fireEvent.click(screen.getByText('settings.mcpNextStep'));

    await waitFor(() => {
      expect(getAgentMcpConfigsInvoke).toHaveBeenCalledWith();
    });
    expect(getManagedAgents).not.toHaveBeenCalled();
  });

  it('edits the saved alias and sends an explicit clear when the field is emptied', async () => {
    const server: IMcpServer = {
      id: 'image-server-id',
      name: 'Example Image',
      purpose: 'async_image',
      backend_alias: 'current-alias',
      transport: { type: 'http', url: 'https://example.com/mcp' },
      enabled: true,
      created_at: 0,
      updated_at: 0,
      original_json: JSON.stringify({
        mcpServers: { 'Example Image': { url: 'https://example.com/mcp', backend_alias: 'stale-alias' } },
      }),
    };
    const onSubmit = vi.fn().mockResolvedValue(server);
    render(<JsonImportModal visible server={server} onCancel={vi.fn()} onSubmit={onSubmit} />);

    const field = screen.getByRole('textbox', { name: 'settings.mcpBackendAlias' });
    expect(field).toHaveValue('current-alias');
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ backend_alias: null })));
  });

  it('keeps the JSON open for correction after the server rejects an import', async () => {
    const onCancel = vi.fn();
    const onBatchImport = vi.fn().mockResolvedValue([]);
    render(<JsonImportModal visible onCancel={onCancel} onSubmit={vi.fn()} onBatchImport={onBatchImport} />);

    const json = '{"image":{"url":"https://example.com/mcp","purpose":"async_image","backend_alias":"taken"}}';
    const editor = screen.getByRole('textbox', { name: 'MCP JSON' });
    const submit = screen.getByRole('button', { name: 'Save' });
    fireEvent.change(editor, { target: { value: json } });
    fireEvent.click(submit);

    await waitFor(() => expect(submit).toBeEnabled());
    expect(onBatchImport).toHaveBeenCalledWith([expect.objectContaining({ backend_alias: 'taken' })]);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
