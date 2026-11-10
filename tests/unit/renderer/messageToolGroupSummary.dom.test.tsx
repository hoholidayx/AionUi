import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import type { IMessageAcpToolCall, TMessage } from '@/common/chat/chatLib';
import MessageToolGroupSummary from '@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary';

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessage: {
        invoke: vi.fn(),
      },
    },
    fs: {
      getImageBase64: { invoke: vi.fn().mockResolvedValue('data:image/png;base64,aW1hZ2U=') },
    },
  },
}));

describe('MessageToolGroupSummary', () => {
  it('fills in a missing image from full history and uses a newer image when it arrives', async () => {
    const invoke = vi.mocked(ipcBridge.database.getConversationMessage.invoke);
    invoke.mockResolvedValue({
      id: 'message-1',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        update: {
          session_update: 'tool_call',
          tool_call_id: 'tool-1',
          status: 'completed',
          title: 'rg',
          kind: 'search',
          raw_input: { pattern: 'needle', path: '.' },
          raw_output: { saved_path: '/workspace/full-result.png' },
          content: [{ type: 'content', content: { type: 'text', text: 'full output' } }],
        },
      },
    } as unknown as TMessage);

    const compactMessage = {
      id: 'message-1',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        _compact: { truncated: true, original_size: 90000, preview_chars: 4096 },
        update: {
          session_update: 'tool_call',
          tool_call_id: 'tool-1',
          status: 'completed',
          title: 'rg',
          kind: 'search',
          raw_input: { pattern: 'needle', path: '.' },
          content: [{ type: 'content', content: { type: 'text', text: 'preview' } }],
        },
      },
    } as unknown as IMessageAcpToolCall;
    const { rerender } = render(<MessageToolGroupSummary messages={[compactMessage]} />);

    fireEvent.click(screen.getByText('View Steps · 1'));
    fireEvent.click(screen.getByText('rg'));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith({
        conversation_id: 'conversation-1',
        message_id: 'message-1',
      });
    });
    expect(await screen.findByText('full output')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'full-result.png' })).toHaveAttribute(
      'src',
      'data:image/png;base64,aW1hZ2U='
    );

    rerender(
      <MessageToolGroupSummary
        messages={[
          {
            ...compactMessage,
            content: {
              ...compactMessage.content,
              update: { ...compactMessage.content.update, raw_output: { saved_path: '/workspace/live-result.png' } },
            },
          },
        ]}
      />
    );
    expect(await screen.findByRole('img', { name: 'live-result.png' })).toBeInTheDocument();
  });
});
