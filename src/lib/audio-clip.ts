import { spawn } from 'child_process';
import { getFfmpegPath } from '@/lib/ffmpeg-path';
import { ffmpegEnabled } from '@/lib/ffmpeg-config';
import { logger } from '@/lib/logger';

/**
 * Create a WAV clip (16kHz mono PCM) of the first N seconds from a remote audio URL using ffmpeg.
 * On Vercel, uses Cloudflare Worker. In local dev, uses local ffmpeg.
 */
export async function createWavClipFromUrl(audioUrl: string, seconds: number = 10, startOffset: number = 0): Promise<Buffer> {
  if (!ffmpegEnabled) {
    throw new Error('FFmpeg is disabled');
  }
  // Allow up to 300s to support 5-minute clips for Free users
  const clipSeconds = Math.max(1, Math.min(300, Math.floor(seconds || 10)));
  const offsetSeconds = Math.max(0, Math.floor(startOffset || 0));

  // Local dev: use local ffmpeg
  const ffmpegPath = getFfmpegPath();

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
      console.log(`[ffmpeg] Creating WAV clip: ${clipSeconds}s from ${safeUrlLog} (offset: ${offsetSeconds}s)`);
      console.log(`[ffmpeg] Binary: ${ffmpegPath || 'ffmpeg (system PATH)'}`);
      const args = [
        '-hide_banner',
        '-loglevel', 'error',
        '-ss', String(offsetSeconds),
        '-t', String(clipSeconds),
        '-i', audioUrl,
        '-ar', '16000', // sample rate
        '-ac', '1', // mono
        '-f', 'wav',
        '-acodec', 'pcm_s16le',
        'pipe:1'
      ];
      console.log('[FREE_CLIP][ffmpeg] Command:', `ffmpeg ${args.join(' ')}`.replace(audioUrl, safeUrlLog));
      console.log('[FREE_CLIP][ffmpeg] Clip parameters:', {
        startOffset: offsetSeconds,
        duration: clipSeconds,
        sampleRate: 16000,
        channels: 'mono',
        format: 'WAV PCM 16-bit'
      });

      const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      const chunks: Buffer[] = [];
      proc.stdout.on('data', (d) => chunks.push(d as Buffer));
      const errChunks: Buffer[] = [];
      proc.stderr.on('data', (d) => errChunks.push(d as Buffer));

      proc.on('error', async (err) => {
        console.error('[ffmpeg] spawn failed:', err);
        logger.error(err, {
          context: 'ffmpeg_spawn_error',
          payload: {
            audioUrl: safeUrlLog,
            clipSeconds,
            offsetSeconds,
          },
        });
        reject(new Error(`ffmpeg spawn failed: ${err.message}`));
      });
      proc.on('close', async (code, signal) => {
        if (code === 0) {
          const buf = Buffer.concat(chunks);
          const expectedSize = clipSeconds * 16000 * 2; // 16kHz, 16-bit mono
          console.log(`[FREE_CLIP][ffmpeg] Clip completed successfully:`, {
            requestedDuration: clipSeconds,
            outputSize: buf.length,
            outputSizeMB: (buf.length / 1024 / 1024).toFixed(2),
            expectedSizeBytes: expectedSize,
            sizeRatio: (buf.length / expectedSize).toFixed(2)
          });
          resolve(buf);
          return;
        }

        const stderr = Buffer.concat(errChunks).toString('utf8');
        console.error(`[ffmpeg] exited abnormally`, {
          code,
          signal,
          stderr,
        });
        logger.error(new Error(`ffmpeg exited with code ${code ?? 'null'}${signal ? ` signal ${signal}` : ''}`), {
          context: 'ffmpeg_process_exit',
          payload: {
            code,
            signal,
            stderr,
            audioUrl: safeUrlLog,
            clipSeconds,
            offsetSeconds,
          },
        });
        reject(new Error(`ffmpeg exited with code ${code ?? 'null'}${signal ? ` signal ${signal}` : ''}: ${stderr}`));
      });
    } catch (e: any) {
      console.error('[ffmpeg] run failed:', e);
      reject(new Error(`Failed to run ffmpeg: ${e.message}`));
    }
  });
}
