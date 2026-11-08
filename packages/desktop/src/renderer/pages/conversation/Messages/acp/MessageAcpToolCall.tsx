/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpToolCall } from '@/common/chat/chatLib';
import { getAcpAsyncImage, getAcpImageFileName, getAcpImagePath } from '@/common/chat/acpToolCallOutput';
import FileChangesPanel from '@/renderer/components/base/FileChangesPanel';
import LocalImageView from '@/renderer/components/media/LocalImageView';
import { useDiffPreviewHandlers } from '@/renderer/hooks/file/useDiffPreviewHandlers';
import { parseDiff } from '@/renderer/utils/file/diffUtils';
import { downloadAsyncImage, downloadFileFromPath } from '@/renderer/utils/file/download';
import { Button, Card, Message, Tag, Tooltip } from '@arco-design/web-react';
import { Download } from '@icon-park/react';
import { createTwoFilesPatch } from 'diff';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import MarkdownView from '@renderer/components/Markdown';

const StatusTag: React.FC<{ status: string; asyncImage: boolean }> = ({ status, asyncImage }) => {
  const { t } = useTranslation();
  const getTagProps = () => {
    switch (status) {
      case 'pending':
        return { color: 'blue', text: asyncImage ? t('tools.status.pending') : 'Pending' };
      case 'in_progress':
        return { color: 'orange', text: asyncImage ? t('tools.status.executing') : 'In Progress' };
      case 'completed':
        return asyncImage ? { color: 'green', text: t('common.success') } : { color: 'gray', text: status };
      case 'failed':
        return asyncImage ? { color: 'red', text: t('common.failed') } : { color: 'gray', text: status };
      default:
        return { color: 'gray', text: status };
    }
  };

  const { color, text } = getTagProps();
  return <Tag color={color}>{text}</Tag>;
};

// Diff content display as a separate component to ensure hooks are called unconditionally
const DiffContentView: React.FC<{ old_text: string; new_text: string; path: string }> = ({
  old_text,
  new_text,
  path,
}) => {
  const display_name = path.split(/[/\\]/).pop() || path || 'Unknown file';
  const formattedDiff = useMemo(
    () => createTwoFilesPatch(display_name, display_name, old_text, new_text, '', '', { context: 3 }),
    [display_name, old_text, new_text]
  );
  const fileInfo = useMemo(() => parseDiff(formattedDiff, display_name), [formattedDiff, display_name]);
  const { handleFileClick, handleDiffClick } = useDiffPreviewHandlers({
    diffText: formattedDiff,
    display_name,
    file_path: path || display_name,
  });

  return (
    <FileChangesPanel
      title={display_name}
      files={[fileInfo]}
      onFileClick={handleFileClick}
      onDiffClick={handleDiffClick}
      defaultExpanded={true}
    />
  );
};

const ContentView: React.FC<{ content: IMessageAcpToolCall['content']['update']['content'][0] }> = ({ content }) => {
  if (content.type === 'diff') {
    return (
      <DiffContentView old_text={content.old_text || ''} new_text={content.new_text || ''} path={content.path || ''} />
    );
  }

  // 处理 content 类型，包含 text 内容
  if (content.type === 'content' && content.content && content.content.type === 'text' && content.content.text) {
    return (
      <div className='mt-3'>
        <div className='bg-1 p-3 rounded border overflow-hidden'>
          <div className='overflow-x-auto break-words'>
            <MarkdownView>{content.content.text}</MarkdownView>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

const getKindDisplayName = (toolKind: string) => {
  switch (toolKind) {
    case 'edit':
      return 'File Edit';
    case 'read':
      return 'File Read';
    case 'execute':
      return 'Shell Command';
    default:
      return toolKind;
  }
};

const MessageAcpToolCall: React.FC<{ message: IMessageAcpToolCall }> = ({ message }) => {
  const { t } = useTranslation();
  const [messageApi, messageContext] = Message.useMessage();
  const { content } = message;
  if (!content?.update) {
    return null;
  }
  const { update } = content;
  const { tool_call_id, kind, title, status, rawInput, content: diffContent } = update;
  const asyncOutput = getAcpAsyncImage(update);
  const attachmentId = asyncOutput?.attachment_id;
  const asyncImage =
    status === 'completed' && typeof attachmentId === 'string' && attachmentId && message.conversation_id
      ? { conversationId: message.conversation_id, attachmentId }
      : undefined;
  const hasOnlyDiffs =
    !asyncOutput &&
    Array.isArray(diffContent) &&
    diffContent.length > 0 &&
    diffContent.every((contentItem) => contentItem.type === 'diff');
  const imagePath = asyncOutput ? undefined : getAcpImagePath(update);
  const imageAlt = imagePath?.split(/[/\\]/).pop() || t('acp.image.generated_alt');
  const handleDownloadImage = async () => {
    try {
      if (asyncImage) {
        await downloadAsyncImage(asyncImage, 'generated-image.png');
      } else if (imagePath) {
        await downloadFileFromPath(imagePath, getAcpImageFileName(imagePath));
      }
      messageApi.success(t('acp.image.download_success'));
    } catch (error) {
      console.error('[MessageAcpToolCall] Failed to download image:', error);
      messageApi.error(t('acp.image.download_error'));
    }
  };

  if (hasOnlyDiffs) {
    return (
      <div className='w-full mb-2 flex flex-col gap-8px'>
        {diffContent.map((contentItem, index) => (
          <ContentView key={`${contentItem.path || 'diff'}-${index}`} content={contentItem} />
        ))}
      </div>
    );
  }

  return (
    <Card className='w-full mb-2' size='small' bordered>
      {messageContext}
      <div className='flex items-start gap-3'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-2 mb-2'>
            <span className='font-medium text-t-primary'>
              {asyncOutput ? t('settings.mcpPurposeAsyncImage') : title || getKindDisplayName(kind)}
            </span>
            <StatusTag status={status} asyncImage={!!asyncOutput} />
          </div>
          {!asyncOutput && rawInput && (
            <div className='text-sm'>
              {typeof rawInput === 'string' ? (
                <MarkdownView>{`\`\`\`\n${rawInput}\n\`\`\``}</MarkdownView>
              ) : (
                <pre className='bg-1 p-2 rounded text-xs overflow-x-auto'>{JSON.stringify(rawInput, null, 2)}</pre>
              )}
            </div>
          )}
          {(imagePath || asyncImage) && (
            <div className='group relative mt-3 overflow-hidden rounded border bg-1 p-2'>
              <LocalImageView
                src={imagePath}
                asyncImage={asyncImage}
                alt={imageAlt}
                className='max-w-full max-h-[520px] object-contain rounded'
              />
              <Tooltip content={t('acp.image.download')}>
                <Button
                  aria-label={t('acp.image.download_aria')}
                  className='!absolute end-10px top-10px !h-28px !w-28px !p-0 opacity-0 shadow-sm transition-opacity group-hover:opacity-90 focus:opacity-100'
                  type='secondary'
                  size='mini'
                  shape='circle'
                  icon={<Download theme='outline' size='14' />}
                  onClick={() => void handleDownloadImage()}
                />
              </Tooltip>
            </div>
          )}
          {!asyncOutput && diffContent && diffContent.length > 0 && (
            <div>
              {diffContent.map((item, index) => (
                <ContentView key={index} content={item} />
              ))}
            </div>
          )}
          {status === 'failed' && typeof asyncOutput?.error_code === 'string' && (
            <div className='text-xs text-t-secondary mt-2'>{asyncOutput.error_code}</div>
          )}
          {!asyncOutput && <div className='text-xs text-t-secondary mt-2'>Tool Call ID: {tool_call_id}</div>}
        </div>
      </div>
    </Card>
  );
};

export default MessageAcpToolCall;
