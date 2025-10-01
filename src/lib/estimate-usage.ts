import { POLICY } from '@/services/policy';
import { UserTier } from '@/services/user-tier';
import { YouTubeService } from '@/lib/youtube';
import { getDurationFromUrl } from '@/lib/audio-duration';

export type TranscriptionSourceKind = 'youtube_url' | 'file_upload' | 'audio_url';

interface EstimateParams {
  type: TranscriptionSourceKind;
  content: string;
  userTier: UserTier;
  options?: Record<string, any>;
  userUuid: string;
  modelType: 'standard' | 'high_accuracy';
}

function extractDurationSeconds(options?: Record<string, any>): number | null {
  if (!options) return null;
  const candidates = [
    options.estimatedDurationSec,
    options.probedDurationSec,
    options.originalDurationSec,
    options.durationSec,
    options.duration_seconds,
    options.metadata?.duration
  ];

  for (const value of candidates) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
}

export async function computeEstimatedMinutes(params: EstimateParams): Promise<number> {
  const options = params.options ?? {};
  if (!params.options) {
    (params as any).options = options;
  }
  const { type, content, userTier, userUuid, modelType } = params;

  const explicitDuration = extractDurationSeconds(options);
  const hasExplicitDuration = explicitDuration !== null;
  let estimatedSeconds: number | null = explicitDuration;

  if (userTier === UserTier.FREE) {
    const previewSec = POLICY.preview.freePreviewSeconds || 300;
    const clipSeconds = Number(options.trimToSeconds) || previewSec;
    estimatedSeconds = Math.min(estimatedSeconds ?? clipSeconds, clipSeconds);
  }

  if (estimatedSeconds === null) {
    if (type === 'youtube_url') {
      try {
        const parsedId = YouTubeService.validateAndParseUrl(content);

        if (!parsedId) {
          console.warn('[EstimateUsage] Failed to parse YouTube URL for duration estimate', { content });
        } else {
          const info = await YouTubeService.getVideoInfo(parsedId);
          if (info?.duration && Number.isFinite(info.duration) && info.duration > 0) {
            options.youtubeVideoId = parsedId;
            options.estimatedDurationSec = info.duration;
            estimatedSeconds = info.duration;
          }
        }
      } catch (error) {
        console.warn('[EstimateUsage] YouTube duration fetch failed', error);
      }
    } else if (type === 'audio_url' || type === 'file_upload') {
      try {
        const duration = await getDurationFromUrl(content);
        if (duration !== null && Number.isFinite(duration) && duration > 0) {
          options.estimatedDurationSec = duration;
          estimatedSeconds = duration;
        }
      } catch (error) {
        console.warn('[EstimateUsage] Failed to read media duration', error);
      }
    }
  }

  if (estimatedSeconds === null) {
    estimatedSeconds = 10 * 60;
  }

  const estimatedMinutes = Math.max(1, Math.ceil(estimatedSeconds / 60));

  let packCoverageMinutes = 0;
  try {
    const { getEstimatedPackCoverage } = await import('@/services/minutes');
    packCoverageMinutes = await getEstimatedPackCoverage(userUuid, estimatedMinutes, modelType);
  } catch {
    packCoverageMinutes = 0;
  }

  let leftoverMinutes = Math.max(0, estimatedMinutes - packCoverageMinutes);

  if (
    userTier === UserTier.FREE &&
    !hasExplicitDuration &&
    packCoverageMinutes > 0 &&
    leftoverMinutes > 0
  ) {
    leftoverMinutes = Math.min(leftoverMinutes, 1);
  }

  return leftoverMinutes;
}
