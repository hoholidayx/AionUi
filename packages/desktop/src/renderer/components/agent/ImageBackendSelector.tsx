/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { assistants, mcpService } from '@/common/adapter/ipcBridge';
import { resolveLocaleKey } from '@/common/utils';
import AionSelect from '@/renderer/components/base/AionSelect';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { IMAGE_BACKEND_CATALOG_KEY, isEnabledImageBackend } from '@/renderer/hooks/mcp/catalog';
import { Picture } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

type ImageBackendSelectorProps = {
  value?: string | null;
  assistantId?: string | null;
  disabled?: boolean;
  onChange: (id: string | null) => void;
};

const DEFAULT_BACKEND = '';

/** Select an explicit image backend or inherit the account default. */
const ImageBackendSelector: React.FC<ImageBackendSelectorProps> = ({ value, assistantId, disabled, onChange }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const locale = resolveLocaleKey(i18n?.language ?? 'en-US');
  const { data: assistant } = useSWR(assistantId ? `guid.assistant.detail.${assistantId}.${locale}` : null, () =>
    assistants.get.invoke({ id: assistantId!, locale })
  );
  const { data: catalog = [], mutate } = useSWR(
    [IMAGE_BACKEND_CATALOG_KEY, user?.id],
    async () =>
      (await mcpService.listServers.invoke())
        .filter(isEnabledImageBackend)
        .map(({ id, name, is_default }) => ({ id, name, is_default })),
    { revalidateOnFocus: true }
  );
  const allowed = assistant?.defaults.async_image_backend_ids;
  const backends = catalog.filter((server) => allowed?.includes(server.id) ?? true);
  if ((assistantId && !assistant) || assistant?.defaults.async_image_enabled === false || backends.length === 0) {
    return null;
  }

  const label = t('mcp.imageBackend.label');
  const accountDefault = backends.find((server) => server.is_default);
  const canUseDefault = accountDefault || !catalog.some((server) => server.is_default);
  const defaultLabel = accountDefault
    ? t('mcp.imageBackend.defaultWithName', { name: accountDefault.name })
    : t('mcp.imageBackend.default');
  const missing = value && !backends.some((server) => server.id === value);
  const options = [
    ...(canUseDefault ? [{ value: DEFAULT_BACKEND, label: defaultLabel }] : []),
    ...(missing ? [{ value, label: t('mcp.imageBackend.unavailable'), disabled: true }] : []),
    ...backends.map((server) => ({ value: server.id, label: server.name })),
  ];

  return (
    <AionSelect
      aria-label={label}
      className='w-148px max-w-full'
      size='small'
      value={value ?? DEFAULT_BACKEND}
      placeholder={label}
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
