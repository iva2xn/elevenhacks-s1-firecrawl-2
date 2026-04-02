'use client';

import React, { useState, useEffect, useRef } from 'react';
import Map, { Marker, Source, Layer, MapRef, Popup } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import * as turf from '@turf/turf';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';
const ELEVENLABS_KEY = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || '';

const AVATAR_OPTIONS = [
  'Aero', 'Mia', 'Rider', 'Ace', 'Ghost', 'Shadow', 'Bolt', 'Viper', 'Nova', 'Echo'
];

export default function MapControl() {
  const mapRef = useRef<MapRef>(null);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileHandle, setProfileHandle] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'friends' | 'settings'>('profile');
  const [friendsList, setFriendsList] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [discoveryList, setDiscoveryList] = useState<any[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const [profilePins, setProfilePins] = useState<any[]>([]);
  const [isGroupOnly, setIsGroupOnly] = useState(false);
  const [avatarIndex, setAvatarIndex] = useState(0);

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
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [passingPin, setPassingPin] = useState<any | null>(null);
  const [routeIntel, setRouteIntel] = useState<string | null>(null);
  const [commsState, setCommsState] = useState<'off' | 'connecting' | 'on'>('off');
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [showPlotConfirm, setShowPlotConfirm] = useState<{ lng: number, lat: number, routeInfo: any, streets: string[] } | null>(null);
  const [scoutingStatus, setScoutingStatus] = useState<'idle' | 'searching' | 'complete'>('idle');
  const [isMissionStarted, setIsMissionStarted] = useState(false);
  const convRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeAssetIdx, setActiveAssetIdx] = useState(0);

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

        const res = await fetch(`${WORKER_URL}/api/friends/list/${user.id}`);
        if (res.ok) {
          const list = await res.json();
          setFriendsList(list);
        }

        const reqs = await fetch(`${WORKER_URL}/api/friends/requests/${user.id}`);
        if (reqs.ok) {
          const rlist = await reqs.json();
          setIncomingRequests(rlist);
        }

        const disc = await fetch(`${WORKER_URL}/api/discovery?userId=${user.id}`);
        if (disc.ok) {
          const dlist = await disc.json();
          setDiscoveryList(dlist);
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

  const handleRandomizeAvatar = (direction: 'next' | 'prev') => {
    if (!currentUser) return;
    let nextIdx = direction === 'next' ? avatarIndex + 1 : avatarIndex - 1;
    if (nextIdx >= AVATAR_OPTIONS.length) nextIdx = 0;
    if (nextIdx < 0) nextIdx = AVATAR_OPTIONS.length - 1;
    
    setAvatarIndex(nextIdx);
    const updatedUser = {
      ...currentUser,
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${AVATAR_OPTIONS[nextIdx]}`
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

  // 🛰️ REAL-TIME GEOLOCATION ENGINE (Non-Dev Mode)
  useEffect(() => {
    if (isDevMode) return;
    
    if ("geolocation" in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (isDevMode) return; // double check
          const newPos = {
            longitude: pos.coords.longitude,
            latitude: pos.coords.latitude
          };
          setRiderPosition(newPos);
          riderRef.current.longitude = newPos.longitude;
          riderRef.current.latitude = newPos.latitude;
          
          if (pos.coords.heading !== null) {
            setRiderBearing(pos.coords.heading);
            riderRef.current.bearing = pos.coords.heading;
          }
        },
        (err) => console.warn('Geolocation error:', err),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [isDevMode]);

  // 🎮 SIMULATOR MODE SYNC: Handover logic between Real and Sim
  useEffect(() => {
    if (isDevMode) {
      const sfPos = { longitude: -122.4194, latitude: 37.7749 };
      
      // Reset position to SF
      setRiderPosition(sfPos);
      riderRef.current.longitude = sfPos.longitude;
      riderRef.current.latitude = sfPos.latitude;
      riderRef.current.bearing = 0;
      setRiderBearing(0);
      
      // Reposition camera to SF overview
      setViewState(prev => ({
        ...prev,
        ...sfPos,
        zoom: 14.5,
        pitch: 0,
        bearing: 0
      }));
      
      // Wipe mission states to prevent interference
      setRouteData(null);
      setTargetWaypoint(null);
      setIsMissionStarted(false);
      setIsNavigating(false);
      setCurrentInstruction(null);
      setScoutingStatus('idle');
      setShowPlotConfirm(null);
    } else {
      // 🛰️ Disabling Simulator: Instant Handover to Real GPS
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const realPos = {
              longitude: pos.coords.longitude,
              latitude: pos.coords.latitude
            };
            
            // Critical: Update both state AND ref for high-performance systems
            setRiderPosition(realPos);
            riderRef.current.longitude = realPos.longitude;
            riderRef.current.latitude = realPos.latitude;
            
            setViewState(prev => ({
              ...prev,
              ...realPos,
              zoom: 15,
              pitch: 0,
              bearing: 0
            }));
            
            // Clear all mission and routing states
            setRouteData(null);
            setTargetWaypoint(null);
            setIsMissionStarted(false);
            setIsNavigating(false);
            setScoutingStatus('idle');
            setShowPlotConfirm(null);
          },
          (err) => {
            console.warn('GPS Snap-back failed', err);
            // Fallback: stay where we are but disable sim
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }
    }
  }, [isDevMode]);

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
              voice_settings: { 
                stability: 0.45, 
                similarity_boost: 0.8,
                speed: 0.8 
              },
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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedImages(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
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

    // 2. Upload Images
    let imageIds: string[] = [];
    if (selectedImages.length > 0) {
      setIsUploadingImages(true);
      try {
        const uploadPromises = selectedImages.map(async (file) => {
          const resp = await fetch(`${WORKER_URL}/api/upload-image`, {
            method: 'POST',
            body: await file.arrayBuffer(),
            headers: { 'Content-Type': file.type }
          });
          if (resp.ok) {
            const data = await resp.json();
            return data.image_id;
          }
          return null;
        });
        const results = await Promise.all(uploadPromises);
        imageIds = results.filter(id => id !== null) as string[];
      } catch (err) {
        console.error('Image uploads failed', err);
      }
      setIsUploadingImages(false);
    }

    // 3. Create the pin
    const pinRequest = {
      longitude: isCreatingPin.lng,
      latitude: isCreatingPin.lat,
      text: transcription || 'Voice Message',
      author_id: currentUser.id,
      audio_id: audio_id,
      images: imageIds.length > 0 ? imageIds : null
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
    setSelectedImages([]);
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
      // Refresh discovery
      const disc = await fetch(`${WORKER_URL}/api/discovery?userId=${currentUser.id}`);
      if (disc.ok) setDiscoveryList(await disc.json());
    } catch (err) {
      console.error('Follow failed', err);
    }
  };

  const handleAcceptFriend = async (requesterId: string) => {
    try {
      if (!currentUser?.id) return;
      await fetch(`${WORKER_URL}/api/friends/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUser.id, friend_id: requesterId })
      });
      
      // Refresh lists
      const [friends, reqs] = await Promise.all([
        fetch(`${WORKER_URL}/api/friends/list/${currentUser.id}`).then(r => r.json()),
        fetch(`${WORKER_URL}/api/friends/requests/${currentUser.id}`).then(r => r.json())
      ]);
      setFriendsList(friends);
      setIncomingRequests(reqs);
    } catch (err) {
      console.error('Accept failed', err);
    }
  };

  const handleViewProfile = async (profile: any) => {
    setSelectedProfile(profile);
    try {
      const resp = await fetch(`${WORKER_URL}/api/pins/user/${profile.user_id || profile.id}`);
      if (resp.ok) {
        setProfilePins(await resp.json());
      }
    } catch (err) {
      console.error('Failed to fetch profile pins');
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

  const filteredPins = pins.filter(p => !isGroupOnly || friendsList.some(f => f.id === p.author_id) || p.author_id === currentUser.id);

  // 🛰️ PROXIMITY ENGINE: Auto-trigger audio when near pins
  useEffect(() => {
    if (isPlaying || filteredPins.length === 0) return;

    filteredPins.forEach(pin => {
      if (visitedPins.has(pin.id)) return;
      
      const distance = turf.distance(
        [riderPosition.longitude, riderPosition.latitude], 
        [pin.longitude, pin.latitude], 
        { units: 'meters' }
      );

      if (distance < 100) {
        setVisitedPins(prev => {
          const next = new Set(prev);
          next.add(pin.id);
          return next;
        });
        setSelectedPin(pin);

        if (pin.audio_id) {
          playVoice(pin.id, pin.text, 'original', pin.audio_id);
        } else {
          playVoice(pin.id, pin.text, 'ai');
        }
      }
    });
  }, [riderPosition, filteredPins, visitedPins, isPlaying]);

  const handleMapClick = async (evt: any) => {
    const { lng, lat } = evt.lngLat;
    
    if (isDropMode) {
      setIsCreatingPin({ lng, lat });
      setIsDropMode(false);
      return;
    }
    
    if (isNavigating || isMissionStarted) return;
    
    const startCoords: [number, number] = [riderPosition.longitude, riderPosition.latitude];
    const endCoords: [number, number] = [lng, lat];
    
    // Step 1: Get the route
    const routeInfo = await fetchRoute(startCoords, endCoords);
    if (!routeInfo) return;
    
    const steps = routeInfo.steps;
    const streets = steps 
      ? Array.from(new Set(steps.map((s: any) => s.name).filter((n: string) => n && n !== '')))
      : [];

    setRouteData({ type: 'Feature', geometry: routeInfo.geometry });
    setTargetWaypoint(endCoords);
    (window as any)._lastRouteInfo = routeInfo;
    setScoutingStatus('idle');
    setShowPlotConfirm({ lng, lat, routeInfo, streets: streets as string[] });
  };

  const handleStartMission = () => {
    if (!showPlotConfirm) return;
    setIsMissionStarted(true);
    setShowPlotConfirm(null);
    
    if (isDevMode) {
      animateRider(showPlotConfirm.routeInfo);
    } else {
      setIsNavigating(true);
      // Real-time tracking is handled by the useEffect
    }
  };

  const handleRunRecon = async () => {
    if (!showPlotConfirm) return;
    setScoutingStatus('searching');
    
    const { streets, routeInfo } = showPlotConfirm;
    const startCoords: [number, number] = [riderPosition.longitude, riderPosition.latitude];
    const endCoords: [number, number] = [showPlotConfirm.lng, showPlotConfirm.lat];

    // Send to backend — reverse geocode cities, Firecrawl search, LLM summary
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
        setRouteIntel(reconData.briefing);
        
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
                voice_settings: { stability: 0.45, similarity_boost: 0.8, speed: 0.8 },
              }),
            }
          );
          if (ttsResp.ok) {
            const blob = await ttsResp.blob();
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            await audio.play();
          }
        } catch (ttsErr) {
          console.error('TTS failed:', ttsErr);
        }
      }
    } catch (err) {
      console.error('Recon request failed:', err);
    }
    setScoutingStatus('complete');
    setShowPlotConfirm(null); // Dismiss immediately once audio is loaded/started
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

        {currentInstruction && typeof riderPosition.longitude === 'number' && (
          <Marker longitude={riderPosition.longitude} latitude={riderPosition.latitude} anchor="bottom" offset={[0, -60]}>
            <div>
              <div className="bg-[#FF5D8F] text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in zoom-in slide-in-from-bottom-2 duration-300 border border-white/20">
                <span className="font-bold text-sm tracking-tight capitalize">{currentInstruction}</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path d="M12 19V5m0 0l-7 7m7-7l7 7" />
                </svg>
              </div>
              <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-[#FF5D8F] mx-auto mt-[-1px]"></div>
            </div>
          </Marker>
        )}

        {targetWaypoint && typeof targetWaypoint[0] === 'number' && typeof targetWaypoint[1] === 'number' && (
          <Marker longitude={targetWaypoint[0]} latitude={targetWaypoint[1]} anchor="bottom">
            <div className="pointer-events-none">
              <svg viewBox="0 0 100 100" className="w-8 h-8 drop-shadow-lg">
                <path d="M50 0 C30 0 15 15 15 35 C15 60 50 100 50 100 C50 100 85 60 85 35 C85 15 70 0 50 0 Z" fill="#FF5D8F" />
                <circle cx="50" cy="35" r="10" fill="white" fillOpacity={0.8} />
              </svg>
            </div>
          </Marker>
        )}

        {typeof riderPosition.longitude === 'number' && (
          <Marker 
            longitude={riderPosition.longitude} 
            latitude={riderPosition.latitude} 
            anchor="center"
            rotationAlignment="map"
            rotation={riderBearing}
          >
            <div className="relative transition-transform duration-75 ease-linear pointer-events-none">
              <div className="w-12 h-12 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-10 h-10 drop-shadow-md relative z-10">
                  <path d="M50 10 L85 85 L50 70 L15 85 Z" fill="#FF5D8F" />
                </svg>
              </div>
            </div>
          </Marker>
        )}

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
            offset={65} // Added extra breathing room from the pin
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
              
              {selectedPin.images && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6">
                  {(() => {
                    try {
                      const imgs = JSON.parse(selectedPin.images);
                      return Array.isArray(imgs) ? imgs.map((imgId: string) => (
                        <div 
                          key={imgId} 
                          onClick={() => setPassingPin(selectedPin)}
                          className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-white/10 cursor-pointer hover:border-[#FF5D8F] transition-all"
                        >
                          <img src={`${WORKER_URL}/api/images/${imgId}`} className="w-full h-full object-cover" alt="Pin Intel" />
                        </div>
                      )) : null;
                    } catch (e) { return null; }
                  })()}
                </div>
              )}
              
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
 
                {/* Image Picker Section */}
                {recordingState === 'preview' && (
                  <div 
                    className="w-full space-y-4 pt-4 border-t border-white/5"
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                        if (files.length > 0) {
                          setSelectedImages(prev => [...prev, ...files]);
                        }
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Attach Images</h3>
                      <span className="text-[10px] text-[#FF5D8F] font-black">{selectedImages.length}</span>
                    </div>
                    
                    <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
                      {selectedImages.map((file, idx) => (
                        <div key={idx} className="relative flex-shrink-0 w-20 h-20 rounded-2xl overflow-hidden border border-white/10 group">
                          <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                          <button 
                            onClick={() => removeImage(idx)}
                            className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/80 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ))}
                      <label className="flex-shrink-0 w-20 h-20 rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-zinc-500 hover:border-[#FF5D8F] hover:text-[#FF5D8F] hover:bg-[#FF5D8F]/5 transition-all cursor-pointer">
                        <input type="file" multiple accept="image/*" className="hidden" onChange={handleImageSelect} />
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M12 4v16m8-8H4" /></svg>
                        <span className="text-[8px] font-black uppercase mt-1">Add</span>
                      </label>
                    </div>
                  </div>
                )}
 
              {recordingState === 'transcribing' && (
                  <div className="flex flex-col items-center gap-6">
                    <div className="w-16 h-16 rounded-full border-[4px] border-[#FF5D8F]/20 border-t-[#FF5D8F] animate-spin shadow-[0_0_15px_rgba(255,93,143,0.2)]" style={{ willChange: 'transform', transform: 'translateZ(0)' }}></div>
                    <div className="text-center">
                      <p className="text-white font-black text-lg uppercase tracking-tight">Processing</p>
                      <p className="text-[#FF5D8F] text-[8px] font-bold uppercase tracking-widest mt-1 animate-pulse">Uploading Tactical Intel</p>
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

            <div className="relative mx-auto w-40 h-40 group">
              <div className="absolute inset-0 bg-[#FF5D8F]/20 blur-3xl rounded-full animate-pulse"></div>
              <div className="relative w-full h-full rounded-full border-4 border-[#FF5D8F] p-1.5 bg-[#0A0A0A] shadow-2xl overflow-hidden flex items-center justify-center">
                 <img src={currentUser?.avatar_url} className="w-full h-full object-cover rounded-full" alt="Avatar" />
                 
                 {/* Swipe/Click Controls */}
                 <button 
                  onClick={() => handleRandomizeAvatar('prev')}
                  className="absolute left-0 top-1/2 -translate-y-1/2 p-2 bg-black/60 text-white rounded-r-xl opacity-0 group-hover:opacity-100 transition-opacity"
                 >
                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M15 19l-7-7 7-7" /></svg>
                 </button>
                 <button 
                  onClick={() => handleRandomizeAvatar('next')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-2 bg-black/60 text-white rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity"
                 >
                   <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M9 5l7 7-7 7" /></svg>
                 </button>
              </div>
              <p className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-black text-[#FF5D8F] uppercase tracking-widest whitespace-nowrap bg-black px-2 py-0.5 border border-[#FF5D8F]/30 rounded">Slide to Change</p>
            </div>

            <div className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <label className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold">Your Callsign</label>
                <input 
                  type="text" 
                  value={profileName} 
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white text-lg font-black focus:outline-none focus:border-[#FF5D8F] transition-all text-center"
                  placeholder="Rider Name"
                />
              </div>
            </div>

            <button 
              onClick={handleFinishOnboarding}
              className="w-full py-5 bg-[#FF5D8F] hover:bg-[#FF7DA5] text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-[#FF5D8F]/20 transition-all active:scale-95"
            >
              Confirm Identity
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

      {/* Dev Mode Play Control: Top Left */}
      {isDevMode && routeData && (
        <div className={`absolute top-6 left-6 z-20 transition-all duration-500 animate-in slide-in-from-top-4 ${isSidebarOpen ? '-translate-y-12 opacity-0' : 'translate-y-0 opacity-100'}`}>
          <button 
            onClick={() => {
              const currentRouteInfo = showPlotConfirm?.routeInfo || (window as any)._lastRouteInfo;
              if (currentRouteInfo) {
                setIsMissionStarted(true);
                animateRider(currentRouteInfo);
              }
            }}
            className="bg-[#FF5D8F] border border-white/20 w-14 h-14 rounded-2xl shadow-2xl text-white hover:bg-[#FF7DA5] hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
          >
             <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
      )}

      <div className={`absolute top-6 right-6 z-10 w-80 h-[calc(100vh-3rem)] pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${isSidebarOpen ? 'translate-x-0 opacity-100 scale-100' : 'translate-x-12 opacity-0 scale-95'}`}>
        <div className={`bg-[#0A0A0A] border border-white/10 h-full rounded-[2.5rem] shadow-4xl relative flex flex-col overflow-hidden ${isSidebarOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          
          {/* New Sleek Closer - Relocated to top right corner of sidebar */}
          <button 
             onClick={() => setIsSidebarOpen(false)}
             className="absolute top-6 right-6 w-9 h-9 flex items-center justify-center bg-zinc-900 border border-white/5 rounded-full text-zinc-500 hover:text-white transition-all hover:bg-zinc-800 hover:scale-110 active:scale-95 shadow-xl z-[60]"
          >
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>

          {/* Sidebar Tabs */}
          <div className="flex bg-white/5 p-1 mx-6 mt-[4.5rem] mb-6 rounded-2xl border border-white/10 relative">
             {(['profile', 'friends', 'settings'] as const).map(tab => (
               <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === tab ? 'bg-[#FF5D8F] text-white shadow-lg shadow-[#FF5D8F]/20' : 'text-zinc-500 hover:text-white'}`}
               >
                 {tab}
               </button>
             ))}
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
                      onClick={() => handleRandomizeAvatar('next')}
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
                {selectedProfile ? (
                  <div className="space-y-6">
                    <button 
                      onClick={() => setSelectedProfile(null)}
                      className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors group px-1"
                    >
                      <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M15 19l-7-7 7-7" /></svg>
                      <span className="text-[10px] font-black uppercase tracking-widest">Back to Friends</span>
                    </button>

                    <div className="flex flex-col items-center gap-4 py-4 bg-white/5 border border-white/10 rounded-3xl mx-1">
                      <div className="w-20 h-20 rounded-full border-2 border-[#FF5D8F] p-1">
                        <div className="w-full h-full rounded-full overflow-hidden bg-zinc-900 border border-white/10">
                           <img src={selectedProfile.avatar_url} className="w-full h-full object-cover" alt="Profile" />
                        </div>
                      </div>
                      <div className="text-center">
                        <h2 className="text-white font-black text-xl tracking-tight">{selectedProfile.name}</h2>
                        <p className="text-[#FF5D8F] text-[9px] font-black uppercase tracking-widest">{selectedProfile.handle}</p>
                      </div>
                    </div>

                    <div className="space-y-4 px-1">
                       <h3 className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Travel Pins</h3>
                       {profilePins.length > 0 ? (
                         <div className="space-y-3">
                           {profilePins.map(pin => (
                             <div key={pin.id} className="group bg-white/5 border border-white/10 rounded-2xl p-5 transition-all hover:bg-white/[0.08] hover:border-[#FF5D8F]/20">
                               <div className="flex items-center justify-between mb-3">
                                 <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border ${pin.type === 'hazard' ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-[#FF5D8F]/10 border-[#FF5D8F]/30 text-[#FF5D8F]'}`}>
                                   {pin.type}
                                 </span>
                                 <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">
                                   {new Date(pin.timestamp).toLocaleDateString()}
                                 </span>
                               </div>
                               <p className="text-white text-sm font-bold leading-relaxed mb-4 line-clamp-3">{pin.title || pin.text}</p>
                               <button 
                                 onClick={() => playVoice(pin.id, pin.text, pin.audio_id ? 'original' : 'ai', pin.audio_id)}
                                 className="w-full flex items-center justify-center gap-3 py-3 bg-white/5 hover:bg-[#FF5D8F] hover:text-white border border-white/10 hover:border-transparent rounded-xl transition-all group/btn"
                               >
                                 <svg className="w-4 h-4 transition-transform group-hover/btn:scale-110" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                 <span className="text-[10px] font-black uppercase tracking-widest">Listen to Note</span>
                               </button>
                             </div>
                           ))}
                         </div>
                       ) : (
                         <div className="py-12 text-center bg-white/2 border border-white/10 border-dashed rounded-3xl opacity-50">
                           <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest">No intelligence gathered</p>
                         </div>
                       )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-10">
                    {/* Friend Requests Section */}
                    {incomingRequests.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="text-[10px] text-zinc-500 font-black uppercase tracking-widest px-1">Friend Requests</h3>
                        <div className="space-y-3">
                          {incomingRequests.map((req, idx) => (
                            <div key={req.user_id || `req-${idx}`} className="bg-[#FF5D8F]/5 border border-[#FF5D8F]/20 rounded-3xl p-5 flex items-center gap-4 animate-in slide-in-from-right-4 duration-300">
                              <div className="w-12 h-12 rounded-2xl overflow-hidden border border-white/10 shadow-lg">
                                 <img src={req.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${req.user_id}`} className="w-full h-full object-cover" alt="Avatar" />
                              </div>
                              <div className="flex-1 min-w-0">
                                 <p className="text-white font-black text-sm truncate">{req.name || 'Anonymous Rider'}</p>
                                 <p className="text-[#FF5D8F] text-[10px] font-black uppercase truncate">{req.handle || '@unknown'}</p>
                              </div>
                              <button 
                                onClick={() => handleAcceptFriend(req.user_id)}
                                className="w-10 h-10 flex items-center justify-center bg-[#FF5D8F] text-white rounded-2xl shadow-xl shadow-[#FF5D8F]/30 hover:scale-110 active:scale-95 transition-all"
                              >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path d="M5 13l4 4L19 7" /></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Friends List Section */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Squadron</h3>
                        <div className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full">
                          <span className="text-[9px] font-black text-white">{friendsList.length}</span>
                        </div>
                      </div>
                      
                      {friendsList.length > 0 ? (
                        <div className="space-y-3">
                          {friendsList.map((friend, idx) => (
                            <div 
                              key={friend.id || `friend-${idx}`} 
                              onClick={() => handleViewProfile(friend)}
                              className="cursor-pointer group bg-white/5 border border-white/10 rounded-3xl p-5 flex items-center gap-4 transition-all hover:bg-white/[0.08] hover:border-[#FF5D8F]/30 hover:translate-x-1"
                            >
                              <div className="w-14 h-14 rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 shadow-inner group-hover:scale-105 transition-transform">
                                 <img src={friend.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.id}`} className="w-full h-full object-cover" alt="Avatar" />
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                 <p className="text-white font-black text-sm truncate">{friend.name || 'Rider'}</p>
                                 <p className="text-[#FF5D8F] text-[10px] font-black uppercase tracking-tighter truncate">{friend.handle || '@handle'}</p>
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">
                                <svg className="w-5 h-5 text-[#FF5D8F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M9 5l7 7-7 7" /></svg>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-12 text-center bg-white/2 border border-white/10 border-dashed rounded-[2.5rem] flex flex-col items-center gap-3">
                           <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-zinc-700">
                             <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                           </div>
                           <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest">No squadron data</p>
                        </div>
                      )}
                    </div>

                    {/* Discovery Section */}
                    <div className="space-y-6 pt-6 border-t border-white/5">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Discovery</h3>
                        <div className="flex items-center gap-1.5 bg-[#FF5D8F]/10 border border-[#FF5D8F]/20 px-2.5 py-1 rounded-full">
                           <div className="w-1.5 h-1.5 rounded-full bg-[#FF5D8F] shadow-[0_0_8px_#FF5D8F] animate-pulse" />
                           <span className="text-[9px] font-black text-[#FF5D8F] uppercase tracking-widest">Live Feed</span>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        {discoveryList.length > 0 ? discoveryList.slice(0, 10).map((rider, idx) => (
                          <div 
                            key={rider.id || `disc-${idx}`} 
                            onClick={() => handleViewProfile(rider)}
                            className="cursor-pointer group bg-white/5 border border-white/10 rounded-3xl p-5 flex items-center gap-4 transition-all hover:bg-white/[0.08] hover:border-white/20"
                          >
                            <div className="w-14 h-14 rounded-2xl overflow-hidden border border-white/10 bg-zinc-900 group-hover:scale-105 transition-transform">
                               <img src={rider.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${rider.id}`} className="w-full h-full object-cover" alt="Avatar" />
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                               <p className="text-white font-black text-sm truncate">{rider.name || 'Rider'}</p>
                               <p className="text-[#FF5D8F] text-[10px] font-black uppercase tracking-tighter truncate">{rider.handle || '@handle'}</p>
                            </div>
                            {currentUser?.id !== rider.id && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleFollow(rider.id); }}
                                disabled={friendsList.some(f => f.id === rider.id)}
                                className={`w-10 h-10 flex items-center justify-center rounded-2xl border transition-all ${friendsList.some(f => f.id === rider.id) ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-white/5 border-white/10 text-white/40 hover:text-[#FF5D8F] hover:border-[#FF5D8F]/50 ring-0 hover:ring-4 ring-[#FF5D8F]/10'}`}
                              >
                                {friendsList.some(f => f.id === rider.id) ? (
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path d="M5 13l4 4L19 7" /></svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path d="M12 4v16m8-8H4" /></svg>
                                )}
                              </button>
                            )}
                          </div>
                        )) : (
                          <div className="py-12 text-center bg-white/2 border border-white/10 border-dashed rounded-[2.5rem]">
                            <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest">Scanning for riders...</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
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

      {/* Passing Pin Cinematic Overlay */}
      {passingPin && (
        <div className="fixed inset-0 z-[500] flex flex-col items-center justify-center bg-black/95 animate-in fade-in duration-500 pointer-events-auto">
          
          {/* Explicit Background Close Layer designed to sit BEHIND the slider */}
          <div className="absolute inset-0 cursor-pointer" onClick={() => setPassingPin(null)} />
          
          <div className="relative w-full h-full flex flex-col pointer-events-none">
            {passingPin.images ? (
              <>
                {/* Cinematic Image Carousel: Left-to-Right Slider */}
                <div 
                  ref={scrollRef}
                  onScroll={(e) => {
                    const container = e.currentTarget;
                    const center = container.scrollLeft + container.offsetWidth / 2;
                    let newIdx = activeAssetIdx;
                    let minDiff = Infinity;
                    
                    // Dynamically find the child closest to the center
                    Array.from(container.children).forEach((child, i) => {
                      const childCenter = (child as HTMLElement).offsetLeft + (child as HTMLElement).offsetWidth / 2;
                      const diff = Math.abs(childCenter - center);
                      if (diff < minDiff) {
                        minDiff = diff;
                        newIdx = i;
                      }
                    });
                    
                    if (newIdx !== activeAssetIdx) setActiveAssetIdx(newIdx);
                  }}
                  onMouseDown={(e) => {
                    const el = e.currentTarget;
                    el.dataset.isDown = 'true';
                    el.dataset.startX = e.pageX.toString();
                    el.dataset.scrollLeft = el.scrollLeft.toString();
                    el.style.scrollSnapType = 'none'; // Disable snap physics while dragging
                    el.style.cursor = 'grabbing';
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget;
                    el.dataset.isDown = 'false';
                    el.style.scrollSnapType = 'x mandatory';
                    el.style.cursor = 'grab';
                  }}
                  onMouseUp={(e) => {
                    const el = e.currentTarget;
                    el.dataset.isDown = 'false';
                    el.style.scrollSnapType = 'x mandatory';
                    el.style.cursor = 'grab';
                  }}
                  onMouseMove={(e) => {
                    const el = e.currentTarget;
                    if (el.dataset.isDown !== 'true') return;
                    e.preventDefault();
                    const startX = parseFloat(el.dataset.startX || '0');
                    const scrollLeft = parseFloat(el.dataset.scrollLeft || '0');
                    const walk = (e.pageX - startX) * 2.5; // Drag friction multiplier
                    el.scrollLeft = scrollLeft - walk;
                  }}
                  className="w-full flex-grow flex items-center gap-[4vw] overflow-x-auto no-scrollbar snap-x snap-mandatory px-[15vw] md:px-[20vw] lg:px-[25vw] pointer-events-auto cursor-grab"
                >
                  {(() => {
                    try {
                      const imgs = JSON.parse(passingPin.images);
                      return Array.isArray(imgs) ? imgs.map((imgId: string, idx: number) => (
                        <div 
                          key={imgId} 
                          onClick={(e) => e.stopPropagation()}
                          className={`flex-shrink-0 w-[70vw] md:w-[60vw] lg:w-[50vw] aspect-[4/3] md:aspect-video snap-center relative transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeAssetIdx === idx ? 'scale-100 opacity-100 z-10' : 'scale-[0.4] opacity-30 grayscale blur-[2px] z-0'}`}
                        >
                          <img 
                            src={`${WORKER_URL}/api/images/${imgId}`} 
                            className="w-full h-full object-contain rounded-[2rem] md:rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] pointer-events-none select-none" 
                            draggable="false"
                            alt={`Asset ${idx + 1}`}
                          />
                        </div>
                      )) : null;
                    } catch (e) { return null; }
                  })()}
                </div>
              
                {/* Pagination Controls */}
                <div 
                  className="flex justify-center gap-3 pb-8 pt-4 animate-in fade-in duration-1000 delay-500"
                  onClick={(e) => e.stopPropagation()}
                >
                   {(() => {
                     try {
                       const imgs = JSON.parse(passingPin.images);
                       return Array.isArray(imgs) ? imgs.map((_, i) => (
                         <div key={i} className={`h-1.5 rounded-full transition-all duration-700 ${activeAssetIdx === i ? 'w-12 bg-[#FF5D8F]' : 'w-3 bg-white/20'}`} />
                       )) : null;
                     } catch { return null; }
                   })()}
                </div>
              </>
            ) : (
              <div 
                className="m-auto bg-zinc-950 rounded-[5rem] p-16 flex flex-col items-center gap-8 border border-white/5 shadow-4xl animate-in zoom-in-95 duration-1000"
                onClick={(e) => e.stopPropagation()}
              >
                 <div className="w-24 h-24 rounded-full bg-[#FF5D8F]/20 flex items-center justify-center shadow-[0_0_30px_rgba(255,93,143,0.3)]">
                    <svg className="w-10 h-10 text-[#FF5D8F]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                 </div>
                 <div className="text-center space-y-4">
                   <h2 className="text-white text-4xl font-black uppercase tracking-tighter">Voice Pin</h2>
                   <p className="text-zinc-500 text-lg font-bold max-w-md leading-relaxed">"{passingPin.text}"</p>
                 </div>
              </div>
            )}
          </div>

          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/5 border border-white/10 px-8 py-5 rounded-[2rem] animate-in fade-in slide-in-from-bottom-20 duration-1000 delay-700 shadow-3xl pointer-events-auto">
            <div className="w-10 h-10 rounded-2xl overflow-hidden border border-[#FF5D8F]/50 shadow-inner">
              <img src={passingPin.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${passingPin.author_id}`} className="w-full h-full object-cover" alt="Author" />
            </div>
            <div className="flex flex-col items-start min-w-[120px]">
              <span className="text-white text-[10px] font-black uppercase tracking-widest">{passingPin.author_name || 'Field Agent'}</span>
              <span className="text-zinc-500 text-[8px] font-bold uppercase tracking-tighter mt-0.5">Recorded {new Date(passingPin.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="w-px h-6 bg-white/10 mx-2" />
            <button 
              onClick={(e) => { e.stopPropagation(); setPassingPin(null); }}
              className="text-[#FF5D8F] text-[9px] font-black uppercase tracking-widest hover:text-white transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {/* Route Summary Confirmation Popup */}
      {showPlotConfirm && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[300] animate-in slide-in-from-bottom-8 fade-in gap-5 duration-500">
           <div className="bg-[#0A0A0A] border border-white/10 rounded-full shadow-4xl p-1.5 flex items-stretch gap-6">
              <div className="pl-5 flex items-center gap-3">
                <span className="text-white font-black text-[10px] uppercase tracking-widest leading-none translate-y-[0.5px]">Summary</span>
                <button 
                  onClick={() => setShowPlotConfirm(null)}
                  className="text-zinc-600 hover:text-white flex items-center transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="flex">
                {scoutingStatus === 'idle' ? (
                  <button 
                    onClick={handleRunRecon}
                    className="px-6 py-3 bg-[#FF5D8F] text-white font-black text-[10px] uppercase tracking-widest rounded-full hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#FF5D8F]/20 flex items-center justify-center leading-none"
                  >
                     Summarize
                  </button>
                ) : (
                  <div className="px-6 py-3 flex items-center justify-center">
                     <span className="text-[10px] font-black text-[#FF5D8F] uppercase tracking-widest animate-pulse leading-none">Searching...</span>
                  </div>
                )}
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
