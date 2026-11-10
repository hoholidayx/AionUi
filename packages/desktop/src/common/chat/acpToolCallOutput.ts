/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpRawOutput, AsyncImageOutput, ToolCallUpdate } from '@/common/types/platform/acpTypes';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { ToolImageSource } from '@/common/types/chatFile';
import type { IMessageAcpToolCall, IMessageToolCall } from './chatLib';

const INLINE_IMAGE_RESULT_LIMIT = 64 * 1024;
const IMAGE_PATH_EXTENSION_RE = /\.(?:png|jpe?g|webp|gif)$/i;

const isProbablyInlineImageResult = (value: string): boolean =>
  value.length > INLINE_IMAGE_RESULT_LIMIT &&
  (value.startsWith('iVBORw0KGgo') ||
    value.startsWith('/9j/') ||
    value.startsWith('UklGR') ||
    value.startsWith('data:image/'));

const isImagePath = (path: string): boolean => IMAGE_PATH_EXTENSION_RE.test(path);

const mimeTypeFromImagePath = (path: string): string => {
  const lower = path.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/png';
};

const sanitizeAcpRawOutput = (rawOutput?: AcpRawOutput): AcpRawOutput | undefined => {
  if (!rawOutput) return rawOutput;

  const result = rawOutput.result;
  const savedPath = rawOutput.saved_path;
  if (typeof result !== 'string' || !isProbablyInlineImageResult(result)) {
    return rawOutput;
  }

  const { result: _result, ...rest } = rawOutput;
  const sanitized: AcpRawOutput = {
    ...rest,
    result_omitted: true,
    result_omitted_reason: rawOutput.result_omitted_reason || 'image_base64',
    result_bytes: rawOutput.result_bytes || result.length,
  };

  if (rawOutput.image || (typeof savedPath === 'string' && savedPath)) {
    const path = rawOutput.image?.path || savedPath;
    sanitized.image = rawOutput.image || {
      path,
      mime_type: mimeTypeFromImagePath(path),
      source: 'codex_image_generation',
    };
  }

  return sanitized;
};

export const sanitizeAcpToolUpdate = (update: ToolCallUpdate['update']): ToolCallUpdate['update'] => ({
  ...update,
  rawOutput: sanitizeAcpRawOutput(update.rawOutput),
  raw_output: sanitizeAcpRawOutput(update.raw_output),
});

export const sanitizeAcpToolCallContent = (content: ToolCallUpdate): ToolCallUpdate => ({
  ...content,
  update: sanitizeAcpToolUpdate(content.update),
});

export const getAcpImagePath = (update: ToolCallUpdate['update']): string | undefined => {
  const rawOutput = update.rawOutput || update.raw_output;
  const imagePath = rawOutput?.image?.path;
  if (typeof imagePath === 'string' && imagePath) return imagePath;

  const savedPath = rawOutput?.saved_path;
  if (
    typeof savedPath === 'string' &&
    savedPath &&
    (rawOutput?.result_omitted_reason === 'image_base64' || isImagePath(savedPath))
  ) {
    return savedPath;
  }

  return undefined;
};

export const getAcpImageFileName = (path?: string, fallback = 'generated-image.png'): string =>
  path?.split(/[/\\]/).pop() || fallback;

export const getAcpAsyncImage = (update?: ToolCallUpdate['update']): AsyncImageOutput | undefined => {
  if (typeof update?.tool_call_id !== 'string' || !update.tool_call_id.startsWith('async-image:')) return undefined;

  const output = update.raw_output?.async_image ?? update.rawOutput?.async_image;
  return output && typeof output === 'object' && !Array.isArray(output) ? output : undefined;
};

export function getAcpToolImageSource(
  update: ToolCallUpdate['update'],
  conversationId?: string
): ToolImageSource | undefined {
  const asyncOutput = getAcpAsyncImage(update);
  if (asyncOutput) {
    const attachmentId = asyncOutput.attachment_id;
    if (update.status === 'completed' && conversationId && typeof attachmentId === 'string' && attachmentId) {
      return { kind: 'async-attachment', ref: { conversationId, attachmentId } };
    }
    return undefined;
  }

  const path = getAcpImagePath(update);
  return path ? { kind: 'local-path', path } : undefined;
}

/** Projects pre-queue failures as standalone image cards, including older conversation rows. */
export const getAsyncImageAdmissionFailure = (message: IMessageToolCall): IMessageAcpToolCall | undefined => {
  if (message.content?.name !== 'image_generate_async' || message.content.status !== 'error') return undefined;

  let errorCode: string | undefined;
  try {
    const output: unknown = JSON.parse(message.content.output ?? 'null');
    if (output && typeof output === 'object' && 'error_code' in output && typeof output.error_code === 'string') {
      errorCode = output.error_code;
    }
  } catch {
    // Older tool failures can contain plain text. The card uses a safe fallback.
  }

  return {
    ...message,
    type: 'acp_tool_call',
    content: {
      session_id: message.conversation_id ?? '',
      update: {
        sessionUpdate: 'tool_call',
        tool_call_id: `async-image:admission-${message.id}`,
        status: 'failed',
        title: '',
        kind: 'execute',
        raw_output: { async_image: { error_code: errorCode } },
      },
    },
  };
};

export const isAcpAsyncImageEvent = (message: Pick<IResponseMessage, 'type' | 'data'>): boolean =>
  message.type === 'acp_tool_call' && !!getAcpAsyncImage((message.data as ToolCallUpdate | undefined)?.update);

const ASYNC_IMAGE_PROGRESS = { pending: 0, in_progress: 1, completed: 2, failed: 2 };

// A history fetch and a live frame can arrive in either order.
export const isNewerAcpAsyncImageUpdate = (
  next?: ToolCallUpdate['update'],
  previous?: ToolCallUpdate['update']
): boolean =>
  !!next &&
  !!previous &&
  !!getAcpAsyncImage(next) &&
  !!getAcpAsyncImage(previous) &&
  ASYNC_IMAGE_PROGRESS[next.status] > ASYNC_IMAGE_PROGRESS[previous.status];
