import { existsSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import ffmpegStatic from 'ffmpeg-static';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

let cachedPath: string | null = null;

/**
 * Resolve an ffmpeg binary path that works in both local dev and serverless environments.
 * Priority order: explicit env override -> @ffmpeg-installer -> ffmpeg-static -> system PATH fallback.
 */
export function getFfmpegPath(): string {
  if (cachedPath) return cachedPath;

  const envPath = process.env.FFMPEG_PATH?.trim();
  if (envPath) {
    console.log(`[ffmpeg-path] Using env FFMPEG_PATH: ${envPath}`);
    cachedPath = envPath;
    return cachedPath;
  }

  // Try @ffmpeg-installer/ffmpeg first (better Vercel support)
  const installerPath = ffmpegInstaller?.path;
  console.log(`[ffmpeg-path] @ffmpeg-installer/ffmpeg path: ${installerPath}`);

  if (installerPath) {
    try {
      // Try to make it executable
      if (existsSync(installerPath)) {
        try {
          chmodSync(installerPath, 0o755);
        } catch (e) {
          console.warn(`[ffmpeg-path] Could not chmod ${installerPath}:`, e);
        }
        console.log(`[ffmpeg-path] Using @ffmpeg-installer: ${installerPath}`);
        cachedPath = installerPath;
        return cachedPath;
      }

      // Try alternative paths in node_modules
      const alternatives = [
        join(process.cwd(), 'node_modules', '@ffmpeg-installer', 'linux-x64', 'ffmpeg'),
        join(process.cwd(), 'node_modules', '@ffmpeg-installer', 'darwin-x64', 'ffmpeg'),
        join(process.cwd(), 'node_modules', '@ffmpeg-installer', 'darwin-arm64', 'ffmpeg'),
      ];

      for (const altPath of alternatives) {
        if (existsSync(altPath)) {
          try {
            chmodSync(altPath, 0o755);
          } catch (e) {
            console.warn(`[ffmpeg-path] Could not chmod ${altPath}:`, e);
          }
          console.log(`[ffmpeg-path] Using alternative @ffmpeg-installer path: ${altPath}`);
          cachedPath = altPath;
          return cachedPath;
        }
      }
    } catch (e) {
      console.error(`[ffmpeg-path] Error resolving @ffmpeg-installer:`, e);
    }
  }

  // Fallback to ffmpeg-static
  console.log(`[ffmpeg-path] ffmpeg-static raw path: ${ffmpegStatic}`);
  if (typeof ffmpegStatic === 'string' && ffmpegStatic.length > 0) {
    const candidate = ffmpegStatic.replace(/\s*\[app-route\].*$/i, '');
    console.log(`[ffmpeg-path] ffmpeg-static cleaned path: ${candidate}`);

    if (existsSync(candidate)) {
      try {
        chmodSync(candidate, 0o755);
      } catch (e) {
        console.warn(`[ffmpeg-path] Could not chmod ${candidate}:`, e);
      }
      console.log(`[ffmpeg-path] Using ffmpeg-static: ${candidate}`);
      cachedPath = candidate;
      return cachedPath;
    }

    // Try to find ffmpeg-static in node_modules
    const staticAlternatives = [
      join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg'),
      join(dirname(require.resolve('ffmpeg-static')), 'ffmpeg'),
    ];

    for (const altPath of staticAlternatives) {
      if (existsSync(altPath)) {
        try {
          chmodSync(altPath, 0o755);
        } catch (e) {
          console.warn(`[ffmpeg-path] Could not chmod ${altPath}:`, e);
        }
        console.log(`[ffmpeg-path] Using alternative ffmpeg-static path: ${altPath}`);
        cachedPath = altPath;
        return cachedPath;
      }
    }
  }

  // Last resort: try common system paths in serverless environments
  const systemPaths = [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/bin/ffmpeg',
    'ffmpeg'
  ];

  for (const path of systemPaths) {
    if (path !== 'ffmpeg' && existsSync(path)) {
      console.log(`[ffmpeg-path] Found system ffmpeg: ${path}`);
      cachedPath = path;
      return cachedPath;
    }
  }

  console.log(`[ffmpeg-path] No ffmpeg found, falling back to PATH: ffmpeg`);
  cachedPath = 'ffmpeg';
  return cachedPath;
}
