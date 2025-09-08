import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Create a WAV clip (16kHz mono PCM) of the first N seconds from a remote audio URL using ffmpeg.
 * Tries ffmpeg-static first, then falls back to system ffmpeg.
 */
function resolveFfmpegPath(): string {
  // Highest priority: explicit env override
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('ffmpeg-static');
    const p: string = (mod && (mod.default || mod)) as string;
    if (typeof p === 'string' && p.length > 0) {
      // Next/Turbopack sometimes rewrites the string in logs; validate at runtime
      const cleaned = p.replace(/\s*\[app-route\].*$/i, '');
      if (fs.existsSync(cleaned)) return cleaned;
    }
  } catch {}
  return 'ffmpeg'; // Fallback to system ffmpeg in PATH
}

export async function createWavClipFromUrl(audioUrl: string, seconds: number = 10): Promise<Buffer> {
  // Allow up to 120s to support 90s preview; probes typically pass 8–12s
  const clipSeconds = Math.max(1, Math.min(120, Math.floor(seconds || 10)));

  // Resolve ffmpeg binary
  const ffmpegPath = resolveFfmpegPath();

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const safeUrlLog = (() => {
        try {
          const u = new URL(audioUrl);
          return `${u.origin}${u.pathname}`;
        } catch {
          return '[non-url/opaque]';
        }
      })();
      console.log(`[ffmpeg] Creating WAV clip: ${clipSeconds}s from ${safeUrlLog}`);
      console.log(`[ffmpeg] Binary: ${ffmpegPath || 'ffmpeg (system PATH)'}`);
      const args = [
        '-hide_banner',
        '-loglevel', 'error',
        '-ss', '0',
        '-t', String(clipSeconds),
        '-i', audioUrl,
        '-ar', '16000', // sample rate
        '-ac', '1', // mono
        '-f', 'wav',
        '-acodec', 'pcm_s16le',
        'pipe:1'
      ];
      console.log('[TEST][LANG-001/PREV-001] ffmpeg.args', args.join(' '));

      const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      const chunks: Buffer[] = [];
      proc.stdout.on('data', (d) => chunks.push(d as Buffer));
      const errChunks: Buffer[] = [];
      proc.stderr.on('data', (d) => errChunks.push(d as Buffer));

      proc.on('error', (err) => {
        console.error('[ffmpeg] spawn failed:', err);
        reject(new Error(`ffmpeg spawn failed: ${err.message}`));
      });
      proc.on('close', (code) => {
        if (code === 0) {
          const buf = Buffer.concat(chunks);
          console.log(`[ffmpeg] Clip done (${clipSeconds}s) size=${buf.length} bytes`);
          resolve(buf);
        } else {
          const stderr = Buffer.concat(errChunks).toString('utf8');
          console.error(`[ffmpeg] exited with code ${code}:`, stderr);
          reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
        }
      });
    } catch (e: any) {
      console.error('[ffmpeg] run failed:', e);
      reject(new Error(`Failed to run ffmpeg: ${e.message}`));
    }
  });
}
