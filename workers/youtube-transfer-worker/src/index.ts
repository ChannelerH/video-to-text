const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type BucketLike = {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    }
  ) => Promise<unknown>;
};

type WorkerEnv = {
  YOUTUBE_AUDIO_BUCKET?: BucketLike;
  R2_PUBLIC_BASE?: string;
  PUBLIC_R2_DOMAIN?: string;
  [key: string]: unknown;
};

type UploadRequestBody = {
  sourceUrl?: string;
  videoId?: string;
  jobId?: string;
  bucketPrefix?: string;
  contentType?: string;
  publicUrlBase?: string;
};

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    try {
      const {
        sourceUrl,
        videoId,
        jobId,
        bucketPrefix = 'youtube-audio',
        contentType,
        publicUrlBase,
      } = await request.json<UploadRequestBody>();

      if (!sourceUrl) {
        return json({ error: 'sourceUrl is required' }, 400);
      }

      const bucket = env.YOUTUBE_AUDIO_BUCKET;
      if (!bucket) {
        return json({ error: 'R2 bucket not bound' }, 500);
      }

      const downloadResp = await fetch(sourceUrl);
      if (!downloadResp.ok) {
        return json({ error: `fetch source failed (${downloadResp.status})` }, 502);
      }

      const data = await downloadResp.arrayBuffer();
      const inferredType = contentType || downloadResp.headers.get('content-type') || 'audio/mpeg';
      const safeVideoId = sanitize(videoId) || 'yt';
      const key = `${trimTrailingSlashes(bucketPrefix) || 'youtube-audio'}/${safeVideoId}_${Date.now()}.mp3`;

      await bucket.put(key, data, {
        httpMetadata: { contentType: inferredType },
        customMetadata: { videoId: safeVideoId, jobId: jobId || '' },
      });

      const base = trimTrailingSlashes(publicUrlBase || env.R2_PUBLIC_BASE || env.PUBLIC_R2_DOMAIN || '') || null;
      const publicUrl = base ? `${base}/${key}` : null;

      return json({ success: true, key, uploadedUrl: publicUrl, bytes: data.byteLength });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ error: message }, 500);
    }
  },
};

function sanitize(value: unknown): string {
  if (!value || typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
}

function trimTrailingSlashes(value: unknown): string {
  if (!value || typeof value !== 'string') return '';
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end--;
  return value.slice(0, end);
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
