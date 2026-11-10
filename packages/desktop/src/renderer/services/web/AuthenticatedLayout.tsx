import '@/common/adapter/browser';
import '@renderer/components/workspace/registerWebFsPicker';
import '@arco-design/web-react/es/_util/react-19-adapter';
import '@arco-design/web-react/dist/css/arco.css';
import 'uno.css';
import '@renderer/styles/arco-override.css';
import '@renderer/styles/markdown.css';
import React, { useEffect } from 'react';
import { SWRConfig } from 'swr';
import Layout from '@renderer/components/layout/Layout';
import RendererConfig from '@renderer/components/layout/startup/RendererConfig';
import RuntimeFailureDialogs from '@renderer/components/layout/startup/RuntimeFailureDialogs';
import Sider from '@renderer/components/layout/Sider';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { ConversationHistoryProvider } from '@renderer/hooks/context/ConversationHistoryContext';
import { FeedbackProvider } from '@renderer/hooks/context/FeedbackContext';
import { ThemeProvider } from '@renderer/hooks/context/ThemeContext';
import { useCrossSessionRateLimitNotice } from '@renderer/hooks/system/useCrossSessionRateLimitNotice';
import { PreviewProvider } from '@renderer/pages/conversation/Preview/context/PreviewContext';
import { syncConfiguredLanguage, subscribeToLanguageChanges } from '@renderer/services/i18n';

const swrDefaults = { revalidateOnFocus: false };

export default function AuthenticatedLayout() {
  const { user } = useAuth();
  useCrossSessionRateLimitNotice(user?.id);

  useEffect(() => {
    void syncConfiguredLanguage();
    return subscribeToLanguageChanges();
  }, []);

  return (
    <SWRConfig value={swrDefaults}>
      <RendererConfig>
        <ThemeProvider>
          <PreviewProvider>
            <FeedbackProvider>
              <RuntimeFailureDialogs />
              <ConversationHistoryProvider>
                <Layout sider={<Sider />} />
              </ConversationHistoryProvider>
            </FeedbackProvider>
          </PreviewProvider>
        </ThemeProvider>
      </RendererConfig>
    </SWRConfig>
  );
}
