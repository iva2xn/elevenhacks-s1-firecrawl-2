'use client';

import React, { useState } from 'react';
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
    const distance = turf.length(line, { units: 'kilometers' });
    const speed = 0.05; // km per frame roughly
    let currentDist = 0;
    setIsNavigating(true);

    const step = () => {
      if (currentDist >= distance) {
        setIsNavigating(false);
        return;
      }

      currentDist += speed;
      const point = turf.along(line, currentDist, { units: 'kilometers' });
      const nextPoint = turf.along(line, Math.min(currentDist + speed, distance), { units: 'kilometers' });
      
      const bearing = turf.bearing(
        turf.point(point.geometry.coordinates),
        turf.point(nextPoint.geometry.coordinates)
      );

      setRiderPosition({
        longitude: point.geometry.coordinates[0],
        latitude: point.geometry.coordinates[1]
      });
      setRiderBearing(bearing);

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
        text: activePinType === 'hazard' ? 'Hazard detected' : 'Friend nearby'
      };
      setPins([...pins, newPin]);
      setIsDropMode(false);
    } else {
      if (isNavigating) return;
      
      const geometry = await fetchRoute(
        [riderPosition.longitude, riderPosition.latitude],
        [lng, lat]
      );
      
      if (geometry) {
        setRouteData({
          type: 'Feature',
          geometry: geometry
        });
        animateRider(geometry);
      } else {
        // Fallback to teleport if route fails
        setRiderPosition({ longitude: lng, latitude: lat });
      }
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
        {/* Navigation Route Path */}
        {routeData && (
          <Source id="my-data" type="geojson" data={routeData}>
            <Layer
              id="line-layer"
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{ 'line-color': '#FF5D8F', 'line-width': 3, 'line-opacity': 0.3 }}
            />
          </Source>
        )}

        {/* Rider Marker (Directional Arrow) */}
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
            <svg 
              viewBox="0 0 100 100" 
              className="w-10 h-10"
            >
              <path 
                d="M50 10 L85 85 L50 70 L15 85 Z" 
                fill="#FF5D8F"
              />
            </svg>
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
            <div className="group cursor-pointer">
              <svg 
                viewBox="0 0 100 100" 
                className={`w-10 h-10 drop-shadow-lg transition-transform hover:scale-110 active:scale-95`}
              >
                <path 
                  d="M50 0 C30 0 15 15 15 35 C15 60 50 100 50 100 C50 100 85 60 85 35 C85 15 70 0 50 0 Z" 
                  fill={pin.type === 'hazard' ? '#FF5D8F' : '#C084FC'}
                />
                <circle cx="50" cy="35" r="15" fill="#000" fillOpacity="0.2" />
                <circle cx="50" cy="35" r="10" fill="white" fillOpacity="0.8" />
              </svg>
            </div>
          </Marker>
        ))}
      </Map>
      
      <div className="absolute top-6 left-6 z-10 w-72">
        <div className="bg-black/80 backdrop-blur-2xl border border-white/10 p-6 rounded-[2.5rem] shadow-2xl">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full bg-[#FF5D8F] ${isNavigating ? 'animate-ping' : 'animate-pulse'}`}></div>
            <h1 className="text-white font-black text-xl tracking-tighter uppercase italic">Aero Co-Pilot</h1>
          </div>
          
          <div className="mt-8 space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Rider Orientation</p>
                <p className="text-white font-mono text-[10px]">{Math.round(riderBearing)}°</p>
              </div>
              
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                <input 
                  type="range" 
                  min="0" 
                  max="360" 
                  value={Math.round(riderBearing)} 
                  onChange={(e) => setRiderBearing(parseInt(e.target.value))}
                  className="w-full accent-[#FF5D8F]"
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold mb-1">Latitude</p>
                    <p className="text-white font-mono text-xs tabular-nums">{riderPosition.latitude.toFixed(5)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-widest text-zinc-600 font-bold mb-1">Longitude</p>
                    <p className="text-white font-mono text-xs tabular-nums">{riderPosition.longitude.toFixed(5)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold px-1">Simulator Layer</p>
              
              <button
                onClick={() => setIsDropMode(!isDropMode)}
                className={`
                  w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-500
                  ${isDropMode 
                    ? 'bg-[#FF5D8F] border-white/20 shadow-[0_0_30px_rgba(255,93,143,0.3)] text-white' 
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}
                `}
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="font-black text-xs uppercase tracking-tight">Drop Point</span>
                </div>
                <div className={`text-[9px] font-black uppercase ${isDropMode ? 'text-white' : 'text-zinc-600'}`}>
                  {isDropMode ? 'Live' : 'Standby'}
                </div>
              </button>

              {isDropMode && (
                <div className="flex gap-2 animate-in zoom-in-95 duration-200">
                  <button 
                    onClick={() => setActivePinType('hazard')}
                    className={`flex-1 py-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all
                      ${activePinType === 'hazard' ? 'bg-[#FF5D8F]/20 border-[#FF5D8F] text-[#FF5D8F] shadow-[0_0_15px_rgba(255,93,143,0.2)]' : 'bg-white/5 border-white/5 text-zinc-600'}
                    `}
                  >
                    Hazard
                  </button>
                  <button 
                    onClick={() => setActivePinType('friend')}
                    className={`flex-1 py-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all
                      ${activePinType === 'friend' ? 'bg-[#C084FC]/20 border-[#C084FC] text-[#C084FC] shadow-[0_0_15px_rgba(192,132,252,0.2)]' : 'bg-white/5 border-white/5 text-zinc-600'}
                    `}
                  >
                    Friend
                  </button>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-white/5 flex justify-between">
              <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-600">Active Pins</span>
              <span className="text-white font-mono text-[10px]">{pins.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 right-6 z-10 flex gap-4">
        <div className="bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl shadow-xl">
          <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold mb-0.5">Engine Status</p>
          <p className="text-emerald-400 font-mono text-[10px] leading-none">OPERATIONAL</p>
        </div>
      </div>
    </div>
  );
}
