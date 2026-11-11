/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { type ChatFileRef, chatFileRefPath } from '@/common/types/chatFile';
import type { IMcpServer, TProviderWithModel } from '@/common/config/storage';
import { toSessionMcpServer } from '@/renderer/hooks/mcp/catalog';
import { emitter } from '@/renderer/utils/emitter';
import { updateWorkspaceTime } from '@/renderer/utils/workspace/workspaceHistory';
import { Message } from '@arco-design/web-react';
import { useCallback, useRef } from 'react';
import { type TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import { mutate as swrMutate } from 'swr';
import { getConversationCreateErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import { assistantDetailScope, refreshAssistantDetail } from '@/renderer/hooks/assistant/useAssistantDetail';
import { useAuth } from '@/renderer/hooks/context/AuthContext';

export type GuidSendDeps = {
  // Input state
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  files: ChatFileRef[];
  setFiles: React.Dispatch<React.SetStateAction<ChatFileRef[]>>;
  dir: string;
  setDir: React.Dispatch<React.SetStateAction<string>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  loading: boolean;

  // Assistant state
  selectedAssistantId: string | null;
  selectedAssistantBackend: string;
  selectedMode: string;
  selectedAcpModel: string | null;
  selectedThoughtLevelValue?: string;
  current_model: TProviderWithModel | undefined;

  guidDisabledBuiltinSkills: string[] | undefined;
  guidEnabledSkills: string[] | undefined;
  assistantDefaultSkillIds?: string[];
  assistantDefaultDisabledBuiltinSkillIds?: string[];
  availableMcpServers: IMcpServer[];
  selectedMcpServerIds: string[] | undefined;
  imageBackendId?: string | null;
  needsImageBackendSelection?: boolean;
  assistantDefaultMcpIds?: string[];
  isGoogleAuth: boolean;

  // Mention state reset
  setMentionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionQuery: React.Dispatch<React.SetStateAction<string | null>>;
  setMentionSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionActiveIndex: React.Dispatch<React.SetStateAction<number>>;

  // Navigation
  navigate: NavigateFunction;
  t: TFunction;
  localeKey: string;
};

export type GuidSendResult = {
  handleSend: () => Promise<void>;
  sendMessageHandler: () => void;
  isButtonDisabled: boolean;
};

/**
 * Hook that manages the send logic for ACP and Aion CLI conversations.
 */
export const useGuidSend = (deps: GuidSendDeps): GuidSendResult => {
  const detailScope = assistantDetailScope(useAuth());
  const {
    input,
    setInput,
    files,
    setFiles,
    dir,
    setDir,
    setLoading,
    loading,
    selectedAssistantId,
    selectedAssistantBackend,
    selectedMode,
    selectedAcpModel,
    selectedThoughtLevelValue,
    current_model,
    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    assistantDefaultSkillIds,
    assistantDefaultDisabledBuiltinSkillIds,
    availableMcpServers,
    selectedMcpServerIds,
    imageBackendId,
    needsImageBackendSelection,
    assistantDefaultMcpIds,
    setMentionOpen,
    setMentionQuery,
    setMentionSelectorOpen,
    setMentionActiveIndex,
    navigate,
    t,
    localeKey,
  } = deps;
  const sendingRef = useRef(false);
  const isButtonDisabled = loading || !selectedAssistantId || needsImageBackendSelection === true;

  const handleSend = useCallback(async () => {
    if (!selectedAssistantId || needsImageBackendSelection) {
      return;
    }

    const isCustomWorkspace = !!dir;
    const finalWorkspace = dir || '';

    const assistantConversationId = selectedAssistantId;
    const assistantBackend = selectedAssistantBackend;
    const enabled_skills_to_send = guidEnabledSkills ?? assistantDefaultSkillIds;
    const excludeBuiltinSkills = guidDisabledBuiltinSkills ?? assistantDefaultDisabledBuiltinSkillIds;
    const imageBackendIds = new Set(
      availableMcpServers.filter((server) => server.purpose === 'async_image').map((server) => server.id)
    );
    const selectedAllMcpServerIds = (selectedMcpServerIds ?? []).filter((id) => !imageBackendIds.has(id));
    const selectedMcpServerIdSet = new Set(selectedAllMcpServerIds);
    const selectedUserMcpServerIds = availableMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id) && server.builtin !== true)
      .map((server) => server.id);
    // Async image endpoints are resolved by the backend hook from their live IDs.
    const snapshotMcpServers = availableMcpServers.filter((server) => server.purpose !== 'async_image');
    const selectedAllSessionMcpServers = snapshotMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id))
      .map((server) => toSessionMcpServer(server));
    const selectedSessionMcpServers = snapshotMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id) && server.builtin === true)
      .map((server) => toSessionMcpServer(server));
    const defaultSelectedMcpServerIds = assistantDefaultMcpIds?.filter((id) => !imageBackendIds.has(id));
    const defaultSelectedUserMcpServerIds = availableMcpServers
      .filter((server) => (defaultSelectedMcpServerIds ?? []).includes(server.id) && server.builtin !== true)
      .map((server) => server.id);
    const assistantOverrideMcpIds =
      selectedMcpServerIds !== undefined ? selectedAllMcpServerIds : defaultSelectedMcpServerIds;
    const selectedUserMcpServerIdsToSend =
      selectedMcpServerIds !== undefined ? selectedUserMcpServerIds : defaultSelectedUserMcpServerIds;
    const defaultSessionMcpServers = snapshotMcpServers
      .filter((server) => (defaultSelectedMcpServerIds ?? []).includes(server.id))
      .map((server) => toSessionMcpServer(server));

    // `current_model` is the aionrs provider selection and means nothing to a
    // CLI agent, which owns its own model list. Used as a blanket fallback it
    // leaked into the FIRST turn of every CLI conversation: before the agent's
    // catalog has been probed the two preceding options are empty, so a brand
    // new Antigravity conversation started with e.g. `gemini-3.1-pro-preview`
    // — a provider model agy has never heard of — and the turn failed with
    // USER_LLM_PROVIDER_MODEL_NOT_FOUND. Once the catalog lands the second
    // option wins, which is why it only ever reproduced on first use.
    //
    // Omitting it lets the agent start on its own default, which is what a user
    // who has not picked a model means. The cron dialog already gates the same
    // value this way (`resolvedBackend !== 'aionrs' → undefined`).
    //
    // The cached `current_model_id` is NOT a fallback for the same reason, and it
    // used to defeat the very intent described above. It is whatever the LAST
    // session of this agent wrote back, so an unpicked conversation inherited a
    // stranger's choice: for claude that was usually its `default` row, which
    // PINS the account default and overrides the user's own ANTHROPIC_MODEL — so
    // the app ran a different model than `claude` in a terminal did, and the
    // picker contradicted itself (the row promised one model, the session used
    // another). Omit it: no pick means no override, and the agent resolves the
    // model from the user's own config.
    const assistantOverrideModel =
      selectedAcpModel || (assistantBackend === 'aionrs' ? current_model?.use_model : undefined) || undefined;
    const assistantSessionSettings = {
      model: assistantOverrideModel,
      permission: selectedMode || undefined,
      thought_level: selectedThoughtLevelValue || undefined,
    };

    if (assistantBackend === 'aionrs') {
      if (!current_model) {
        Message.warning(t('conversation.noModelConfigured'));
        return;
      }
      const runtimeOverrides = {
        ...(guidEnabledSkills !== undefined && { skill_ids: guidEnabledSkills }),
        ...(guidDisabledBuiltinSkills !== undefined && { disabled_builtin_skill_ids: guidDisabledBuiltinSkills }),
        ...(selectedMcpServerIds !== undefined && { mcp_ids: selectedAllMcpServerIds }),
      };
      try {
        const conversation = await ipcBridge.conversation.create.invoke({
          name: input,
          model: current_model,
          assistant: {
            id: assistantConversationId,
            locale: localeKey,
            conversation_overrides: { ...assistantSessionSettings, ...runtimeOverrides },
            ...(Object.keys(runtimeOverrides).length > 0 && { runtime_overrides: runtimeOverrides }),
          },
          extra: {
            default_files: files.map(chatFileRefPath),
            workspace: finalWorkspace,
            custom_workspace: isCustomWorkspace,
            ...(selectedMcpServerIds !== undefined && {
              selected_mcp_server_ids: selectedUserMcpServerIds,
              selected_session_mcp_servers: selectedAllSessionMcpServers,
            }),
            ...(imageBackendId && { image_backend_id: imageBackendId }),
          },
        });

        if (!conversation || !conversation.id) {
          Message.error(t('conversation.createFailed'));
          return;
        }

        if (isCustomWorkspace) {
          updateWorkspaceTime(finalWorkspace);
        }

        if (assistantConversationId) {
          await Promise.all([
            refreshAssistantDetail(detailScope, assistantConversationId, localeKey),
            swrMutate('assistants.list'),
          ]);
        }

        emitter.emit('chat.history.refresh');

        // Empty input = "start chat": create the conversation but do not stash an
        // initial message, so the window opens idle on the empty state instead of
        // auto-sending a blank first turn.
        if (input.trim()) {
          const initialMessage = {
            input,
            files: files.length > 0 ? files : undefined,
          };
          sessionStorage.setItem(`aionrs_initial_message_${conversation.id}`, JSON.stringify(initialMessage));
        }

        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        console.error('Failed to create Aion CLI conversation:', error);
        throw error;
      }
      return;
    }

    try {
      const conversation = await ipcBridge.conversation.create.invoke({
        name: input,
        assistant: {
          id: assistantConversationId,
          locale: localeKey,
          conversation_overrides: {
            ...assistantSessionSettings,
            skill_ids: enabled_skills_to_send,
            disabled_builtin_skill_ids: excludeBuiltinSkills,
            mcp_ids: assistantOverrideMcpIds,
          },
        },
        extra: {
          workspace: finalWorkspace,
          custom_workspace: isCustomWorkspace,
          default_files: files.map(chatFileRefPath),
          selected_mcp_server_ids: selectedUserMcpServerIdsToSend,
          selected_session_mcp_servers:
            selectedMcpServerIds !== undefined ? selectedSessionMcpServers : defaultSessionMcpServers,
        },
      });
      if (!conversation || !conversation.id) {
        console.error('Failed to create ACP conversation - conversation object is null or missing id');
        return;
      }

      if (isCustomWorkspace) {
        updateWorkspaceTime(finalWorkspace);
      }

      if (assistantConversationId) {
        await Promise.all([
          refreshAssistantDetail(detailScope, assistantConversationId, localeKey),
          swrMutate('assistants.list'),
        ]);
      }

      emitter.emit('chat.history.refresh');

      // Empty input = "start chat": create the conversation but do not stash an
      // initial message, so the window opens idle on the empty state instead of
      // auto-sending a blank first turn.
      if (input.trim() || (selectedAssistantBackend === 'dots' && files.length > 0)) {
        const initialMessage = {
          input,
          files: files.length > 0 ? files : undefined,
        };
        sessionStorage.setItem(`acp_initial_message_${conversation.id}`, JSON.stringify(initialMessage));
      }

      await navigate(`/conversation/${conversation.id}`);
    } catch (error: unknown) {
      console.error('Failed to create ACP conversation:', error);
      throw error;
    }
  }, [
    input,
    files,
    dir,
    selectedAssistantId,
    selectedAssistantBackend,
    selectedMode,
    selectedAcpModel,
    selectedThoughtLevelValue,
    current_model,
    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    assistantDefaultSkillIds,
    assistantDefaultDisabledBuiltinSkillIds,
    availableMcpServers,
    selectedMcpServerIds,
    imageBackendId,
    needsImageBackendSelection,
    assistantDefaultMcpIds,
    navigate,
    t,
    detailScope,
    localeKey,
  ]);

  const sendMessageHandler = useCallback(() => {
    if (isButtonDisabled || sendingRef.current) return;
    sendingRef.current = true;
    setLoading(true);
    handleSend()
      .then(() => {
        setInput('');
        setMentionOpen(false);
        setMentionQuery(null);
        setMentionSelectorOpen(false);
        setMentionActiveIndex(0);
        setFiles([]);
        setDir('');
      })
      .catch((error) => {
        console.error('Failed to send message:', error);
        Message.error(getConversationCreateErrorMessage(error, t));
      })
      .finally(() => {
        sendingRef.current = false;
        setLoading(false);
      });
  }, [
    isButtonDisabled,
    handleSend,
    setLoading,
    setInput,
    setMentionOpen,
    setMentionQuery,
    setMentionSelectorOpen,
    setMentionActiveIndex,
    setFiles,
    setDir,
    t,
  ]);

  return {
    handleSend,
    sendMessageHandler,
    isButtonDisabled,
  };
};
