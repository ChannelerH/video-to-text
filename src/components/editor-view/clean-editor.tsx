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
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  Copy,
  Check
} from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';

interface CleanEditorProps {
  audioUrl?: string | null;
  segments: any[];
  chapters: any[];
  transcription: any;
  onClose?: () => void;
}

export default function CleanEditor({ 
  audioUrl, 
  segments, 
  chapters, 
  transcription,
  onClose 
}: CleanEditorProps) {
  const t = useTranslations('tool_interface');
  const [showChapters, setShowChapters] = useState(true);
  const [copiedSegment, setCopiedSegment] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
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
      waveColor: 'rgba(147, 51, 234, 0.3)',
      progressColor: 'rgba(147, 51, 234, 1)',
      cursorColor: 'transparent',
      barWidth: 2,
      barRadius: 2,
      cursorWidth: 0,
      height: 60,
      barGap: 1,
      normalize: true,
      interact: true,
      dragToSeek: true,
    });

    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    
    wavesurfer.load(audioUrl);
    
    wavesurfer.on('ready', () => {
      setWaveformReady(true);
      setDuration(wavesurfer.getDuration());
      
      // Add subtle chapter regions
      chapters.forEach((chapter, idx) => {
        regions.addRegion({
          start: chapter.startTime,
          end: chapter.endTime,
          color: `rgba(147, 51, 234, 0.05)`,
          drag: false,
          resize: false,
        });
      });
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

  // Auto-scroll to active segment
  useEffect(() => {
    const activeSegmentIdx = segments.findIndex(
      seg => currentTime >= seg.start && currentTime < seg.end
    );
    
    if (activeSegmentIdx !== -1 && transcriptRef.current) {
      const segmentEl = transcriptRef.current.querySelector(`[data-segment="${activeSegmentIdx}"]`);
      if (segmentEl) {
        segmentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentTime, segments]);

  // Keyboard shortcuts
  useHotkeys('space', (e) => {
    e.preventDefault();
    setPlaying(!isPlaying);
  }, [isPlaying]);

  useHotkeys('left', () => jumpToChapter(Math.max(0, currentChapter - 1)), [currentChapter]);
  useHotkeys('right', () => jumpToChapter(Math.min(chapters.length - 1, currentChapter + 1)), [currentChapter]);
  useHotkeys('escape', () => onClose?.(), []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const copySegment = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedSegment(index);
    setTimeout(() => setCopiedSegment(null), 2000);
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-gray-950 flex flex-col"
    >
      {/* Minimal Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <button
          onClick={() => setShowChapters(!showChapters)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          {showChapters ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          {showChapters ? 'Hide' : 'Show'} Chapters
        </button>
        
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            Press <kbd className="px-1.5 py-0.5 bg-gray-800 rounded text-xs">Space</kbd> to play/pause
          </span>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chapters Sidebar */}
        <AnimatePresence>
          {showChapters && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-r border-gray-800 overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-gray-800">
                <h3 className="font-medium text-white">Chapters</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {chapters.length} chapters • {formatTime(duration)} total
                </p>
              </div>
              
              <div className="flex-1 overflow-y-auto p-3">
                {chapters.map((chapter, idx) => {
                  const isActive = idx === currentChapter;
                  
                  return (
                    <button
                      key={idx}
                      onClick={() => jumpToChapter(idx)}
                      className={`w-full text-left p-3 mb-2 rounded-lg transition-all ${
                        isActive 
                          ? 'bg-purple-500/20 border border-purple-500/50' 
                          : 'hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-mono ${
                          isActive ? 'text-purple-400' : 'text-gray-500'
                        }`}>
                          {formatTime(chapter.startTime)}
                        </span>
                        <span className={`text-sm flex-1 ${
                          isActive ? 'text-white' : 'text-gray-300'
                        }`}>
                          {chapter.title}
                        </span>
                      </div>
                      {isActive && (
                        <div className="mt-2 h-0.5 bg-purple-500/50 rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transcript Area */}
        <div className="flex-1 flex flex-col">
          {/* Transcript */}
          <div 
            ref={transcriptRef}
            className="flex-1 overflow-y-auto px-8 py-6"
          >
            <div className="max-w-3xl mx-auto">
              {segments.map((segment, idx) => {
                const isActive = currentTime >= segment.start && currentTime < segment.end;
                
                return (
                  <motion.div
                    key={idx}
                    data-segment={idx}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(idx * 0.01, 0.5) }}
                    className={`group mb-4 flex gap-4 ${
                      isActive ? 'scale-[1.02]' : ''
                    }`}
                  >
                    {/* Timestamp */}
                    <button
                      onClick={() => setCurrentTime(segment.start)}
                      className={`flex-shrink-0 text-xs font-mono px-2 py-1 rounded transition-all ${
                        isActive 
                          ? 'bg-purple-500 text-white' 
                          : 'text-gray-500 hover:text-purple-400'
                      }`}
                    >
                      {formatTime(segment.start)}
                    </button>
                    
                    {/* Text */}
                    <div className="flex-1 relative">
                      <p className={`leading-relaxed transition-colors ${
                        isActive ? 'text-white' : 'text-gray-400'
                      }`}>
                        {segment.text}
                      </p>
                      
                      {/* Copy Button */}
                      <button
                        onClick={() => copySegment(segment.text, idx)}
                        className="absolute -right-8 top-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {copiedSegment === idx ? (
                          <Check className="w-4 h-4 text-green-400" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-500 hover:text-gray-300" />
                        )}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Audio Controls */}
          <div className="border-t border-gray-800 px-8 py-4">
            {/* Waveform */}
            {audioUrl && (
              <div className="mb-4">
                <div ref={waveformRef} className="rounded-lg" />
              </div>
            )}
            
            {/* Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Play Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => jumpToChapter(Math.max(0, currentChapter - 1))}
                    className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <SkipBack className="w-5 h-5" />
                  </button>
                  
                  <button
                    onClick={() => setPlaying(!isPlaying)}
                    className="p-3 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5" />
                    )}
                  </button>
                  
                  <button
                    onClick={() => jumpToChapter(Math.min(chapters.length - 1, currentChapter + 1))}
                    className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>
                </div>

                {/* Time Display */}
                <div className="text-sm font-mono">
                  <span className="text-white">{formatTime(currentTime)}</span>
                  <span className="text-gray-500 mx-2">/</span>
                  <span className="text-gray-400">{formatTime(duration)}</span>
                </div>
              </div>

              {/* Speed Controls */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Speed:</span>
                {[0.75, 1, 1.25, 1.5, 2].map(speed => (
                  <button
                    key={speed}
                    onClick={() => {
                      if (wavesurferRef.current) {
                        wavesurferRef.current.setPlaybackRate(speed);
                      }
                    }}
                    className="px-2 py-1 text-xs rounded hover:bg-gray-800 transition-colors"
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}