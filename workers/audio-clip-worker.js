/**
 * Cloudflare Worker for audio clipping using ffmpeg
 *
 * Deploy this to Cloudflare Workers:
 * 1. npm install -g wrangler
 * 2. wrangler login
 * 3. wrangler deploy
 *
 * Environment variables needed:
 * - R2_BUCKET: Your R2 bucket binding
 * - ALLOWED_ORIGINS: Comma-separated list of allowed origins
 */

export default {
  async fetch(request, env) {
    // CORS handling
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    try {
      const { audioUrl, seconds = 300, startOffset = 0 } = await request.json();

      if (!audioUrl) {
        return new Response(JSON.stringify({ error: 'audioUrl is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Download the audio file
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error(`Failed to download audio: ${audioResponse.statusText}`);
      }

      const audioBuffer = await audioResponse.arrayBuffer();

      // Use ffmpeg.wasm to clip the audio
      // Note: This is a simplified example. You'll need to integrate ffmpeg.wasm properly
      // For production, consider using a service like Cloudflare Stream or AWS MediaConvert

      // For now, return a success response indicating the worker is set up
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Worker is ready. Integrate ffmpeg.wasm for actual processing.',
          inputUrl: audioUrl,
          requestedDuration: seconds,
          startOffset: startOffset,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  },
};