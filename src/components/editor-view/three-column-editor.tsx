"use client";

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useHotkeys } from 'react-hotkeys-hook';
import { usePlayerStore } from '@/stores/player-store';
import { useTranslations } from 'next-intl';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Clock,
  Edit2,
  Copy,
  Check,
  ChevronRight,
  X
} from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';

interface ThreeColumnEditorProps {
  audioUrl?: string | null;
  segments: any[];
  chapters: any[];
  transcription: any;
  onClose?: () => void;
}

export default function ThreeColumnEditor({ 
  audioUrl, 
  segments, 
  chapters: initialChapters, 
  transcription,
  onClose 
}: ThreeColumnEditorProps) {
  const t = useTranslations('tool_interface');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [editingChapter, setEditingChapter] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [currentSpeed, setCurrentSpeed] = useState(1);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(false); // Default off
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [waveformReady, setWaveformReady] = useState(false);
  
  const {
    isPlaying,
    currentTime,
    duration,
    currentChapter,
    chapters,
    setPlaying,
    setCurrentTime,
    setDuration,
    jumpToChapter,
    setChapters,
    updateChapter
  } = usePlayerStore();

  // Initialize chapters
  useEffect(() => {
    // If no chapters, create default ones based on segments
    const chaptersToUse = initialChapters.length > 0 ? initialChapters : [{
      id: 'full',
      title: 'Full Transcription',
      startTime: 0,
      endTime: transcription?.duration || 60,
      segments: segments
    }];
    setChapters(chaptersToUse);
    if (transcription?.duration) {
      setDuration(transcription.duration);
    }
  }, [initialChapters, segments, transcription]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'rgba(147, 51, 234, 0.3)',
      progressColor: 'rgba(147, 51, 234, 1)',
      cursorColor: 'rgba(236, 72, 153, 0.8)',
      barWidth: 2,
      barRadius: 3,
      cursorWidth: 2,
      height: 100,
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
      
      // Add chapter regions
      chapters.forEach((chapter, idx) => {
        const hue = (idx * 60) % 360;
        regions.addRegion({
          start: chapter.startTime,
          end: chapter.endTime,
          content: chapter.title,
          color: `hsla(${hue}, 70%, 50%, 0.15)`,
          drag: false,
          resize: false,
        });
      });
    });

    wavesurfer.on('audioprocess', () => {
      setCurrentTime(wavesurfer.getCurrentTime());
    });

    wavesurfer.on('seeking', (progress) => {
      const time = progress * wavesurfer.getDuration();
      setCurrentTime(time);
    });

    wavesurfer.on('play', () => setPlaying(true));
    wavesurfer.on('pause', () => setPlaying(false));

    regions.on('region-clicked', (region: any) => {
      wavesurfer.setTime(region.start);
      setCurrentTime(region.start);
    });

    wavesurferRef.current = wavesurfer;

    return () => {
      if (wavesurferRef.current) {
        try {
          wavesurferRef.current.destroy();
          wavesurferRef.current = null;
        } catch (error) {
          console.warn('Error destroying wavesurfer:', error);
        }
      }
    };
  }, [audioUrl]); // Only recreate when audioUrl changes, not chapters

  // Sync playback state
  useEffect(() => {
    if (!wavesurferRef.current || !waveformReady) return;
    
    if (isPlaying) {
      wavesurferRef.current.play();
    } else {
      wavesurferRef.current.pause();
    }
  }, [isPlaying, waveformReady]);

  // Sync time when jumping
  useEffect(() => {
    if (!wavesurferRef.current || !waveformReady) return;
    
    const wsTime = wavesurferRef.current.getCurrentTime();
    if (Math.abs(wsTime - currentTime) > 0.5) {
      wavesurferRef.current.setTime(currentTime);
    }
  }, [currentTime, waveformReady]);

  // Auto-scroll to active segment
  useEffect(() => {
    const activeSegmentIdx = segments.findIndex(
      seg => currentTime >= seg.start && currentTime < seg.end
    );
    
    if (activeSegmentIdx !== -1 && transcriptRef.current && isPlaying) {
      const segmentEl = transcriptRef.current.querySelector(`[data-segment="${activeSegmentIdx}"]`) as HTMLElement;
      if (segmentEl && transcriptRef.current) {
        // Calculate position relative to the transcript container
        const containerRect = transcriptRef.current.getBoundingClientRect();
        const elementRect = segmentEl.getBoundingClientRect();
        const relativeTop = elementRect.top - containerRect.top;
        const containerHeight = transcriptRef.current.clientHeight;
        const scrollTop = transcriptRef.current.scrollTop;
        
        // Only scroll if element is not already in view
        if (relativeTop < 100 || relativeTop > containerHeight - 100) {
          const targetScroll = scrollTop + relativeTop - containerHeight / 2;
          transcriptRef.current.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
          });
        }
      }
    }
  }, [currentTime, segments, isPlaying]);

  // Keyboard shortcuts - only when enabled
  useHotkeys('space', (e) => {
    if (!shortcutsEnabled) return;
    e.preventDefault();
    setPlaying(!isPlaying);
  }, [isPlaying, shortcutsEnabled]);
  
  // Jump to previous segment
  useHotkeys('j', () => {
    if (!shortcutsEnabled) return;
    
    const currentSegmentIdx = segments.findIndex(
      seg => currentTime >= seg.start && currentTime < seg.end
    );
    
    // If we found the current segment and it's not the first one
    if (currentSegmentIdx > 0) {
      const prevSegment = segments[currentSegmentIdx - 1];
      const targetTime = prevSegment.start + 0.01;
      
      // Update both store time and waveform
      setCurrentTime(targetTime);
      if (wavesurferRef.current && waveformReady) {
        wavesurferRef.current.seekTo(targetTime / duration);
      }
    }
  }, [currentTime, segments, shortcutsEnabled, waveformReady, duration]);
  
  // Jump to next segment
  useHotkeys('k', () => {
    if (!shortcutsEnabled) return;
    
    const currentSegmentIdx = segments.findIndex(
      seg => currentTime >= seg.start && currentTime < seg.end
    );
    
    // If we found the current segment and it's not the last one
    if (currentSegmentIdx >= 0 && currentSegmentIdx < segments.length - 1) {
      const nextSegment = segments[currentSegmentIdx + 1];
      const targetTime = nextSegment.start + 0.01;
      
      // Update both store time and waveform
      setCurrentTime(targetTime);
      if (wavesurferRef.current && waveformReady) {
        wavesurferRef.current.seekTo(targetTime / duration);
      }
    }
  }, [currentTime, segments, shortcutsEnabled, waveformReady, duration]);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) seconds = 0;
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const copyText = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const startEditChapter = (index: number, title: string) => {
    setEditingChapter(index);
    setEditTitle(title);
  };

  const saveChapterTitle = () => {
    if (editingChapter !== null && editTitle.trim()) {
      updateChapter(editingChapter, { title: editTitle.trim() });
    }
    setEditingChapter(null);
    setEditTitle('');
  };

  return (
    <div className="w-full max-w-full bg-gray-900 rounded-xl overflow-hidden border border-purple-500/20">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/50">
        <h3 className="text-sm font-medium text-gray-300">Editor View</h3>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Three Column Layout */}
      <div className="flex h-[700px] w-full">
        {/* Left Panel - Chapters */}
        <div className="w-64 border-r border-gray-800 flex flex-col bg-gray-950/50 flex-shrink-0">
          <div className="p-4 border-b border-gray-800">
            <h4 className="text-sm font-medium text-white">Chapters</h4>
            <p className="text-xs text-gray-500 mt-1">
              {chapters.length} chapters • {formatTime(duration)}
            </p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {chapters.map((chapter, idx) => {
              const isActive = idx === currentChapter;
              const progress = isActive ? 
                ((currentTime - chapter.startTime) / (chapter.endTime - chapter.startTime)) * 100 : 0;
              
              return (
                <motion.div
                  key={chapter.id || idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`group relative p-3 rounded-lg cursor-pointer transition-all ${
                    isActive 
                      ? 'bg-purple-500/20 border border-purple-500/50' 
                      : 'hover:bg-gray-800/50'
                  }`}
                  onClick={() => jumpToChapter(idx)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      {editingChapter === idx ? (
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onBlur={saveChapterTitle}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveChapterTitle();
                            if (e.key === 'Escape') {
                              setEditingChapter(null);
                              setEditTitle('');
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full px-2 py-1 bg-gray-800 border border-purple-500 rounded text-sm text-white"
                          autoFocus
                        />
                      ) : (
                        <h5 className="text-sm font-medium text-white">
                          {chapter.title}
                        </h5>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-gray-500" />
                        <span className="text-xs text-gray-500">
                          {formatTime(chapter.startTime)} - {formatTime(chapter.endTime)}
                        </span>
                      </div>
                    </div>
                    
                    {!editingChapter && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditChapter(idx, chapter.title);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded transition-all"
                      >
                        <Edit2 className="w-3 h-3 text-gray-400" />
                      </button>
                    )}
                  </div>
                  
                  {isActive && (
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-purple-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Center Panel - Transcript */}
        <div className="flex-1 flex flex-col bg-gray-950/30">
          <div className="p-4 border-b border-gray-800">
            <h4 className="text-sm font-medium text-white">Transcript</h4>
            <p className="text-xs text-gray-500 mt-1">
              {segments.length} segments • Click to jump
            </p>
          </div>
          
          <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 relative scroll-smooth">
            {segments.map((segment, idx) => {
              const isActive = currentTime >= segment.start && currentTime < segment.end;
              
              return (
                <div
                  key={idx}
                  data-segment={idx}
                  onClick={() => setCurrentTime(segment.start)}
                  className={`group mb-3 p-3 rounded-lg cursor-pointer transition-all ${
                    isActive 
                      ? 'bg-purple-500/10 border-l-2 border-purple-500' 
                      : 'hover:bg-gray-800/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`text-xs font-mono ${
                      isActive ? 'text-purple-400' : 'text-gray-500'
                    }`}>
                      {formatTime(segment.start)}
                    </span>
                    
                    <p className={`flex-1 text-sm leading-relaxed ${
                      isActive ? 'text-white' : 'text-gray-300'
                    }`}>
                      {segment.text}
                    </p>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copyText(segment.text, idx);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-700 rounded transition-all"
                    >
                      {copiedIndex === idx ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Panel - Player */}
        <div className="w-72 border-l border-gray-800 flex flex-col bg-gray-950/50 flex-shrink-0">
          <div className="p-4 border-b border-gray-800">
            <h4 className="text-sm font-medium text-white">Audio Player</h4>
          </div>
          
          <div className="flex-1 p-4 space-y-4">
            {/* Waveform */}
            {audioUrl ? (
              <div className="bg-gray-900 rounded-lg p-3">
                <div ref={waveformRef} />
              </div>
            ) : (
              <div className="bg-gray-900 rounded-lg p-8 text-center">
                <p className="text-sm text-gray-500">No audio available</p>
              </div>
            )}
            
            {/* Play Controls */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => jumpToChapter(Math.max(0, currentChapter - 1))}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <SkipBack className="w-5 h-5 text-gray-300" />
              </button>
              
              <button
                onClick={() => setPlaying(!isPlaying)}
                className="p-3 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6 text-white" />
                ) : (
                  <Play className="w-6 h-6 text-white ml-0.5" />
                )}
              </button>
              
              <button
                onClick={() => jumpToChapter(Math.min(chapters.length - 1, currentChapter + 1))}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <SkipForward className="w-5 h-5 text-gray-300" />
              </button>
            </div>
            
            {/* Time Display */}
            <div className="text-center">
              <div className="text-2xl font-mono text-white">
                {formatTime(Math.min(currentTime, duration))}
              </div>
              <div className="text-sm text-gray-500">
                of {formatTime(duration || 0)}
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="bg-gray-800 rounded-full h-2 overflow-hidden">
              <motion.div
                className="h-full bg-purple-600"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>
            
            {/* Current Chapter - removed as it's not useful with single chapter */}
            
            {/* Speed Controls */}
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Playback Speed</p>
              <div className="grid grid-cols-3 gap-2">
                {[0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => (
                  <button
                    key={speed}
                    onClick={() => {
                      if (wavesurferRef.current) {
                        wavesurferRef.current.setPlaybackRate(speed);
                        setCurrentSpeed(speed);
                      }
                    }}
                    className={`px-3 py-1.5 text-xs rounded transition-colors ${
                      currentSpeed === speed
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
            
            {/* Keyboard Shortcuts */}
            <div className="bg-gray-900 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500">{t('editor.keyboard_shortcuts')}</p>
                <button
                  onClick={() => setShortcutsEnabled(!shortcutsEnabled)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    shortcutsEnabled ? 'bg-purple-600' : 'bg-gray-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      shortcutsEnabled ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <div className={`space-y-1 text-xs ${!shortcutsEnabled ? 'opacity-50' : ''}`}>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('editor.play_pause')}</span>
                  <kbd className="px-2 py-0.5 bg-gray-800 rounded">Space</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('editor.previous_segment')}</span>
                  <kbd className="px-2 py-0.5 bg-gray-800 rounded">J</kbd>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('editor.next_segment')}</span>
                  <kbd className="px-2 py-0.5 bg-gray-800 rounded">K</kbd>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}