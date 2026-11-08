/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mcpService } from '@/common/adapter/ipcBridge';
import AionSelect from '@/renderer/components/base/AionSelect';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { IMAGE_BACKEND_CATALOG_KEY } from '@/renderer/hooks/mcp/catalog';
import { Picture } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

type ImageBackendSelectorProps = {
  value?: string | null;
  disabled?: boolean;
  onChange: (id: string | null) => void;
};

const DEFAULT_BACKEND = '';

/** Select an explicit image backend or inherit the account default. */
const ImageBackendSelector: React.FC<ImageBackendSelectorProps> = ({ value, disabled, onChange }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: backends = [], mutate } = useSWR(
    [IMAGE_BACKEND_CATALOG_KEY, user?.id],
    async () =>
      (await mcpService.listServers.invoke())
        .filter((server) => server.enabled && !server.builtin && server.purpose === 'async_image')
        .map(({ id, name, is_default }) => ({ id, name, is_default })),
    { revalidateOnFocus: true }
  );
  if (!value && backends.length === 0) return null;

  const label = t('mcp.imageBackend.label');
  const accountDefault = backends.find((server) => server.is_default);
  const defaultLabel = accountDefault
    ? t('mcp.imageBackend.defaultWithName', { name: accountDefault.name })
    : t('mcp.imageBackend.default');
  const missing = value && !backends.some((server) => server.id === value);
  const options = [
    { value: DEFAULT_BACKEND, label: defaultLabel },
    ...(missing ? [{ value, label: t('mcp.imageBackend.unavailable'), disabled: true }] : []),
    ...backends.map((server) => ({ value: server.id, label: server.name })),
  ];

  return (
    <AionSelect
      aria-label={label}
      className='w-148px max-w-full'
      size='small'
      value={value ?? DEFAULT_BACKEND}
      disabled={disabled}
      options={options}
      renderFormat={(option) => (
        <span className='flex items-center gap-4px min-w-0' title={label}>
          <Picture theme='outline' size='14' className='shrink-0' aria-hidden='true' />
          <span className='truncate'>{option?.children}</span>
        </span>
      )}
      onChange={(id: string) => onChange(id || null)}
      onVisibleChange={(open) => {
        if (open) void mutate();
      }}
    />
  );
};

export default ImageBackendSelector;
