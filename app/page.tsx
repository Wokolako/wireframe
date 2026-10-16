'use client';

import dynamic from 'next/dynamic';
import {useEffect} from 'react';
import {Sprout} from 'lucide-react';

const AuthRoot = dynamic(() => import('../src/auth').then(module => module.AuthRoot), {
  ssr: false,
  loading: () => <main className="startup-state" role="status"><Sprout size={36}/><p>Opening your growing network…</p></main>,
});

export default function HomePage() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(error => console.error('Service worker registration failed.', error));
    }
  }, []);

  return <AuthRoot/>;
}
