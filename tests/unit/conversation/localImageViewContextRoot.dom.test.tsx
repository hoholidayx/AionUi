/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * LocalImageView resolves relative image paths in markdown against the
 * conversation workspace (the agent cwd) read straight from ConversationContext,
 * and forwards that workspace to the fs sandbox. Inside a conversation a bare
 * `./chart.png` becomes `<workspace>/chart.png` with `workspace` set; outside any
 * conversation (settings markdown) there is no workspace so the src goes through
 * untouched. A dropped workspace sends the backend a bare relative path, which it
 * canonicalizes against its own cwd and rejects (400) — the exact bug this guards.
 */

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getImageBase64: vi.fn(() => Promise.resolve<string | null>(null)),
  getAsyncImage: vi.fn(),
  getToolImage: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/common', () => ({
  __esModule: true,
  ipcBridge: {
    fs: {
      getImageBase64: { invoke: hoisted.getImageBase64 },
      getAsyncImage: { invoke: hoisted.getAsyncImage },
      getToolImage: { invoke: hoisted.getToolImage },
    },
  },
}));

import LocalImageView from '@renderer/components/media/LocalImageView';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';

afterEach(() => {
  cleanup();
  hoisted.getImageBase64.mockClear();
  hoisted.getAsyncImage.mockReset();
  hoisted.getToolImage.mockReset();
  vi.unstubAllGlobals();
});

it('reads an asynchronous attachment from the original conversation and releases its preview on unmount', async () => {
  const image = new Blob(['image'], { type: 'image/png' });
  const createObjectURL = vi.fn().mockReturnValue('blob:test-image');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    }
  );
  hoisted.getAsyncImage.mockResolvedValueOnce(image);

  const { unmount } = render(
    <ConversationProvider value={{ conversation_id: 'another-conversation', workspace: '/workspace', type: 'aionrs' }}>
      <LocalImageView asyncImage={{ conversationId: 'original-conversation', attachmentId: 'image-1' }} alt='demo' />
    </ConversationProvider>
  );
  expect(await screen.findByRole('img', { name: 'demo' })).toHaveAttribute('src', 'blob:test-image');
  expect(hoisted.getAsyncImage).toHaveBeenCalledWith({
    conversationId: 'original-conversation',
    attachmentId: 'image-1',
  });
  expect(hoisted.getImageBase64).not.toHaveBeenCalled();
  expect(createObjectURL).toHaveBeenCalledWith(image);

  unmount();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-image');
});

it('explains when the asynchronous image attachment is unavailable', async () => {
  hoisted.getAsyncImage.mockResolvedValueOnce(null);

  render(
    <LocalImageView asyncImage={{ conversationId: 'original-conversation', attachmentId: 'image-1' }} alt='demo' />
  );

  expect(await screen.findByText('acp.image.asyncFailure.outputUnavailable')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

it('requests a generated tool image by conversation and call ID even when the file is unavailable', async () => {
  hoisted.getToolImage.mockResolvedValueOnce(undefined);
  const ref = { conversationId: 'conv-1', messageId: 'image-call' };
  render(<LocalImageView toolImage={ref} alt='demo' unavailableText='Image unavailable' />);

  expect(await screen.findByText('Image unavailable')).toBeInTheDocument();
  expect(hoisted.getToolImage).toHaveBeenCalledWith(ref);
  expect(hoisted.getImageBase64).not.toHaveBeenCalled();
});

const renderInConversation = (workspace: string | undefined, src: string) =>
  render(
    <ConversationProvider value={{ conversation_id: 'conv-1', workspace, type: 'acp' }}>
      <LocalImageView src={src} alt='demo' />
    </ConversationProvider>
  );

describe('LocalImageView workspace root from ConversationContext', () => {
  it('joins a relative src onto the conversation workspace and forwards it as the fs workspace', async () => {
    renderInConversation('/workspace/demo', './material.jpeg');
    await waitFor(() => expect(hoisted.getImageBase64).toHaveBeenCalled());
    expect(hoisted.getImageBase64).toHaveBeenCalledWith({
      path: '/workspace/demo/material.jpeg',
      workspace: '/workspace/demo',
    });
  });

  it('passes an absolute src through untouched while still forwarding the workspace', async () => {
    renderInConversation('/workspace/demo', '/var/tmp/aionui/pic.png');
    await waitFor(() => expect(hoisted.getImageBase64).toHaveBeenCalled());
    expect(hoisted.getImageBase64).toHaveBeenCalledWith({
      path: '/var/tmp/aionui/pic.png',
      workspace: '/workspace/demo',
    });
  });

  it('sends the src as-is with no workspace when rendered outside a conversation', async () => {
    render(<LocalImageView src='./material.jpeg' alt='demo' />);
    await waitFor(() => expect(hoisted.getImageBase64).toHaveBeenCalled());
    expect(hoisted.getImageBase64).toHaveBeenCalledWith({
      path: './material.jpeg',
      workspace: undefined,
    });
  });
});
