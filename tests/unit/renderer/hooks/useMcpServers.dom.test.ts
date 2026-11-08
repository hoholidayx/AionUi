/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useSWR from 'swr';

const { ensureBackendMcpCatalogMock } = vi.hoisted(() => ({
  ensureBackendMcpCatalogMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    extensions: {
      getMcpServers: { invoke: vi.fn().mockResolvedValue([]) },
    },
  },
}));

vi.mock('@/renderer/hooks/mcp/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/renderer/hooks/mcp/catalog')>()),
  ensureBackendMcpCatalog: ensureBackendMcpCatalogMock,
}));

import { IMAGE_BACKEND_CATALOG_KEY } from '@/renderer/hooks/mcp/catalog';
import { useMcpServers } from '@/renderer/hooks/mcp/useMcpServers';

describe('useMcpServers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureBackendMcpCatalogMock.mockResolvedValue({
      userServers: [],
      builtinServers: [],
      allServers: [],
    });
  });

  it('loads MCP catalog on mount', async () => {
    const { result } = renderHook(() => useMcpServers());

    await waitFor(() => expect(result.current.isMcpServersLoading).toBe(false));

    expect(ensureBackendMcpCatalogMock).toHaveBeenCalledTimes(1);
    expect(result.current.mcpServers).toEqual([]);
  });

  it('does not fall back to configService business data when MCP catalog loading fails', async () => {
    ensureBackendMcpCatalogMock.mockRejectedValue(new Error('catalog failed'));

    const { result } = renderHook(() => useMcpServers());

    await waitFor(() => expect(result.current.isMcpServersLoading).toBe(false));

    expect(result.current.mcpServers).toEqual([]);
  });

  it('updates local MCP state without persisting business data outside the backend catalog', async () => {
    const { result } = renderHook(() => useMcpServers());

    await waitFor(() => expect(result.current.isMcpServersLoading).toBe(false));

    act(() => {
      void result.current.saveMcpServers([
        {
          id: 'mcp-1',
          name: 'server-1',
          enabled: true,
          transport: { type: 'stdio', command: 'foo', args: [] },
          created_at: 1,
          updated_at: 1,
          original_json: '{}',
          builtin: false,
        },
      ]);
    });

    await waitFor(() => expect(result.current.mcpServers).toHaveLength(1));
  });

  it('refreshes the image backend catalog when settings saves a server', async () => {
    const fetchImageBackends = vi.fn().mockResolvedValue([]);
    const { result } = renderHook(() => {
      useSWR([IMAGE_BACKEND_CATALOG_KEY, 'catalog-refresh-test'], fetchImageBackends);
      return useMcpServers();
    });
    await waitFor(() => expect(fetchImageBackends).toHaveBeenCalledTimes(1));

    await act(() => result.current.saveMcpServers([]));

    await waitFor(() => expect(fetchImageBackends).toHaveBeenCalledTimes(2));
  });
});
