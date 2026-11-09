import { mcpService } from '@/common/adapter/ipcBridge';
import { assistantDetailScope, useAssistantDetail } from '@/renderer/hooks/assistant/useAssistantDetail';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import type { TFunction } from 'i18next';
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
) => {
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
    disabled: disabled || choice.disabled,
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

export type ImageBackendMenu = NonNullable<ReturnType<typeof buildImageBackendMenu>>;
