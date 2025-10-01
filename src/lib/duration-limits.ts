/**
 * Duration limits for different user tiers
 * Controls upload limits and display limits for transcription
 */

import { UserTier } from '@/services/user-tier';

export interface TierDurationLimits {
  maxUploadSeconds: number;           // 单次上传时长上限（秒）
  displaySecondsPerTranscription: number;  // 单次显示时长（秒）
  monthlyDisplaySeconds: number | null;    // 月度累计显示上限（秒），null 表示无限制
}

/**
 * Get upload limit (max duration for a single file) for a user tier
 * This prevents users from uploading excessively long audio files
 *
 * @param tier - User tier
 * @param userUuid - User UUID (undefined for anonymous users)
 * @returns Maximum upload duration in seconds, -1 means unlimited
 */
export function getUploadLimitForTier(
  tier: UserTier | string,
  userUuid?: string
): number {
  // Anonymous users
  if (!userUuid) {
    return 900; // 15 minutes for anonymous
  }

  const tierStr = String(tier).toLowerCase();

  switch (tierStr) {
    case 'free':
      return 1800;   // 30 minutes
    case 'basic':
      return 3600;   // 60 minutes (unchanged)
    case 'pro':
      return 10800;  // 180 minutes = 3 hours (unchanged)
    case 'premium':
      return -1;     // unlimited
    default:
      return 1800;   // default to FREE
  }
}

/**
 * Get display limit (how much of the transcription result to show) for a user tier
 *
 * @param tier - User tier
 * @param userUuid - User UUID (undefined for anonymous users)
 * @returns Seconds to display per transcription, -1 means show full result
 */
export function getDisplayLimitForTier(
  tier: UserTier | string,
  userUuid?: string
): number {
  // Anonymous users
  if (!userUuid) {
    return 180; // Show first 3 minutes
  }

  const tierStr = String(tier).toLowerCase();

  switch (tierStr) {
    case 'free':
      return 300;    // Show first 5 minutes
    case 'basic':
    case 'pro':
    case 'premium':
      return -1;     // Show full result
    default:
      return 300;    // default to FREE
  }
}

/**
 * Get monthly display limit (cumulative seconds of transcription results shown per month)
 * Only applies to FREE tier
 *
 * @param tier - User tier
 * @param userUuid - User UUID (undefined for anonymous users)
 * @returns Monthly display limit in seconds, null means no monthly limit
 */
export function getMonthlyDisplayLimitForTier(
  tier: UserTier | string,
  userUuid?: string
): number | null {
  if (!userUuid) {
    return null; // Anonymous users have daily limit instead
  }

  const tierStr = String(tier).toLowerCase();

  switch (tierStr) {
    case 'free':
      return 1800;   // 30 minutes per month
    case 'basic':
    case 'pro':
    case 'premium':
      return null;   // No monthly display limit
    default:
      return 1800;
  }
}

/**
 * Format seconds to human-readable string
 */
export function formatSeconds(seconds: number): string {
  if (seconds < 0) return 'unlimited';
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
}

/**
 * Get all limits for a user tier (for display/logging)
 */
export function getTierLimits(
  tier: UserTier | string,
  userUuid?: string
): TierDurationLimits {
  return {
    maxUploadSeconds: getUploadLimitForTier(tier, userUuid),
    displaySecondsPerTranscription: getDisplayLimitForTier(tier, userUuid),
    monthlyDisplaySeconds: getMonthlyDisplayLimitForTier(tier, userUuid)
  };
}