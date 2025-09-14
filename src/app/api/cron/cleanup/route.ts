import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transcriptions, transcription_results, transcription_edits } from '@/db/schema';
import { and, eq, lt, sql } from 'drizzle-orm';
import { getUserTier, UserTier } from '@/services/user-tier';
import { CloudflareR2Service } from '@/lib/r2-upload';

// Verify cron secret or admin secret
function verifyCronAuth(req: NextRequest): boolean {
  const cronSecret = req.headers.get('x-cron-secret');
  const adminSecret = req.headers.get('x-admin-secret');
  
  if (cronSecret && cronSecret === process.env.CRON_SECRET) {
    return true;
  }
  
  if (adminSecret && adminSecret === process.env.ADMIN_SECRET) {
    return true;
  }
  
  // Also support Vercel cron authorization
  const authHeader = req.headers.get('authorization');
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }
  
  return false;
}

export async function GET(req: NextRequest) {
  // For monitoring - return cleanup status
  return NextResponse.json({
    service: 'cleanup',
    status: 'ready',
    message: 'Use POST to trigger cleanup'
  });
}

export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const r2Service = new CloudflareR2Service();
  
  // Parse query params
  const dryRun = req.nextUrl.searchParams.get('dry_run') === 'true';
  const batchSize = Math.min(Number(req.nextUrl.searchParams.get('batch') || 100), 500);
  
  const stats = {
    processed: 0,
    deletedTranscriptions: 0,
    deletedR2Files: 0,
    errors: [] as string[],
    dryRun
  };

  try {
    // Get all unique users with transcriptions
    const users = await db()
      .selectDistinct({ user_uuid: transcriptions.user_uuid })
      .from(transcriptions)
      .limit(batchSize);

    for (const { user_uuid } of users) {
      if (!user_uuid) continue;
      
      try {
        // Get user tier and calculate retention cutoff
        const tier = await getUserTier(user_uuid);
        const retentionDays = tier === UserTier.PRO ? 365 : 
                             tier === UserTier.BASIC ? 90 : 7;
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        
        // Find expired transcriptions for this user
        const expired = await db()
          .select({
            id: transcriptions.id,
            job_id: transcriptions.job_id,
            source_url: transcriptions.source_url,
            created_at: transcriptions.created_at
          })
          .from(transcriptions)
          .where(
            and(
              eq(transcriptions.user_uuid, user_uuid),
              lt(transcriptions.created_at, cutoffDate)
            )
          )
          .limit(50); // Process in smaller chunks
        
        for (const record of expired) {
          stats.processed++;
          
          try {
            // Extract R2 key from source_url if it's an R2 URL
            if (record.source_url) {
              const r2Pattern = /\/uploads\/\d+_[a-z0-9]+_[^\/]+$/;
              const match = record.source_url.match(r2Pattern);
              
              if (match) {
                const key = match[0].substring(1); // Remove leading slash
                
                if (!dryRun) {
                  // Delete from R2
                  try {
                    await r2Service.deleteFile(key);
                    stats.deletedR2Files++;
                    console.log(`Deleted R2 file: ${key}`);
                  } catch (r2Error) {
                    console.error(`Failed to delete R2 file ${key}:`, r2Error);
                    // Continue even if R2 deletion fails
                  }
                }
              }
            }
            
            if (!dryRun) {
              // Delete database records in transaction
              await db().transaction(async (tx) => {
                // Delete results
                await tx
                  .delete(transcription_results)
                  .where(eq(transcription_results.job_id, record.job_id));
                
                // Delete edits
                await tx
                  .delete(transcription_edits)
                  .where(
                    and(
                      eq(transcription_edits.job_id, record.job_id),
                      eq(transcription_edits.user_uuid, user_uuid)
                    )
                  );
                
                // Delete main transcription
                await tx
                  .delete(transcriptions)
                  .where(eq(transcriptions.id, record.id));
              });
              
              stats.deletedTranscriptions++;
              console.log(`Deleted transcription ${record.job_id} (created: ${record.created_at})`);
            } else {
              console.log(`[DRY RUN] Would delete transcription ${record.job_id}`);
            }
            
          } catch (error) {
            const errorMsg = `Failed to process ${record.job_id}: ${error}`;
            stats.errors.push(errorMsg);
            console.error(errorMsg);
          }
        }
        
      } catch (userError) {
        const errorMsg = `Failed to process user ${user_uuid}: ${userError}`;
        stats.errors.push(errorMsg);
        console.error(errorMsg);
      }
    }
    
    // Log summary
    const duration = Date.now() - startTime;
    console.log(`Cleanup completed in ${duration}ms:`, stats);
    
    return NextResponse.json({
      success: true,
      duration,
      ...stats
    });
    
  } catch (error) {
    console.error('Cleanup job failed:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
      ...stats
    }, { status: 500 });
  }
}