/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from '@arco-design/web-react';
import { Left, Right } from '@icon-park/react';
import React, { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import styles from './MobileActionSheet.module.css';
import type { MobileActionSheetEntry, MobileActionSheetProps } from './types';

const PANE_TRANSITION_MS = 260;
const SHEET_TRANSITION_MS = 280;

const MobileActionSheet: React.FC<MobileActionSheetProps> = ({ open, onClose, title, entries }) => {
  const { t } = useTranslation();
  const titleId = useId();
  const subTitleId = useId();
  const mainPaneRef = useRef<HTMLDivElement>(null);
  const subPaneRef = useRef<HTMLDivElement>(null);
  const [activeSubKey, setActiveSubKey] = useState<string | null>(null);
  // Keep the previous pane mounted until its exit transition finishes.
  const [renderedSubKey, setRenderedSubKey] = useState<string | null>(null);
  const [subPhase, setSubPhase] = useState<'idle' | 'enter' | 'shown' | 'exit'>('idle');
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  const activeEntry = entries.find((entry) => entry.key === activeSubKey);
  const activeSub = activeEntry?.submenu;
  const renderedSub = entries.find((entry) => entry.key === renderedSubKey)?.submenu;
  const isSubVisible = subPhase === 'shown' && Boolean(renderedSub);
  const availableSubKey = activeSub ? activeSubKey : null;

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    setVisible(false);
    setActiveSubKey(null);
    const closeTimer = setTimeout(() => setMounted(false), SHEET_TRANSITION_MS);
    return () => clearTimeout(closeTimer);
  }, [open]);

  // Give the browser a frame to paint the off-screen starting position.
  useLayoutEffect(() => {
    if (!open || !mounted) return;
    const previousFocus = document.activeElement;
    let enterFrame = 0;
    const startFrame = requestAnimationFrame(() => {
      enterFrame = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(startFrame);
      cancelAnimationFrame(enterFrame);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open, mounted]);

  useEffect(() => {
    if (availableSubKey) {
      setRenderedSubKey(availableSubKey);
      setSubPhase('enter');
      let enterFrame = 0;
      const startFrame = requestAnimationFrame(() => {
        enterFrame = requestAnimationFrame(() => setSubPhase('shown'));
      });
      return () => {
        cancelAnimationFrame(startFrame);
        cancelAnimationFrame(enterFrame);
      };
    }
    // Refreshing the menu can remove the entry behind the open pane.
    if (activeSubKey) setActiveSubKey(null);
    if (renderedSubKey) {
      setSubPhase('exit');
      const id = setTimeout(() => {
        setRenderedSubKey(null);
        setSubPhase('idle');
      }, PANE_TRANSITION_MS);
      return () => clearTimeout(id);
    }
  }, [activeSubKey, availableSubKey, renderedSubKey]);

  useLayoutEffect(() => {
    if (open && visible) (isSubVisible ? subPaneRef : mainPaneRef).current?.focus({ preventScroll: true });
  }, [open, visible, isSubVisible]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!mounted) {
    return null;
  }

  const handleEntryClick = (entry: MobileActionSheetEntry) => {
    if (entry.disabled) return;
    if (entry.submenu) {
      entry.submenu.onOpen?.();
      setActiveSubKey(entry.key);
      return;
    }
    entry.onClick?.();
    onClose();
  };

  const handleSubSelect = (key: string) => {
    if (!activeSub || activeEntry?.disabled) return;
    activeSub.onSelect(key);
    // Multi-select (skills / MCP on the home page): toggle and stay so the user
    // can pick several in a row.
    if (activeSub.multiSelect) {
      return;
    }
    // For settings (model, permission) the user expects to see the new value
    // reflected on the main pane, so we slide back instead of dismissing the
    // sheet. For non-selectable submenus (skills, attach) the selection is
    // an action — close the sheet so the user can immediately interact with
    // the result (e.g. type a slash command, see attached files).
    if (activeSub.selectable !== false) {
      setActiveSubKey(null);
      return;
    }
    onClose();
  };

  return createPortal(
    <Fragment>
      <div className={`${styles.mask} ${visible ? styles.visible : ''}`} onClick={onClose} />
      <div
        className={`${styles.sheet} ${visible ? styles.visible : ''}`}
        role='dialog'
        aria-modal='true'
        aria-labelledby={isSubVisible ? subTitleId : title ? titleId : undefined}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <div className={styles.handle} />
        <div className={styles.panes}>
          <div
            className={`${styles.pane} ${styles.paneMain} ${isSubVisible ? styles.paneOutLeft : styles.paneActive}`}
            ref={mainPaneRef}
            tabIndex={-1}
            inert={!open || isSubVisible}
            aria-hidden={!open || isSubVisible}
          >
            {title && (
              <div className={styles.header} id={titleId}>
                {title}
              </div>
            )}
            <div className={styles.list}>
              {entries.map((entry, index) => (
                <Fragment key={entry.key}>
                  {entry.dividerBefore && index !== 0 && <div className={styles.divider} />}
                  <Button
                    type='text'
                    className={styles.item}
                    disabled={entry.disabled}
                    onClick={() => handleEntryClick(entry)}
                    data-testid={`mobile-action-sheet-${entry.key}`}
                  >
                    {entry.icon && (
                      <span className={`${styles.icon} ${entry.variant === 'muted' ? styles.muted : ''}`}>
                        {entry.icon}
                      </span>
                    )}
                    <span className={styles.body}>
                      <span className={styles.label}>{entry.label}</span>
                      {entry.description && <span className={styles.desc}>{entry.description}</span>}
                    </span>
                    {(entry.meta || entry.submenu) && (
                      <span className={styles.meta}>
                        {entry.meta && <span className={styles.metaText}>{entry.meta}</span>}
                        {entry.submenu && (
                          <Right theme='outline' size='14' className={styles.chevron} aria-hidden='true' />
                        )}
                      </span>
                    )}
                  </Button>
                </Fragment>
              ))}
            </div>
          </div>

          {renderedSub && (
            <div
              className={`${styles.pane} ${styles.paneSub} ${isSubVisible ? styles.paneActive : styles.paneOutRight}`}
              ref={subPaneRef}
              tabIndex={-1}
              inert={!open || !isSubVisible}
              aria-hidden={!open || !isSubVisible}
            >
              <div className={styles.subbar}>
                <Button className={styles.back} onClick={() => setActiveSubKey(null)} type='text'>
                  <Left theme='outline' size='16' />
                  <span>{t('common.goBack')}</span>
                </Button>
                <div className={styles.subtitle} id={subTitleId}>
                  {renderedSub.title}
                </div>
              </div>
              <div className={styles.list}>
                {renderedSub.options.length === 0 ? (
                  <div className={styles.empty}>{renderedSub.emptyText}</div>
                ) : (
                  renderedSub.options.map((option) => {
                    const showRadio = renderedSub.multiSelect !== true && renderedSub.selectable !== false;
                    const showCheckbox = renderedSub.multiSelect === true;
                    return (
                      <Button
                        type='text'
                        key={option.key}
                        className={styles.item}
                        disabled={option.disabled || activeEntry?.disabled}
                        aria-pressed={showRadio || showCheckbox ? Boolean(option.active) : undefined}
                        onClick={() => handleSubSelect(option.key)}
                        data-testid={`mobile-action-sheet-option-${option.key}`}
                      >
                        <span className={styles.body}>
                          <span className={styles.label}>{option.label}</span>
                          {option.description && <span className={styles.desc}>{option.description}</span>}
                        </span>
                        {showRadio && (
                          <span
                            className={`${styles.radio} ${option.active ? styles.checked : ''}`}
                            aria-hidden='true'
                          />
                        )}
                        {showCheckbox && (
                          <span
                            className={`${styles.checkbox} ${option.active ? styles.checkboxChecked : ''}`}
                            aria-hidden='true'
                          />
                        )}
                      </Button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Fragment>,
    document.body
  );
};

export default MobileActionSheet;
