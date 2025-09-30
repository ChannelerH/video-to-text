import { existsSync } from 'fs';
import ffmpegStatic from 'ffmpeg-static';

let cachedPath: string | null = null;

/**
 * Resolve an ffmpeg binary path that works in both local dev and serverless environments.
 * Priority order: explicit env override -> packaged ffmpeg-static binary -> system PATH fallback.
 */
export function getFfmpegPath(): string {
  if (cachedPath) return cachedPath;

  const envPath = process.env.FFMPEG_PATH?.trim();
  if (envPath) {
    cachedPath = envPath;
    return cachedPath;
  }

  if (typeof ffmpegStatic === 'string' && ffmpegStatic.length > 0) {
    const candidate = ffmpegStatic.replace(/\s*\[app-route\].*$/i, '');
    if (existsSync(candidate)) {
      cachedPath = candidate;
      return cachedPath;
    }
  }

  cachedPath = 'ffmpeg';
  return cachedPath;
}
