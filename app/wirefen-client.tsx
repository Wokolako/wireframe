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
    // Preserve bookmarks from the previous hash router.
    if(location.hash.startsWith('#/') && !location.hash.startsWith('#//'))router.replace(location.hash.slice(1));
    if(process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  },[router]);
  return <AuthRoot/>;
}
