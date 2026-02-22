'use client';

import { usePrivy } from '@privy-io/react-auth';
import Onboarding from './components/Onboarding';
import MainLayout from './components/MainLayout';

export default function Home() {
  const { ready, authenticated } = usePrivy();

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#000] flex items-center justify-center text-white">
        <p className="text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (!authenticated) {
    return <Onboarding />;
  }

  return <MainLayout />;
}
