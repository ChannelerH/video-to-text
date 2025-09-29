import tls from 'tls';

type EmailPayload = {
  subject: string;
  text: string;
};

const recipient = process.env.ERROR_ALERT_EMAIL || 'channelerH@gmail.com';
const sender = process.env.ERROR_ALERT_FROM || recipient;
const appPassword = process.env.ERROR_ALERT_APP_PASSWORD;

if (!appPassword) {
  console.warn('[ErrorReporter] Missing ERROR_ALERT_APP_PASSWORD env variable. Error emails will be disabled.');
}

const emailQueue: EmailPayload[] = [];
let flushing = false;

function base64(value: string) {
  return Buffer.from(value, 'utf8').toString('base64');
}

async function sendEmailViaSmtp(payload: EmailPayload) {
  if (!appPassword) {
    throw new Error('Missing Gmail App Password');
  }

  const host = process.env.ERROR_ALERT_SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.ERROR_ALERT_SMTP_PORT || 465);

  const socket = tls.connect(port, host, {
    servername: host,
    rejectUnauthorized: false,
  });

  socket.setEncoding('utf8');

  const write = (command: string) => {
    socket.write(`${command}\r\n`);
  };

  const read = (expected?: number) =>
    new Promise<{ code: number; raw: string }>((resolve, reject) => {
      let buffer = '';

      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onError);
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const onData = (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/).filter(Boolean);
        if (!lines.length) return;
        const lastLine = lines[lines.length - 1];
        if (!/^\d{3} [\s\S]*/.test(lastLine)) {
          return;
        }

        cleanup();
        buffer = '';
        const code = Number(lastLine.slice(0, 3));
        if (expected && code !== expected) {
          reject(new Error(`SMTP expected ${expected}, got ${code}: ${lastLine}`));
          return;
        }
        resolve({ code, raw: lines.join('\n') });
      };

      socket.on('data', onData);
      socket.once('error', onError);
    });

  try {
    await read();
    write(`EHLO ${host}`);
    await read(250);
    write('AUTH LOGIN');
    await read(334);
    write(base64(sender));
    await read(334);
    write(base64(appPassword));
    await read(235);
    write(`MAIL FROM:<${sender}>`);
    await read(250);
    write(`RCPT TO:<${recipient}>`);
    await read(250);
    write('DATA');
    await read(354);

    const headers = [
      `From: ${sender}`,
      `To: ${recipient}`,
      `Subject: ${payload.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      payload.text,
    ].join('\r\n');

    write(`${headers}\r\n.`);
    await read(250);
    write('QUIT');
    await read(221);
  } finally {
    socket.end();
  }
}

async function flushQueue() {
  if (flushing || !appPassword) return;
  flushing = true;

  while (emailQueue.length) {
    const batch = emailQueue.splice(0, emailQueue.length);
    if (!batch.length) break;

    const mergedSubject =
      batch.length === 1
        ? batch[0].subject
        : `[${process.env.NEXT_PUBLIC_PROJECT_NAME || 'Harku'}] Error Digest (${batch.length})`;

    const mergedBody = batch
      .map((payload, idx) => `[#${idx + 1}] ${payload.subject}\n${payload.text}`)
      .join('\n\n---\n\n');

    try {
      await sendEmailViaSmtp({ subject: mergedSubject, text: mergedBody });
    } catch (error) {
      console.error('[ErrorReporter] Failed to send alert email:', error);
      // put the batch back to the front so it can retry later
      emailQueue.unshift(...batch);
      break;
    }
  }

  flushing = false;
}

function scheduleFlush() {
  setTimeout(() => {
    flushQueue().catch((error) => {
      console.error('[ErrorReporter] flushQueue error:', error);
    });
  }, 10_000);
}

export function reportError(subject: string, text: string) {
  if (!appPassword) {
    return;
  }

  emailQueue.push({ subject, text });
  scheduleFlush();
}
