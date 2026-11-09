/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { useImageBackends } from '@/renderer/hooks/mcp/useImageBackends';
import { Button, Dropdown, Menu } from '@arco-design/web-react';
import { Picture, Right } from '@icon-park/react';
import type { TFunction } from 'i18next';
import React, { useState } from 'react';

export type ImageBackendMenu = {
  title: string;
  currentLabel?: string;
  options: { id: string | null; key: string; label: string; active: boolean; disabled: boolean }[];
  disabled: boolean;
  onOpen: () => void;
  onSelect: (key: string) => void;
};

/** Build the same choices for the Web menus and the desktop app's picker. */
export const buildImageBackendMenu = (
  backends: ReturnType<typeof useImageBackends>['backends'],
  t: TFunction,
  {
    value,
    disabled,
    onChange,
    onOpen,
  }: { value?: string | null; disabled: boolean; onChange: (id: string | null) => void; onOpen: () => void }
): ImageBackendMenu | undefined => {
  if (backends.length === 0) return undefined;

  const title = t('mcp.imageBackend.label');
  const accountDefault = backends.find((server) => server.is_default);
  const choices: { id: string | null; label: string; disabled?: boolean }[] = [
    ...(accountDefault
      ? [{ id: null, label: t('mcp.imageBackend.defaultWithName', { name: accountDefault.name }) }]
      : []),
    ...(value && !backends.some((server) => server.id === value)
      ? [{ id: value, label: t('mcp.imageBackend.unavailable'), disabled: true }]
      : []),
    ...backends.map((server) => ({ id: server.id, label: server.name })),
  ];
  const options = choices.map((choice) => ({
    id: choice.id,
    label: choice.label,
    key: choice.id === null ? 'image-backend:default' : `image-backend:server:${choice.id}`,
    active: choice.id === (value || null),
    disabled: disabled || choice.disabled === true,
  }));

  return {
    title,
    disabled,
    options,
    currentLabel: options.find((option) => option.active)?.label,
    onOpen,
    onSelect: (key: string) => {
      const option = options.find((item) => item.key === key);
      if (option && !option.disabled) onChange(option.id);
    },
  };
};

export const IMAGE_BACKEND_MENU_CLASS = 'max-w-[min(18rem,calc(100vw-16px))] max-h-[min(20rem,50dvh)] overflow-y-auto';

/** Return menu items so Arco can apply its menu keyboard handling. */
export const renderImageBackendOptions = (menu: ImageBackendMenu, onSelected?: () => void) =>
  menu.options.map((option) => (
    <Menu.Item
      key={option.key}
      disabled={option.disabled}
      aria-disabled={option.disabled}
      role='menuitemradio'
      aria-checked={option.active}
      onClick={() => {
        menu.onSelect(option.key);
        onSelected?.();
      }}
      className={`!h-auto !min-h-32px !py-6px !leading-5 !whitespace-normal [overflow-wrap:anywhere] ${option.active ? '!bg-2' : ''}`}
    >
      <span className='me-8px inline-block w-12px text-primary' aria-hidden='true'>
        {option.active ? '✓' : ''}
      </span>
      {option.label}
    </Menu.Item>
  ));

/** Select an explicit image backend or inherit the account default. */
const ImageBackendSelector: React.FC<{
  menu?: ImageBackendMenu;
  inMenu?: boolean;
  onSelected?: () => void;
}> = ({ menu, inMenu, onSelected }) => {
  const [open, setOpen] = useState(false);
  if (!menu) return null;

  const { title, currentLabel, disabled, onOpen } = menu;
  const buttonLabel = currentLabel ? `${title} · ${currentLabel}` : title;
  const pictureIcon = <Picture theme='outline' size='16' aria-hidden='true' />;

  return (
    <Dropdown
      trigger='click'
      position='tr'
      triggerProps={inMenu ? { position: 'rt' } : undefined}
      disabled={disabled}
      onVisibleChange={(visible) => {
        setOpen(visible);
        if (visible) onOpen();
      }}
      droplist={
        <Menu aria-label={title} className={IMAGE_BACKEND_MENU_CLASS}>
          {renderImageBackendOptions(menu, onSelected)}
        </Menu>
      }
    >
      {inMenu ? (
        <Button
          type='text'
          className='!flex !items-center !gap-10px !justify-start w-full !rounded-8px !px-12px'
          aria-haspopup='menu'
          aria-expanded={open}
          title={buttonLabel}
        >
          <span className='w-18px shrink-0 inline-flex justify-center text-t-tertiary'>{pictureIcon}</span>
          <span className='flex-1 text-start'>{title}</span>
          <Right theme='outline' size='12' className='shrink-0 text-t-tertiary' aria-hidden='true' />
        </Button>
      ) : (
        <Button
          type='secondary'
          shape='circle'
          className='shrink-0'
          aria-label={buttonLabel}
          aria-haspopup='menu'
          aria-expanded={open}
          title={buttonLabel}
          icon={pictureIcon}
        />
      )}
    </Dropdown>
  );
};

export default ImageBackendSelector;
