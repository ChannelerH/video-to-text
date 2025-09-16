// Centralized product policy: per-tier limits and preview controls
import { UserTier } from '@/services/user-tier';

export interface TierLimits {
  maxFileMinutes: number;   // per-file duration cap
  maxFileSizeMB: number;    // per-file size cap
  retentionDays: number;    // storage retention in days
  previewSeconds?: number;  // FREE preview seconds for gated features
}

export const POLICY = {
  preview: {
    freePreviewSeconds: 300,      // 5 minutes preview for AI/diarization/export
    freeMonthlyAiChapters: 20,     // per month
    freeMonthlyAiSummary: 20       // per month
  },
  limits: (tier: UserTier): TierLimits => {
    switch (tier) {
      case UserTier.PRO:
        return { maxFileMinutes: 240, maxFileSizeMB: 1024, retentionDays: 365 };
      case UserTier.BASIC:
        return { maxFileMinutes: 120, maxFileSizeMB: 500, retentionDays: 90 };
      case UserTier.FREE:
      default:
        return { maxFileMinutes: 15, maxFileSizeMB: 100, retentionDays: 7, previewSeconds: 300 };
    }
  }
};

// Helper: trim segments to preview window seconds
export function trimSegmentsToSeconds<T extends { start: number; end: number }>(
  segments: T[],
  seconds: number
): T[] {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  return segments
    .filter((s) => s.start < seconds)
    .map((s) => ({
      ...(s as any),
      end: Math.min(s.end, seconds)
    }));
}

// In-memory feature usage tracker (best-effort; consider DB later)
type FeatureKey = 'ai_chapters' | 'ai_summary';
const usageMap = new Map<string, number>();

export function featureKey(userId: string | undefined, feature: FeatureKey): string {
  const month = new Date();
  const ym = `${month.getUTCFullYear()}-${month.getUTCMonth() + 1}`;
  return `${feature}:${userId || 'anon'}:${ym}`;
}

export function getMonthlyUsage(userId: string | undefined, feature: FeatureKey): number {
  const key = featureKey(userId, feature);
  return usageMap.get(key) || 0;
}

export function incMonthlyUsage(userId: string | undefined, feature: FeatureKey): void {
  const key = featureKey(userId, feature);
  usageMap.set(key, (usageMap.get(key) || 0) + 1);
}

