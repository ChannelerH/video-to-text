import { NextRequest, NextResponse } from 'next/server';
import { CloudflareR2Service } from '@/lib/r2-upload';
import { getUserUuid } from '@/services/user';
import { getUserTier, UserTier } from '@/services/user-tier';
import { POLICY } from '@/services/policy';
import { readJson } from '@/lib/read-json';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function POST(req: NextRequest) {
  try {
    const body = await readJson<Record<string, unknown>>(req);
    const fileName = String(body?.fileName || '').trim();
    const contentType = String(body?.contentType || '').trim();
    const mode = (String(body?.mode || 'video').trim()) as 'video' | 'audio';
    const size = Number(body?.size || 0);

    if (!fileName || !contentType) {
      return NextResponse.json({ success: false, error: 'missing fileName or contentType' }, { status: 400 });
    }

    // Check plan limits quickly
    const userId = await getUserUuid();
    const tier = userId ? await getUserTier(userId) : UserTier.FREE;
    const limits = POLICY.limits(tier);
    const maxMB = limits.maxFileSizeMB || 500;
    if (size > maxMB * 1024 * 1024) {
      return NextResponse.json({ success: false, error: `file too large for plan: max ${maxMB}MB` }, { status: 400 });
    }

    const r2 = new CloudflareR2Service();
    const cfg = r2.validateConfig();
    if (!cfg.isValid) {
      return NextResponse.json({ success: false, error: `r2 config missing: ${cfg.missing.join(', ')}` }, { status: 500 });
    }

    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2);
    const safeName = fileName.replace(/[^A-Za-z0-9_.-]+/g, '_');
    const key = `${mode}-uploads/${ts}_${rand}_${safeName}`;

    const uploadUrl = await r2.getPresignedUploadUrl(key, contentType, { expiresIn: 3600, metadata: { 'upload-time': new Date().toISOString() } });
    const publicUrl = r2.getPublicUrl(key);

    return NextResponse.json({ success: true, data: { key, uploadUrl, publicUrl, expiresIn: 3600 } });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || 'presign_failed' }, { status: 500 });
  }
}
