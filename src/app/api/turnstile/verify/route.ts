import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, verifySessionToken as verifyToken } from '@/lib/turnstile-session';

const usedTokens = new Map<string, number>();
const ipAttempts = new Map<string, { count: number; resetTime: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [token, timestamp] of usedTokens) {
    if (now - timestamp > 3600000) {
      usedTokens.delete(token);
    }
  }
  for (const [ip, data] of ipAttempts) {
    if (now > data.resetTime) {
      ipAttempts.delete(ip);
    }
  }
}, 300000);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, action } = body;
    
    // 获取真实IP
    const forwardedFor = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const clientIp = (forwardedFor?.split(',')[0] || realIp || 'unknown').trim();
    
  if (action === 'verify_session') {
    const result = verifyToken(token, clientIp);
    if (!result.valid) {
      return NextResponse.json({ success: false, error: result.error || 'Invalid session' }, { status: 403 });
    }
    return NextResponse.json({ success: true, valid: true, sessionExpiry: result.expiry });
  }

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 400 }
      );
    }
    
    // IP速率限制：每IP每分钟最多3次验证
    const now = Date.now();
    const ipData = ipAttempts.get(clientIp);
    
    if (ipData) {
      if (now < ipData.resetTime) {
        if (ipData.count >= 3) {
          const waitTime = Math.ceil((ipData.resetTime - now) / 1000);
          console.warn(`[Turnstile] Rate limit exceeded for IP ${clientIp}`);
          return NextResponse.json(
            { 
              success: false, 
              error: `Too many attempts. Please wait ${waitTime} seconds.`,
              retryAfter: waitTime 
            },
            { status: 429 }
          );
        }
        ipData.count++;
      } else {
        ipAttempts.set(clientIp, { count: 1, resetTime: now + 60000 });
      }
    } else {
      ipAttempts.set(clientIp, { count: 1, resetTime: now + 60000 });
    }
    
    // 检查token是否已被使用（防止重放攻击）
    if (usedTokens.has(token)) {
      console.warn(`[Turnstile] Token reuse attempted for IP ${clientIp}`);
      return NextResponse.json(
        { success: false, error: 'Token already used' },
        { status: 403 }
      );
    }

    // Verify the token with Cloudflare
    const secretKey = process.env.TURNSTILE_SECRET || process.env.TURNSTILE_SECRE;
    
    if (!secretKey) {
      console.error('Turnstile secret key not configured');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);
    formData.append('remoteip', clientIp);

    const result = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: formData,
      }
    );

    const outcome = await result.json();

    if (outcome.success) {
      usedTokens.set(token, now);
      const { token: sessionToken, expiry } = createSessionToken(clientIp);
      
      return NextResponse.json({ 
        success: true,
        sessionToken,
        sessionExpiry: expiry,
        challenge_ts: outcome.challenge_ts,
        hostname: outcome.hostname
      });
    } else {
      console.error('Turnstile verification failed:', outcome['error-codes']);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Verification failed',
          errorCodes: outcome['error-codes']
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Verification error' },
      { status: 500 }
    );
  }
}
