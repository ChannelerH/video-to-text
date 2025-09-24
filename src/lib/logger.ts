import { handleServerError, getOriginalConsoleError } from './server-error-handler';

const isServer = typeof window === 'undefined';

export function loggerError(error: unknown, extra?: { context?: string; payload?: any }) {
  if (!isServer) {
    console.error('[Error]', error, extra?.context, extra?.payload);
    return;
  }

  handleServerError(error, extra);
}

export const logger = {
  error: loggerError,
};

export function installConsoleErrorPatch() {
  if (!isServer) return;

  const original = getOriginalConsoleError();
  if ((console as any)._patchedForErrorReporter) {
    return;
  }

  console.error = (...args: unknown[]) => {
    original(...args);
    if (!args.length) return;

    const [first, ...rest] = args;
    let context: string | undefined;
    let payload: any;

    if (typeof rest[0] === 'string') {
      context = rest[0];
      payload = rest[1];
    } else if (rest.length) {
      payload = rest[0];
    }

    handleServerError(first, { context, payload }, { silent: true });
  };

  (console as any)._patchedForErrorReporter = true;
}

