import { ipcBridge } from '@/common';
import { joinPath } from '@/common/chat/chatLib';
import type { ToolImageSource } from '@/common/types/chatFile';
import { LoadingTwo } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConversationContextSafe } from '@renderer/hooks/context/ConversationContext';
import { iconColors } from '@/renderer/styles/colors';

type LocalImageViewProps = {
  alt: string;
  className?: string;
} & ({ src: string; source?: never } | { src?: never; source: ToolImageSource });

const LocalImageView: React.FC<LocalImageViewProps> = ({ src, source, alt, className }) => {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<{ key: string; url: string } | null>(null);
  const scoped = source?.kind === 'local-path' ? undefined : source;
  const kind = scoped?.kind;
  const conversationId = scoped?.ref.conversationId;
  const messageId = scoped?.kind === 'tool-message' ? scoped.ref.messageId : undefined;
  const attachmentId = scoped?.kind === 'async-attachment' ? scoped.ref.attachmentId : undefined;
  const path = source?.kind === 'local-path' ? source.path : (src ?? '');
  const fallback = source ? '' : (src ?? '');
  // Resolve relative image paths (e.g. ![](./chart.png)) against the conversation
  // workspace = the agent cwd, and pass it as the fs sandbox workspace. Outside a
  // conversation (settings markdown) there is no workspace, so the src is sent
  // through unchanged — matching the previous default root of ''.
  const workspace = useConversationContextSafe()?.workspace;
  const root = scoped ? '' : (workspace ?? '');

  const absolutePath = useMemo(() => {
    if (!root) return path;
    if (
      path.startsWith('http') ||
      path.startsWith('data:') ||
      path.startsWith('/') ||
      path.startsWith('file:') ||
      path.startsWith('\\') ||
      /^[A-Za-z]:/.test(path)
    ) {
      return path;
    }
    return joinPath(root, path);
  }, [path, root]);
  const requestKey = JSON.stringify([kind, conversationId, messageId, attachmentId, absolutePath, root, fallback]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setPreview(null);
    const load = async () => {
      let url: string | null | undefined;
      try {
        if (kind) {
          const blob =
            kind === 'tool-message' && conversationId && messageId
              ? await ipcBridge.fs.getToolImage.invoke({ conversationId, messageId })
              : kind === 'async-attachment' && conversationId && attachmentId
                ? await ipcBridge.fs.getAsyncImage.invoke({ conversationId, attachmentId })
                : undefined;
          if (active && blob) objectUrl = URL.createObjectURL(blob);
          url = objectUrl;
        } else {
          url = await ipcBridge.fs.getImageBase64.invoke({ path: absolutePath, workspace: root || undefined });
        }
      } catch (error) {
        if (active) console.error('[LocalImageView] Failed to load image:', error);
      }
      if (active) setPreview({ key: requestKey, url: url || fallback });
    };
    void load();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [absolutePath, root, fallback, kind, conversationId, attachmentId, messageId, requestKey]);
  if (preview?.key !== requestKey)
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <LoadingTwo
          className='loading'
          style={{ display: 'flex' }}
          theme='outline'
          size='14'
          fill={iconColors.primary}
          strokeWidth={2}
        />
        <span>{alt}</span>
      </span>
    );
  return preview.url ? (
    <img
      src={preview.url}
      alt={alt}
      className={className}
      onError={source ? () => setPreview({ key: requestKey, url: '' }) : undefined}
    />
  ) : (
    <span>{source ? t('acp.image.asyncFailure.outputUnavailable') : alt}</span>
  );
};

export default LocalImageView;
