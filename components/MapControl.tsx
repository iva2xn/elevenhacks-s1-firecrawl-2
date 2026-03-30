'use client';

import React, { useState, useEffect } from 'react';
import Map, { Marker, Source, Layer } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as turf from '@turf/turf';

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
  const [riderBearing, setRiderBearing] = useState(0);
  const [routeData, setRouteData] = useState<any>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  
  // Sidebar & Dev Mode State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDevMode, setIsDevMode] = useState(false);
  const [travelSpeed, setTravelSpeed] = useState(0.05);
  const [targetWaypoint, setTargetWaypoint] = useState<[number, number] | null>(null);

  const [pins, setPins] = useState<any[]>([]);
  const [isDropMode, setIsDropMode] = useState(false);
  const [activePinType, setActivePinType] = useState('hazard');

  const fetchRoute = async (start: [number, number], end: [number, number]) => {
    try {
      const resp = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&access_token=${MAPBOX_TOKEN}`
      );
      const data = await resp.json();
      if (data.routes && data.routes.length > 0) {
        return data.routes[0].geometry;
      }
    } catch (err) {
      console.error('Failed to fetch route', err);
    }
    return null;
  };

  const animateRider = (path: any) => {
    const line = turf.lineString(path.coordinates);
    const distanceMeter = turf.length(line, { units: 'kilometers' });
    let currentDist = 0;
    setIsNavigating(true);

    const step = () => {
      if (currentDist >= distanceMeter) {
        setIsNavigating(false);
        setRouteData(null);
        setTargetWaypoint(null);
        return;
      }

      currentDist += travelSpeed;
      const point = turf.along(line, currentDist, { units: 'kilometers' });
      const lookAhead = Math.min(currentDist + 0.1, distanceMeter);
      const nextPoint = turf.along(line, lookAhead, { units: 'kilometers' });
      
      const newBearing = turf.bearing(
        turf.point(point.geometry.coordinates),
        turf.point(nextPoint.geometry.coordinates)
      );

      setRiderPosition({
        longitude: point.geometry.coordinates[0],
        latitude: point.geometry.coordinates[1]
      });
      setRiderBearing(newBearing);

      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  };

  const handleMapClick = async (evt: any) => {
    const { lng, lat } = evt.lngLat;
    
    if (isDropMode) {
      const newPin = {
        id: Date.now(),
        longitude: lng,
        latitude: lat,
        type: activePinType,
        text: activePinType === 'hazard' ? 'Hazard' : 'Friend'
      };
      setPins([...pins, newPin]);
      setIsDropMode(false);
    } else {
      if (isNavigating) return;
      
      if (isDevMode) {
        const geometry = await fetchRoute(
          [riderPosition.longitude, riderPosition.latitude],
          [lng, lat]
        );
        if (geometry) {
          setRouteData({ type: 'Feature', geometry });
          animateRider(geometry);
        }
      } else {
        setTargetWaypoint([lng, lat]);
      }
    }
  };

  useEffect(() => {
    if (isDevMode && targetWaypoint && !isNavigating) {
      const triggerMove = async () => {
        const geometry = await fetchRoute(
          [riderPosition.longitude, riderPosition.latitude],
          targetWaypoint
        );
        if (geometry) {
          setRouteData({ type: 'Feature', geometry });
          animateRider(geometry);
        }
      };
      triggerMove();
    }
  }, [isDevMode]);

  const handleMarkerDrag = (evt: any) => {
    const { lng, lat } = evt.lngLat;
    setRiderPosition({ longitude: lng, latitude: lat });
  };

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-900 text-white p-8 text-center">
        <div>
          <h2 className="text-2xl font-bold mb-4 font-sans uppercase">Mapbox Token Missing</h2>
          <p className="text-zinc-400 mb-6">Add <code>NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to your <code>.env.local</code></p>
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
        {routeData && (
          <Source id="route-path" type="geojson" data={routeData}>
            <Layer
              id="line-layer"
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{ 'line-color': '#FF5D8F', 'line-width': 3, 'line-opacity': 0.3 }}
            />
          </Source>
        )}

        {targetWaypoint && (
          <Marker longitude={targetWaypoint[0]} latitude={targetWaypoint[1]} anchor="bottom">
            <svg viewBox="0 0 100 100" className="w-8 h-8 drop-shadow-lg">
              <path d="M50 0 C30 0 15 15 15 35 C15 60 50 100 50 100 C50 100 85 60 85 35 C85 15 70 0 50 0 Z" fill="#FF5D8F" />
              <circle cx="50" cy="35" r="10" fill="white" fillOpacity="0.8" />
            </svg>
          </Marker>
        )}

        <Marker 
          longitude={riderPosition.longitude} 
          latitude={riderPosition.latitude}
          anchor="center"
          draggable
          onDragEnd={handleMarkerDrag}
        >
          <div 
            className="relative transition-transform duration-75 ease-linear"
            style={{ transform: `rotate(${riderBearing}deg)` }}
          >
            <svg viewBox="0 0 100 100" className="w-10 h-10">
              <path d="M50 10 L85 85 L50 70 L15 85 Z" fill="#FF5D8F" />
            </svg>
          </div>
        </Marker>

        {pins.map(pin => (
          <Marker key={pin.id} longitude={pin.longitude} latitude={pin.latitude} anchor="bottom">
            <div className="group cursor-pointer">
              <svg viewBox="0 0 100 100" className="w-10 h-10 drop-shadow-lg transition-transform hover:scale-110 active:scale-95">
                <path d="M50 0 C30 0 15 15 15 35 C15 60 50 100 50 100 C50 100 85 60 85 35 C85 15 70 0 50 0 Z" fill={pin.type === 'hazard' ? '#FF5D8F' : '#C084FC'} />
                <circle cx="50" cy="35" r="15" fill="#000" fillOpacity="0.1" />
                <circle cx="50" cy="35" r="10" fill="white" fillOpacity="0.8" />
              </svg>
            </div>
          </Marker>
        ))}
      </Map>
      
      {/* Collapsed Settings Button (on the Right) */}
      {!isSidebarOpen && (
        <div className="absolute top-6 right-6 z-20 animate-in zoom-in-50 duration-500">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="bg-black/80 backdrop-blur-2xl border border-white/10 p-4 rounded-[1.5rem] shadow-2xl text-white/60 hover:text-[#FF5D8F] transition-all hover:scale-105 active:scale-95"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      )}

      {/* Expanded Sidebar (on the Right) */}
      <div className={`absolute top-6 right-6 z-10 w-72 h-[calc(100vh-3rem)] pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isSidebarOpen ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0'}`}>
        <div className="bg-black/80 backdrop-blur-2xl border border-white/10 h-full rounded-[2.5rem] shadow-2xl relative flex flex-col pointer-events-auto overflow-hidden">
          <div className="p-8 flex-1 overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-white font-bold text-xl tracking-tight leading-none uppercase">Settings</h1>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="text-white/40 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Developer Mode First */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Developer Mode</p>
                    <p className="text-[10px] text-zinc-600 font-medium">Simulation Controls</p>
                  </div>
                  <button onClick={() => setIsDevMode(!isDevMode)} className={`w-10 h-5 rounded-full relative transition-colors ${isDevMode ? 'bg-[#FF5D8F]' : 'bg-white/10'}`}>
                    <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white transition-transform ${isDevMode ? 'translate-x-5' : ''}`}></div>
                  </button>
                </div>

                {isDevMode && (
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-4 animate-in slide-in-from-top-4">
                    <div className="flex justify-between items-center px-1">
                      <p className="text-[9px] uppercase tracking-widest text-[#FF5D8F] font-bold">Travel Speed</p>
                      <p className="text-[10px] font-mono text-white">{(travelSpeed * 10).toFixed(1)}x</p>
                    </div>
                    <input type="range" min="0.01" max="0.5" step="0.01" value={travelSpeed} onChange={(e) => setTravelSpeed(parseFloat(e.target.value))} className="w-full accent-[#FF5D8F]" />
                  </div>
                )}
              </div>

              <div className="h-px bg-white/5" />

              <div className="p-4 bg-[#FF5D8F]/5 rounded-2xl border border-[#FF5D8F]/10 flex justify-between items-center">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#FF5D8F] font-bold">Status</p>
                  <p className="text-white font-mono text-xs mt-0.5">{isNavigating ? 'Navigating' : 'Standby'}</p>
                </div>
                <div className={`w-2 h-2 rounded-full bg-[#FF5D8F] ${isNavigating ? 'animate-ping' : 'opacity-40'}`}></div>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold px-1 text-[9px]">Simulation Layer</p>
                <button onClick={() => setIsDropMode(!isDropMode)} className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${isDropMode ? 'bg-[#FF5D8F] text-white border-white/20' : 'bg-white/5 border-white/10 text-zinc-400'}`}>
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <span className="font-bold text-xs uppercase">Drop Marker</span>
                  </div>
                </button>

                {isDropMode && (
                  <div className="flex gap-2 animate-in zoom-in-95 duration-200">
                    <button onClick={() => setActivePinType('hazard')} className={`flex-1 py-3 rounded-xl border text-[9px] font-black uppercase transition-all ${activePinType === 'hazard' ? 'bg-[#FF5D8F]/20 border-[#FF5D8F] text-[#FF5D8F]' : 'bg-white/5 border-white/5 text-zinc-600'}`}>Hazard</button>
                    <button onClick={() => setActivePinType('friend')} className={`flex-1 py-3 rounded-xl border text-[9px] font-black uppercase transition-all ${activePinType === 'friend' ? 'bg-[#C084FC]/20 border-[#C084FC] text-[#C084FC]' : 'bg-white/5 border-white/5 text-zinc-600'}`}>Friend</button>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {isDevMode && (
            <div className="p-8 border-t border-white/5 bg-black/40 rounded-b-[2.5rem]">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                <span>Active Marks</span>
                <span className="text-white font-mono">{pins.length + (targetWaypoint ? 1 : 0)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="absolute bottom-6 left-6 z-10 flex gap-4">
        <div className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl shadow-xl">
          <p className="text-[9px] uppercase tracking-widest text-[#FF5D8F] font-bold">Operational</p>
        </div>
      </div>
    </div>
  );
}
