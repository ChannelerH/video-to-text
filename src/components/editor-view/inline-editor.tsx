"use client";

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHotkeys } from 'react-hotkeys-hook';
import { usePlayerStore } from '@/stores/player-store';
import { useTranslations } from 'next-intl';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  X,
  ChevronDown,
  ChevronUp,
  List
} from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';

interface InlineEditorProps {
  audioUrl?: string | null;
  segments: any[];
  chapters: any[];
  transcription: any;
  onClose?: () => void;
}

export default function InlineEditor({ 
  audioUrl, 
  segments, 
  chapters, 
  transcription,
  onClose 
}: InlineEditorProps) {
  const t = useTranslations('tool_interface');
  const [isMinimized, setIsMinimized] = useState(false);
  const [showChapterDropdown, setShowChapterDropdown] = useState(false);
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [waveformReady, setWaveformReady] = useState(false);
  
  const {
    isPlaying,
    currentTime,
    duration,
    currentChapter,
    setPlaying,
    setCurrentTime,
    setDuration,
    jumpToChapter,
    setChapters,
  } = usePlayerStore();

  // Initialize
  useEffect(() => {
    setChapters(chapters);
    if (transcription?.duration) {
      setDuration(transcription.duration);
    }
  }, [chapters, transcription]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'rgba(168, 85, 247, 0.4)',
      progressColor: 'rgba(168, 85, 247, 1)',
      cursorColor: 'rgba(236, 72, 153, 1)',
      barWidth: 2,
      barRadius: 2,
      cursorWidth: 1,
      height: 48,
      barGap: 1,
      normalize: true,
      interact: true,
      dragToSeek: true,
    });
    
    wavesurfer.load(audioUrl);
    
    wavesurfer.on('ready', () => {
      setWaveformReady(true);
      setDuration(wavesurfer.getDuration());
    });

    wavesurfer.on('audioprocess', () => {
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('play', () => setPlaying(true));
    wavesurfer.on('pause', () => setPlaying(false));

    wavesurferRef.current = wavesurfer;

    return () => {
      wavesurfer.destroy();
    };
  }, [audioUrl]);

  // Sync playback
  useEffect(() => {
    if (!wavesurferRef.current || !waveformReady) return;
    
    if (isPlaying) {
      wavesurferRef.current.play();
    } else {
      wavesurferRef.current.pause();
    }
  }, [isPlaying, waveformReady]);

  // Sync time for jumping
  useEffect(() => {
    if (!wavesurferRef.current || !waveformReady) return;
    
    const wsTime = wavesurferRef.current.getCurrentTime();
    if (Math.abs(wsTime - currentTime) > 1) {
      wavesurferRef.current.setTime(currentTime);
    }
  }, [currentTime]);

  // Keyboard shortcuts
  useHotkeys('space', (e) => {
    e.preventDefault();
    setPlaying(!isPlaying);
  }, [isPlaying]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full bg-gray-900/95 backdrop-blur-xl border border-purple-500/20 rounded-xl shadow-2xl overflow-hidden"
      >
        <div className={`transition-all duration-300 ${isMinimized ? 'h-16' : 'h-32'}`}>
          {/* Main Controls Row */}
          <div className="flex items-center gap-4 px-6 py-3">
            {/* Play Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => jumpToChapter(Math.max(0, currentChapter - 1))}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Previous Chapter (J)"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => setPlaying(!isPlaying)}
                className="p-2.5 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                title="Play/Pause (Space)"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4 ml-0.5" />
                )}
              </button>
              
              <button
                onClick={() => jumpToChapter(Math.min(chapters.length - 1, currentChapter + 1))}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                title="Next Chapter (K)"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Time */}
            <div className="text-sm font-mono text-gray-300">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>

            {/* Waveform */}
            <div className="flex-1 max-w-2xl">
              {audioUrl ? (
                <div ref={waveformRef} className="w-full" />
              ) : (
                <div className="h-12 flex items-center justify-center text-sm text-gray-500">
                  No audio available
                </div>
              )}
            </div>

            {/* Chapter Selector */}
            <div className="relative">
              <button
                onClick={() => setShowChapterDropdown(!showChapterDropdown)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <List className="w-4 h-4" />
                <span className="text-sm">
                  {chapters[currentChapter]?.title || 'Chapters'}
                </span>
                <ChevronDown className="w-3 h-3" />
              </button>
              
              {showChapterDropdown && (
                <div className="absolute top-full mt-2 right-0 w-64 max-h-80 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-xl">
                  {chapters.map((chapter, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        jumpToChapter(idx);
                        setShowChapterDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors ${
                        idx === currentChapter ? 'bg-purple-500/20 text-purple-400' : 'text-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="flex-1 truncate">{chapter.title}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          {formatTime(chapter.startTime)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Speed Control */}
            <div className="flex items-center gap-1">
              {[0.75, 1, 1.25, 1.5, 2].map(speed => (
                <button
                  key={speed}
                  onClick={() => {
                    if (wavesurferRef.current) {
                      wavesurferRef.current.setPlaybackRate(speed);
                    }
                  }}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    speed === 1 ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-white/10'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                {isMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
              
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Progress Bar (when minimized) */}
          {isMinimized && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800">
              <div
                className="h-full bg-purple-600 transition-all"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>
          )}
        </div>
      </motion.div>
  );
}