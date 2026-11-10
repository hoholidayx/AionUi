import { getAcpImageFileName } from '@/common/chat/acpToolCallOutput';
import type { ToolImageSource } from '@/common/types/chatFile';
import LocalImageView from '@/renderer/components/media/LocalImageView';
import { downloadAsyncImage, downloadFileFromPath, downloadToolImage } from '@/renderer/utils/file/download';
import { Button, Message, Tooltip } from '@arco-design/web-react';
import { Download } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const ToolImagePreview: React.FC<{ source: ToolImageSource; variant?: 'compact' | 'standalone' }> = ({
  source,
  variant = 'compact',
}) => {
  const { t } = useTranslation();
  const [messageApi, messageContext] = Message.useMessage();
  const standalone = variant === 'standalone';
  const fileName =
    source.kind === 'tool-message'
      ? source.fileName
      : getAcpImageFileName(source.kind === 'local-path' ? source.path : undefined);
  const alt =
    source.kind === 'async-attachment'
      ? t('acp.image.generated_alt')
      : source.kind === 'local-path' && standalone
        ? getAcpImageFileName(source.path, t('acp.image.generated_alt'))
        : fileName;
  const download = async () => {
    try {
      switch (source.kind) {
        case 'tool-message':
          await downloadToolImage(source.ref, fileName);
          break;
        case 'async-attachment':
          await downloadAsyncImage(source.ref, fileName);
          break;
        case 'local-path':
          await downloadFileFromPath(source.path, fileName);
          break;
      }
      messageApi.success(t('acp.image.download_success'));
    } catch (error) {
      console.error('[ToolImagePreview] Failed to download image:', error);
      messageApi.error(t('acp.image.download_error'));
    }
  };

  return (
    <div
      className={`group relative overflow-hidden rounded border bg-1 p-2 ${standalone ? 'mt-3' : 'm-l-20px m-t-8px max-w-280px'}`}
    >
      {messageContext}
      <LocalImageView
        source={source}
        alt={alt}
        className={`max-w-full object-contain rounded ${standalone ? 'max-h-[520px]' : 'max-h-320px'}`}
      />
      <Tooltip content={t('acp.image.download')}>
        <Button
          aria-label={t('acp.image.download_aria')}
          className='!absolute end-10px top-10px !h-28px !w-28px !p-0 opacity-0 shadow-sm transition-opacity group-hover:opacity-90 focus:opacity-100'
          type='secondary'
          size='mini'
          shape='circle'
          icon={<Download theme='outline' size='14' />}
          onClick={() => void download()}
        />
      </Tooltip>
    </div>
  );
};

export default ToolImagePreview;
