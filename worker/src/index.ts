export interface Env {
  DB: D1Database;
  AI: Ai;
  aero_audio_clips: R2Bucket;
  ELEVENLABS_API_KEY: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url);

    // GET /api/pins - Fetch all pins
    if (request.method === 'GET' && pathname === '/api/pins') {
      try {
        const { results } = await env.DB.prepare('SELECT * FROM pins ORDER BY timestamp DESC').all();
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

    // POST /api/pins - Create a pin with AI classification
    if (request.method === 'POST' && pathname === '/api/pins') {
      try {
        const body: any = await request.json();
        const { longitude, latitude, text, author, audio_id = null } = body;

        // Perform AI Classification & Content Generation
        let pinType = 'scenic';
        let pinTitle = 'Voice Note';
        let pinSummary = '';

        const authorName = author && author !== 'Anonymous' && author !== 'Rider' ? author : 'your friend';

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

        // --- AI Call 2: Generate a SHORT title (2-4 words max) ---
        try {
          const titleRes: any = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
            prompt: `Create a 2-4 word title for this message. Reply with ONLY the title, no punctuation, no quotes, no explanation.\nMessage: "${text}"\nTitle:`
          });
          pinTitle = titleRes.response.trim().replace(/^["'\s]+|["'\s]+$/g, '').split('\n')[0].trim();
          if (!pinTitle || pinTitle.length > 50) pinTitle = 'Voice Note';
        } catch (e) {
          console.error('Title generation failed', e);
        }

        // --- AI Call 3: Generate a friendly summary ---
        try {
          const summaryRes: any = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
            prompt: `Summarize this message in one short friendly sentence (under 15 words) starting with "Hey, ${authorName}". Do not repeat—paraphrase it.\nMessage: "${text}"\nSummary:`
          });
          pinSummary = summaryRes.response.trim().replace(/^["'\s]+|["'\s]+$/g, '').split('\n')[0].trim();
          if (!pinSummary) pinSummary = `Hey, ${authorName} left a voice message here.`;
        } catch (e) {
          console.error('Summary generation failed', e);
          pinSummary = `Hey, ${authorName} left a voice message here.`;
        }

        const id = crypto.randomUUID();
        const timestamp = Date.now();

        console.log('Final Data to Store:', { id, pinType, pinTitle, pinSummary });

        await env.DB.prepare(
          'INSERT INTO pins (id, longitude, latitude, type, text, author, timestamp, audio_id, title, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
          .bind(id, longitude, latitude, pinType, text, author || 'Anonymous', timestamp, audio_id, pinTitle, pinSummary)
          .run();

        return new Response(JSON.stringify({ 
          id, 
          type: pinType, 
          text, 
          title: pinTitle, 
          summary: pinSummary, 
          longitude, 
          latitude, 
          timestamp, 
          audio_id,
          author: author || 'Anonymous'
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

    // POST /api/summarize - Use AI to group pins into a single script
    if (request.method === 'POST' && pathname === '/api/summarize') {
      try {
        const { pins } = (await request.json()) as any;
        if (!pins || pins.length === 0) return new Response('No pins shared', { status: 400 });

        const messageData = pins.map((p: any) => `[${p.type.toUpperCase()}]: ${p.text}`).join('\n');

        const summaryPrompt = `You are a premium AI Co-Pilot for a motorcyclist. 
        Summarize the following reports into ONE concise, professional 5-10 second announcement.
        Focus on safety first. Keep it extremely brief for a rider at speed.
        
        REPORTS:
        ${messageData}
        
        ANNOUNCEMENT:`;

        const aiResponse: any = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
          prompt: summaryPrompt,
          max_tokens: 60
        });

        const script = aiResponse.response.trim().replace(/^"/, '').replace(/"$/, '');

        return new Response(JSON.stringify({ script }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: 'Summarization failed', details: err.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    // POST /api/tts - Convert text to speech via ElevenLabs
    if (request.method === 'POST' && pathname === '/api/tts') {
      try {
        const { text, voiceId = '21m00Tcm4TlvDq8ikWAM' } = (await request.json()) as any; // Default: 'Rachel'

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
              model_id: 'eleven_monolingual_v1',
              voice_settings: { stability: 0.5, similarity_boost: 0.5 },
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

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  },
};
