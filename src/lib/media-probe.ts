import { spawn } from 'child_process';
import fs from 'fs';

function resolveFfmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('ffmpeg-static');
    const p: string = (mod && (mod.default || mod)) as string;
    if (typeof p === 'string' && p.length > 0) {
      const cleaned = p.replace(/\s*\[app-route\].*$/i, '');
      if (fs.existsSync(cleaned)) return cleaned;
    }
  } catch {}
  return 'ffmpeg';
}

/**
 * Best-effort probe to get media duration in seconds using ffmpeg.
 * Works for most HTTP(S) URLs and R2 public URLs.
 */
export async function probeDurationSeconds(url: string, timeoutMs: number = 15000): Promise<number | null> {
  const ffmpegPath = resolveFfmpegPath();
  return new Promise<number | null>((resolve) => {
    try {
      const args = ['-hide_banner', '-i', url, '-f', 'null', '-'];
      const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      const to = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch {}
        resolve(null);
      }, timeoutMs);
      proc.stderr.on('data', (d) => { stderr += String(d); });
      proc.on('error', () => { clearTimeout(to); resolve(null); });
      proc.on('close', () => {
        clearTimeout(to);
        // Parse a line like: Duration: 00:10:31.25,
        const m = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})[\.,](\d{2})/);
        if (!m) return resolve(null);
        const h = parseInt(m[1], 10) || 0;
        const min = parseInt(m[2], 10) || 0;
        const s = parseInt(m[3], 10) || 0;
        const cs = parseInt(m[4], 10) || 0; // centiseconds
        const total = h * 3600 + min * 60 + s + (cs / 100);
        resolve(Math.round(total));
      });
    } catch {
      resolve(null);
    }
  });
}

