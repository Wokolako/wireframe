'use client';

import dynamic from 'next/dynamic';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';

const AuthRoot = dynamic(() => import('../src/auth').then(module => module.AuthRoot), {
  ssr:false,
  loading:() => <div className="startup-state" role="status"><p>Opening your growing network…</p></div>,
});

export function WirefenClient() {
  const router = useRouter();
  useEffect(() => {
    // Ignore errors injected by browser extensions (e.g. MetaMask inpage.js)
    const handleExtensionError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const filename = 'filename' in event ? (event as ErrorEvent).filename : '';
      const message = 'message' in event ? (event as ErrorEvent).message : String((event as PromiseRejectionEvent).reason?.message || (event as PromiseRejectionEvent).reason || '');
      if (filename?.startsWith('chrome-extension://') || filename?.startsWith('moz-extension://') || message?.toLowerCase().includes('metamask')) {
        event.preventDefault();
        event.stopImmediatePropagation?.();
      }
    };
    window.addEventListener('error', handleExtensionError);
    window.addEventListener('unhandledrejection', handleExtensionError);

    // Preserve bookmarks from the previous hash router.
    if(location.hash.startsWith('#/') && !location.hash.startsWith('#//'))router.replace(location.hash.slice(1));
    if(process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    } else if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const registration of registrations) {
          registration.unregister();
        }
      }).catch(() => {});
    }
    return () => {
      window.removeEventListener('error', handleExtensionError);
      window.removeEventListener('unhandledrejection', handleExtensionError);
    };
  },[router]);
  return <AuthRoot/>;
}
