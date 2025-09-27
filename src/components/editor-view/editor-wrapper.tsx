'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// Lazy load the editor with SSR disabled to avoid hydration issues
const ThreeColumnEditor = dynamic(
  () => import('@/components/editor-view/three-column-editor'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
      </div>
    )
  }
);

interface EditorWrapperProps {
  audioUrl: string | null;
  segments: any[];
  chapters: any[];
  speakers?: any[];
  transcription: any;
  onClose?: () => void;
  backHref?: string;
  isPreviewMode?: boolean;
  originalDurationSec?: number;
  jobId: string;
}

export default function EditorWrapper(props: EditorWrapperProps) {
  return <ThreeColumnEditor {...props} />;
}
