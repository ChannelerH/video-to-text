import { reportError } from './error-reporter';

type ErrorPayload = {
  context?: string;
  payload?: any;
};

const isServer = typeof window === 'undefined';
const isDev = process.env.NODE_ENV === 'development';

const stackCooldownMs = Number(process.env.ERROR_ALERT_COOLDOWN_MS || 5 * 60 * 1000);
const knownStacks = new Map<string, number>();

function normalize(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

function serializePayload(payload: any): string {
  if (!payload) return '';
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return '[unserializable payload]';
  }
}

function shouldNotify(stack?: string): boolean {
  if (!stack) return true;
  const now = Date.now();
  const prev = knownStacks.get(stack) || 0;
  if (now - prev < stackCooldownMs) return false;
  knownStacks.set(stack, now);
  return true;
}

export function handleServerError(
  error: unknown,
  extra?: ErrorPayload,
  options?: { silent?: boolean }
) {
  const { message, stack } = normalize(error);
  const contextInfo = extra?.context ? `\nContext: ${extra.context}` : '';
  const payloadInfo = extra?.payload ? `\nPayload: ${serializePayload(extra.payload)}` : '';

  if (!options?.silent) {
    consoleErrorOriginal('[Error]', message, stack || '', contextInfo, payloadInfo);
  }

  const allowDev = process.env.ERROR_ALERT_ALLOW_DEV === 'true';

  if (!isServer || (isDev && !allowDev)) {
    return;
  }

  if (!shouldNotify(stack)) {
    return;
  }

  const subject = `[Harku] Server Error: ${message}`;
  const text = `Message: ${message}\n${stack ? `Stack: ${stack}\n` : ''}${contextInfo}${payloadInfo}`;

  try {
    reportError(subject, text);
  } catch (notifyError) {
    consoleErrorOriginal('[ErrorReporter] Failed to send error email:', notifyError);
  }
}

const consoleErrorOriginal = console.error.bind(console);

export function getOriginalConsoleError() {
  return consoleErrorOriginal;
}
