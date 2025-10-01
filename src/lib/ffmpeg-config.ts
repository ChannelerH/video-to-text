export const ffmpegEnabled = String(process.env.FFMPEG_ENABLED).toLowerCase() === 'true';

export function assertFfmpegEnabled(feature: string): void {
  if (!ffmpegEnabled) {
    throw new Error(`${feature} requires FFmpeg, which is disabled. Set FFMPEG_ENABLED=true to enable.`);
  }
}
