/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveLocaleKey } from '@/common/utils';
import AionSelect from '@/renderer/components/base/AionSelect';
import { useImageBackends } from '@/renderer/hooks/mcp/useImageBackends';
import { Picture } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

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
  const locale = resolveLocaleKey(i18n?.language ?? 'en-US');
  const { backends, refreshBackends } = useImageBackends(assistantId, locale);
  if (backends.length === 0) return null;

  const label = t('mcp.imageBackend.label');
  const accountDefault = backends.find((server) => server.is_default);
  const missing = value && !backends.some((server) => server.id === value);
  const options = [
    ...(accountDefault
      ? [{ value: DEFAULT_BACKEND, label: t('mcp.imageBackend.defaultWithName', { name: accountDefault.name }) }]
      : []),
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
        if (open) void refreshBackends();
      }}
    />
  );
};

export default ImageBackendSelector;
