'use client';

import React, { useState } from 'react';
import Map, { Marker } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

export default function MapControl() {
  const [viewState, setViewState] = useState({
    longitude: -122.4,
    latitude: 37.8,
    zoom: 12
  });

  const [riderPosition, setRiderPosition] = useState({
    longitude: -122.4,
    latitude: 37.8
  });

  const [pins, setPins] = useState<any[]>([]);
  const [isDropMode, setIsDropMode] = useState(false);
  const [activePinType, setActivePinType] = useState('hazard');

  const handleMapClick = (evt: any) => {
    const { lng, lat } = evt.lngLat;
    
    if (isDropMode) {
      const newPin = {
        id: Date.now(),
        longitude: lng,
        latitude: lat,
        type: activePinType,
        text: activePinType === 'hazard' ? 'Hazard detected' : 'Friend nearby'
      };
      setPins([...pins, newPin]);
      setIsDropMode(false); // Auto-exit drop mode for better UX
    } else {
      setRiderPosition({ longitude: lng, latitude: lat });
    }
  };

  const handleMarkerDrag = (evt: any) => {
    const { lng, lat } = evt.lngLat;
    setRiderPosition({ longitude: lng, latitude: lat });
  };

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
        onClick={handleMapClick}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        cursor={isDropMode ? "cell" : "crosshair"}
      >
        {/* Rider Marker */}
        <Marker 
          longitude={riderPosition.longitude} 
          latitude={riderPosition.latitude}
          anchor="bottom"
          draggable
          onDragEnd={handleMarkerDrag}
        >
          <div className="relative group cursor-grab active:cursor-grabbing">
            <div className="absolute -inset-2 bg-blue-500/20 rounded-full blur-xl group-hover:bg-blue-500/40 transition-all"></div>
            <div className="relative flex items-center justify-center w-12 h-12 bg-white rounded-full shadow-2xl border-2 border-blue-500 overflow-hidden transition-transform duration-300 group-hover:scale-110">
              <svg 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2.5" 
                className="w-7 h-7 text-blue-600"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="absolute top-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
          </div>
        </Marker>

        {/* Message/Hazard Pins */}
        {pins.map(pin => (
          <Marker
            key={pin.id}
            longitude={pin.longitude}
            latitude={pin.latitude}
            anchor="bottom"
          >
            <div className={`cursor-pointer transition-transform hover:scale-110`}>
              <div className={`
                flex items-center justify-center w-8 h-8 rounded-full shadow-lg border-2 border-white
                ${pin.type === 'hazard' ? 'bg-orange-500' : pin.type === 'friend' ? 'bg-emerald-500' : 'bg-purple-500'}
              `}>
                {pin.type === 'hazard' ? (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
              </div>
            </div>
          </Marker>
        ))}
      </Map>
      
      <div className="absolute top-6 left-6 z-10 w-72">
        <div className="bg-black/80 backdrop-blur-xl border border-white/10 p-5 rounded-3xl shadow-2xl">
          <h1 className="text-white font-bold text-xl tracking-tight leading-none">AI Co-Pilot</h1>
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-1.5 font-bold">Simulation Dashboard</p>
          
          <div className="mt-8 space-y-6">
            <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-1">Rider Status</p>
              <div className="flex justify-between items-end">
                <p className="text-white font-mono text-sm leading-none tabular-nums">
                  {riderPosition.latitude.toFixed(4)}, {riderPosition.longitude.toFixed(4)}
                </p>
                <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold px-1">Simulation Tools</p>
              
              <button
                onClick={() => setIsDropMode(!isDropMode)}
                className={`
                  w-full flex items-center justify-between p-3 rounded-2xl border transition-all duration-300
                  ${isDropMode 
                    ? 'bg-blue-600 border-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.4)] text-white' 
                    : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'}
                `}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isDropMode ? 'bg-white/20' : 'bg-white/5'}`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <span className="font-bold text-sm">Drop Pin AI</span>
                </div>
                <div className={`text-[10px] font-black uppercase tracking-tighter ${isDropMode ? 'text-blue-200' : 'text-zinc-600'}`}>
                  {isDropMode ? 'Active' : 'Ready'}
                </div>
              </button>

              {isDropMode && (
                <div className="grid grid-cols-2 gap-2 animate-in slide-in-from-top-2 duration-300">
                  <button 
                    onClick={() => setActivePinType('hazard')}
                    className={`p-2 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all
                      ${activePinType === 'hazard' ? 'bg-orange-500 border-orange-400 text-white' : 'bg-white/5 border-white/5 text-zinc-500'}
                    `}
                  >
                    Hazard
                  </button>
                  <button 
                    onClick={() => setActivePinType('friend')}
                    className={`p-2 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all
                      ${activePinType === 'friend' ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-white/5 border-white/5 text-zinc-500'}
                    `}
                  >
                    Friend
                  </button>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-white/10">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                <span>Active Entities</span>
                <span className="text-zinc-400 tabular-nums">{pins.length + 1}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 right-6 z-10">
        <div className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-lg shadow-xl">
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-0.5">Map Engine</p>
          <p className="text-zinc-400 font-mono text-[10px]">
            {viewState.zoom.toFixed(1)}x Zoom
          </p>
        </div>
      </div>
    </div>
  );
}
