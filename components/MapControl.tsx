'use client';

import React, { useState, useEffect, useRef } from 'react';
import Map, { Marker, Source, Layer, MapRef, Popup } from 'react-map-gl/mapbox';
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
  const [selectedPin, setSelectedPin] = useState<any | null>(null);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);
  const [visitedPins, setVisitedPins] = useState<Set<string>>(new Set());
  const [isCreatingPin, setIsCreatingPin] = useState<{ lng: number, lat: number } | null>(null);
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'preview' | 'transcribing' | 'finished'>('idle');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedAudio_id, setUploadedAudio_id] = useState<string | null>(null);
  const [newPinText, setNewPinText] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

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
  
  const playVoice = async (id: string, text: string, type: 'ai' | 'original', audioId?: string) => {
    if (isPlaying) return;
    setIsPlaying(id + '-' + type);
    try {
      let audioUrl: string;
      
      if (type === 'original' && audioId) {
        // Play ACTUAL voice from R2
        audioUrl = `${WORKER_URL}/api/audio/${audioId}`;
        console.log('🔗 Playing original voice from R2:', audioUrl);
      } else {
        // Play AI voice from ElevenLabs proxy
        const resp = await fetch(`/api/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text })
        });
        
        if (!resp.ok) {
          const errorData = await resp.json();
          throw new Error(errorData.error || 'TTS failed');
        }
        
        const blob = await resp.blob();
        audioUrl = URL.createObjectURL(blob);
      }
      
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPlaying(null);
      await audio.play();
    } catch (err) {
      console.error('Audio playback failed', err);
      setIsPlaying(null);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/mpeg' });
        setAudioBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        setRecordingState('preview');
      };
      
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecordingState('recording');
    } catch (err) {
      console.error('Recording failed', err);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
  };

  const handleCreatePin = async () => {
    if (!isCreatingPin || !audioBlob) return;
    setRecordingState('transcribing');

    let audio_id = null;
    let transcription = '';

    // 1. Upload audio & Get transcription (ONE STEP)
    try {
      const uploadResp = await fetch(`${WORKER_URL}/api/upload`, {
        method: 'POST',
        body: audioBlob
      });
      if (uploadResp.ok) {
        const data = await uploadResp.json();
        audio_id = data.audio_id;
        transcription = data.transcription;
        console.log('✅ Audio uploaded to R2, ID:', audio_id);
      }
    } catch (err) {
      console.error('Final upload failed', err);
    }

    // 2. Create the pin
    const pinRequest = {
      longitude: isCreatingPin.lng,
      latitude: isCreatingPin.lat,
      text: transcription || 'Voice Message',
      author: 'Rider',
      audio_id: audio_id
    };

    try {
      const resp = await fetch(`${WORKER_URL}/api/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pinRequest)
      });
      
      if (resp.ok) {
        const savedPin = await resp.json();
        console.log('Pin Saved successfully:', savedPin);
        setPins(prev => [...prev, savedPin]);
      }
    } catch (err) {
      console.error('Failed to save pin', err);
    }

    setIsCreatingPin(null);
    setAudioBlob(null);
    setPreviewUrl(null);
    setUploadedAudio_id(null);
    setRecordingState('idle');
  };

  const handleSummarize = async () => {
    if (pins.length === 0 || isPlaying) return;
    setIsPlaying('summary');
    
    try {
      // 1. Get the summary script from Worker AI
      const sumResp = await fetch(`${WORKER_URL}/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pins })
      });
      
      if (!sumResp.ok) {
        const errorData = await sumResp.json();
        throw new Error(errorData.error || 'Summarization failed');
      }
      const { script } = await sumResp.json();
      
      // 2. Play it via ElevenLabs
      const resp = await fetch(`/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: script })
      });
      
      if (!resp.ok) throw new Error('TTS failed');
      const audioBlob = await resp.blob();
      const audio = new Audio(URL.createObjectURL(audioBlob));
      audio.onended = () => setIsPlaying(null);
      await audio.play();
    } catch (err) {
      console.error('Regional summary failed', err);
      setIsPlaying(null);
    }
  };

  // 🛰️ PROXIMITY ENGINE: Auto-trigger audio when near pins
  useEffect(() => {
    if (isPlaying || pins.length === 0) return;

    for (const pin of pins) {
      if (visitedPins.has(pin.id)) continue;

      const riderPoint = turf.point([riderPosition.longitude, riderPosition.latitude]);
      const pinPoint = turf.point([pin.longitude, pin.latitude]);
      const distance = turf.distance(riderPoint, pinPoint, { units: 'meters' });

      // Trigger zone: 100 meters
      if (distance < 100) {
        setVisitedPins(prev => new Set(prev).add(pin.id));
        // playVoice signature: (id: string, text: string, type: 'ai' | 'original', audioId?: string)
        if (pin.audio_id) {
          playVoice(pin.id, pin.text, 'original', pin.audio_id);
        } else {
          playVoice(pin.id, pin.summary || pin.text, 'ai');
        }
        break; // Only play one at a time
      }
    }
  }, [riderPosition, pins, visitedPins, isPlaying]);

  const handleMapClick = async (evt: any) => {
    const { lng, lat } = evt.lngLat;
    
    if (isDropMode) {
      setIsCreatingPin({ lng, lat });
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
          <Marker 
            key={pin.id} 
            longitude={pin.longitude} 
            latitude={pin.latitude} 
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setSelectedPin(pin);
            }}
          >
            <div className="cursor-pointer">
              <svg viewBox="0 0 100 100" className={`w-10 h-10 drop-shadow-2xl transition-all duration-300 ${selectedPin?.id === pin.id ? 'scale-125' : 'hover:scale-110'}`}>
                <path d="M50 0 C30 0 15 15 15 35 C15 60 50 100 50 100 C50 100 85 60 85 35 C85 15 70 0 50 0 Z" fill={pin.type === 'hazard' ? '#FF5D8F' : '#C084FC'} />
                <circle cx="50" cy="35" r="10" fill="white" fillOpacity="0.8" />
              </svg>
            </div>
          </Marker>
        ))}

        {selectedPin && (
          <Popup
            longitude={selectedPin.longitude}
            latitude={selectedPin.latitude}
            anchor="bottom"
            onClose={() => setSelectedPin(null)}
            closeButton={false}
            className="pin-popup"
            offset={45}
          >
            <div className="bg-[#0A0A0A]/95 backdrop-blur-2xl p-6 rounded-2xl border border-white/10 shadow-3xl w-64 animate-in zoom-in-95 fade-in-0 duration-300 overflow-hidden relative group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#FF5D8F] to-transparent opacity-50"></div>
              
              <div className="flex items-center justify-between mb-4">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-2xl border bg-[#FF5D8F]/10 border-[#FF5D8F]/30 text-[#FF5D8F]">
                  {selectedPin.type}
                </span>
                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">
                  {new Date(selectedPin.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              
              <h3 className="text-white text-xl font-black leading-tight mb-6 tracking-tight">
                {selectedPin.title && selectedPin.title.length < 50 ? selectedPin.title : (selectedPin.text.length > 30 ? selectedPin.text.substring(0, 30) + '...' : selectedPin.text)}
              </h3>
              
              <div className="flex gap-2">
                {selectedPin.audio_id && (
                  <button
                    onClick={() => playVoice(selectedPin.id, selectedPin.text, 'original', selectedPin.audio_id)}
                    disabled={isPlaying !== null}
                    className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl border transition-all duration-500 ${isPlaying === selectedPin.id + '-original' ? 'bg-[#FF5D8F] border-transparent text-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                  >
                    {isPlaying === selectedPin.id + '-original' ? (
                       <div className="flex gap-1 items-center">
                         <div className="w-1.2 h-1.2 bg-white rounded-full animate-bounce" />
                         <span className="text-[10px] font-black uppercase">Playing</span>
                       </div>
                    ) : ( 
                       <div className="flex items-center gap-2">
                         <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                         <span className="text-[10px] font-black uppercase tracking-wider">Play</span>
                       </div>
                    )}
                  </button>
                )}

                <button
                  onClick={() => playVoice(selectedPin.id, selectedPin.summary || selectedPin.text, 'ai')}
                  disabled={isPlaying !== null}
                  className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl border transition-all duration-300 ${isPlaying === selectedPin.id + '-ai' ? 'bg-[#FF5D8F] border-transparent text-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20 disabled:opacity-50'}`}
                >
                  {isPlaying === selectedPin.id + '-ai' ? (
                    <div className="flex gap-1 items-center">
                       <span className="text-[10px] font-black uppercase animate-pulse">Summary...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                       <span className="text-[10px] font-black uppercase tracking-wider">Summary</span>
                    </div>
                  )}
                </button>
              </div>
            </div>
          </Popup>
        )}
      </Map>

      {isCreatingPin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 animate-in fade-in duration-300">
          <div className="bg-[#0A0A0A] border border-white/10 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
            <div className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-white font-black text-xl uppercase tracking-tighter">Record</h2>
                  <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">Aero Co-Pilot Voice Engine</p>
                </div>
                <button onClick={() => setIsCreatingPin(null)} className="p-2 -mr-2 text-zinc-600 hover:text-white transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="h-40 bg-zinc-900/50 border border-white/5 rounded-2xl flex flex-col items-center justify-center p-6 text-center relative overflow-hidden transition-all duration-500">
                {recordingState === 'idle' && (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-600">
                       <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                    </div>
                    <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Ready to Capture</p>
                  </div>
                )}
                
                {recordingState === 'recording' && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#FF5D8F]/20 animate-pulse">
                      <div className="w-6 h-6 bg-[#FF5D8F] rounded-full" />
                    </div>
                    <p className="text-[#FF5D8F] text-[10px] font-bold uppercase tracking-widest">Recording Live</p>
                  </div>
                )}

                {recordingState === 'preview' && (
                  <div className="flex flex-col items-center gap-4">
                    <button 
                      onClick={() => { const a = new Audio(previewUrl!); a.play(); }}
                      className="w-14 h-14 rounded-full bg-[#FF5D8F] text-white flex items-center justify-center shadow-lg shadow-[#FF5D8F]/20 hover:scale-110 active:scale-95 transition-all"
                    >
                       <svg className="w-6 h-6 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    <p className="text-[#FF5D8F] text-[10px] font-bold uppercase tracking-widest">Preview Recording</p>
                  </div>
                )}

                {recordingState === 'transcribing' && (
                  <div className="flex flex-col items-center gap-4">
                    <svg className="w-8 h-8 text-[#FF5D8F] animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M12 4V2m0 20v-2m8-8h2M2 12h2" /></svg>
                    <p className="text-white text-[10px] font-bold uppercase tracking-widest">AI Analysis</p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3">
                {recordingState === 'idle' ? (
                  <button 
                    onClick={startRecording}
                    className="w-full py-4 bg-[#FF5D8F] hover:bg-[#FF7DA5] text-white font-bold text-[11px] uppercase tracking-widest rounded-2xl transition-all active:scale-95"
                  >
                    Start Recording
                  </button>
                ) : recordingState === 'recording' ? (
                  <button 
                    onClick={stopRecording}
                    className="w-full py-4 bg-white text-black font-bold text-[11px] uppercase tracking-widest rounded-2xl transition-all active:scale-95"
                  >
                    Stop & Listen
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={handleCreatePin}
                      className="w-full py-4 bg-[#FF5D8F] text-white hover:bg-[#FF7DA5] font-bold text-[11px] uppercase tracking-widest rounded-2xl transition-all active:scale-95"
                    >
                      Confirm Drop
                    </button>
                    <button 
                      onClick={() => { setAudioBlob(null); setPreviewUrl(null); setRecordingState('idle'); }}
                      className="w-full py-3 text-zinc-500 hover:text-white transition-all font-bold text-[10px] uppercase tracking-widest"
                    >
                      Delete & Restart
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main UI Controls: Bottom Right */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col items-end gap-6 pointer-events-none">
        <button 
          onClick={() => setIsDropMode(!isDropMode)} 
          className={`pointer-events-auto h-14 w-14 flex items-center justify-center rounded-2xl shadow-2xl transition-all duration-500 active:scale-95 group relative ${isDropMode ? 'bg-white text-black rotate-45' : 'bg-[#FF5D8F] text-white hover:bg-[#FF7DA5]'}`}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
            <path d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {!isSidebarOpen && (
        <div className="absolute top-6 right-6 z-20 animate-in zoom-in-50 duration-500">
          <button onClick={() => setIsSidebarOpen(true)} className="bg-black/95 backdrop-blur-3xl border border-white/10 p-4 rounded-2xl shadow-2xl text-white/80 hover:text-[#FF5D8F] transition-all">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      )}

      <div className={`absolute top-6 right-6 z-10 w-72 h-[calc(100vh-3rem)] pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isSidebarOpen ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0'}`}>
        <div className="bg-black/95 backdrop-blur-3xl border border-white/10 h-full rounded-2xl shadow-2xl relative flex flex-col pointer-events-auto overflow-hidden">
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
                  <button onClick={() => setIsDevMode(!isDevMode)} className={`w-10 h-5 rounded-2xl relative transition-colors ${isDevMode ? 'bg-[#FF5D8F]' : 'bg-white/10'}`}>
                    <div className={`absolute top-1 left-1 w-3 h-3 rounded-2xl bg-white transition-transform ${isDevMode ? 'translate-x-5' : ''}`}></div>
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
                <div className={`w-2 h-2 rounded-2xl bg-[#FF5D8F] ${isNavigating ? 'animate-ping' : 'opacity-40'}`}></div>
              </div>
              <div className="space-y-3">
                <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold px-1 text-[9px]">Simulation Layer</p>
                
                <button 
                  onClick={handleSummarize} 
                  disabled={pins.length === 0 || isPlaying !== null}
                  className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${isPlaying === 'summary' ? 'bg-[#FF5D8F] text-white border-white/20' : 'bg-white/5 border-white/10 text-zinc-400 disabled:opacity-30'}`}
                >
                  <div className="flex items-center gap-3">
                    {isPlaying === 'summary' ? (
                       <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    ) : (
                       <svg className="w-5 h-5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0012 18.75c-1.03 0-1.9-.4-2.524-1.047l-.548-.547z" /></svg>
                    )}
                    <span className="font-bold text-xs uppercase">{isPlaying === 'summary' ? 'Co-Pilot Thinking...' : 'Region Summary'}</span>
                  </div>
                </button>

                <button onClick={() => setIsDropMode(!isDropMode)} className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${isDropMode ? 'bg-[#FF5D8F] text-white border-white/20' : 'bg-white/5 border-white/10 text-zinc-400'}`}>
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <span className="font-bold text-xs uppercase">Drop Marker</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
          {isDevMode && (
            <div className="p-8 border-t border-white/10 bg-black/40 rounded-b-2xl">
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
