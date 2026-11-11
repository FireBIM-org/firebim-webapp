import { useRouter } from 'next/router';
import { useEffect } from 'react';

export function useUnsavedChanges(dirty: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!dirty) return;
    const cancelled = Object.assign(
      new Error('Navigation cancelled: translation draft has unsaved changes.'),
      { cancelled: true },
    );
    const handleCancellation = (event: PromiseRejectionEvent) => {
      if (event.reason === cancelled) event.preventDefault();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const routeChange = (url: string) => {
      if (
        url === router.asPath ||
        window.confirm('Leave without saving your translation draft changes?')
      )
        return;
      router.events.emit('routeChangeError', cancelled, url, { shallow: false });
      throw cancelled;
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('unhandledrejection', handleCancellation);
    router.events.on('routeChangeStart', routeChange);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('unhandledrejection', handleCancellation);
      router.events.off('routeChangeStart', routeChange);
    };
  }, [dirty, router]);
}
