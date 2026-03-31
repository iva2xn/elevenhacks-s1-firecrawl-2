'use client';

import React, { useState, useEffect, useRef } from 'react';
import Map, { Marker, Source, Layer, MapRef } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as turf from '@turf/turf';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

export default function MapControl() {
  const mapRef = useRef<MapRef>(null);

  const [viewState, setViewState] = useState({
    longitude: -122.4,
    latitude: 37.8,
    zoom: 14,
    pitch: 0,
    bearing: 0
  });

  const [riderPosition, setRiderPosition] = useState({
    longitude: -122.4,
    latitude: 37.8
  });
  const [riderBearing, setRiderBearing] = useState(0);
  const [routeData, setRouteData] = useState<any>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [currentInstruction, setCurrentInstruction] = useState<string | null>(null);
  
  // Sidebar & Dev Mode State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDevMode, setIsDevMode] = useState(false);
  
  // Travel Speed sync for real-time improvements
  const travelSpeedRef = useRef(0.001);
  const [travelSpeed, _setTravelSpeed] = useState(0.001);
  const setTravelSpeed = (val: number) => {
    _setTravelSpeed(val);
    travelSpeedRef.current = val;
  };

  const [targetWaypoint, setTargetWaypoint] = useState<[number, number] | null>(null);

  const [pins, setPins] = useState<any[]>([]);
  const [isDropMode, setIsDropMode] = useState(false);
  const [activePinType, setActivePinType] = useState('hazard');

  const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_API_URL || 'http://localhost:8787';

  // Fetch pins on load
  useEffect(() => {
    const loadPins = async () => {
      try {
        const resp = await fetch(`${WORKER_URL}/api/pins`);
        if (resp.ok) {
          const data = await resp.json();
          setPins(data);
        }
      } catch (err) {
        console.warn('Backend not detected, running in simulation mode');
      }
    };
    loadPins();
  }, [WORKER_URL]);

  // Refs for high-performance, synchronous animation tracking
  const riderRef = useRef({
    longitude: -122.4,
    latitude: 37.8,
    bearing: 0
  });

  const fetchRoute = async (start: [number, number], end: [number, number]) => {
    try {
      const resp = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&steps=true&access_token=${MAPBOX_TOKEN}`
      );
      const data = await resp.json();
      if (data.routes && data.routes.length > 0) {
        return {
          geometry: data.routes[0].geometry,
          steps: data.routes[0].legs[0].steps
        };
      }
    } catch (err) {
      console.error('Failed to fetch route', err);
    }
    return null;
  };

  const animateRider = async (routeInfo: any) => {
    const { geometry, steps } = routeInfo;
    const line = turf.lineString(geometry.coordinates);
    const distanceMeter = turf.length(line, { units: 'kilometers' });
    let currentDist = 0;
    
    // Store previous view state to return to
    const preNavZoom = viewState.zoom;
    const preNavPitch = viewState.pitch;

    setIsNavigating(true);

    const firstPoint = geometry.coordinates[0];
    const secondPoint = geometry.coordinates[1] || firstPoint;
    const initialBearing = turf.bearing(turf.point(firstPoint), turf.point(secondPoint));
    const startPos = { longitude: riderPosition.longitude, latitude: riderPosition.latitude };
    const startBearing = riderRef.current.bearing;

    // 1. CINEMATIC SYNC: Glide & Rotate Rider WHILE FlyTo Camera
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [firstPoint[0], firstPoint[1]],
        zoom: 19,
        pitch: 65,
        bearing: initialBearing,
        duration: 2500,
        essential: true
      });
    }

    const syncDuration = 2500;
    const startTime = performance.now();

    const syncLoop = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / syncDuration, 1);
      
      const currentLon = startPos.longitude + (firstPoint[0] - startPos.longitude) * progress;
      const currentLat = startPos.latitude + (firstPoint[1] - startPos.latitude) * progress;
      
      let bDiff = initialBearing - startBearing;
      if (bDiff > 180) bDiff -= 360;
      if (bDiff < -180) bDiff += 360;
      const currentBearing = startBearing + bDiff * progress;

      const pos = { longitude: currentLon, latitude: currentLat };
      setRiderPosition(pos);
      setRiderBearing(currentBearing);
      riderRef.current = { longitude: currentLon, latitude: currentLat, bearing: currentBearing };

      if (progress < 1) {
        requestAnimationFrame(syncLoop);
      }
    };
    requestAnimationFrame(syncLoop);
    
    // Wait for the sync animation to complete
    await new Promise(r => setTimeout(r, 2500));

    const step = () => {
      if (currentDist >= distanceMeter) {
        setIsNavigating(false);
        setRouteData(null);
        setTargetWaypoint(null);
        setCurrentInstruction(null);
        if (mapRef.current) {
          mapRef.current.flyTo({ pitch: preNavPitch, bearing: 0, zoom: preNavZoom, duration: 2500 });
        }
        return;
      }

      // USE REF FOR REAL-TIME SPEED CHANGES (Ultra-Fine Multiplier)
      currentDist += travelSpeedRef.current;
      const point = turf.along(line, currentDist, { units: 'kilometers' });
      const lookAheadDist = Math.min(currentDist + 0.005, distanceMeter);
      const nextPoint = turf.along(line, lookAheadDist, { units: 'kilometers' });
      
      const targetBearing = turf.bearing(
        turf.point(point.geometry.coordinates),
        turf.point(nextPoint.geometry.coordinates)
      );

      // SMOOTH RIDER ROTATION
      let bDiff = targetBearing - riderRef.current.bearing;
      if (bDiff > 180) bDiff -= 360;
      if (bDiff < -180) bDiff += 360;
      riderRef.current.bearing += bDiff * 0.12; 

      const newPos = {
        longitude: point.geometry.coordinates[0],
        latitude: point.geometry.coordinates[1]
      };
      
      riderRef.current.longitude = newPos.longitude;
      riderRef.current.latitude = newPos.latitude;

      setRiderPosition(newPos);
      setRiderBearing(riderRef.current.bearing);

      // SMOOTH CAMERA CHASE (Softer lerp: 0.05 for weighted feel)
      setViewState(prev => {
        const lonDiff = newPos.longitude - prev.longitude;
        const latDiff = newPos.latitude - prev.latitude;
        const bViewDiff = riderRef.current.bearing - prev.bearing;

        return {
          ...prev,
          longitude: prev.longitude + lonDiff * 0.05, 
          latitude: prev.latitude + latDiff * 0.05,
          bearing: prev.bearing + (bViewDiff > 180 ? bViewDiff - 360 : bViewDiff < -180 ? bViewDiff + 360 : bViewDiff) * 0.05
        };
      });

      // Current Instruction Logic
      let cumulativeDist = 0;
      for (const s of steps) {
        cumulativeDist += s.distance / 1000;
        if (cumulativeDist > currentDist) {
          setCurrentInstruction(s.name || s.maneuver.instruction);
          break;
        }
      }

      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  };

  const handleMapClick = async (evt: any) => {
    const { lng, lat } = evt.lngLat;
    
    if (isDropMode) {
      const userText = window.prompt('Enter pin details (AI will classify this):', activePinType === 'hazard' ? 'Hazard detected' : 'Friend signal here');
      
      if (!userText) {
        setIsDropMode(false);
        return;
      }

      const pinRequest = {
        longitude: lng,
        latitude: lat,
        text: userText,
        author: 'Rider'
      };

      try {
        const resp = await fetch(`${WORKER_URL}/api/pins`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pinRequest)
        });
        
        if (resp.ok) {
          const savedPin = await resp.json();
          setPins(prev => [...prev, savedPin]);
        } else {
          // Fallback if worker isn't running
          setPins(prev => [...prev, { ...pinRequest, id: Date.now(), type: activePinType }]);
        }
      } catch (err) {
        // Fallback for local simulation
        setPins(prev => [...prev, { ...pinRequest, id: Date.now(), type: activePinType }]);
      }
      setIsDropMode(false);
    } else {
      if (isNavigating) return;
      
      if (isDevMode) {
        const routeInfo = await fetchRoute(
          [riderPosition.longitude, riderPosition.latitude],
          [lng, lat]
        );
        if (routeInfo) {
          setRouteData({ type: 'Feature', geometry: routeInfo.geometry });
          animateRider(routeInfo);
        }
      } else {
        setTargetWaypoint([lng, lat]);
      }
    }
  };

  useEffect(() => {
    if (isDevMode && targetWaypoint && !isNavigating) {
      const triggerMove = async () => {
        const routeInfo = await fetchRoute(
          [riderPosition.longitude, riderPosition.latitude],
          targetWaypoint
        );
        if (routeInfo) {
          setRouteData({ type: 'Feature', geometry: routeInfo.geometry });
          animateRider(routeInfo);
        }
      };
      triggerMove();
    }
  }, [isDevMode, targetWaypoint, isNavigating]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#0A0A0A] text-white p-8 text-center border-t">
        <div>
          <h2 className="text-2xl font-bold mb-4 uppercase">Mapbox Token Missing</h2>
          <p className="text-zinc-500 mb-6">Add <code>NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to your <code>.env.local</code></p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#0A0A0A]">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        onClick={handleMapClick}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        cursor={isDropMode ? "cell" : "crosshair"}
      >
        <Layer
          id="3d-buildings"
          source="composite"
          source-layer="building"
          filter={['==', 'extrude', 'true']}
          type="fill-extrusion"
          minzoom={16.5}
          paint={{
            'fill-extrusion-color': '#FFFFFF',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.4
          }}
        />

        <Layer
          id="sky"
          type="sky"
          paint={{
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 0.0],
            'sky-atmosphere-sun-intensity': 15
          }}
        />

        {routeData && (
          <Source id="route-path" type="geojson" data={routeData}>
            <Layer id="line-glow" type="line" paint={{ 'line-color': '#FF5D8F', 'line-width': 12, 'line-blur': 10, 'line-opacity': 0.3 }} />
            <Layer id="line-layer" type="line" paint={{ 'line-color': '#FF5D8F', 'line-width': 6, 'line-opacity': 1.0 }} />
          </Source>
        )}

        {currentInstruction && (
          <Marker longitude={riderPosition.longitude} latitude={riderPosition.latitude} anchor="bottom" offset={[0, -60]}>
            <div className="bg-[#FF5D8F] text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in zoom-in slide-in-from-bottom-2 duration-300 border border-white/20">
              <span className="font-bold text-sm tracking-tight capitalize">{currentInstruction}</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                <path d="M12 19V5m0 0l-7 7m7-7l7 7" />
              </svg>
            </div>
            <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-[#FF5D8F] mx-auto mt-[-1px]"></div>
          </Marker>
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
          rotationAlignment="map"
          rotation={riderBearing}
        >
          <div className="relative transition-transform duration-75 ease-linear">
            <div className="w-12 h-12 flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-10 h-10 drop-shadow-md relative z-10">
                <path d="M50 10 L85 85 L50 70 L15 85 Z" fill="#FF5D8F" />
              </svg>
            </div>
          </div>
        </Marker>

        {pins.map(pin => (
          <Marker key={pin.id} longitude={pin.longitude} latitude={pin.latitude} anchor="bottom">
            <svg viewBox="0 0 100 100" className="w-10 h-10 drop-shadow-2xl transition-transform hover:scale-110">
              <path d="M50 0 C30 0 15 15 15 35 C15 60 50 100 50 100 C50 100 85 60 85 35 C85 15 70 0 50 0 Z" fill={pin.type === 'hazard' ? '#FF5D8F' : '#C084FC'} />
              <circle cx="50" cy="35" r="10" fill="white" fillOpacity="0.8" />
            </svg>
          </Marker>
        ))}
      </Map>

      {!isSidebarOpen && (
        <div className="absolute top-6 right-6 z-20 animate-in zoom-in-50 duration-500">
          <button onClick={() => setIsSidebarOpen(true)} className="bg-black/95 backdrop-blur-3xl border border-white/10 p-4 rounded-[1.5rem] shadow-2xl text-white/80 hover:text-[#FF5D8F] transition-all">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      )}

      <div className={`absolute top-6 right-6 z-10 w-72 h-[calc(100vh-3rem)] pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isSidebarOpen ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0'}`}>
        <div className="bg-black/95 backdrop-blur-3xl border border-white/10 h-full rounded-[2.5rem] shadow-2xl relative flex flex-col pointer-events-auto overflow-hidden">
          <div className="p-8 flex-1 overflow-y-auto no-scrollbar">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/10">
              <h1 className="text-white font-bold text-xl uppercase tracking-tight">Settings</h1>
              <button onClick={() => setIsSidebarOpen(false)} className="text-white/40 hover:text-[#FF5D8F] transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-6">
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
                  <div className="p-4 bg-white/5 rounded-2xl border border-white/10 space-y-4 animate-in slide-in-from-top-4">
                    <div className="flex justify-between items-center px-1">
                      <p className="text-[9px] uppercase tracking-widest text-[#FF5D8F] font-bold">Travel Speed</p>
                      <p className="text-[10px] font-mono text-white">{travelSpeed.toFixed(4)}x</p>
                    </div>
                    <input type="range" min="0.0005" max="0.5" step="0.0001" value={travelSpeed} onChange={(e) => setTravelSpeed(parseFloat(e.target.value))} className="w-full accent-[#FF5D8F]" />
                  </div>
                )}
              </div>
              <div className="h-px bg-white/5" />
              <div className="p-4 bg-[#FF5D8F]/10 rounded-2xl border border-[#FF5D8F]/20 flex justify-between items-center">
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
                    <button onClick={() => setActivePinType('hazard')} className={`flex-1 py-3 rounded-xl border text-[9px] font-black uppercase transition-all ${activePinType === 'hazard' ? 'bg-[#FF5D8F]/20 border-[#FF5D8F] text-[#FF5D8F]' : 'bg-white/5 border-white/10 text-zinc-600'}`}>Hazard</button>
                    <button onClick={() => setActivePinType('friend')} className={`flex-1 py-3 rounded-xl border text-[9px] font-black uppercase transition-all ${activePinType === 'friend' ? 'bg-[#C084FC]/20 border-[#C084FC] text-[#C084FC]' : 'bg-white/5 border-white/10 text-zinc-600'}`}>Friend</button>
                  </div>
                )}
              </div>
            </div>
          </div>
          {isDevMode && (
            <div className="p-8 border-t border-white/10 bg-black/40 rounded-b-[2.5rem]">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-[#FF5D8F]">
                <span>Active Marks</span>
                <span className="text-white font-mono">{pins.length + (targetWaypoint ? 1 : 0)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
