'use client';

import dynamic from 'next/dynamic';

const MapControl = dynamic(() => import('@/components/MapControl'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen w-full bg-black">
      <div className="w-10 h-10 border-4 border-[#FF5D8F] border-t-transparent rounded-full animate-spin"></div>
    </div>
  ),
});

export default function Home() {
  return (
    <div className="flex-1 flex flex-col bg-black">
      <MapControl />
    </div>
  );
}
