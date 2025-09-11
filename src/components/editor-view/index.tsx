"use client";

import { useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useHotkeys } from 'react-hotkeys-hook';
import { usePlayerStore } from '@/stores/player-store';
import ChapterNavigation from '@/components/chapter-navigation';
import TranscriptView from '@/components/transcript-view';
import AudioPlayer from '@/components/audio-player';
import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface EditorViewProps {
  audioUrl?: string | null;
  segments: any[];
  chapters: any[];
  transcription: any;
}

export default function EditorView({ audioUrl, segments, chapters, transcription }: EditorViewProps) {
  const t = useTranslations('tool_interface.editor');
  const {
    showChapterPanel,
    toggleChapterPanel,
    setPlaying,
    isPlaying,
    nextChapter,
    previousChapter,
    setAudioUrl,
    setChapters,
    setDuration
  } = usePlayerStore();

  // Initialize store with data
  useEffect(() => {
    if (audioUrl) {
      setAudioUrl(audioUrl);
    }
    setChapters(chapters);
    if (transcription?.duration) {
      setDuration(transcription.duration);
    }
  }, [audioUrl, chapters, transcription]);

  // Keyboard shortcuts
  useHotkeys('space', (e) => {
    e.preventDefault();
    setPlaying(!isPlaying);
  }, [isPlaying]);

  useHotkeys('j', () => previousChapter(), []);
  useHotkeys('k', () => nextChapter(), []);
  useHotkeys('o', () => toggleChapterPanel(), []);

  // Keyboard shortcut for Enter to play from current chapter
  useHotkeys('enter', () => {
    const currentChapter = usePlayerStore.getState().currentChapter;
    if (currentChapter >= 0) {
      usePlayerStore.getState().jumpToChapter(currentChapter);
      setPlaying(true);
    }
  }, []);

  return (
    <div className="editor-view h-[calc(100vh-250px)] min-h-[600px] rounded-lg overflow-hidden border border-gray-700/50 bg-black/20">
      <PanelGroup direction="horizontal" className="h-full">
        {/* Left Panel - Chapter Navigation */}
        {showChapterPanel && (
          <>
            <Panel 
              defaultSize={20} 
              minSize={15} 
              maxSize={30}
              className="border-r border-gray-700/50"
            >
              <ChapterNavigation chapters={chapters} />
            </Panel>
            
            <PanelResizeHandle className="w-1 bg-gray-700/30 hover:bg-purple-500/30 transition-colors" />
          </>
        )}

        {/* Center Panel - Transcript */}
        <Panel defaultSize={showChapterPanel ? 50 : 65} minSize={40}>
          <div className="h-full relative">
            {/* Toggle Chapter Panel Button */}
            {!showChapterPanel && (
              <button
                onClick={toggleChapterPanel}
                className="absolute top-4 left-4 z-10 p-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 transition-colors"
                title={t('show_chapters') || 'Show chapters (O)'}
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            
            <TranscriptView segments={segments} chapters={chapters} />
          </div>
        </Panel>

        <PanelResizeHandle className="w-1 bg-gray-700/30 hover:bg-purple-500/30 transition-colors" />

        {/* Right Panel - Audio Player */}
        <Panel defaultSize={showChapterPanel ? 30 : 35} minSize={25} maxSize={40}>
          <div className="h-full flex flex-col">
            {audioUrl ? (
              <AudioPlayer audioUrl={audioUrl} chapters={chapters} />
            ) : (
              <div className="p-4 text-center text-gray-500">
                <p className="mb-2">{t('no_audio_available') || 'No audio available'}</p>
                <p className="text-xs">{t('audio_playback_unavailable') || 'Audio playback is not available for this transcription'}</p>
              </div>
            )}
            
            {/* Keyboard Shortcuts Help */}
            <div className="p-4 border-t border-gray-700/50">
              <h4 className="text-sm font-medium text-gray-400 mb-2">
                {t('keyboard_shortcuts') || 'Keyboard Shortcuts'}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Play/Pause:</span>
                  <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">Space</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Previous:</span>
                  <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">J</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Next:</span>
                  <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">K</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Toggle Panel:</span>
                  <kbd className="px-1.5 py-0.5 bg-gray-800 rounded">O</kbd>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}