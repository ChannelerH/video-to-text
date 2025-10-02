import { existsSync, chmodSync } from 'fs';
import { join, dirname, resolve } from 'path';
import os from 'os';
import { ffmpegEnabled } from '@/lib/ffmpeg-config';

let cachedPath: string | null = null;

function resolveInstallerBinary(): string | null {
  const platformKey = `${os.platform()}-${os.arch()}`;
  const binaryName = os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

  try {
    const packageDir = dirname(require.resolve('@ffmpeg-installer/ffmpeg/package.json'));
    const candidateRoots = [
      resolve(packageDir, '..', platformKey),
      resolve(packageDir, platformKey),
    ];

    for (const root of candidateRoots) {
      const candidate = join(root, binaryName);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[ffmpeg-path] @ffmpeg-installer/ffmpeg not available: ${message}`);
  }

  const fallbackRoots = [
    join(process.cwd(), 'node_modules', '@ffmpeg-installer', platformKey),
    join(process.cwd(), '..', 'node_modules', '@ffmpeg-installer', platformKey),
  ];

  for (const root of fallbackRoots) {
    const candidate = join(root, binaryName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Resolve an ffmpeg binary path that works in both local dev and serverless environments.
 * Priority order: explicit env override -> @ffmpeg-installer -> ffmpeg-static -> system PATH fallback.
 */
export function getFfmpegPath(): string {
  if (cachedPath) return cachedPath;

  if (!ffmpegEnabled) {
    cachedPath = 'ffmpeg';
    console.log('[ffmpeg-path] FFmpeg disabled; using placeholder command');
    return cachedPath;
  }

  const envPath = process.env.FFMPEG_PATH?.trim();
  if (envPath) {
    console.log(`[ffmpeg-path] Using env FFMPEG_PATH: ${envPath}`);
    cachedPath = envPath;
    return cachedPath;
  }

  // Try @ffmpeg-installer/ffmpeg first (better Vercel support)
  const installerPath = resolveInstallerBinary();

  if (installerPath) {
    try {
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
    } catch (e) {
      console.error(`[ffmpeg-path] Error verifying installer path ${installerPath}:`, e);
    }
  }

  // Fallback to ffmpeg-static
  let ffmpegStatic: string | null = null;
  try {
    ffmpegStatic = require('ffmpeg-static');
    console.log(`[ffmpeg-path] ffmpeg-static raw path: ${ffmpegStatic}`);
  } catch (e) {
    console.log(`[ffmpeg-path] ffmpeg-static not available:`, (e as Error).message);
  }

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
