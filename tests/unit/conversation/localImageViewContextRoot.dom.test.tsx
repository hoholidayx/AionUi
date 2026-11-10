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
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolImageSource } from '@/common/types/chatFile';

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

const asyncPreview = (attachmentId: string) => (
  <ConversationProvider value={{ conversation_id: 'another-conversation', workspace: '/workspace', type: 'aionrs' }}>
    <LocalImageView
      source={{ kind: 'async-attachment', ref: { conversationId: 'original-conversation', attachmentId } }}
      alt='demo'
    />
  </ConversationProvider>
);

it('reads the original attachment, drops obsolete results, and releases the current preview', async () => {
  const image = new Blob(['image'], { type: 'image/png' });
  let resolveObsolete!: (image: Blob) => void;
  const obsolete = new Promise<Blob>((resolve) => {
    resolveObsolete = resolve;
  });
  const nextImage = new Blob(['next'], { type: 'image/png' });
  const createObjectURL = vi.fn().mockReturnValueOnce('blob:test-image').mockReturnValueOnce('blob:next-image');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    }
  );
  hoisted.getAsyncImage.mockResolvedValueOnce(image).mockReturnValueOnce(obsolete).mockResolvedValueOnce(nextImage);

  const { rerender, unmount } = render(asyncPreview('image-1'));
  expect(await screen.findByRole('img', { name: 'demo' })).toHaveAttribute('src', 'blob:test-image');
  expect(hoisted.getAsyncImage).toHaveBeenCalledWith({
    conversationId: 'original-conversation',
    attachmentId: 'image-1',
  });
  expect(createObjectURL).toHaveBeenCalledWith(image);

  rerender(asyncPreview('pending-image'));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-image');
  rerender(asyncPreview('new-image'));
  expect(await screen.findByRole('img', { name: 'demo' })).toHaveAttribute('src', 'blob:next-image');
  await act(async () => resolveObsolete(image));
  expect(createObjectURL).toHaveBeenCalledTimes(2);
  expect(hoisted.getImageBase64).not.toHaveBeenCalled();

  unmount();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:next-image');
});

it('explains when the asynchronous image attachment is unavailable', async () => {
  hoisted.getAsyncImage.mockResolvedValueOnce(null);

  render(
    <LocalImageView
      source={{ kind: 'async-attachment', ref: { conversationId: 'original-conversation', attachmentId: 'image-1' } }}
      alt='demo'
    />
  );

  expect(await screen.findByText('acp.image.asyncFailure.outputUnavailable')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

const scopedSources = [
  { kind: 'tool-message', ref: { conversationId: 'conv-1', messageId: 'image-call' }, fileName: 'result.png' },
  { kind: 'async-attachment', ref: { conversationId: 'conv-1', attachmentId: 'image-1' } },
] satisfies ToolImageSource[];

it.each(scopedSources)('shows unavailable for a rejected $kind without reading a local path', async (source) => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const read = source.kind === 'tool-message' ? hoisted.getToolImage : hoisted.getAsyncImage;
  read.mockRejectedValueOnce(new Error('Access denied'));
  render(<LocalImageView source={source} alt='demo' />);

  expect(await screen.findByText('acp.image.asyncFailure.outputUnavailable')).toBeInTheDocument();
  expect(read).toHaveBeenCalledWith(source.ref);
  expect(hoisted.getImageBase64).not.toHaveBeenCalled();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  consoleError.mockRestore();
});

it('shows unavailable for an unreadable generated path instead of using the path as an image URL', async () => {
  render(<LocalImageView source={{ kind: 'local-path', path: '/missing.png' }} alt='demo' />);
  expect(await screen.findByText('acp.image.asyncFailure.outputUnavailable')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
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
