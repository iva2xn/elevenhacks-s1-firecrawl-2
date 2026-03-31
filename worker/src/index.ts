export interface Env {
  DB: D1Database;
  AI: Ai;
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

    // POST /api/pins - Create a pin with AI classification
    if (request.method === 'POST' && pathname === '/api/pins') {
      try {
        const body: any = await request.json();
        const { longitude, latitude, text, author } = body;

        // Perform AI Classification using Workers AI (Llama 3)
        let pinType = 'scenic'; // default
        try {
          const aiPrompt = `Categorize the following message for a motorcyclist. 
          Return ONLY ONE WORD from this list: HAZARD, FRIEND, SCENIC.
          Message: "${text}"`;

          const aiResponse: any = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
            prompt: aiPrompt,
          });

          const resultText = aiResponse.response.trim().toUpperCase();
          if (resultText.includes('HAZARD')) pinType = 'hazard';
          else if (resultText.includes('FRIEND')) pinType = 'friend';
          else pinType = 'scenic';
        } catch (aiErr) {
          console.error('AI Classification failed', aiErr);
        }

        const id = crypto.randomUUID();
        const timestamp = Date.now();

        await env.DB.prepare(
          'INSERT INTO pins (id, longitude, latitude, type, text, author, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
          .bind(id, longitude, latitude, pinType, text, author || 'Anonymous', timestamp)
          .run();

        return new Response(JSON.stringify({ id, type: pinType, text, longitude, latitude, timestamp }), {
          status: 201,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Error creating pin', details: err }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  },
};
