import { getAcpImageFileName } from '@/common/chat/acpToolCallOutput';
import LocalImageView from '@/renderer/components/media/LocalImageView';
import { downloadFileFromPath } from '@/renderer/utils/file/download';
import { Button, Message, Tooltip } from '@arco-design/web-react';
import { Download } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const ToolImagePreview: React.FC<{ path: string; workspace?: string }> = ({ path, workspace }) => {
  const { t } = useTranslation();
  const [messageApi, messageContext] = Message.useMessage();
  const fileName = getAcpImageFileName(path);
  const download = async () => {
    try {
      await downloadFileFromPath(path, fileName, workspace);
      messageApi.success(t('acp.image.download_success'));
    } catch (error) {
      console.error('[ToolImagePreview] Failed to download image:', error);
      messageApi.error(t('acp.image.download_error'));
    }
  };

  return (
    <div className='group relative m-l-20px m-t-8px overflow-hidden rounded border bg-1 p-2 max-w-280px'>
      {messageContext}
      <LocalImageView
        src={path}
        alt={fileName}
        className='max-w-full max-h-320px object-contain rounded'
        unavailableText={t('acp.image.asyncFailure.outputUnavailable')}
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
