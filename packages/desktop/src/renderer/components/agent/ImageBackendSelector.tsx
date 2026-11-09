/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ImageBackendMenu } from '@/renderer/hooks/mcp/useImageBackends';
import { Button, Dropdown, Menu } from '@arco-design/web-react';
import { Picture, Right } from '@icon-park/react';
import React, { useState } from 'react';

export const IMAGE_BACKEND_MENU_CLASS = 'max-w-[min(18rem,calc(100vw-16px))] max-h-[min(20rem,50dvh)] overflow-y-auto';

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
