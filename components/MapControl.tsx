'use client';

import React, { useState } from 'react';
import Map from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

export default function MapControl() {
  const [viewState, setViewState] = useState({
    longitude: -122.4,
    latitude: 37.8,
    zoom: 12
  });

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-900 text-white p-8 text-center">
        <div>
          <h2 className="text-2xl font-bold mb-4">Mapbox Token Missing</h2>
          <p className="text-zinc-400 mb-6">
            Please add <code>NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to your <code>.env.local</code> file.
          </p>
          <div className="inline-block p-4 bg-zinc-800 rounded-lg border border-zinc-700 text-left font-mono text-sm leading-relaxed">
            NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_token_here
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-900">
      <Map
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
      />
      
      
      <div className="absolute top-6 left-6 z-10">
        <div className="bg-black/60 backdrop-blur-md border border-white/10 p-4 rounded-xl shadow-2xl">
          <h1 className="text-white font-bold text-lg tracking-tight">AI Co-Pilot Dashboard</h1>
          <p className="text-zinc-400 text-xs mt-1 font-medium">Stage 1: UI Foundation</p>
        </div>
      </div>

      <div className="absolute bottom-6 left-6 z-10">
        <div className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-lg shadow-xl">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Current Coordinates</p>
          <p className="text-white font-mono text-sm">
            {viewState.latitude.toFixed(4)}, {viewState.longitude.toFixed(4)}
          </p>
        </div>
      </div>
    </div>
  );
}
