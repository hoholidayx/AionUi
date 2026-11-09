/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import ImageBackendSelector, { buildImageBackendMenu } from '@/renderer/components/agent/ImageBackendSelector';
import MobileActionSheet from '@/renderer/components/chat/MobileActionSheet';
import type { MobileActionSheetEntry } from '@/renderer/components/chat/MobileActionSheet';
import { useImageBackends } from '@/renderer/hooks/mcp/useImageBackends';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';

const { listServers, getAssistant, auth } = vi.hoisted(() => ({
  listServers: vi.fn(),
  getAssistant: vi.fn(),
  auth: { user: { id: 'owner' } as { id: string } | null, status: 'authenticated' as 'authenticated' | 'checking' },
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: { listServers: { invoke: listServers } },
  assistants: { get: { invoke: getAssistant } },
}));
vi.mock('@/renderer/hooks/context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) => (options?.name ? `${key}: ${options.name}` : key),
  }),
}));

const renderSelector = (value: string | null, allowed?: string[], defaultBackend = true, disabled = false) => {
  auth.user = { id: 'owner' };
  auth.status = 'authenticated';
  const onChange = vi.fn();
  const transport = { type: 'http', url: 'https://example.com/mcp' };
  listServers.mockResolvedValue([
    { id: 'image-a', name: 'Image A', purpose: 'async_image', enabled: true, is_default: defaultBackend, transport },
    { id: 'image-b', name: 'Image B', purpose: 'async_image', enabled: true, transport },
    { id: 'disabled', name: 'Disabled', purpose: 'async_image', enabled: false, transport },
    { id: 'sse', name: 'SSE image', purpose: 'async_image', enabled: true, transport: { ...transport, type: 'sse' } },
    { id: 'tools', name: 'General tools', purpose: 'general', enabled: true, transport },
  ]);
  getAssistant.mockResolvedValue({ defaults: { async_image_backend_ids: allowed } });
  const swrConfig = { provider: () => new Map() };
  const Picker = () => {
    const { t } = useTranslation();
    const { backends } = useImageBackends(allowed && 'assistant-a', 'en-US');
    return (
      <ImageBackendSelector menu={buildImageBackendMenu(backends, t, { value, disabled, onChange, onOpen: vi.fn() })} />
    );
  };
  const view = () => (
    <SWRConfig value={swrConfig}>
      <Picker />
    </SWRConfig>
  );
  const rendered = render(view());
  return { onChange, rerender: () => rendered.rerender(view()) };
};

describe('ImageBackendSelector', () => {
  it('offers enabled image backends and shows which one is the global default', async () => {
    const { onChange } = renderSelector(null);
    const button = await screen.findByRole('button', { name: /mcp.imageBackend.defaultWithName: Image A/ });
    expect(button).toHaveTextContent(/^$/);
    fireEvent.click(button);
    expect(await screen.findByRole('menuitemradio', { name: /Image A/, checked: true })).toBeVisible();
    expect(screen.queryByText('Disabled')).not.toBeInTheDocument();
    expect(screen.queryByText('General tools')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Image B' }));
    expect(onChange).toHaveBeenCalledWith('image-b');
  });

  it('keeps an unavailable saved choice visible until the user returns to global default', async () => {
    const { onChange } = renderSelector('deleted');
    fireEvent.click(await screen.findByRole('button', { name: /mcp.imageBackend.unavailable/ }));
    const unavailable = await screen.findByRole('menuitemradio', {
      name: 'mcp.imageBackend.unavailable',
      checked: true,
    });
    expect(unavailable).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(unavailable);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'mcp.imageBackend.defaultWithName: Image A' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('offers only the allowed backend when the global default is excluded', async () => {
    renderSelector('image-a', ['image-b']);
    fireEvent.click(await screen.findByRole('button', { name: /mcp.imageBackend.unavailable/ }));
    expect(await screen.findByText('Image B')).toBeVisible();
    expect(screen.queryByText('Image A')).not.toBeInTheDocument();
    expect(screen.queryByText('mcp.imageBackend.defaultWithName: Image A')).not.toBeInTheDocument();
  });

  it('hides the selector for an explicitly empty selection, even with a saved backend', async () => {
    renderSelector('image-a', []);
    await vi.waitFor(() => expect(getAssistant).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /mcp.imageBackend.label/ })).not.toBeInTheDocument();
  });

  it('requires an explicit HTTP backend when the account default is unset', async () => {
    renderSelector(null, undefined, false);
    fireEvent.click(await screen.findByRole('button', { name: 'mcp.imageBackend.label' }));
    expect(await screen.findByRole('menuitemradio', { name: 'Image A' })).toBeVisible();
    expect(screen.queryByText('mcp.imageBackend.default')).not.toBeInTheDocument();
    expect(screen.queryByText('SSE image')).not.toBeInTheDocument();
  });

  it('does not reuse an earlier account’s image permissions for the same assistant ID', async () => {
    const { rerender } = renderSelector('image-a', ['image-a']);
    expect(await screen.findByRole('button', { name: /Image A/ })).toBeVisible();

    getAssistant.mockClear();
    auth.user = null;
    auth.status = 'checking';
    rerender();
    expect(getAssistant).not.toHaveBeenCalled();

    let resolveNext!: (detail: { defaults: { async_image_backend_ids: string[] } }) => void;
    getAssistant.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNext = resolve;
      })
    );
    auth.user = { id: 'next-owner' };
    auth.status = 'authenticated';
    rerender();
    expect(screen.queryByRole('button', { name: /Image A/ })).not.toBeInTheDocument();

    await act(async () => resolveNext({ defaults: { async_image_backend_ids: ['image-b'] } }));
    expect(await screen.findByRole('button', { name: /mcp.imageBackend.unavailable/ })).toBeVisible();
  });

  it('loads assistant permissions for the authenticated desktop session', async () => {
    const { rerender } = renderSelector('image-a', ['image-a']);
    auth.user = null;
    rerender();
    expect(await screen.findByRole('button', { name: /Image A/ })).toBeVisible();
  });

  it('cannot open the menu while backend selection is disabled', async () => {
    renderSelector(null, undefined, true, true);
    const button = await screen.findByRole('button', { name: /mcp.imageBackend.label/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Image backend in the mobile action sheet', () => {
  const onSelect = vi.fn();
  const imageEntry: MobileActionSheetEntry = {
    key: 'image-backend',
    label: 'Image backend',
    submenu: {
      title: 'Image backend',
      options: [{ key: 'unavailable', label: 'Unavailable backend', active: true, disabled: true }],
      onSelect,
    },
  };
  const attachEntry = { key: 'attach', label: 'Add files' };

  it('exposes the selected but unavailable backend as a disabled button', async () => {
    render(<MobileActionSheet open onClose={vi.fn()} title='More' entries={[attachEntry, imageEntry]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Image backend' }));

    const choice = await screen.findByRole('button', { name: 'Unavailable backend', pressed: true });
    expect(choice).toBeDisabled();
    fireEvent.click(choice);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('returns to the plus menu when a catalog refresh removes the open submenu', async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <MobileActionSheet open onClose={onClose} title='More' entries={[attachEntry, imageEntry]} />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Image backend' }));
    await screen.findByRole('dialog', { name: 'Image backend' });

    rerender(<MobileActionSheet open onClose={onClose} title='More' entries={[attachEntry]} />);

    const menu = await screen.findByRole('dialog', { name: 'More' });
    expect(screen.getByRole('button', { name: 'Add files' })).toBeVisible();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
