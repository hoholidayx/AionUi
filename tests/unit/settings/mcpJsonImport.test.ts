import { describe, expect, it } from 'vitest';

import { parseMcpJsonImport } from '@/renderer/pages/settings/ToolsSettings/mcpJsonImport';

describe('parseMcpJsonImport', () => {
  it('rejects a bare server object instead of treating its fields as server names', () => {
    const result = parseMcpJsonImport({
      command: 'npx',
      args: ['-y', '@playwright/mcp'],
    });

    expect(result).toEqual({
      isValid: false,
      errorKey: 'settings.mcpJsonBareServerError',
    });
  });

  it('parses mcpServers stdio configs', () => {
    const result = parseMcpJsonImport({
      mcpServers: {
        playwright: {
          command: 'npx',
          args: ['-y', '@playwright/mcp'],
        },
      },
    });

    expect(result).toEqual({
      isValid: true,
      servers: [
        {
          name: 'playwright',
          description: 'Imported from JSON',
          transport: {
            type: 'stdio',
            command: 'npx',
            args: ['-y', '@playwright/mcp'],
            env: {},
          },
          originalConfig: {
            command: 'npx',
            args: ['-y', '@playwright/mcp'],
          },
        },
      ],
    });
  });

  it('normalizes string stdio args in array transport configs', () => {
    const result = parseMcpJsonImport([
      {
        name: 'report',
        transport: {
          type: 'stdio',
          command: 'python',
          args: 'D:\\PJ-MCP\\report_mcp_server.py',
        },
      },
    ]);

    expect(result).toEqual({
      isValid: true,
      servers: [
        {
          name: 'report',
          description: 'Imported from JSON',
          transport: {
            type: 'stdio',
            command: 'python',
            args: ['D:\\PJ-MCP\\report_mcp_server.py'],
            env: {},
          },
          originalConfig: {
            transport: {
              type: 'stdio',
              command: 'python',
              args: 'D:\\PJ-MCP\\report_mcp_server.py',
            },
          },
        },
      ],
    });
  });

  it('maps streamable_http to http for the backend contract', () => {
    const result = parseMcpJsonImport({
      mcpServers: {
        docs: {
          type: 'streamable_http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer token' },
        },
      },
    });

    expect(result).toEqual({
      isValid: true,
      servers: [
        {
          name: 'docs',
          description: 'Imported from JSON',
          transport: {
            type: 'http',
            url: 'https://example.com/mcp',
            headers: { Authorization: 'Bearer token' },
          },
          originalConfig: {
            type: 'streamable_http',
            url: 'https://example.com/mcp',
            headers: { Authorization: 'Bearer token' },
          },
        },
      ],
    });
  });

  it('rejects http configs without a URL', () => {
    const result = parseMcpJsonImport({
      mcpServers: {
        broken: {
          type: 'http',
        },
      },
    });

    expect(result).toEqual({
      isValid: false,
      errorKey: 'settings.mcpJsonUrlRequiredError',
    });
  });

  it('carries image generation roles without importing either legacy default', () => {
    expect(
      parseMcpJsonImport({
        mcpServers: {
          primary: {
            type: 'streamable_http',
            url: 'https://example.com/mcp',
            purpose: 'async_image',
            is_default: true,
          },
          secondary: { type: 'http', url: 'https://example.org/sse', purpose: 'async_image', is_default: true },
          docs: { type: 'http', url: 'https://example.net/mcp' },
        },
      })
    ).toMatchObject({
      isValid: true,
      servers: [
        { name: 'primary', transport: { type: 'http' }, purpose: 'async_image' },
        { name: 'secondary', transport: { type: 'http' }, purpose: 'async_image' },
        { name: 'docs', transport: { type: 'http' } },
      ],
    });
  });

  it('requires Streamable HTTP for asynchronous image generation', () => {
    expect(
      parseMcpJsonImport({ image: { type: 'sse', url: 'https://example.com/sse', purpose: 'async_image' } })
    ).toEqual({ isValid: false, errorKey: 'settings.mcpAsyncImageHttpRequired' });
  });

  it('discards the legacy default even in original JSON and for general servers', () => {
    const result = parseMcpJsonImport({ docs: { url: 'https://example.com/mcp', is_default: true } });
    expect(result.isValid).toBe(true);
    if (result.isValid) {
      expect(result.servers[0]).not.toHaveProperty('is_default');
      expect(result.servers[0].originalConfig).toEqual({ url: 'https://example.com/mcp' });
    }
  });
});
