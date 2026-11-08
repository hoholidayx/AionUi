import { mcpService } from '@/common/adapter/ipcBridge';
import { assistantDetailScope, useAssistantDetail } from '@/renderer/hooks/assistant/useAssistantDetail';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import useSWR from 'swr';
import { IMAGE_BACKEND_CATALOG_KEY, isEnabledImageBackend } from './catalog';

/** Return the current account catalog filtered by the assistant's image permissions. */
export const useImageBackends = (assistantId: string | null | undefined, locale: string, enabled = true) => {
  const auth = useAuth();
  const { data: assistant } = useAssistantDetail(assistantDetailScope(auth), assistantId, locale);
  const { data: catalog, mutate } = useSWR(
    enabled ? [IMAGE_BACKEND_CATALOG_KEY, auth.user?.id] : null,
    async () =>
      (await mcpService.listServers.invoke())
        .filter(isEnabledImageBackend)
        .map(({ id, name, is_default }) => ({ id, name, is_default })),
    { revalidateOnFocus: true }
  );
  const allowed = assistant?.defaults.async_image_backend_ids;
  const hasAssistantPolicy = assistantId == null || assistant != null;
  const imageGenerationDisabled = assistant?.defaults.async_image_enabled === false || allowed?.length === 0;
  const resolved = imageGenerationDisabled || (hasAssistantPolicy && catalog != null);
  const backends =
    !hasAssistantPolicy || imageGenerationDisabled
      ? []
      : (catalog ?? []).filter((server) => allowed?.includes(server.id) ?? true);

  return { assistant, backends, resolved, refreshBackends: mutate };
};
