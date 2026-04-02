export interface Env {
  DB: D1Database;
  AI: Ai;
  aero_audio_clips: R2Bucket;
  aero_images: R2Bucket;
  ELEVENLABS_API_KEY: string;
  FIRECRAWL_API_KEY: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SCOUT_PROMPT = `You are the Aero Co-Pilot Tactical Scout. You are a professional motorcycle spotter.
Your mission is to summarize real-time intelligence into a CLEAN, NATURAL NARRATIVE for audio delivery.

RULES:
- ONLY report data that exists in the raw intelligence.
- NEVER say "no hazards found," "no data gathered," or "no reports." Just skip them.
- NEVER use abbreviations or symbols (Write "kilometers per hour" NOT "km/h", "degrees celsius" NOT "°C").
- NEVER use headers, bold text, or symbols (No "TACTICAL BRIEFING:", No asterisks).
- If there's nothing interesting to report besides the weather, just mention the weather and the next road ahead.`;

const sanitizeBriefing = (text: string): string => {
  return text
    .replace(/\*\*.*?\*\*/g, '')                         // Remove bold text
    .replace(/^\s*TACTICAL BRIEFING:?\s*/i, '')         // Strict header removal
    .replace(/^\s*SCOUT REPORT:?\s*/i, '')               // Strict header removal
    .replace(/^\s*INTEL:?\s*/i, '')                       // Strict header removal
    .replace(/°C/g, ' degrees celsius')                  // Ensure TTS reads full words
    .replace(/km\/h/g, ' kilometers per hour')           // Ensure TTS reads full words
    .replace(/(\r\n|\n|\r)/gm, " ")                      // Natural flow
    .replace(/\s+/g, ' ')                                // Collapse whitespace
    .trim();
};

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

    // GET /api/images/:id - Fetch an image from R2
    if (request.method === 'GET' && pathname.startsWith('/api/images/')) {
      const imageId = pathname.split('/').pop();
      if (!imageId) return new Response('Missing image ID', { status: 400 });

      const imageFile = await env.aero_images.get(imageId);
      if (!imageFile) return new Response('Image not found', { status: 404 });

      const headers = new Headers();
      imageFile.writeHttpMetadata(headers);
      headers.set('etag', imageFile.httpEtag);
      headers.append('Access-Control-Allow-Origin', '*');

      return new Response(imageFile.body, { headers });
    }

    // POST /api/pins - Create a pin with AI classification & Tactical Scouting
    if (request.method === 'POST' && pathname === '/api/pins') {
      try {
        const body: any = await request.json();
        const { longitude, latitude, text, author_id = null, audio_id = null, images = null, scout = false } = body;

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

        // --- AI Call 2: Generate Title ---
        try {
          const titleRes: any = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
            prompt: `Generate a very short, 2-to-4 word descriptive title for this message. No quotes, no headers, no prefixes. Just the title.\nMessage: "${text}"`
          });
          const rawTitle = titleRes.response.trim().replace(/^"|"$/g, '');
          if (rawTitle) pinTitle = rawTitle;
        } catch (e) {
          console.error('Title generation failed', e);
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
          'INSERT INTO pins (id, longitude, latitude, type, text, author_id, timestamp, audio_id, title, summary, images) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
          .bind(id, longitude, latitude, pinType, finalText, author_id, timestamp, audio_id, pinTitle, null, images ? JSON.stringify(images) : null)
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
          images,
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

    // POST /api/upload-image - Upload an image to R2
    if (request.method === 'POST' && pathname === '/api/upload-image') {
      try {
        const imageId = crypto.randomUUID() + '.jpg';
        const imageData = await request.arrayBuffer();

        // 1. Store in R2
        try {
          await env.aero_images.put(imageId, imageData, {
            httpMetadata: { contentType: 'image/jpeg' },
          });
          console.log('Successfully saved image to R2:', imageId);
        } catch (r2Err: any) {
          console.error('R2 Image Put Failed:', r2Err.message);
          throw r2Err;
        }

        return new Response(JSON.stringify({ image_id: imageId }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: 'Image Upload failed', details: err.message }), {
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

    // POST /api/friends - Send a friend request
    if (request.method === 'POST' && pathname === '/api/friends') {
      try {
        const { user_id, friend_id } = (await request.json()) as any;
        if (user_id === friend_id) throw new Error('Cannot add self');

        await env.DB.prepare(
          'INSERT OR IGNORE INTO friendships (user_id, friend_id, status) VALUES (?, ?, ?)'
        )
          .bind(user_id, friend_id, 'pending')
          .run();

        return new Response(JSON.stringify({ success: true, status: 'pending' }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // POST /api/friends/accept - Accept a friend request
    if (request.method === 'POST' && pathname === '/api/friends/accept') {
      try {
        const { user_id, friend_id } = (await request.json()) as any;
        
        // Update the existing request to accepted
        // Note: in our schema, 'user_id' is the requester, 'friend_id' is the target (accepting)
        await env.DB.prepare(
          'UPDATE friendships SET status = \'accepted\' WHERE user_id = ? AND friend_id = ?'
        )
          .bind(friend_id, user_id) // requester comes from the other side
          .run();
        
        // Also create a reciprocal friendship if not existing
        await env.DB.prepare(
            'INSERT OR REPLACE INTO friendships (user_id, friend_id, status) VALUES (?, ?, ?)'
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

    // GET /api/friends/requests/:id - Get incoming friend requests
    if (request.method === 'GET' && pathname.startsWith('/api/friends/requests/')) {
        try {
          const userId = pathname.split('/').pop();
          const { results } = await env.DB.prepare(`
            SELECT f.user_id, u.name, u.avatar_url, u.handle 
            FROM friendships f 
            JOIN users u ON f.user_id = u.id 
            WHERE f.friend_id = ? AND f.status = 'pending'
          `)
            .bind(userId)
            .all();
          
          return new Response(JSON.stringify(results), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

    // GET /api/friends/list/:id - Get details for all accepted friends
    if (request.method === 'GET' && pathname.startsWith('/api/friends/list/')) {
        try {
          const userId = pathname.split('/').pop();
          const { results } = await env.DB.prepare(`
            SELECT u.id, u.name, u.avatar_url, u.handle 
            FROM friendships f 
            JOIN users u ON f.friend_id = u.id 
            WHERE f.user_id = ? AND f.status = 'accepted'
          `)
            .bind(userId)
            .all();
          
          return new Response(JSON.stringify(results), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

    // GET /api/discovery - Find new people (exclude current user and already followed)
    if (request.method === 'GET' && pathname === '/api/discovery') {
        try {
          const userId = new URL(request.url).searchParams.get('userId');
          const { results } = await env.DB.prepare(`
            SELECT id, name, avatar_url, handle 
            FROM users 
            WHERE id != ? 
            AND id NOT IN (SELECT friend_id FROM friendships WHERE user_id = ?)
            LIMIT 10
          `)
            .bind(userId, userId)
            .all();
          
          return new Response(JSON.stringify(results), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }
      }

    // GET /api/pins/user/:id - Fetch all pins by a specific user
    if (request.method === 'GET' && pathname.startsWith('/api/pins/user/')) {
        try {
          const authorId = pathname.split('/').pop();
          const { results } = await env.DB.prepare(`
            SELECT * FROM pins WHERE author_id = ? ORDER BY timestamp DESC
          `)
            .bind(authorId)
            .all();
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
              model_id: 'eleven_multilingual_v2',
              voice_settings: { 
                stability: 0.45, 
                similarity_boost: 0.8,
                speed: 0.8 
              },
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
        
        // 2. Weather Code Translator (Open-Meteo)
        const weatherCodeMap: Record<number, string> = {
          0: 'Clear sky',
          1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
          45: 'Fog', 48: 'Depositing rime fog',
          51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
          61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
          71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
          77: 'Snow grains',
          80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
          85: 'Slight snow showers', 86: 'Heavy snow showers',
          95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
        };

        // 3. Concurrent Data Extraction: Structured Weather (Open-Meteo) + Tactical Search (Firecrawl)
        const [weatherData, reconResults] = await Promise.all([
          // A. Structured Weather for Start and End Points
          Promise.all([startCoords, endCoords].map(async (coords, idx) => {
            try {
              const resp = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${coords[1]}&longitude=${coords[0]}&current_weather=true`
              );
              const data: any = await resp.json();
              const current = data.current_weather;
              const pointName = idx === 0 ? 'START' : 'END';
              if (current) {
                const condition = weatherCodeMap[current.weathercode] || `Condition Code ${current.weathercode}`;
                return `${pointName}: ${current.temperature} degrees celsius, ${condition}, Wind: ${current.windspeed} kilometers per hour`;
              }
              return `${pointName}: Weather data unavailable via API.`;
            } catch (e) {
              return `${idx === 0 ? 'START' : 'END'}: Weather fetch failed.`;
            }
          })).then(results => results.join(' | ')),

          // B. Firecrawl: search ONLY for SAFETY and HAZARDS per location
          Promise.all(uniqueTargets.slice(0, 4).map(async (loc) => {
            try {
              const query = `road safety conditions traffic accidents hazards near ${loc}`;
              const fcResp = await fetch('https://api.firecrawl.dev/v1/search', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${env.FIRECRAWL_API_KEY}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query, limit: 3 })
              });
              const data: any = await fcResp.json();
              const webResults = data.data?.web || data.data || [];
              const safetyInfo = (Array.isArray(webResults) && webResults.length > 0)
                ? webResults.map((d: any) => `${d.title || ''}: ${d.description || d.snippet || ''}`).filter(Boolean).join(' | ')
                : 'No critical hazards found in search.';
              
              return `LOCATION: ${loc}\nSAFETY: ${safetyInfo}`;
            } catch (e: any) {
              console.error(`Firecrawl safety search failed:`, e.message);
              return `LOCATION: ${loc}\nSAFETY: Search unavailable.`;
            }
          }))
        ]);

        console.log('📊 Recon complete. Weather:', weatherData);
        console.log('📊 Safety Data Count:', reconResults.length);

        // 4. Synthesize with LLM
        const synthesizedIntel: any = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
          prompt: `${SCOUT_PROMPT}\n\nROUTE: From "${startPlace}" to "${endPlace}"\nSTREETS ON ROUTE: ${streets.join(', ')}\n\nSTRUCTURED WEATHER DATA:\n${weatherData}\n\nRAW SAFETY INTELLIGENCE:\n${reconResults.join('\n\n')}\n\nCombine this into 2-3 natural sentences. ALWAYS start with the current weather conditions. Then, mention only specific hazards if found. If no hazards are mentioned in the intel, just say "The roads look clear ahead." Do not use headers, bold text, or symbols.\n\nTACTICAL BRIEFING:`
        });

        const rawBriefing = synthesizedIntel.response.trim();
        const briefing = sanitizeBriefing(rawBriefing);
        console.log('✅ Briefing sanitized:', briefing);
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
