'use client';

import { useEffect } from 'react';
import { installConsoleFilter } from '@/lib/console-filter';

export default function LoggingProvider() {
  useEffect(() => {
    installConsoleFilter();
  }, []);

  return null;
}
