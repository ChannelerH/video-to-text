#!/usr/bin/env node
const enabled = (process.env.QUEUE_WORKER_ENABLED || 'true').toLowerCase();
if (enabled === 'false' || enabled === '0' || enabled === 'no') {
  console.log('[QueueWorker] Disabled via QUEUE_WORKER_ENABLED. Exiting.');
  process.exit(0);
}

const DEFAULT_INTERVAL_MS = Number(process.env.QUEUE_WORKER_INTERVAL_MS || 5000);
const DEFAULT_START_DELAY_MS = Number(process.env.QUEUE_WORKER_START_DELAY_MS || 3000);
const REQUEST_TIMEOUT_MS = Number(process.env.QUEUE_WORKER_REQUEST_TIMEOUT_MS || 20000);
const port = Number(process.env.PORT || 3000);
const baseUrl = process.env.QUEUE_WORKER_TARGET_URL || `http://127.0.0.1:${port}/api/cron/process-jobs`;
const cronSecret = process.env.CRON_SECRET || '';

const url = (() => {
  if (!cronSecret) return baseUrl;
  const hasQuery = baseUrl.includes('?');
  const separator = hasQuery ? '&' : '?';
  return `${baseUrl}${separator}secret=${encodeURIComponent(cronSecret)}`;
})();

const headers = cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tick() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const elapsed = Date.now() - startedAt;

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[QueueWorker] Non-OK response', {
        status: response.status,
        elapsedMs: elapsed,
        body: body?.slice(0, 200),
      });
      return;
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    console.log('[QueueWorker] Tick complete', {
      status: response.status,
      elapsedMs: elapsed,
      processed: payload?.processed,
      message: payload?.message,
      job_id: payload?.job_id,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    const reason = error?.name === 'AbortError' ? 'timeout' : error?.message || String(error);
    console.error('[QueueWorker] Tick failed', { reason });
  }
}

(async () => {
  console.log('[QueueWorker] Starting background loop', {
    baseUrl,
    usesSecret: !!cronSecret,
    intervalMs: DEFAULT_INTERVAL_MS,
    startDelayMs: DEFAULT_START_DELAY_MS,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  if (DEFAULT_START_DELAY_MS > 0) {
    await sleep(DEFAULT_START_DELAY_MS);
  }

  while (true) {
    await tick();
    await sleep(DEFAULT_INTERVAL_MS);
  }
})();
