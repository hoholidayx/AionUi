/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import ImageBackendSelector from '@/renderer/components/agent/ImageBackendSelector';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { SWRConfig } from 'swr';
import { describe, expect, it, vi } from 'vitest';

const { listServers } = vi.hoisted(() => ({ listServers: vi.fn() }));

vi.mock('@/common/adapter/ipcBridge', () => ({ mcpService: { listServers: { invoke: listServers } } }));
vi.mock('@/renderer/hooks/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) => (options?.name ? `${key}: ${options.name}` : key),
  }),
}));

const renderSelector = (value: string | null) => {
  const onChange = vi.fn();
  listServers.mockResolvedValue([
    { id: 'image-a', name: 'Image A', purpose: 'async_image', enabled: true, is_default: true },
    { id: 'image-b', name: 'Image B', purpose: 'async_image', enabled: true },
    { id: 'disabled', name: 'Disabled', purpose: 'async_image', enabled: false },
    { id: 'tools', name: 'General tools', purpose: 'general', enabled: true },
  ]);
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <ImageBackendSelector value={value} onChange={onChange} />
    </SWRConfig>
  );
  return onChange;
};

describe('ImageBackendSelector', () => {
  it('offers enabled image backends and shows which one is the global default', async () => {
    const onChange = renderSelector(null);
    fireEvent.click(await screen.findByText('mcp.imageBackend.defaultWithName: Image A'));
    fireEvent.click(await screen.findByText('Image B'));
    expect(onChange).toHaveBeenCalledWith('image-b');
    expect(screen.queryByText('Disabled')).not.toBeInTheDocument();
    expect(screen.queryByText('General tools')).not.toBeInTheDocument();
  });

  it('keeps an unavailable saved choice visible until the user returns to global default', async () => {
    const onChange = renderSelector('deleted');
    fireEvent.click(await screen.findByText('mcp.imageBackend.unavailable'));
    fireEvent.click(await screen.findByText('mcp.imageBackend.defaultWithName: Image A'));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
