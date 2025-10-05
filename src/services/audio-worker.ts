import { resolvePublicR2Base } from '@/services/r2-utils';

type WorkerUploadResponse = {
  uploadedUrl?: string | null;
  key?: string;
  success?: boolean;
};

type WorkerUploadParams = {
  jobId: string;
  sourceUrl: string;
  videoId?: string;
  sourceHash?: string | null;
  action?: string;
  bucketPrefix?: string;
};

export async function uploadAudioViaWorker(params: WorkerUploadParams): Promise<WorkerUploadResponse | null> {
  const {
    jobId,
    sourceUrl,
    videoId,
    sourceHash,
    action = 'youtube-upload',
    bucketPrefix,
  } = params;

  const workerUrl = process.env.YOUTUBE_TRANSFER_WORKER_URL || process.env.AUDIO_CLIP_WORKER_URL;
  if (!workerUrl) {
    return null;
  }

  const payload: Record<string, unknown> = {
    action,
    sourceUrl,
    audioUrl: sourceUrl,
    videoId: videoId ?? jobId,
    jobId,
  };

  const prefix = bucketPrefix || process.env.YOUTUBE_WORKER_BUCKET_PREFIX;
  if (prefix) {
    payload.bucketPrefix = prefix;
  }

  const publicUrlBase = resolvePublicR2Base();
  if (publicUrlBase) {
    payload.publicUrlBase = publicUrlBase;
  }

  if (sourceHash) {
    payload.sourceHash = sourceHash;
  }

  const callbackSecret = process.env.WORKER_UPLOAD_SECRET;
  const callbackBase =
    process.env.WORKER_CALLBACK_BASE_URL ||
    process.env.CALLBACK_BASE_URL ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (callbackSecret && callbackBase) {
    try {
      const callbackUrl = new URL(
        `/api/internal/transcriptions/${encodeURIComponent(jobId)}/processed-url`,
        callbackBase,
      );
      payload.callbackUrl = callbackUrl.toString();
      payload.callbackSecret = callbackSecret;
    } catch (error) {
      console.error('[Audio Worker] Failed to construct callback URL', error);
    }
  }

  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[Audio Worker] Upload failed', {
        status: response.status,
        statusText: response.statusText,
        errorText,
      });
      return null;
    }

    const result: WorkerUploadResponse = await response.json().catch(() => ({}));
    if (result.success === false) {
      console.error('[Audio Worker] Worker explicitly reported failure', result);
      return null;
    }

    return {
      uploadedUrl: typeof result.uploadedUrl === 'string' ? result.uploadedUrl : null,
      key: typeof result.key === 'string' ? result.key : undefined,
    };
  } catch (error) {
    console.error('[Audio Worker] Upload request crashed', error);
    return null;
  }
}
