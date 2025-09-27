import { installConsoleErrorPatch } from './logger';
import { installConsoleFilter } from './console-filter';
import { handleServerError } from './server-error-handler';

function registerProcessHandlers() {
  const proc = process as NodeJS.Process & { _errorReporterInstalled?: boolean };
  if (proc._errorReporterInstalled) return;

  proc.on('uncaughtException', (error) => {
    handleServerError(error, { context: 'uncaughtException' });
  });

  proc.on('unhandledRejection', (reason) => {
    handleServerError(reason as unknown, { context: 'unhandledRejection' });
  });

  proc._errorReporterInstalled = true;
}

if (typeof window === 'undefined') {
  installConsoleFilter();
  installConsoleErrorPatch();
  registerProcessHandlers();
}
