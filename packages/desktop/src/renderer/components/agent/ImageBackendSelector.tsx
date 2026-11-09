/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveLocaleKey } from '@/common/utils';
import { useImageBackends } from '@/renderer/hooks/mcp/useImageBackends';
import { Button, Dropdown, Menu } from '@arco-design/web-react';
import { Picture } from '@icon-park/react';
import React, { useState } from 'react';
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
  const [open, setOpen] = useState(false);
  if (backends.length === 0) return null;

  const label = t('mcp.imageBackend.label');
  const accountDefault = backends.find((server) => server.is_default);
  const missing = value && !backends.some((server) => server.id === value);
  const options: { value: string; label: string; disabled?: boolean }[] = [
    ...(accountDefault
      ? [{ value: DEFAULT_BACKEND, label: t('mcp.imageBackend.defaultWithName', { name: accountDefault.name }) }]
      : []),
    ...(missing ? [{ value, label: t('mcp.imageBackend.unavailable'), disabled: true }] : []),
    ...backends.map((server) => ({ value: server.id, label: server.name })),
  ];
  const selectedValue = value ?? DEFAULT_BACKEND;
  const selectedLabel = options.find((option) => option.value === selectedValue)?.label;
  const buttonLabel = selectedLabel ? `${label} · ${selectedLabel}` : label;

  return (
    <Dropdown
      trigger='click'
      position='tr'
      disabled={disabled}
      onVisibleChange={(visible) => {
        setOpen(visible);
        if (visible) void refreshBackends();
      }}
      droplist={
        <Menu
          aria-label={label}
          className='max-w-[min(18rem,calc(100vw-16px))] max-h-[min(20rem,50dvh)] overflow-y-auto'
          selectedKeys={[`backend:${selectedValue}`]}
        >
          {options.map((option) => (
            <Menu.Item
              key={`backend:${option.value}`}
              disabled={disabled || option.disabled}
              aria-disabled={disabled || option.disabled}
              role='menuitemradio'
              aria-checked={selectedValue === option.value}
              onClick={() => onChange(option.value || null)}
              className='!h-auto !min-h-32px !py-6px !leading-5 !whitespace-normal [overflow-wrap:anywhere]'
            >
              {option.label}
            </Menu.Item>
          ))}
        </Menu>
      }
    >
      <Button
        type='secondary'
        shape='circle'
        className='shrink-0'
        aria-label={buttonLabel}
        aria-haspopup='menu'
        aria-expanded={open}
        title={buttonLabel}
        icon={<Picture theme='outline' size='16' aria-hidden='true' />}
      />
    </Dropdown>
  );
};

export default ImageBackendSelector;
