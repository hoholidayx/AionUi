import type { BadgeProps } from '@arco-design/web-react';
import { Badge, Spin } from '@arco-design/web-react';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import { Checklist, Right } from '@icon-park/react';
import React, { useEffect, useMemo, useState } from 'react';
import { ipcBridge } from '@/common';
import type { NormalizedToolCall, NormalizedToolStatus, ToolMessage } from '@/common/chat/normalizeToolCall';
import { normalizeToolMessages, hasRunningToolMessages } from '@/common/chat/normalizeToolCall';
import ToolImagePreview from './ToolImagePreview';
import styles from './ToolCards.module.css';

const statusToBadge = (status: NormalizedToolStatus): BadgeProps['status'] => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'error':
      return 'error';
    case 'running':
      return 'processing';
    case 'canceled':
      return 'default';
    case 'pending':
    default:
      return 'default';
  }
};

const ToolItemDetail: React.FC<{ item: NormalizedToolCall }> = ({ item }) => {
  const [expanded, setExpanded] = useState(false);
  const [fullItem, setFullItem] = useState<NormalizedToolCall | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const displayItem = item.truncated && fullItem?.status === item.status ? fullItem : item;
  const image = item.image ?? displayItem.image;
  const hasDetail = displayItem.input || displayItem.output || item.truncated || image;
  const loadFullItem = async () => {
    if (!item.truncated || displayItem !== item || loadingFull || !item.conversationId || !item.messageId) return;
    setLoadingFull(true);
    setLoadError(false);
    try {
      const message = await ipcBridge.database.getConversationMessage.invoke({
        conversation_id: item.conversationId,
        message_id: item.messageId,
      });
      const next = normalizeToolMessages([message as ToolMessage]).find((candidate) => candidate.key === item.key);
      if (next) setFullItem(next);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingFull(false);
    }
  };

  const toggleExpanded = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded) void loadFullItem();
  };

  return (
    <div className='flex flex-col'>
      <div className='flex flex-row color-#86909C gap-12px items-center'>
        <Badge
          status={statusToBadge(item.status)}
          className={item.status === 'running' ? styles.badgeBreathing : undefined}
        />
        <span
          className={
            'flex-1 min-w-0' +
            (expanded ? ' break-all' : ' truncate') +
            (hasDetail ? ' cursor-pointer hover:color-#4E5969' : '')
          }
          onClick={hasDetail ? toggleExpanded : undefined}
        >
          <span className='font-medium text-13px'>{displayItem.name}</span>
          {displayItem.description && displayItem.description !== displayItem.name && (
            <span className='m-l-4px opacity-80 text-13px'>{displayItem.description}</span>
          )}
        </span>
        {hasDetail && (
          <span className='flex-shrink-0 cursor-pointer hover:color-#4E5969 transition-colors' onClick={toggleExpanded}>
            {expanded ? <IconDown style={{ fontSize: 12 }} /> : <IconRight style={{ fontSize: 12 }} />}
          </span>
        )}
      </div>
      {expanded && hasDetail && (
        <div className={`${styles.detailPanel} m-l-20px m-t-4px`}>
          {loadingFull && <div className={styles.detailLabel}>Loading...</div>}
          {loadError && <div className={styles.detailLabel}>Failed to load full output</div>}
          {displayItem.input && (
            <div className={styles.detailSection}>
              <div className={styles.detailLabel}>Input</div>
              <pre className={styles.detailContent}>{displayItem.input}</pre>
            </div>
          )}
          {displayItem.output && (
            <div className={styles.detailSection}>
              <div className={styles.detailLabel}>Output</div>
              <pre className={styles.detailContent}>{displayItem.output}</pre>
            </div>
          )}
        </div>
      )}
      {image && <ToolImagePreview source={image} />}
    </div>
  );
};

const MessageToolGroupSummary: React.FC<{ messages: ToolMessage[] }> = ({ messages }) => {
  const hasRunning = hasRunningToolMessages(messages);
  const [showMore, setShowMore] = useState(hasRunning);

  useEffect(() => {
    if (hasRunning) setShowMore(true);
  }, [hasRunning]);

  const tools = useMemo(() => normalizeToolMessages(messages), [messages]);

  return (
    <div className={styles.summary}>
      <div className={styles.summaryHeader} onClick={() => setShowMore(!showMore)}>
        <span className={styles.summaryIcon}>
          {hasRunning ? <Spin size={12} /> : <Checklist theme='outline' size='14' />}
        </span>
        <span className={styles.summaryLabel}>View Steps {tools.length > 0 ? `· ${tools.length}` : ''}</span>
        <span className={`${styles.summaryArrow}${showMore ? ` ${styles.summaryArrowOpen}` : ''}`}>
          <Right theme='outline' size='12' />
        </span>
      </div>
      {showMore && (
        <div className={styles.summaryBody}>
          {tools.map((item) => (
            <ToolItemDetail key={JSON.stringify([item.conversationId, item.messageId, item.key])} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(MessageToolGroupSummary);
