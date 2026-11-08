import { assistants } from '@/common/adapter/ipcBridge';
import type { useAuth } from '@/renderer/hooks/context/AuthContext';
import useSWR, { mutate } from 'swr';

/** A desktop session is authenticated without a Web account. */
export const assistantDetailScope = ({ status, user }: Pick<ReturnType<typeof useAuth>, 'status' | 'user'>) =>
  status === 'authenticated' ? (user?.id ?? null) : undefined;

type AssistantDetailScope = ReturnType<typeof assistantDetailScope>;

const assistantDetailKey = (accountId: string | null, id: string, locale: string) =>
  ['assistant.detail', accountId, id, locale] as const;

/** Revalidate only the assistant detail in the active account's scope. */
export const refreshAssistantDetail = (scope: AssistantDetailScope, id: string, locale: string) =>
  scope === undefined ? undefined : mutate(assistantDetailKey(scope, id, locale));

/** Load the assistant's current settings, including live image backend restrictions. */
export const useAssistantDetail = (scope: AssistantDetailScope, id: string | null | undefined, locale: string) =>
  useSWR(id && scope !== undefined ? assistantDetailKey(scope, id, locale) : null, () =>
    id ? assistants.get.invoke({ id, locale }) : null
  );
