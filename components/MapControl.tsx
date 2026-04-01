'use client';

import React, { useState, useEffect, useRef } from 'react';
import Map, { Marker, Source, Layer, MapRef, Popup } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as turf from '@turf/turf';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';
const ELEVENLABS_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || '';

const MOCK_RIDERS = [
  { id: 'rider-aero', name: 'Aero Co-Pilot', handle: '@aero', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Aero' },
  { id: 'rider-mia', name: 'Mia', handle: '@ride_mia', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Mia' }
];

export default function MapControl() {
  const mapRef = useRef<MapRef>(null);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileHandle, setProfileHandle] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'friends' | 'settings'>('profile');
  const [friendsList, setFriendsList] = useState<string[]>([]);
  const [isGroupOnly, setIsGroupOnly] = useState(false);

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
  const [useScout, setUseScout] = useState(true);
  const [routeIntel, setRouteIntel] = useState<string | null>(null);
  const [commsState, setCommsState] = useState<'off' | 'connecting' | 'on'>('off');
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const convRef = useRef<any>(null);
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
        console.warn('Backend not detected');
      }
    };
    
    const initializeUser = async () => {
      const savedId = localStorage.getItem('aero_rider_id');
      if (savedId) {
        const user = {
          id: savedId,
          name: localStorage.getItem('aero_rider_name') || 'Rider',
          handle: localStorage.getItem('aero_rider_handle') || '@rider',
          avatar_url: localStorage.getItem('aero_rider_avatar') || `https://api.dicebear.com/7.x/avataaars/svg?seed=${savedId}`
        };
        setCurrentUser(user);
        setProfileName(user.name);
        setProfileHandle(user.handle);
        syncProfile(user);
      } else {
        const randId = 'rider-' + Math.random().toString(36).substring(2, 9);
        const randName = 'Rider-' + Math.floor(1000 + Math.random() * 9000);
        const newUser = {
          id: randId,
          name: randName,
          handle: '@' + randName.toLowerCase(),
          avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${randId}`
        };
        setCurrentUser(newUser);
        setProfileName(newUser.name);
        setProfileHandle(newUser.handle);
        setIsOnboarding(true);
      }
    };

    const syncProfile = async (user: any) => {
      try {
        await fetch(`${WORKER_URL}/api/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(user)
        });

        const res = await fetch(`${WORKER_URL}/api/friends/${user.id}`);
        if (res.ok) {
          const list = await res.json();
          setFriendsList(list);
        }
      } catch (err) {
        console.warn('Sync failed');
      }
    };

    loadPins();
    initializeUser();
  }, [WORKER_URL]);

  const handleUpdateProfile = async () => {
    if (!currentUser) return;
    const updatedUser = {
      ...currentUser,
      name: profileName,
      handle: profileHandle.startsWith('@') ? profileHandle : '@' + profileHandle
    };
    setCurrentUser(updatedUser);
    localStorage.setItem('aero_rider_name', updatedUser.name);
    localStorage.setItem('aero_rider_handle', updatedUser.handle);
    localStorage.setItem('aero_rider_avatar', updatedUser.avatar_url);
    
    try {
      await fetch(`${WORKER_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedUser)
      });
      setIsSidebarOpen(false);
    } catch (err) {
      console.error('Update failed');
    }
  };

  const handleRandomizeAvatar = () => {
    if (!currentUser) return;
    const newSeed = Math.random().toString(36).substring(7);
    const updatedUser = {
      ...currentUser,
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${newSeed}`
    };
    setCurrentUser(updatedUser);
  };

  const handleFinishOnboarding = () => {
    localStorage.setItem('aero_rider_id', currentUser.id);
    localStorage.setItem('aero_rider_name', currentUser.name);
    localStorage.setItem('aero_rider_handle', currentUser.handle);
    localStorage.setItem('aero_rider_avatar', currentUser.avatar_url);
    setIsOnboarding(false);
    // Force immediate sync
    fetch(`${WORKER_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentUser)
    });
  };

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
        // Play AI voice from ElevenLabs directly
        const resp = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': ELEVENLABS_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text,
              model_id: 'eleven_multilingual_v2',
              voice_settings: { stability: 0.45, similarity_boost: 0.8 },
            }),
          }
        );
        
        if (!resp.ok) {
          throw new Error('ElevenLabs TTS failed: ' + resp.status);
        }
        
        const blob = await resp.blob();
        audioUrl = URL.createObjectURL(blob);
      }
      
      const audio = new Audio(audioUrl);
      audio.playbackRate = 1.15;
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
      author_id: currentUser.id,
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

  const handleFollow = async (friendId: string) => {
    try {
      if (!currentUser?.id) return;
      await fetch(`${WORKER_URL}/api/friends`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, friend_id: friendId })
      });
      setFriendsList(prev => Array.from(new Set([...prev, friendId])));
    } catch (err) {
      console.error('Follow failed', err);
    }
  };

  const handleToggleComms = async (contextOverride?: string) => {
    if (commsState === 'on' || commsState === 'connecting') {
      if (convRef.current) {
        convRef.current.close();
      }
      setCommsState('off');
      return;
    }

    setCommsState('connecting');
    try {
      const AGENT_ID = 'agent_8501kn3j7kj4emxbgtj1rvafr0r1';
      const socket = new WebSocket(`wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${AGENT_ID}`);
      
      socket.onopen = () => {
        console.log('📡 Comms Uplink Established');
        setCommsState('on');
        
        // Prime with intelligence using correct protocol
        const intel = contextOverride || routeIntel;
        if (intel) {
          socket.send(JSON.stringify({
            type: 'conversation_initiation_client_data',
            conversation_config_override: {
              agent: {
                prompt: {
                  prompt: `You are the Aero Tactical Scout, a motorcycle co-pilot AI. You have received the following real-time intelligence briefing about the rider's current route. Deliver this briefing conversationally and concisely. Focus on safety-critical information first (hazards, weather, road conditions), then tactical advantages. Be direct and professional.\n\nROUTE INTELLIGENCE:\n${intel}`
                },
                first_message: 'Scout online. I have your route intel — here is your tactical briefing.'
              }
            }
          }));
          console.log('🛰️ Intel primed to agent:', intel.substring(0, 200));
        }
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'agent_response') setIsAgentSpeaking(true);
          if (msg.type === 'agent_response_end') setIsAgentSpeaking(false);
        } catch (e) {
          // Binary audio data, ignore parse errors
        }
      };

      socket.onerror = (err) => {
        console.error('WebSocket error:', err);
        setCommsState('off');
      };

      socket.onclose = () => setCommsState('off');
      convRef.current = socket;
    } catch (err) {
      console.error('Radio failed', err);
      setCommsState('off');
    }
  };

  const filteredPins = pins.filter(p => !isGroupOnly || friendsList.includes(p.author_id) || p.author_id === currentUser.id);

  // 🛰️ PROXIMITY ENGINE: Auto-trigger audio when near pins
  useEffect(() => {
    if (isPlaying || filteredPins.length === 0) return;

    for (const pin of filteredPins) {
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
          playVoice(pin.id, pin.text, 'ai');
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
      return;
    }
    
    if (isNavigating) return;
    
    const startCoords: [number, number] = [riderPosition.longitude, riderPosition.latitude];
    const endCoords: [number, number] = [lng, lat];
    
    // Step 1: Get the route and draw it on the map
    const routeInfo = await fetchRoute(startCoords, endCoords);
    if (!routeInfo) return;
    
    setRouteData({ type: 'Feature', geometry: routeInfo.geometry });
    setTargetWaypoint(endCoords);
    
    // Step 2: Extract street names from route steps
    const steps = routeInfo.steps;
    const streets = steps 
      ? Array.from(new Set(steps.map((s: any) => s.name).filter((n: string) => n && n !== '')))
      : [];
    
    console.log('🛰️ Route plotted. Streets:', streets);
    console.log('📍 From:', startCoords, 'To:', endCoords);
    
    // Step 3: Send to backend — reverse geocode cities, Firecrawl search, LLM summary
    try {
      const reconResp = await fetch(`${WORKER_URL}/api/recon/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          streets, 
          startCoords, 
          endCoords,
          mapboxToken: MAPBOX_TOKEN 
        })
      });
      const reconData = await reconResp.json();
      
      if (reconData.briefing) {
        console.log('📡 BRIEFING:', reconData.briefing);
        console.log('📍 Route:', reconData.startPlace, '→', reconData.endPlace);
        setRouteIntel(reconData.briefing);
        
        // Step 4: Generate voice summary and play it
        try {
          const ttsResp = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM`,
            {
              method: 'POST',
              headers: {
                'xi-api-key': ELEVENLABS_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                text: reconData.briefing,
                model_id: 'eleven_multilingual_v2',
                voice_settings: { stability: 0.45, similarity_boost: 0.8 },
              }),
            }
          );
          if (ttsResp.ok) {
            const blob = await ttsResp.blob();
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            audio.playbackRate = 1.15;
            
            // Wait for voice to finish, then start driving
            await new Promise<void>((resolve) => {
              audio.onended = () => resolve();
              audio.onerror = () => resolve();
              audio.play().catch(() => resolve());
            });
            console.log('🔊 Briefing complete');
          }
        } catch (ttsErr) {
          console.error('TTS failed:', ttsErr);
        }
      } else if (reconData.error) {
        console.error('Recon error:', reconData.error);
      }
    } catch (err) {
      console.error('Recon request failed:', err);
    }
    
    // Step 5: NOW start driving
    setTargetWaypoint(null);
    animateRider(routeInfo);
  };


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

        {filteredPins.map(pin => (
          <Marker 
            key={pin.id} 
            longitude={pin.longitude} 
            latitude={pin.latitude} 
            anchor="bottom"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setSelectedPin(pin);
              // Auto-engage Comms with this pin's context
              if (commsState === 'off') {
                handleToggleComms(pin.text);
              }
            }}
          >
            <div className="relative group cursor-pointer transition-all duration-300 hover:scale-110 active:scale-95">
              <svg viewBox="0 0 100 100" className={`w-11 h-11 drop-shadow-2xl transition-all duration-300 ${selectedPin?.id === pin.id ? 'scale-115' : ''}`}>
                <path d="M50 0 C30 0 15 15 15 35 C15 60 50 100 50 100 C50 100 85 60 85 35 C85 15 70 0 50 0 Z" fill={pin.type === 'hazard' ? '#FF5D8F' : '#C084FC'} />
              </svg>
              {/* Profile Avatar inside Pin */}
              <div className="absolute top-[6px] left-[10.5px] w-[23px] h-[23px] rounded-full overflow-hidden border-[1.5px] border-white/30 bg-black/40">
                 <img 
                   src={pin.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${pin.author_id || pin.id}`} 
                   className="w-full h-full object-cover" 
                   alt="Author"
                 />
              </div>
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
              
              <div className="flex">
                <button
                  onClick={() => playVoice(selectedPin.id, selectedPin.text, selectedPin.audio_id ? 'original' : 'ai', selectedPin.audio_id)}
                  disabled={isPlaying !== null}
                  className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl border transition-all duration-500 ${isPlaying?.startsWith(selectedPin.id) ? 'bg-[#FF5D8F] border-transparent text-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                >
                  {isPlaying?.startsWith(selectedPin.id) ? (
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
              </div>
            </div>
          </Popup>
        )}
      </Map>

      {isCreatingPin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0A0A0A] border border-white/10 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-98 duration-200">
            <div className="p-8 space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-white font-black text-xl uppercase tracking-tighter">Record</h2>
                  <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest mt-1">Aero Co-Pilot Voice Engine</p>
                </div>
                <button onClick={() => setIsCreatingPin(null)} className="p-2 -mr-2 text-zinc-600 hover:text-white transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="flex flex-col items-center justify-center py-4 text-center">
                {recordingState === 'idle' && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500">
                       <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                    </div>
                    <div>
                      <p className="text-white font-black text-lg uppercase tracking-tight">Ready</p>
                      <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Tap below to start</p>
                    </div>
                  </div>
                )}
                
                {recordingState === 'recording' && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center justify-center w-20 h-20 rounded-full bg-[#FF5D8F]/10 border border-[#FF5D8F]/30">
                      <div className="w-8 h-8 bg-[#FF5D8F] rounded-full shadow-[0_0_20px_rgba(255,93,143,0.5)]" />
                    </div>
                    <p className="text-[#FF5D8F] font-black text-lg uppercase tracking-tight">Recording...</p>
                  </div>
                )}
 
                {recordingState === 'preview' && (
                  <div className="flex flex-col items-center gap-4">
                    <button 
                      onClick={() => { const a = new Audio(previewUrl!); a.play(); }}
                      className="w-20 h-20 rounded-full bg-[#FF5D8F] text-white flex items-center justify-center shadow-xl shadow-[#FF5D8F]/20 hover:scale-105 active:scale-95 transition-all"
                    >
                       <svg className="w-8 h-8 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    <p className="text-[#FF5D8F] font-black text-lg uppercase tracking-tight">Review Audio</p>
                  </div>
                )}
 
              {recordingState === 'transcribing' && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-20 h-20 rounded-full border-2 border-[#FF5D8F]/30 flex items-center justify-center">
                      <div className="w-12 h-12 bg-[#FF5D8F]/10 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-[#FF5D8F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M12 4V2m0 20v-2m8-8h2M2 12h2" /></svg>
                      </div>
                    </div>
                    <div>
                      <p className="text-white font-black text-lg uppercase tracking-tight">Recording Voice</p>
                      <p className="text-zinc-500 text-[8px] font-bold uppercase tracking-widest">Processing Tactical Input</p>
                    </div>
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
                      className="w-full py-4 bg-[#FF5D8F] text-white hover:bg-[#FF7DA5] font-bold text-[11px] uppercase tracking-widest rounded-2xl transition-all active:scale-95 shadow-lg shadow-[#FF5D8F]/20"
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

      {/* Onboarding Overlay */}
      {isOnboarding && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-3xl animate-in fade-in duration-500">
          <div className="w-full max-w-sm bg-[#0A0A0A] border border-white/10 rounded-3xl shadow-3xl overflow-hidden p-10 text-center space-y-8 animate-in zoom-in-95 duration-500">
            <div className="space-y-2">
              <h1 className="text-white text-3xl font-black uppercase tracking-tighter">Welcome to Aero</h1>
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Co-Pilot Social Network</p>
            </div>

            <div className="relative mx-auto w-32 h-32">
              <div className="absolute inset-0 bg-white/20 blur-2xl rounded-full"></div>
              <div className="relative w-full h-full rounded-full border-2 border-[#FF5D8F] overflow-hidden bg-zinc-900 shadow-2xl">
                 <img src={currentUser?.avatar_url} className="w-full h-full object-cover" />
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-white text-xl font-bold">{currentUser?.name}</p>
              <p className="text-[#FF5D8F] text-xs font-black uppercase tracking-widest">{currentUser?.handle}</p>
            </div>

            <button 
              onClick={handleFinishOnboarding}
              className="w-full py-5 bg-[#FF5D8F] hover:bg-[#FF7DA5] text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-[#FF5D8F]/20 transition-all active:scale-95"
            >
              Start Riding
            </button>
          </div>
        </div>
      )}

      {/* Main UI Controls: Bottom Right */}
      <div className={`absolute bottom-6 right-6 z-20 flex flex-col items-end gap-5 pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isSidebarOpen ? 'translate-y-24 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100 pointer-events-auto'}`}>
        {currentUser && (
          <button 
            onClick={() => { setActiveTab('profile'); setIsSidebarOpen(true); }}
            className="pointer-events-auto h-14 w-14 rounded-full border-2 border-white/20 bg-zinc-900 overflow-hidden shadow-2xl hover:scale-110 active:scale-95 transition-all shadow-black/50 overflow-hidden"
          >
            <img src={currentUser.avatar_url} className="w-full h-full object-cover" />
          </button>
        )}
        <button 
          onClick={() => setIsDropMode(!isDropMode)} 
          className={`pointer-events-auto h-14 w-14 flex items-center justify-center rounded-2xl shadow-2xl transition-all duration-500 active:scale-95 group relative ${isDropMode ? 'bg-white text-black rotate-45' : 'bg-[#FF5D8F] text-white hover:bg-[#FF7DA5]'}`}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
            <path d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <div className={`absolute top-6 right-6 z-20 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isSidebarOpen ? '-translate-y-12 opacity-0' : 'translate-y-0 opacity-100'}`}>
        <button 
          onClick={() => { setActiveTab('settings'); setIsSidebarOpen(true); }}
          className="bg-black/95 backdrop-blur-3xl border border-white/10 p-4 rounded-2xl shadow-2xl text-white/80 hover:text-[#FF5D8F] transition-all pointer-events-auto"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>

      <div className={`absolute top-6 right-6 z-10 w-80 h-[calc(100vh-3rem)] pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isSidebarOpen ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-12 opacity-0 scale-95'}`}>
        <div className="bg-black/90 backdrop-blur-3xl border border-white/10 h-full rounded-[2.5rem] shadow-4xl relative flex flex-col pointer-events-auto overflow-hidden ring-1 ring-white/5">
          {/* Sidebar Tabs */}
          <div className="flex bg-white/5 p-1.5 mx-8 mt-8 mb-6 rounded-2xl border border-white/10 relative">
             {(['profile', 'friends', 'settings'] as const).map(tab => (
               <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === tab ? 'bg-[#FF5D8F] text-white shadow-lg shadow-[#FF5D8F]/20' : 'text-zinc-500 hover:text-white'}`}
               >
                 {tab}
               </button>
             ))}
             {/* New Sleek Closer */}
             <button 
                onClick={() => setIsSidebarOpen(false)}
                className="absolute -top-3 -right-3 w-8 h-8 flex items-center justify-center bg-black/90 border border-white/10 rounded-full text-white/40 hover:text-[#FF5D8F] transition-all hover:scale-110 active:scale-95 shadow-xl ring-4 ring-[#0A0A0A]"
             >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M6 18L18 6M6 6l12 12" /></svg>
             </button>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar px-10 pb-8">
            {activeTab === 'profile' && currentUser && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex flex-col items-center gap-5">
                  <div className="relative">
                    <div className="w-28 h-28 rounded-full border-2 border-[#FF5D8F] p-1 shadow-2xl">
                       <div className="w-full h-full rounded-full overflow-hidden bg-zinc-900 border border-white/10">
                          <img src={currentUser.avatar_url} className="w-full h-full object-cover" />
                       </div>
                    </div>
                    <button 
                      onClick={handleRandomizeAvatar}
                      className="absolute bottom-0 right-0 p-2.5 bg-[#FF5D8F] text-white rounded-full shadow-lg hover:scale-110 active:scale-95 transition-all ring-4 ring-[#0A0A0A]"
                    >
                       <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    </button>
                  </div>
                  <div className="text-center">
                    <h2 className="text-white font-black text-2xl tracking-tighter">{currentUser.name}</h2>
                    <p className="text-[#FF5D8F] text-xs font-black uppercase tracking-[0.2em] mt-1">{currentUser.handle}</p>
                  </div>
                </div>

                <div className="space-y-5 pt-4">
                  <div className="space-y-2">
                    <label className="text-[9px] uppercase tracking-widest text-[#FF5D8F] font-bold px-1 py-1 bg-[#FF5D8F]/10 rounded border border-[#FF5D8F]/20 inline-block">Rider Profile</label>
                    <div className="space-y-3">
                       <input 
                        type="text" 
                        value={profileName} 
                        onChange={(e) => setProfileName(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm font-bold focus:outline-none focus:border-[#FF5D8F] transition-all ring-1 ring-transparent focus:ring-[#FF5D8F]/20"
                        placeholder="Rider Name"
                      />
                      <input 
                        type="text" 
                        value={profileHandle} 
                        onChange={(e) => setProfileHandle(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white text-sm font-mono font-bold focus:outline-none focus:border-[#FF5D8F] transition-all ring-1 ring-transparent focus:ring-[#FF5D8F]/20"
                        placeholder="@handle"
                      />
                    </div>
                  </div>
                  <button 
                    onClick={handleUpdateProfile}
                    className="w-full py-5 bg-[#FF5D8F] hover:bg-[#FF7DA5] text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-[#FF5D8F]/30 active:scale-95"
                  >
                    Update Identity
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'friends' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="space-y-6">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Discovery</h3>
                    <div className="flex items-center gap-1.5 bg-[#FF5D8F]/10 border border-[#FF5D8F]/20 px-2 py-1 rounded-full">
                       <div className="w-1.5 h-1.5 rounded-full bg-[#FF5D8F] shadow-[0_0_8px_#FF5D8F]" />
                       <span className="text-[8px] font-black text-[#FF5D8F] uppercase tracking-widest">Online</span>
                    </div>
                  </div>
                  
                  <div className="space-y-2.5">
                    {MOCK_RIDERS.map(rider => (
                      <div key={rider.id} className="group bg-white/5 border border-white/10 rounded-[1.5rem] p-4 flex items-center gap-4 transition-all hover:bg-white/[0.08] hover:border-white/20">
                        <div className="w-12 h-12 rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 group-hover:scale-105 transition-transform">
                           <img src={rider.avatar_url} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                           <p className="text-white font-black text-xs truncate">{rider.name}</p>
                           <p className="text-[#FF5D8F] text-[9px] font-black uppercase tracking-tighter truncate">{rider.handle}</p>
                        </div>
                        {currentUser?.id !== rider.id && (
                          <button 
                            onClick={() => handleFollow(rider.id)}
                            disabled={friendsList.includes(rider.id)}
                            className={`p-3 rounded-2xl border transition-all ${friendsList.includes(rider.id) ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-white/5 border-white/10 text-white/40 hover:text-[#FF5D8F] hover:border-[#FF5D8F]/50 ring-0 hover:ring-4 ring-[#FF5D8F]/10'}`}
                          >
                            {friendsList.includes(rider.id) ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path d="M5 13l4 4L19 7" /></svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path d="M12 4v16m8-8H4" /></svg>
                            )}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pt-2">
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-white text-xs font-black uppercase tracking-widest">Simulator</h4>
                      <p className="text-zinc-500 text-[9px] font-bold uppercase tracking-tighter">Developer Control</p>
                    </div>
                    <button onClick={() => setIsDevMode(!isDevMode)} className={`w-12 h-6 rounded-full relative transition-all duration-300 ${isDevMode ? 'bg-[#FF5D8F] shadow-lg shadow-[#FF5D8F]/30' : 'bg-white/10'}`}>
                      <div className={`absolute top-1.5 left-1.5 w-3 h-3 rounded-full bg-white transition-transform duration-300 ${isDevMode ? 'translate-x-6' : ''}`}></div>
                    </button>
                  </div>
                  
                  {isDevMode && (
                    <div className="space-y-5 animate-in slide-in-from-top-4 duration-300 pt-2 border-t border-white/10">
                      <div className="flex justify-between items-center text-[10px] font-black uppercase">
                        <span className="text-[#FF5D8F]">Warp Speed</span>
                        <span className="text-white font-mono">{travelSpeed.toFixed(4)}x</span>
                      </div>
                      <input type="range" min="0.0005" max="0.5" step="0.0001" value={travelSpeed} onChange={(e) => setTravelSpeed(parseFloat(e.target.value))} className="w-full h-1.5 bg-white/10 rounded-full appearance-none accent-[#FF5D8F]" />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <button onClick={() => setIsGroupOnly(!isGroupOnly)} className={`w-full flex items-center justify-between p-6 rounded-3xl border transition-all duration-500 ${isGroupOnly ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10 group'}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-colors ${isGroupOnly ? 'bg-black text-white' : 'bg-white/5 text-[#FF5D8F] group-hover:bg-[#FF5D8F]/10'}`}>
                         <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" /></svg>
                      </div>
                      <div className="text-left">
                        <p className="text-[11px] font-black uppercase tracking-widest">{isGroupOnly ? 'Group View' : 'Global View'}</p>
                        <p className={`text-[9px] font-bold uppercase transition-colors ${isGroupOnly ? 'text-black/60' : 'text-zinc-600'}`}>{isGroupOnly ? 'Filtered Selection' : 'Unfiltered Stream'}</p>
                      </div>
                    </div>
                  </button>
                  <div className="bg-black/20 border border-white/5 rounded-3xl p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-white text-xs font-black uppercase tracking-widest">Aero Comms</h4>
                        <p className="text-[#FF5D8F] text-[8px] font-bold uppercase tracking-tighter shadow-sm">{commsState === 'on' ? 'Satellite Link Established' : 'Radio Offline'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                         {isAgentSpeaking && <div className="flex gap-1 items-center px-2 py-1 bg-[#FF5D8F]/10 rounded-full"><span className="text-[8px] text-[#FF5D8F] font-black uppercase">Receiving Brief</span></div>}
                         <div className={`w-2 h-2 rounded-full ${commsState === 'on' ? 'bg-[#FF5D8F] shadow-[0_0_8px_#FF5D8F]' : 'bg-zinc-800'}`} />
                      </div>
                    </div>
                    
                    <button 
                      onClick={() => handleToggleComms()}
                      disabled={commsState === 'connecting'}
                      className={`w-full py-5 rounded-2xl flex items-center justify-center gap-4 transition-all active:scale-95 border ${commsState === 'on' ? 'bg-[#FF5D8F] text-white border-[#FF5D8F] shadow-lg shadow-[#FF5D8F]/20' : 'bg-white/5 text-white/40 border-white/10 hover:border-[#FF5D8F]/50 hover:text-white'}`}
                    >
                      <svg className={`w-5 h-5 ${commsState === 'on' ? 'scale-110' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                         <path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">{commsState === 'on' ? 'Disconnect Radio' : commsState === 'connecting' ? 'Establishing Link...' : 'Connect Tactical Comms'}</span>
                    </button>

                    {routeIntel && (
                      <div className="p-4 bg-[#FF5D8F]/5 border border-[#FF5D8F]/10 rounded-2xl">
                         <p className="text-[#FF5D8F] text-[8px] font-black uppercase tracking-widest mb-1.5 opacity-50">Active Intel Briefing</p>
                         <p className="text-white/80 text-[10px] font-bold leading-relaxed line-clamp-3 italic opacity-60">"{routeIntel}"</p>
                      </div>
                    )}
                  </div>

                  <div className="bg-[#FF5D8F]/5 border border-[#FF5D8F]/10 rounded-3xl p-6 mt-12">
                     <div className="flex items-center gap-4">
                        <div className={`w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#EF4444]`} />
                        <div className="flex-1">
                          <p className="text-white text-[10px] font-black uppercase tracking-[0.2em]">{isNavigating ? 'In Motion' : 'Stationary'}</p>
                          <p className="text-zinc-500 text-[8px] font-bold uppercase tracking-widest mt-0.5">Recording Stream Status</p>
                        </div>
                     </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-10 border-t border-white/5 bg-black/40 relative flex justify-between items-center">
             <div className="flex items-center gap-2 opacity-30">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_#EF4444]" />
                <span className="text-[8px] font-black uppercase tracking-widest text-[#FF5D8F]">Aero Core Active</span>
             </div>
             <span className="text-[8px] font-mono text-zinc-700">v4.2.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
