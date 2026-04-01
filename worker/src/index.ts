export interface Env {
  DB: D1Database;
  AI: Ai;
  aero_audio_clips: R2Bucket;
  ELEVENLABS_API_KEY: string;
  FIRECRAWL_API_KEY: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SCOUT_PROMPT = `You are the Aero Co-Pilot Tactical Scout. You are analyzing a rider's specific route or location.
Your mission is to provide a BRIEF, TACTICAL briefing about the area based on the search data provided.
Focus on:
1. Weather: Real-time conditions and hazards.
2. Safety: Potential road hazards, gravel reports, or accident-prone zones.
3. Intel: Any tactical advantages or points of interest for a rider.

RULES:
- Be professional and concise (Military Brevity).
- Use current data only. 
- Format as a high-priority dispatch.`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    // GET /api/pins - Fetch all pins with author info
    if (request.method === 'GET' && pathname === '/api/pins') {
      try {
        const { results } = await env.DB.prepare(`
          SELECT p.*, u.name as author_name, u.avatar_url 
          FROM pins p 
          LEFT JOIN users u ON p.author_id = u.id 
          ORDER BY p.timestamp DESC
        `).all();
        return new Response(JSON.stringify(results), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Database error', details: err }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // GET /api/audio/:id - Fetch an audio file from R2
    if (request.method === 'GET' && pathname.startsWith('/api/audio/')) {
      const audioId = pathname.split('/').pop();
      if (!audioId) return new Response('Missing audio ID', { status: 400 });

      const audioFile = await env.aero_audio_clips.get(audioId);
      if (!audioFile) return new Response('Audio not found', { status: 404 });

      const headers = new Headers();
      audioFile.writeHttpMetadata(headers);
      headers.set('etag', audioFile.httpEtag);
      headers.append('Access-Control-Allow-Origin', '*');

      return new Response(audioFile.body, { headers });
    }

    // POST /api/pins - Create a pin with AI classification & Tactical Scouting
    if (request.method === 'POST' && pathname === '/api/pins') {
      try {
        const body: any = await request.json();
        const { longitude, latitude, text, author_id = null, audio_id = null, scout = false } = body;

        // Perform AI Classification & Content Generation
        let pinType = 'scenic';
        let pinTitle = 'Voice Note';

        const authorName = author_id; // Using author_id for the classification logic

        // --- AI Call 1: Classify the pin type ---
        try {
          const typeRes: any = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
            prompt: `Classify this message into exactly one category. Reply with ONLY the single word: HAZARD, FRIEND, or SCENIC. Nothing else.\nMessage: "${text}"`
          });
          const t = typeRes.response.trim().toUpperCase();
          if (t.includes('HAZARD')) pinType = 'hazard';
          else if (t.includes('FRIEND')) pinType = 'friend';
          else pinType = 'scenic';
        } catch (e) {
          console.error('Type classification failed', e);
        }

        // --- AI Call 3: Scouting Report (Enrichment) ---
        let scoutReport = null;
        if (scout) {
          try {
            const scoutRes: any = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
              prompt: `${SCOUT_PROMPT}\n\nLOCATION: [Lon: ${longitude}, Lat: ${latitude}]\n\nRIDER INTENT: ${text}\n\nTACTICAL REPORT:`
            });
            scoutReport = scoutRes.response.trim();
          } catch (e) {
            console.error('Tactical scouting failed', e);
          }
        }

        const id = crypto.randomUUID();
        const timestamp = Date.now();
        const finalText = scoutReport ? scoutReport : text;

        console.log('Final Data to Store:', { id, pinType, pinTitle });

        await env.DB.prepare(
          'INSERT INTO pins (id, longitude, latitude, type, text, author_id, timestamp, audio_id, title, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
          .bind(id, longitude, latitude, pinType, finalText, author_id, timestamp, audio_id, pinTitle, null)
          .run();

        return new Response(JSON.stringify({
          id,
          type: pinType,
          text,
          title: pinTitle,
          longitude,
          latitude,
          timestamp,
          audio_id,
          author_id: author_id
        }), {
          status: 201,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // POST /api/upload - Direct binary upload to R2 + AI Transcription
    if (request.method === 'POST' && pathname === '/api/upload') {
      try {
        const audioId = crypto.randomUUID() + '.mp3';
        const audioData = await request.arrayBuffer();

        // 1. Store in R2
        try {
          await env.aero_audio_clips.put(audioId, audioData, {
            httpMetadata: { contentType: 'audio/mpeg' },
          });
          console.log('Successfully saved to R2:', audioId);
        } catch (r2Err: any) {
          console.error('R2 Put Failed:', r2Err.message);
          throw r2Err;
        }

        // 2. Perform AI Transcription (Whisper)
        let transcription = '';
        try {
          const aiResponse: any = await env.AI.run('@cf/openai/whisper', {
            audio: [...new Uint8Array(audioData)],
          });
          transcription = aiResponse.text || '';
        } catch (aiErr) {
          console.error('Transcription failed', aiErr);
        }

        return new Response(JSON.stringify({ audio_id: audioId, transcription: transcription || '' }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: 'Upload/Transcription failed', details: err.message, transcription: '' }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }



    // POST /api/users - Create or update a user profile
    if (request.method === 'POST' && pathname === '/api/users') {
      try {
        const { id, name, avatar_url, handle } = (await request.json()) as any;
        await env.DB.prepare(
          'INSERT OR REPLACE INTO users (id, name, avatar_url, handle) VALUES (?, ?, ?, ?)'
        )
          .bind(id, name, avatar_url, handle)
          .run();

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // POST /api/friends - Follow/Add a friend
    if (request.method === 'POST' && pathname === '/api/friends') {
      try {
        const { user_id, friend_id } = (await request.json()) as any;
        await env.DB.prepare(
          'INSERT OR IGNORE INTO friendships (user_id, friend_id, status) VALUES (?, ?, ?)'
        )
          .bind(user_id, friend_id, 'accepted')
          .run();

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // GET /api/friends/:id - Get friends list
    if (request.method === 'GET' && pathname.startsWith('/api/friends/')) {
      try {
        const userId = pathname.split('/').pop();
        const { results } = await env.DB.prepare(
          'SELECT friend_id FROM friendships WHERE user_id = ? AND status = \'accepted\''
        )
          .bind(userId)
          .all();
        
        return new Response(JSON.stringify(results.map((r: any) => r.friend_id)), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // POST /api/tts - Convert text to speech via ElevenLabs
    if (request.method === 'POST' && pathname === '/api/tts') {
      try {
        const { text, voiceId = '21m00Tcm4TlvDq8ikWAM' } = (await request.json()) as any; // Reverted to original 'Rachel' but staying on Turbo v2.5 API

        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
          {
            method: 'POST',
            headers: {
              'xi-api-key': env.ELEVENLABS_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text,
              model_id: 'eleven_turbo_v2_5',
              voice_settings: { stability: 0.45, similarity_boost: 0.8 },
            }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`ElevenLabs API error: ${error}`);
        }

        // Return the raw audio buffer
        const audioBuffer = await response.arrayBuffer();
        return new Response(audioBuffer, {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'audio/mpeg',
          },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // POST /api/recon/route - Full route reconnaissance: reverse geocode → Firecrawl search → LLM summary
    if (request.method === 'POST' && pathname === '/api/recon/route') {
      try {
        const body = (await request.json()) as any;
        const { streets = [], startCoords, endCoords, mapboxToken } = body;
        
        if (!startCoords || !endCoords || !mapboxToken) {
          return new Response(JSON.stringify({ error: 'Missing startCoords, endCoords, or mapboxToken' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        // 1. Reverse geocode start and end to get city/area names
        const geocode = async (coords: [number, number]): Promise<string> => {
          try {
            const resp = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${coords[0]},${coords[1]}.json?types=place,locality,neighborhood&access_token=${mapboxToken}`
            );
            const data: any = await resp.json();
            if (data.features && data.features.length > 0) {
              return data.features[0].place_name || data.features[0].text;
            }
          } catch (e) {
            console.error('Geocode failed:', e);
          }
          return `${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}`;
        };

        const [startPlace, endPlace] = await Promise.all([
          geocode(startCoords),
          geocode(endCoords)
        ]);
        
        console.log('📍 Route from:', startPlace, 'to:', endPlace);
        console.log('🛣️ Streets:', streets);

        // 2. Build search locations: cities + key streets
        const searchTargets = [startPlace, endPlace, ...streets.slice(0, 3)].filter(Boolean);
        const uniqueTargets = Array.from(new Set(searchTargets));
        
        // 3. Firecrawl: search for SAFETY and WEATHER separately per location
        const reconResults = await Promise.all(uniqueTargets.slice(0, 4).map(async (loc) => {
          const searches = [
            `road safety conditions traffic accidents hazards near ${loc}`,
            `current weather forecast ${loc} today`
          ];
          
          const results = await Promise.all(searches.map(async (query) => {
            try {
              const fcResp = await fetch('https://api.firecrawl.dev/v1/search', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${env.FIRECRAWL_API_KEY}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query, limit: 3 })
              });
              const data: any = await fcResp.json();
              console.log(`Firecrawl [${query.substring(0, 40)}]:`, data.success, 'results:', data.data?.web?.length || data.data?.length || 0);
              
              const webResults = data.data?.web || data.data || [];
              if (Array.isArray(webResults) && webResults.length > 0) {
                return webResults.map((d: any) => `${d.title || ''}: ${d.description || d.snippet || ''}`).filter(Boolean).join(' | ');
              }
              return 'No data found.';
            } catch (e: any) {
              console.error(`Firecrawl search failed:`, e.message);
              return 'Search unavailable.';
            }
          }));
          
          return `LOCATION: ${loc}\nSAFETY: ${results[0]}\nWEATHER: ${results[1]}`;
        }));

        console.log('📊 Recon complete, synthesizing...');

        // 4. Synthesize with LLM
        const synthesizedIntel: any = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
          prompt: `${SCOUT_PROMPT}\n\nROUTE: From "${startPlace}" to "${endPlace}"\nSTREETS ON ROUTE: ${streets.join(', ')}\n\nRAW INTELLIGENCE DATA:\n${reconResults.join('\n\n')}\n\nGenerate a 3-4 sentence tactical briefing covering: 1) Current weather conditions 2) Road safety/hazards 3) Any critical alerts. Be specific with data from the search results. Do NOT greet the rider. Start directly with the intel.\n\nTACTICAL BRIEFING:`
        });

        const briefing = synthesizedIntel.response.trim();
        console.log('✅ Briefing generated:', briefing.substring(0, 200));

        return new Response(JSON.stringify({ 
          briefing, 
          startPlace, 
          endPlace,
          searchedLocations: uniqueTargets 
        }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        console.error('Recon endpoint error:', err.message);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  },
};
