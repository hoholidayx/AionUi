import { Button } from '@arco-design/web-react';
import React, { type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

function ReloadView() {
  const { t } = useTranslation();
  return (
    <main role='alert'>
      <p>{t('common.error')}</p>
      <Button onClick={() => window.location.reload()}>{t('common.reload')}</Button>
    </main>
  );
}

export default class WebChunkBoundary extends React.Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <ReloadView /> : this.props.children;
  }
}
