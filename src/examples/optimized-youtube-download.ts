/**
 * Example usage of optimized YouTube audio download system
 * 
 * This demonstrates the various optimization features:
 * 1. Parallel chunk downloading
 * 2. Streaming with ytdl-core
 * 3. Progress tracking
 * 4. CDN proxy support
 * 5. Error handling and retries
 * 6. Format optimization
 */

import { YouTubeService, DownloadOptions, DownloadProgress } from '../lib/youtube';
import { TranscriptionService } from '../lib/transcription';

// Example 1: Basic optimized download
export async function basicOptimizedDownload(videoId: string) {
  console.log('=== Basic Optimized Download ===');
  
  try {
    // Check if video is suitable for optimization
    const optimizationInfo = await YouTubeService.isVideoOptimizedForFastDownload(videoId);
    console.log('Optimization status:', optimizationInfo);
    
    // Get audio format info for estimation
    const formatInfo = await YouTubeService.getAudioFormatInfo(videoId);
    console.log('Estimated download time:', formatInfo.estimatedDownloadTime, 'seconds');
    console.log('Supports parallel download:', formatInfo.supportsParallelDownload);
    
    // Download with default optimized settings
    const audioBuffer = await YouTubeService.downloadAudioStreamOptimized(videoId, {
      onProgress: (progress: DownloadProgress) => {
        const percent = progress.percentage || 0;
        const speedMB = Math.round(progress.speed / 1024 / 1024 * 100) / 100;
        console.log(`Progress: ${percent}% at ${speedMB}MB/s`);
      }
    });
    
    console.log(`Download completed: ${audioBuffer.length} bytes`);
    return audioBuffer;
  } catch (error) {
    console.error('Download failed:', error);
    throw error;
  }
}

// Example 2: Advanced configuration for premium users
export async function premiumOptimizedDownload(videoId: string) {
  console.log('=== Premium Optimized Download ===');
  
  const downloadOptions: DownloadOptions = {
    enableParallelDownload: true,
    chunkSize: 2 * 1024 * 1024, // 2MB chunks for premium users
    maxConcurrentChunks: 8, // More parallel connections
    timeout: 120000, // 2 minutes timeout
    retryAttempts: 5, // More retry attempts
    retryDelay: 500,
    cdnProxy: process.env.YOUTUBE_CDN_PROXY, // Use CDN proxy if available
    onProgress: (progress: DownloadProgress) => {
      const percent = progress.percentage || 0;
      const speedMB = Math.round(progress.speed / 1024 / 1024 * 100) / 100;
      const eta = progress.eta ? `${Math.round(progress.eta)}s` : 'N/A';
      const chunkInfo = progress.totalChunks ? 
        `(chunk ${progress.chunkIndex}/${progress.totalChunks})` : '';
      
      console.log(`Premium download: ${percent}% at ${speedMB}MB/s, ETA: ${eta} ${chunkInfo}`);
    },
    onError: (error: Error) => {
      console.error('Premium download error:', error.message);
    }
  };
  
  try {
    const audioBuffer = await YouTubeService.downloadAudioStreamOptimized(videoId, downloadOptions);
    console.log(`Premium download completed: ${audioBuffer.length} bytes`);
    return audioBuffer;
  } catch (error) {
    console.error('Premium download failed:', error);
    throw error;
  }
}

// Example 3: Fallback chain with all methods
export async function robustDownloadWithFallbacks(videoId: string) {
  console.log('=== Robust Download with Fallbacks ===');
  
  const progressCallback = (progress: DownloadProgress) => {
    const percent = progress.percentage || 0;
    const speedMB = Math.round(progress.speed / 1024 / 1024 * 100) / 100;
    console.log(`Download: ${percent}% at ${speedMB}MB/s`);
  };
  
  // Try optimized parallel download first
  try {
    console.log('Attempting optimized parallel download...');
    return await YouTubeService.downloadAudioStreamOptimized(videoId, {
      onProgress: progressCallback,
      onError: (error) => console.warn('Optimized download warning:', error.message)
    });
  } catch (optimizedError) {
    console.warn('Optimized download failed:', optimizedError);
    
    // Fallback to ytdl-core streaming
    try {
      console.log('Falling back to ytdl-core streaming...');
      return await YouTubeService.downloadAudioWithYtdlStream(videoId, {
        onProgress: progressCallback,
        timeout: 90000,
        retryAttempts: 3
      });
    } catch (streamError) {
      console.warn('Stream download failed:', streamError);
      
      // Final fallback to legacy method
      console.log('Using legacy download method...');
      const audioStreamUrl = await YouTubeService.getAudioStreamUrl(videoId);
      const response = await fetch(audioStreamUrl);
      
      if (!response.ok) {
        throw new Error(`All download methods failed. Last error: ${response.statusText}`);
      }
      
      const audioBuffer = Buffer.from(await response.arrayBuffer());
      console.log(`Legacy download completed: ${audioBuffer.length} bytes`);
      return audioBuffer;
    }
  }
}

// Example 4: Full transcription with optimized download
export async function optimizedTranscription(youtubeUrl: string, userId?: string) {
  console.log('=== Optimized Transcription Example ===');
  
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('REPLICATE_API_TOKEN environment variable is required');
  }
  
  const transcriptionService = new TranscriptionService(process.env.REPLICATE_API_TOKEN);
  
  const result = await transcriptionService.processTranscription({
    type: 'youtube_url',
    content: youtubeUrl,
    options: {
      userId: userId,
      userTier: 'premium', // Use premium settings for faster download
      language: 'auto',
      onDownloadProgress: (progress: DownloadProgress) => {
        const percent = progress.percentage || 0;
        const speedMB = Math.round(progress.speed / 1024 / 1024 * 100) / 100;
        console.log(`Transcription download: ${percent}% at ${speedMB}MB/s`);
      },
      downloadOptions: {
        enableParallelDownload: true,
        chunkSize: 1.5 * 1024 * 1024, // 1.5MB chunks
        maxConcurrentChunks: 6,
        timeout: 90000,
        retryAttempts: 3
      }
    }
  });
  
  if (result.success) {
    console.log('Transcription completed successfully!');
    console.log('From cache:', result.data?.fromCache);
    console.log('Estimated cost:', result.data?.estimatedCost);
    console.log('Text preview:', result.data?.transcription.text.substring(0, 200) + '...');
  } else {
    console.error('Transcription failed:', result.error);
  }
  
  return result;
}

// Example usage:
if (require.main === module) {
  const exampleVideoId = 'dQw4w9WgXcQ'; // Rick Roll video (short, good for testing)
  
  (async () => {
    try {
      // Test basic download
      await basicOptimizedDownload(exampleVideoId);
      
      // Test premium download
      await premiumOptimizedDownload(exampleVideoId);
      
      // Test robust fallback chain
      await robustDownloadWithFallbacks(exampleVideoId);
      
      // Test full transcription (requires API token)
      if (process.env.REPLICATE_API_TOKEN) {
        await optimizedTranscription(`https://www.youtube.com/watch?v=${exampleVideoId}`);
      }
    } catch (error) {
      console.error('Example execution failed:', error);
    }
  })();
}