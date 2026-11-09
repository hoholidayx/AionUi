import { ipcBridge } from '@/common';
import { joinPath } from '@/common/chat/chatLib';
import type { ToolImageRef } from '@/common/types/chatFile';
import type { AsyncImageRef } from '@/common/types/platform/acpTypes';
import { LoadingTwo } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConversationContextSafe } from '@renderer/hooks/context/ConversationContext';
import { iconColors } from '@/renderer/styles/colors';

const LocalImageView: React.FC<{
  src?: string;
  asyncImage?: AsyncImageRef;
  toolImage?: ToolImageRef;
  alt: string;
  className?: string;
  unavailableText?: string;
}> = ({ src = '', asyncImage, toolImage, alt, className, unavailableText }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState(src);
  const conversationId = toolImage?.conversationId ?? asyncImage?.conversationId;
  const attachmentId = asyncImage?.attachmentId;
  const messageId = toolImage?.messageId;
  // Resolve relative image paths (e.g. ![](./chart.png)) against the conversation
  // workspace = the agent cwd, and pass it as the fs sandbox workspace. Outside a
  // conversation (settings markdown) there is no workspace, so the src is sent
  // through unchanged — matching the previous default root of ''.
  const root = useConversationContextSafe()?.workspace ?? '';

  const absolutePath = useMemo(() => {
    if (!root) return src;
    if (
      src.startsWith('http') ||
      src.startsWith('data:') ||
      src.startsWith('/') ||
      src.startsWith('file:') ||
      src.startsWith('\\') ||
      /^[A-Za-z]:/.test(src)
    ) {
      return src;
    }
    return joinPath(root, src);
  }, [src, root]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setLoading(true);
    setUrl(unavailableText ? '' : src);
    const imageBlob =
      conversationId && messageId
        ? ipcBridge.fs.getToolImage.invoke({ conversationId, messageId })
        : conversationId && attachmentId
          ? ipcBridge.fs.getAsyncImage.invoke({ conversationId, attachmentId })
          : undefined;
    const imageUrl = imageBlob
      ? imageBlob.then((blob) => {
          if (active) objectUrl = URL.createObjectURL(blob);
          return objectUrl;
        })
      : ipcBridge.fs.getImageBase64.invoke({ path: absolutePath, workspace: root || undefined });
    void imageUrl
      .then((result) => {
        if (active && result) setUrl(result);
      })
      .catch((error) => {
        if (active) console.error('[LocalImageView] Failed to load image:', error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [absolutePath, root, src, conversationId, attachmentId, messageId, unavailableText]);
  if (loading)
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
  return url ? (
    <img src={url} alt={alt} className={className} onError={unavailableText ? () => setUrl('') : undefined} />
  ) : (
    <span>{unavailableText ?? (asyncImage ? t('acp.image.asyncFailure.outputUnavailable') : alt)}</span>
  );
};

export default LocalImageView;
