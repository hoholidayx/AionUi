/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { Alert } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import type { IConversationMcpStatus } from '@/common/config/storage';
import type { ChatFileRef } from '@/common/types/chatFile';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import ConversationPlanBar from '@renderer/pages/conversation/PlanBar/ConversationPlanBar';
import { usePlanRecovery } from '@renderer/pages/conversation/PlanBar/usePlanRecovery';
import { CHAT_SURFACE_CONTAINER_CLASS } from '@/renderer/pages/conversation/utils/chatSurfaceWidth';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import type { TeamSendBoxRuntime } from '@/renderer/pages/team/components/teamSendRuntime';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { ConversationArtifactProvider } from '@renderer/pages/conversation/Messages/artifacts';
import {
  MessageListLoadingProvider,
  MessageListProvider,
  MessagePaginationProvider,
  useMessageLstCache,
} from '@renderer/pages/conversation/Messages/hooks';
import { usePendingConfirmationsRecovery } from '@renderer/pages/conversation/Messages/usePendingConfirmationsRecovery';
import HOC from '@renderer/utils/ui/HOC';
import React from 'react';
import AcpE2EStreamInjector from './AcpE2EStreamInjector';
import AcpSendBox from './AcpSendBox';
import { useAcpMessage } from './useAcpMessage';

const AcpChat: React.FC<{
  conversation_id: string;
  workspace?: string;
  backend: string;
  session_mode?: string;
  agent_name?: string;
  cron_job_id?: string;
  hideSendBox?: boolean;
  emptySlot?: React.ReactNode;
  loadedSkills?: string[];
  loadedMcpServers?: string[];
  loadedMcpStatuses?: IConversationMcpStatus[];
  teamSendMessage?: (payload: { input: string; files: ChatFileRef[] }) => Promise<void>;
  teamRuntime?: TeamSendBoxRuntime;
  assistantId?: string;
  forkCapability?: { at_turn: boolean };
  promptCapability?: { image: boolean; audio: boolean };
}> = ({
  conversation_id,
  workspace,
  backend,
  session_mode,
  agent_name,
  cron_job_id,
  hideSendBox,
  emptySlot,
  loadedSkills,
  loadedMcpServers,
  loadedMcpStatuses,
  teamSendMessage,
  teamRuntime,
  assistantId,
  forkCapability,
  promptCapability,
}) => {
  const { t } = useTranslation();
  const { data: dotsConversation } = useSWR(
    backend === 'dots' ? ['dots.connection', conversation_id] : null,
    () => ipcBridge.conversation.get.invoke({ id: conversation_id }),
    { refreshInterval: 10_000 }
  );
  const dotsConnection = (dotsConversation?.extra as { dots_connection?: string } | undefined)?.dots_connection;
  const dotsStatus =
    dotsConnection === 'offline'
      ? t('conversation.dots.offline')
      : dotsConnection === 'no_subscription'
        ? t('conversation.dots.noSubscription')
        : dotsConnection === 'disabled'
          ? t('conversation.dots.disabled')
          : undefined;
  useMessageLstCache(conversation_id, { recoverImageCards: backend === 'codex' ? 'codex' : undefined });
  usePendingConfirmationsRecovery(conversation_id);
  usePlanRecovery(conversation_id);
  const teamPermission = useTeamPermission();
  const messageState = useAcpMessage(conversation_id, {
    skipWarmup: Boolean(teamPermission),
    prepareRuntime: teamPermission?.warmupSession,
  });

  return (
    <ConversationProvider
      value={{
        conversation_id: conversation_id,
        workspace,
        type: 'acp',
        cron_job_id,
        hideSendBox,
        loadedSkills,
        loadedMcpServers,
        loadedMcpStatuses,
        assistantId,
        forkCapability,
        promptCapability,
      }}
    >
      <ConversationArtifactProvider conversation_id={conversation_id}>
        <div className={`${CHAT_SURFACE_CONTAINER_CLASS} flex-1 flex flex-col px-20px min-h-0`}>
          <FlexFullContainer>
            <MessageList className='flex-1' emptySlot={emptySlot} />
          </FlexFullContainer>
          <AcpE2EStreamInjector conversationId={conversation_id} />
          <ConversationPlanBar conversation_id={conversation_id} />
          {dotsStatus && <Alert type='warning' content={dotsStatus} />}
          {!hideSendBox && dotsConnection !== 'disabled' && (
            <AcpSendBox
              conversation_id={conversation_id}
              backend={backend}
              session_mode={session_mode}
              agent_name={agent_name}
              messageState={messageState}
              teamSendMessage={teamSendMessage}
              teamRuntime={teamRuntime}
            ></AcpSendBox>
          )}
        </div>
      </ConversationArtifactProvider>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, MessageListLoadingProvider, MessagePaginationProvider)(AcpChat);
