/**
 * Cloudflare Worker for audio passthrough
 *
 * Since ffmpeg.wasm doesn't work in Cloudflare Workers due to missing browser APIs,
 * this worker simply returns the full audio file for now.
 *
 * For real audio clipping in production, consider:
 * 1. Use a different platform (AWS Lambda with ffmpeg layer)
 * 2. Use a dedicated service like Cloudflare Stream
 * 3. Skip clipping and let the full audio be transcribed (with cost implications)
 */

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

      console.log(`[Worker] Passthrough for ${audioUrl} (requested: ${seconds}s from ${startOffset}s)`);
      console.log('[Worker] WARNING: Audio clipping not implemented - returning full audio');

      // Download and return the full audio file
      const headers = new Headers();
      headers.set('User-Agent', 'Mozilla/5.0');
      headers.set('Accept-Language', 'en-US,en;q=0.9');
      if (/[?&]range=/.test(audioUrl)) {
        headers.set('Range', 'bytes=0-');
      }

      const audioResponse = await fetch(audioUrl, { headers });
      if (!audioResponse.ok) {
        throw new Error(`Failed to download audio: ${audioResponse.statusText}`);
      }

      const audioData = await audioResponse.arrayBuffer();
      const contentType = audioResponse.headers.get('content-type') || 'audio/wav';

      console.log(`[Worker] Returning full audio: ${audioData.byteLength} bytes`);

      // Return the full audio file
      return new Response(audioData, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': contentType,
          'Content-Length': audioData.byteLength.toString(),
        },
      });
    } catch (error) {
      console.error('[Worker] Error:', error);
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
