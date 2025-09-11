"use client";

import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { usePlayerStore } from '@/stores/player-store';
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';

interface AudioPlayerProps {
  audioUrl: string;
  chapters?: any[];
}

export default function AudioPlayer({ audioUrl, chapters = [] }: AudioPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);
  
  const {
    isPlaying,
    currentTime,
    playbackRate,
    volume,
    showWaveform,
    linkMode,
    setPlaying,
    setCurrentTime,
    setDuration,
    jumpToChapter,
    nextChapter,
    previousChapter,
    currentChapter
  } = usePlayerStore();

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !audioUrl) return;

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'rgb(147, 197, 253)',
      progressColor: 'rgb(168, 85, 247)',
      cursorColor: 'rgb(239, 68, 68)',
      barWidth: 2,
      barRadius: 3,
      cursorWidth: 1,
      height: showWaveform ? 100 : 40,
      barGap: 3,
      normalize: true,
      interact: true,
      dragToSeek: true,
      minPxPerSec: 50,
      autoScroll: true,
      autoCenter: true,
    });

    // Initialize regions plugin
    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    
    // Load audio
    wavesurfer.load(audioUrl);
    
    // Event handlers
    wavesurfer.on('ready', () => {
      setIsReady(true);
      setDuration(wavesurfer.getDuration());
      
      // Add chapter regions
      chapters.forEach((chapter, idx) => {
        regions.addRegion({
          start: chapter.startTime,
          end: chapter.endTime,
          content: chapter.title,
          color: `hsla(${(idx * 60) % 360}, 70%, 50%, 0.2)`,
          drag: false,
          resize: false,
        });
      });
    });

    wavesurfer.on('audioprocess', () => {
      if (linkMode !== 'audio') {
        setCurrentTime(wavesurfer.getCurrentTime());
      }
    });

    wavesurfer.on('seeking', (progress) => {
      const time = progress * wavesurfer.getDuration();
      setCurrentTime(time);
    });

    wavesurfer.on('play', () => setPlaying(true));
    wavesurfer.on('pause', () => setPlaying(false));
    wavesurfer.on('finish', () => setPlaying(false));

    // Click on region to jump
    regions.on('region-clicked', (region: any, e: MouseEvent) => {
      e.stopPropagation();
      wavesurfer.setTime(region.start);
      setCurrentTime(region.start);
    });

    wavesurferRef.current = wavesurfer;
    regionsRef.current = regions;

    return () => {
      wavesurfer.destroy();
    };
  }, [audioUrl, showWaveform]);

  // Sync playback state
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;
    
    if (isPlaying) {
      wavesurferRef.current.play();
    } else {
      wavesurferRef.current.pause();
    }
  }, [isPlaying, isReady]);

  // Sync time when jumping
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;
    
    const wsTime = wavesurferRef.current.getCurrentTime();
    if (Math.abs(wsTime - currentTime) > 0.5) {
      wavesurferRef.current.setTime(currentTime);
    }
  }, [currentTime, isReady]);

  // Sync playback rate
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;
    wavesurferRef.current.setPlaybackRate(playbackRate);
  }, [playbackRate, isReady]);

  // Sync volume
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;
    wavesurferRef.current.setVolume(volume);
  }, [volume, isReady]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="audio-player-container space-y-4 p-4 rounded-lg bg-black/20 border border-purple-500/20">
      {/* Waveform */}
      <div 
        ref={containerRef} 
        className="waveform-container"
        style={{ display: showWaveform ? 'block' : 'none' }}
      />
      
      {/* Simple progress bar when waveform is hidden */}
      {!showWaveform && (
        <div className="simple-progress h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className="progress-fill h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all"
            style={{ width: `${(currentTime / (wavesurferRef.current?.getDuration() || 1)) * 100}%` }}
          />
        </div>
      )}

      {/* Controls */}
      <div className="controls flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Previous Chapter */}
          <button
            onClick={previousChapter}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Previous chapter (J)"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={() => setPlaying(!isPlaying)}
            className="p-3 rounded-full bg-purple-600 hover:bg-purple-700 transition-colors"
            title="Play/Pause (Space)"
          >
            {isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-0.5" />
            )}
          </button>

          {/* Next Chapter */}
          <button
            onClick={nextChapter}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Next chapter (K)"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          {/* Time display */}
          <div className="ml-4 text-sm font-mono">
            <span className="text-purple-400">{formatTime(currentTime)}</span>
            <span className="text-gray-500"> / </span>
            <span className="text-gray-400">{formatTime(wavesurferRef.current?.getDuration() || 0)}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Current Chapter */}
          {chapters[currentChapter] && (
            <div className="text-sm">
              <span className="text-gray-500">Chapter {currentChapter + 1}:</span>
              <span className="ml-2 text-purple-400">{chapters[currentChapter].title}</span>
            </div>
          )}

          {/* Playback Speed */}
          <select
            value={playbackRate}
            onChange={(e) => usePlayerStore.getState().setPlaybackRate(parseFloat(e.target.value))}
            className="px-2 py-1 rounded bg-black/40 border border-gray-600 text-sm"
          >
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1">1x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>

          {/* Volume */}
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => usePlayerStore.getState().setVolume(parseFloat(e.target.value))}
              className="w-20"
            />
          </div>
        </div>
      </div>
    </div>
  );
}