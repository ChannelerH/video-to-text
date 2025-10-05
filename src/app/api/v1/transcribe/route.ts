/**
 * Public API endpoint for Pro/Premium users
 * Requires API key authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserTier, hasFeature, UserTier } from '@/services/user-tier';
import { TranscriptionService } from '@/lib/transcription';
import { readJson } from '@/lib/read-json';
// import { PriorityQueueManager } from '@/lib/priority-queue'; // TODO: 队列功能暂时不启用

// Initialize transcription service
const transcriptionService = new TranscriptionService(
  process.env.REPLICATE_API_TOKEN || '',
  process.env.DEEPGRAM_API_KEY
);

// API key validation
async function validateApiKey(apiKey: string): Promise<{ valid: boolean; userId?: string; tier?: UserTier }> {
  if (!apiKey) {
    return { valid: false };
  }

  // TODO: Implement actual API key validation from database
  // For now, use a simple hash check for demo
  const validKeys = {
    'demo_pro_key_123': { userId: 'demo_user', tier: UserTier.PRO },
    'demo_premium_key_456': { userId: 'demo_premium', tier: UserTier.PREMIUM }
  };

  const keyData = validKeys[apiKey as keyof typeof validKeys];
  if (keyData) {
    return { valid: true, ...keyData };
  }

  return { valid: false };
}

export async function POST(request: NextRequest) {
  try {
    // Check API key from header
    const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!apiKey) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'API key required',
          message: 'Please provide an API key in the X-API-Key header or Authorization header'
        },
        { status: 401 }
      );
    }

    // Validate API key
    const keyValidation = await validateApiKey(apiKey);
    
    if (!keyValidation.valid) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid API key',
          message: 'The provided API key is invalid or expired'
        },
        { status: 401 }
      );
    }

    // Check if user tier has API access
    if (!hasFeature(keyValidation.tier!, 'apiAccess')) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'API access not available',
          message: 'API access requires Pro subscription or higher',
          requiredTier: UserTier.PRO
        },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await readJson<Record<string, unknown>>(request);
    const url = typeof body.url === 'string' ? body.url : undefined;
    const file = typeof body.file === 'string' ? body.file : undefined;
    const options =
      body.options && typeof body.options === 'object'
        ? (body.options as Record<string, any>)
        : {};

    if (!url && !file) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Missing input',
          message: 'Please provide either a URL or a file to transcribe'
        },
        { status: 400 }
      );
    }

    // Determine input type
    let type: 'youtube_url' | 'audio_url' | 'file_upload';
    let content: string;

    if (typeof url === 'string') {
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        type = 'youtube_url';
      } else {
        type = 'audio_url';
      }
      content = url;
    } else if (typeof file === 'string') {
      type = 'file_upload';
      // TODO: Handle file upload to R2 and get URL
      content = file; // For now, pass the base64 data
    } else {
      // Should be unreachable because of earlier validation, but keeps TypeScript satisfied.
      return NextResponse.json(
        {
          success: false,
          error: 'Missing input',
          message: 'Please provide either a URL or a file to transcribe'
        },
        { status: 400 }
      );
    }

    // Add to priority queue
    // TODO: 第一版暂时不启用队列功能
    // const jobId = PriorityQueueManager.addJob({
    //   userId: keyValidation.userId!,
    //   userTier: keyValidation.tier!,
    //   type: 'transcription',
    //   data: { type, content, options },
    //   status: 'pending'
    // });

    // Get queue information
    // const queueInfo = {
    //   jobId,
    //   position: PriorityQueueManager.getQueuePosition(jobId),
    //   estimatedWait: PriorityQueueManager.getEstimatedWaitTime(keyValidation.tier!),
    //   priority: keyValidation.tier
    // };

    // Process transcription
    const jobId = `api-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const result = await transcriptionService.processTranscription({
      type,
      content,
      options: {
        ...options,
        userId: keyValidation.userId,
        userTier: keyValidation.tier,
        formats: options.formats || ['txt', 'srt', 'vtt', 'json']
      }
    });

    if (!result.success) {
      return NextResponse.json(
        { 
          success: false, 
          error: result.error || 'Transcription failed',
          jobId
        },
        { status: 500 }
      );
    }

    // Return transcription result
    return NextResponse.json({
      success: true,
      jobId,
      data: {
        transcription: result.data?.transcription,
        formats: result.data?.formats,
        metadata: {
          duration: result.data?.transcription?.duration,
          language: result.data?.transcription?.language,
          wordCount: result.data?.transcription?.segments?.reduce((acc: number, seg: any) => 
            acc + (seg.text?.split(' ').length || 0), 0
          )
        },
        // queue: queueInfo // TODO: 队列功能暂时不启用
      }
    });

  } catch (error) {
    console.error('API transcription error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      },
      { status: 500 }
    );
  }
}

// API documentation endpoint
export async function GET(request: NextRequest) {
  return NextResponse.json({
    version: '1.0.0',
    endpoints: {
      transcribe: {
        method: 'POST',
        path: '/api/v1/transcribe',
        headers: {
          'X-API-Key': 'Your API key (required)',
          'Content-Type': 'application/json'
        },
        body: {
          url: 'URL to transcribe (YouTube or direct audio URL)',
          file: 'Base64 encoded audio/video file (alternative to URL)',
          options: {
            formats: ['txt', 'srt', 'vtt', 'json', 'md'],
            language: 'Language hint (en, zh, auto)',
            speakerIdentification: 'Enable speaker diarization (Pro only)',
            generateChapters: 'Generate AI chapters (Pro only)',
            generateSummary: 'Generate AI summary (Pro only)'
          }
        },
        response: {
          success: true,
          jobId: 'Unique job identifier',
          data: {
            transcription: 'Transcription object with segments',
            files: 'Generated file URLs',
            metadata: 'Transcription metadata',
            queue: 'Queue information for Pro users'
          }
        }
      }
    },
    authentication: {
      type: 'API Key',
      description: 'API keys are available for Pro and Premium subscribers',
      example: 'curl -X POST https://api.harku.io/v1/transcribe -H "X-API-Key: your_key" -d {...}'
    },
    rateLimits: {
      pro: '100 requests per hour',
      premium: '1000 requests per hour'
    },
    support: {
      documentation: 'https://docs.harku.io/api',
      email: 'api.io'
    }
  });
}
