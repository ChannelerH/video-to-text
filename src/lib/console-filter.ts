const globalKey = '__consoleFilterInstalled__';

function shouldAllowVerbose(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  if (process.env.DEBUG_LOGS === 'true' || process.env.NEXT_PUBLIC_DEBUG_LOGS === 'true') {
    return true;
  }

  if (typeof globalThis !== 'undefined') {
    const flag = (globalThis as unknown as { __ENABLE_DEBUG_LOGS__?: boolean }).__ENABLE_DEBUG_LOGS__;
    if (typeof flag === 'boolean') {
      return flag;
    }
  }

  if (typeof window !== 'undefined') {
    const winFlag = (window as unknown as { __ENABLE_DEBUG_LOGS__?: boolean }).__ENABLE_DEBUG_LOGS__;
    if (typeof winFlag === 'boolean') {
      return winFlag;
    }
  }

  return false;
}

function wrapVerbose<T extends (...args: any[]) => void>(fn: T | undefined): T | undefined {
  if (!fn) return undefined;
  const bound = fn.bind(console);
  return ((...args: Parameters<T>) => {
    if (!shouldAllowVerbose()) return;
    bound(...args);
  }) as T;
}

export function installConsoleFilter() {
  if (typeof globalThis === 'undefined') return;
  if ((globalThis as any)[globalKey]) return;

  const originalLog = wrapVerbose(console.log);
  const originalDebug = wrapVerbose(console.debug ?? console.log);
  const originalInfo = wrapVerbose(console.info ?? console.log);
  const originalTrace = wrapVerbose(console.trace ?? console.log);

  if (originalLog) {
    console.log = originalLog;
  }
  if (originalDebug) {
    console.debug = originalDebug;
  }
  if (originalInfo) {
    console.info = originalInfo;
  }
  if (originalTrace) {
    console.trace = originalTrace;
  }

  (globalThis as any)[globalKey] = true;
}

export function enableVerboseLogs(enable: boolean) {
  if (typeof globalThis !== 'undefined') {
    (globalThis as any).__ENABLE_DEBUG_LOGS__ = enable;
  }
}
