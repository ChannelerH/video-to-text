/**
 * Format timestamp with responsive display:
 * - Mobile (<640px): Simple MM:SS format
 * - Desktop (≥640px): Full HH:MM:SS format for videos longer than 1 hour
 */
export function formatTime(seconds: number, options?: { forceFull?: boolean }): string {
  if (isNaN(seconds) || !isFinite(seconds)) seconds = 0;

  const total = Math.max(0, seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);

  // For short videos (<1 hour) or when not forcing full format, use MM:SS
  if (hrs === 0 && !options?.forceFull) {
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // For longer videos, use HH:MM:SS
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Format timestamp specifically for mobile - always simple MM:SS
 */
export function formatTimeMobile(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) seconds = 0;

  const total = Math.max(0, seconds);
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);

  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Format timestamp with millisecond precision.
 */
export function formatTimeWithMilliseconds(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) seconds = 0;

  const total = Math.max(0, seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);

  const base = hrs > 0
    ? `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return `${base}.${String(ms).padStart(3, '0')}`;
}

/**
 * Check if we're on mobile viewport
 * Note: This is a client-side check only
 */
export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 640;
}
