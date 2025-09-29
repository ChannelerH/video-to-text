import crypto from 'crypto';

const SESSION_DURATION_MS = 20 * 60 * 1000; // 20 minutes

const SESSION_SECRET =
  process.env.TURNSTILE_SESSION_SECRET ||
  process.env.TURNSTILE_SECRET_KEY ||
  process.env.TURNSTILE_SECRET ||
  process.env.TURNSTILE_SECRE ||
  '';

if (!SESSION_SECRET) {
  console.warn('[TurnstileSession] No session secret configured. Session tokens will be considered invalid.');
}

function getSignature(payload: string) {
  if (!SESSION_SECRET) return '';
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
}

export function createSessionToken(ip: string) {
  const now = Date.now();
  const expiry = now + SESSION_DURATION_MS;
  const payload = `${ip}:${expiry}`;
  const signature = getSignature(payload);
  const token = Buffer.from(`${payload}:${signature}`).toString('base64url');
  return { token, expiry };
}

export function verifySessionToken(token: string, ip: string) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 3) {
      return { valid: false, error: 'Malformed token' };
    }
    const [tokenIp, expiryStr, signature] = [parts[0], parts[1], parts.slice(2).join(':')];
    const expectedPayload = `${tokenIp}:${expiryStr}`;
    const expectedSignature = getSignature(expectedPayload);

    if (!expectedSignature || expectedSignature !== signature) {
      return { valid: false, error: 'Invalid signature' };
    }

    const expiry = Number(expiryStr);
    if (!Number.isFinite(expiry) || expiry < Date.now()) {
      return { valid: false, error: 'Session expired' };
    }

    if (tokenIp !== ip) {
      return { valid: false, error: 'IP mismatch' };
    }

    return { valid: true, expiry };
  } catch (error) {
    return { valid: false, error: 'Token decode failed' };
  }
}
