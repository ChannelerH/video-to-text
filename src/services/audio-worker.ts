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

  const workerUrl = process.env.YOUTUBE_TRANSFER_WORKER_URL;
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
    const logPayload = { ...payload } as Record<string, unknown>;
    if (logPayload.callbackSecret) {
      logPayload.callbackSecret = '[REDACTED]';
    }
    console.log('[Audio Worker=====================] Upload request payload', {
      workerUrl,
      payload: logPayload,
    });

    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text().catch(() => '');

    console.log('[Audio Worker=====================] Worker raw response', {
      status: response.status,
      statusText: response.statusText,
      body: responseText,
    });

    if (!response.ok) {
      console.error('[Audio Worker] Upload failed', {
        status: response.status,
        statusText: response.statusText,
        errorText: responseText,
      });
      return null;
    }

    let result: WorkerUploadResponse;
    try {
      result = responseText ? (JSON.parse(responseText) as WorkerUploadResponse) : {};
    } catch (error) {
      console.error('[Audio Worker] Failed to parse worker JSON response', {
        error,
        responseText,
      });
      result = {};
    }

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
