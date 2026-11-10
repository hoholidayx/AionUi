/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageAcpToolCall, IMessageToolCall } from '@/common/chat/chatLib';
import type { ToolImageSource } from '@/common/types/chatFile';
import MessageToolCall from '@/renderer/pages/conversation/Messages/ToolCards/MessageToolCall';
import MessageToolGroupSummary from '@/renderer/pages/conversation/Messages/ToolCards/MessageToolGroupSummary';

const mockDownloadFileFromPath = vi.fn().mockResolvedValue(undefined);
const mockDownloadToolImage = vi.fn().mockResolvedValue(undefined);
const mockMessageSuccess = vi.fn();
const mockMessageError = vi.fn();

vi.mock('@/renderer/components/media/LocalImageView', () => ({
  __esModule: true,
  default: ({ source, alt }: { source: ToolImageSource; alt: string }) => (
    <img
      src={source.kind === 'local-path' ? source.path : undefined}
      alt={alt}
      data-testid='local-image'
      data-tool-message={source.kind === 'tool-message' ? source.ref.messageId : undefined}
    />
  ),
}));

vi.mock('@/renderer/utils/file/download', () => ({
  downloadFileFromPath: (...args: unknown[]) => mockDownloadFileFromPath(...args),
  downloadToolImage: (...args: unknown[]) => mockDownloadToolImage(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');

  return {
    ...actual,
    Message: {
      useMessage: () => [{ success: mockMessageSuccess, error: mockMessageError }, null],
    },
  };
});

describe('standalone Codex image output', () => {
  const image = { path: '/fixture/generated.png', mime_type: 'image/png' };
  const message: IMessageToolCall = {
    id: 'live-ui-message-id',
    conversation_id: 'conv-1',
    type: 'tool_call',
    content: {
      call_id: 'image-call',
      name: 'imageGeneration',
      args: { type: 'imageGeneration' },
      status: 'completed',
      image,
    },
  };

  it('renders the preview and downloads the file without expanding tool details', () => {
    render(<MessageToolCall message={message} />);
    expect(screen.getByText('settings.imageGeneration')).toBeInTheDocument();
    expect(screen.getByTestId('local-image')).toHaveAttribute('data-tool-message', 'image-call');
    fireEvent.click(screen.getByLabelText('acp.image.download_aria'));
    expect(mockDownloadToolImage).toHaveBeenCalledWith(
      { conversationId: 'conv-1', messageId: 'image-call' },
      'generated.png'
    );
    expect(mockDownloadFileFromPath).not.toHaveBeenCalled();
  });

  it('localizes the title of a running Codex image call before an image is available', () => {
    render(
      <MessageToolCall message={{ ...message, content: { ...message.content, status: 'running', image: undefined } }} />
    );
    expect(screen.getByText('settings.imageGeneration')).toBeInTheDocument();
    expect(screen.queryByTestId('local-image')).not.toBeInTheDocument();
  });

  it('localizes the fallback title when the Codex image call ID is missing', () => {
    render(<MessageToolCall message={{ ...message, content: { ...message.content, call_id: '' } }} />);
    expect(screen.getByText('settings.imageGeneration')).toBeInTheDocument();
  });

  it('uses the original name for ordinary tools', () => {
    render(<MessageToolCall message={{ ...message, content: { ...message.content, name: 'Read', args: {} } }} />);
    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.queryByText('settings.imageGeneration')).not.toBeInTheDocument();
  });

  it.each(['error', 'canceled'] as const)('hides the preview for a %s call', (status) => {
    render(<MessageToolCall message={{ ...message, content: { ...message.content, status } }} />);
    expect(screen.queryByTestId('local-image')).not.toBeInTheDocument();
  });

  it('keeps the scoped Codex reference when rendered in View Steps', () => {
    mockDownloadToolImage.mockClear();
    mockDownloadFileFromPath.mockClear();
    render(<MessageToolGroupSummary messages={[message]} />);
    fireEvent.click(screen.getByText('View Steps · 1'));

    const preview = screen.getByTestId('local-image');
    expect(preview).toHaveAttribute('data-tool-message', 'image-call');
    expect(preview).not.toHaveAttribute('src');
    fireEvent.click(screen.getByLabelText('acp.image.download_aria'));
    expect(mockDownloadToolImage).toHaveBeenCalledWith(
      { conversationId: 'conv-1', messageId: 'image-call' },
      'generated.png'
    );
    expect(mockDownloadFileFromPath).not.toHaveBeenCalled();
  });

  it('does not turn a Codex path into a file read when the conversation ID is unavailable', () => {
    render(<MessageToolCall message={{ ...message, conversation_id: '' }} />);
    expect(screen.queryByTestId('local-image')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('acp.image.download_aria')).not.toBeInTheDocument();
  });

  it('keeps the tool card usable when a historical Codex path is malformed', () => {
    render(
      <MessageToolCall
        message={{ ...message, content: { ...message.content, image: { ...image, path: {} as unknown as string } } }}
      />
    );
    expect(screen.getByText('settings.imageGeneration')).toBeInTheDocument();
    expect(screen.queryByTestId('local-image')).not.toBeInTheDocument();
  });

  it('reports a rejected Codex download without retrying by path', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDownloadToolImage.mockRejectedValueOnce(new Error('denied'));
    mockDownloadFileFromPath.mockClear();
    mockMessageError.mockClear();
    render(<MessageToolCall message={message} />);
    fireEvent.click(screen.getByLabelText('acp.image.download_aria'));

    await waitFor(() => expect(mockMessageError).toHaveBeenCalledWith('acp.image.download_error'));
    expect(mockDownloadFileFromPath).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('MessageToolGroupSummary ACP image output', () => {
  beforeEach(() => {
    mockDownloadFileFromPath.mockReset();
    mockDownloadFileFromPath.mockResolvedValue(undefined);
    mockMessageSuccess.mockClear();
    mockMessageError.mockClear();
  });

  it('renders generated image preview when an ACP image tool call is expanded', () => {
    const message: IMessageAcpToolCall = {
      id: 'ig_test_image',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'ig_test_image',
          status: 'completed',
          title: 'Image generation',
          kind: 'execute',
          raw_output: {
            image: {
              path: '/Users/test/.codex/generated_images/session/ig_test_image.png',
            },
          },
          content: [
            {
              type: 'content',
              content: {
                type: 'text',
                text: 'Revised prompt: 一张小猫照片',
              },
            },
          ],
        },
      },
    };

    render(<MessageToolGroupSummary messages={[message]} />);
    fireEvent.click(screen.getByText('View Steps · 1'));

    const image = screen.getByTestId('local-image');
    expect(image).toHaveAttribute('src', '/Users/test/.codex/generated_images/session/ig_test_image.png');
    expect(image).toHaveAttribute('alt', 'ig_test_image.png');
  });

  it('downloads the generated image from its local path', () => {
    const imagePath = '/Users/test/.codex/generated_images/session/ig_test_image.png';
    const message: IMessageAcpToolCall = {
      id: 'ig_test_image',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'ig_test_image',
          status: 'completed',
          title: 'Image generation',
          kind: 'execute',
          raw_output: {
            image: {
              path: imagePath,
            },
          },
        },
      },
    };

    render(<MessageToolGroupSummary messages={[message]} />);
    fireEvent.click(screen.getByText('View Steps · 1'));
    fireEvent.click(screen.getByLabelText('acp.image.download_aria'));

    expect(mockDownloadFileFromPath).toHaveBeenCalledWith(imagePath, 'ig_test_image.png');
  });

  it('shows an error when generated image download fails', async () => {
    const imagePath = '/Users/test/.codex/generated_images/session/ig_test_image.png';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockDownloadFileFromPath.mockRejectedValueOnce(new Error('denied'));
    const message: IMessageAcpToolCall = {
      id: 'ig_test_image',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'ig_test_image',
          status: 'completed',
          title: 'Image generation',
          kind: 'execute',
          raw_output: {
            image: {
              path: imagePath,
            },
          },
        },
      },
    };

    render(<MessageToolGroupSummary messages={[message]} />);
    fireEvent.click(screen.getByText('View Steps · 1'));
    fireEvent.click(screen.getByLabelText('acp.image.download_aria'));

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('acp.image.download_error');
    });
    expect(mockMessageSuccess).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('uses i18n keys for the image download control', () => {
    const message: IMessageAcpToolCall = {
      id: 'ig_test_image',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'ig_test_image',
          status: 'completed',
          title: 'Image generation',
          kind: 'execute',
          raw_output: {
            image: {
              path: '/Users/test/.codex/generated_images/session/ig_test_image.png',
            },
          },
        },
      },
    };

    render(<MessageToolGroupSummary messages={[message]} />);
    fireEvent.click(screen.getByText('View Steps · 1'));

    expect(screen.getByLabelText('acp.image.download_aria')).toBeInTheDocument();
  });

  it('does not render image controls for tool calls without image output', () => {
    const message: IMessageToolCall = {
      id: 'tool-1',
      conversation_id: 'conv-1',
      type: 'tool_call',
      content: {
        call_id: 'tool-1',
        name: 'Shell Command',
        args: {},
        status: 'completed',
      },
    };

    render(<MessageToolGroupSummary messages={[message]} />);
    fireEvent.click(screen.getByText('View Steps · 1'));

    expect(screen.queryByTestId('local-image')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('acp.image.download_aria')).not.toBeInTheDocument();
  });
});
