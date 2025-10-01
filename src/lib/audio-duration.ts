/**
 * Audio Duration Parser
 *
 * Extracts duration from audio files using music-metadata library.
 * Works without ffmpeg, making it compatible with Vercel serverless functions.
 */

import { parseBuffer } from 'music-metadata';
import { Readable } from 'stream';

/**
 * Get audio duration from a Buffer
 * @param buffer - Audio file buffer
 * @returns Duration in seconds, or null if parsing fails
 */
export async function getDurationFromBuffer(buffer: Buffer): Promise<number | null> {
  try {
    const metadata = await parseBuffer(buffer);
    const duration = metadata.format.duration;

    if (duration === undefined || duration === null) {
      console.error('[Audio Duration] Could not extract duration from buffer');
      return null;
    }

    console.log(`[Audio Duration] Extracted from buffer: ${duration.toFixed(2)}s`);
    return duration;
  } catch (error: any) {
    console.error('[Audio Duration] Failed to parse buffer:', error?.message || error);
    return null;
  }
}

/**
 * Get audio duration from a URL (downloads and parses)
 * @param url - Audio file URL
 * @returns Duration in seconds, or null if parsing fails
 */
export async function getDurationFromUrl(url: string): Promise<number | null> {
  try {
    console.log(`[Audio Duration] Fetching audio from URL: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const metadata = await parseBuffer(buffer, {
      mimeType: response.headers.get('content-type') || undefined,
      size: parseInt(response.headers.get('content-length') || '0') || undefined
    });

    const duration = metadata.format.duration;

    if (duration === undefined || duration === null) {
      console.error('[Audio Duration] Could not extract duration from URL');
      return null;
    }

    console.log(`[Audio Duration] Extracted from URL: ${duration.toFixed(2)}s`);
    return duration;
  } catch (error: any) {
    console.error('[Audio Duration] Failed to parse URL:', error?.message || error);
    return null;
  }
}

/**
 * Get audio duration from a ReadableStream (for file uploads)
 * @param stream - Audio file stream
 * @param mimeType - MIME type of the audio file
 * @returns Duration in seconds, or null if parsing fails
 */
export async function getDurationFromStream(
  stream: Readable,
  mimeType?: string
): Promise<number | null> {
  try {
    const buffer = await streamToBuffer(stream);
    const metadata = await parseBuffer(buffer, { mimeType });
    const duration = metadata.format.duration;

    if (duration === undefined || duration === null) {
      console.error('[Audio Duration] Could not extract duration from stream');
      return null;
    }

    console.log(`[Audio Duration] Extracted from stream: ${duration.toFixed(2)}s`);
    return duration;
  } catch (error: any) {
    console.error('[Audio Duration] Failed to parse stream:', error?.message || error);
    return null;
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(Buffer.from(chunk));
    }
  }
  return Buffer.concat(chunks);
}

/**
 * Check if duration exceeds the limit
 * @param duration - Duration in seconds
 * @param maxSeconds - Maximum allowed seconds
 * @returns true if duration is valid (within limit)
 */
export function isWithinDurationLimit(duration: number, maxSeconds: number): boolean {
  return duration > 0 && duration <= maxSeconds;
}

/**
 * Format duration in human-readable format
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g., "5m 30s" or "1h 20m")
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}
