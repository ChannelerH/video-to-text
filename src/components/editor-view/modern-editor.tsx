"use client";

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useHotkeys } from 'react-hotkeys-hook';
import { usePlayerStore } from '@/stores/player-store';
import { useTranslations } from 'next-intl';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  List,
  FileText,
  Activity,
  Clock,
  Hash,
  Edit3,
  Maximize2,
  Minimize2,
  Settings,
  ChevronRight,
  Sparkles
} from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';

interface ModernEditorProps {
  audioUrl?: string | null;
  segments: any[];
  chapters: any[];
  transcription: any;
}

export default function ModernEditor({ audioUrl, segments, chapters, transcription }: ModernEditorProps) {
  const t = useTranslations('tool_interface');
  const [activePanel, setActivePanel] = useState<'chapters' | 'transcript'>('transcript');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [waveformReady, setWaveformReady] = useState(false);
  
  const {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    volume,
    currentChapter,
    setPlaying,
    setCurrentTime,
    setDuration,
    jumpToChapter,
    setChapters,
    updateChapter
  } = usePlayerStore();

  // Initialize chapters
  useEffect(() => {
    setChapters(chapters);
    if (transcription?.duration) {
      setDuration(transcription.duration);
    }
  }, [chapters, transcription]);

  // Initialize WaveSurfer when audio is available
  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;

    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'rgba(168, 85, 247, 0.3)',
      progressColor: 'rgba(168, 85, 247, 0.8)',
      cursorColor: 'rgba(236, 72, 153, 0.8)',
      barWidth: 3,
      barRadius: 6,
      cursorWidth: 2,
      height: 80,
      barGap: 2,
      normalize: true,
      interact: true,
      dragToSeek: true,
    });

    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    
    wavesurfer.load(audioUrl);
    
    wavesurfer.on('ready', () => {
      setWaveformReady(true);
      setDuration(wavesurfer.getDuration());
      
      // Add chapter regions with gradient colors
      chapters.forEach((chapter, idx) => {
        const hue = (idx * 60) % 360;
        regions.addRegion({
          start: chapter.startTime,
          end: chapter.endTime,
          content: chapter.title,
          color: `hsla(${hue}, 70%, 50%, 0.1)`,
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

  // Keyboard shortcuts
  useHotkeys('space', (e) => {
    e.preventDefault();
    setPlaying(!isPlaying);
  }, [isPlaying]);

  useHotkeys('j', () => jumpToChapter(Math.max(0, currentChapter - 1)), [currentChapter]);
  useHotkeys('k', () => jumpToChapter(Math.min(chapters.length - 1, currentChapter + 1)), [currentChapter]);
  useHotkeys('f', () => setIsFullscreen(!isFullscreen), [isFullscreen]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`modern-editor relative ${isFullscreen ? 'fixed inset-0 z-50' : 'h-[80vh]'} bg-gradient-to-br from-gray-900 via-purple-900/10 to-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-purple-500/20`}
    >
      {/* Animated Background */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-pink-600/20 to-blue-600/20 animate-gradient" />
      </div>

      {/* Glass Panels */}
      <PanelGroup direction="horizontal" className="relative z-10">
        {/* Left Panel - Chapters/Navigation */}
        <Panel defaultSize={25} minSize={20} maxSize={35}>
          <motion.div 
            className="h-full backdrop-blur-xl bg-white/5 border-r border-white/10 flex flex-col"
            initial={{ x: -100 }}
            animate={{ x: 0 }}
            transition={{ type: "spring", damping: 20 }}
          >
            {/* Panel Header */}
            <div className="p-6 border-b border-white/10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <List className="w-5 h-5 text-purple-400" />
                  {t('editor.chapters')}
                </h3>
                <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-300">
                  {chapters.length} chapters
                </span>
              </div>
              
              {/* Mini Stats */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-white/5">
                  <div className="text-gray-400">Duration</div>
                  <div className="text-white font-medium">{formatTime(duration)}</div>
                </div>
                <div className="p-2 rounded-lg bg-white/5">
                  <div className="text-gray-400">Progress</div>
                  <div className="text-white font-medium">{Math.round(progressPercentage)}%</div>
                </div>
              </div>
            </div>

            {/* Chapters List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <AnimatePresence>
                {chapters.map((chapter, idx) => {
                  const isActive = idx === currentChapter;
                  const chapterProgress = isActive ? 
                    ((currentTime - chapter.startTime) / (chapter.endTime - chapter.startTime)) * 100 : 0;

                  return (
                    <motion.div
                      key={chapter.id || idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => jumpToChapter(idx)}
                      className={`group relative p-3 rounded-xl cursor-pointer transition-all ${
                        isActive 
                          ? 'bg-gradient-to-r from-purple-500/30 to-pink-500/30 shadow-lg' 
                          : 'hover:bg-white/5'
                      }`}
                    >
                      {/* Chapter Number */}
                      <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-gradient-to-b from-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-purple-400">
                              {String(idx + 1).padStart(2, '0')}
                            </span>
                            <h4 className="text-sm font-medium text-white line-clamp-1">
                              {chapter.title}
                            </h4>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <Clock className="w-3 h-3" />
                            <span>{formatTime(chapter.startTime)}</span>
                            <span className="text-gray-600">•</span>
                            <span>{Math.round(chapter.endTime - chapter.startTime)}s</span>
                          </div>
                        </div>
                        
                        {/* Edit Button */}
                        <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1">
                          <Edit3 className="w-3 h-3 text-gray-400 hover:text-purple-400" />
                        </button>
                      </div>

                      {/* Progress Bar */}
                      {isActive && (
                        <motion.div 
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10 rounded-full overflow-hidden"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          <motion.div
                            className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                            style={{ width: `${chapterProgress}%` }}
                          />
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        </Panel>

        <PanelResizeHandle className="w-1 hover:w-2 bg-gradient-to-b from-purple-500/50 to-pink-500/50 transition-all" />

        {/* Center Panel - Transcript */}
        <Panel defaultSize={50} minSize={40}>
          <motion.div 
            className="h-full backdrop-blur-xl bg-white/5 flex flex-col"
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            transition={{ type: "spring", damping: 20 }}
          >
            {/* Transcript Header */}
            <div className="p-6 border-b border-white/10">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-400" />
                  {t('editor.transcription_text')}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-300">
                    {segments.length} segments
                  </span>
                  <button
                    onClick={() => setIsFullscreen(!isFullscreen)}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4 text-gray-400" />
                    ) : (
                      <Maximize2 className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Transcript Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <AnimatePresence>
                {segments.map((segment, idx) => {
                  const isActive = currentTime >= segment.start && currentTime < segment.end;
                  
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.01, 0.3) }}
                      onClick={() => setCurrentTime(segment.start)}
                      className={`group mb-4 p-4 rounded-xl cursor-pointer transition-all ${
                        isActive 
                          ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 shadow-lg scale-[1.02]' 
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {/* Timestamp */}
                        <div className="flex-shrink-0">
                          <div className={`text-xs font-mono px-2 py-1 rounded-lg ${
                            isActive 
                              ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white' 
                              : 'bg-white/10 text-blue-400'
                          }`}>
                            {formatTime(segment.start)}
                          </div>
                        </div>
                        
                        {/* Text */}
                        <p className={`flex-1 leading-relaxed transition-colors ${
                          isActive ? 'text-white' : 'text-gray-300'
                        }`}>
                          {segment.text}
                        </p>
                      </div>
                      
                      {/* Active Indicator */}
                      {isActive && (
                        <motion.div 
                          className="mt-3 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                          layoutId="activeSegment"
                        />
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        </Panel>

        <PanelResizeHandle className="w-1 hover:w-2 bg-gradient-to-b from-blue-500/50 to-purple-500/50 transition-all" />

        {/* Right Panel - Player */}
        <Panel defaultSize={25} minSize={20} maxSize={35}>
          <motion.div 
            className="h-full backdrop-blur-xl bg-white/5 border-l border-white/10 flex flex-col"
            initial={{ x: 100 }}
            animate={{ x: 0 }}
            transition={{ type: "spring", damping: 20 }}
          >
            {/* Player Header */}
            <div className="p-6 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-pink-400" />
                Audio Player
              </h3>
              
              {/* Waveform */}
              {audioUrl ? (
                <div ref={waveformRef} className="rounded-lg overflow-hidden" />
              ) : (
                <div className="h-20 rounded-lg bg-white/5 flex items-center justify-center">
                  <p className="text-sm text-gray-500">No audio available</p>
                </div>
              )}
            </div>

            {/* Player Controls */}
            <div className="flex-1 p-6 space-y-6">
              {/* Main Controls */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => jumpToChapter(Math.max(0, currentChapter - 1))}
                  className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <SkipBack className="w-5 h-5" />
                </button>
                
                <button
                  onClick={() => setPlaying(!isPlaying)}
                  className="p-4 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg"
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6 ml-0.5" />
                  )}
                </button>
                
                <button
                  onClick={() => jumpToChapter(Math.min(chapters.length - 1, currentChapter + 1))}
                  className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              {/* Time Display */}
              <div className="text-center">
                <div className="text-2xl font-mono text-white">
                  {formatTime(currentTime)}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  of {formatTime(duration)}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>

              {/* Speed Control */}
              <div className="space-y-2">
                <label className="text-xs text-gray-400">Playback Speed</label>
                <div className="flex items-center gap-2">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map(speed => (
                    <button
                      key={speed}
                      onClick={() => {
                        if (wavesurferRef.current) {
                          wavesurferRef.current.setPlaybackRate(speed);
                        }
                      }}
                      className={`px-2 py-1 text-xs rounded-lg transition-all ${
                        playbackRate === speed 
                          ? 'bg-purple-500 text-white' 
                          : 'bg-white/10 hover:bg-white/20'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Keyboard Shortcuts */}
              <div className="p-3 rounded-lg bg-white/5 space-y-2">
                <div className="text-xs text-gray-400 mb-2">Keyboard Shortcuts</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Play/Pause</span>
                    <kbd className="px-1.5 py-0.5 bg-white/10 rounded">Space</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Previous</span>
                    <kbd className="px-1.5 py-0.5 bg-white/10 rounded">J</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Next</span>
                    <kbd className="px-1.5 py-0.5 bg-white/10 rounded">K</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Fullscreen</span>
                    <kbd className="px-1.5 py-0.5 bg-white/10 rounded">F</kbd>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </Panel>
      </PanelGroup>

      {/* CSS for animations */}
      <style jsx>{`
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 15s ease infinite;
        }
      `}</style>
    </motion.div>
  );
}