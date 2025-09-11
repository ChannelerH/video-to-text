"use client";

import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/stores/player-store';
import { useTranslations } from 'next-intl';

interface Segment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

interface TranscriptViewProps {
  segments: Segment[];
  chapters: any[];
}

export default function TranscriptView({ segments, chapters }: TranscriptViewProps) {
  const t = useTranslations('tool_interface.results');
  const containerRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
  const [hoveredSegmentIndex, setHoveredSegmentIndex] = useState<number | null>(null);
  
  const {
    currentTime,
    linkMode,
    currentChapter,
    setCurrentTime,
    isPlaying
  } = usePlayerStore();

  // Find active segment based on current time
  useEffect(() => {
    if (linkMode === 'audio') return;
    
    const activeIndex = segments.findIndex(
      seg => currentTime >= seg.start && currentTime < seg.end
    );
    
    if (activeIndex !== activeSegmentIndex) {
      setActiveSegmentIndex(activeIndex);
      
      // Scroll to active segment
      if (activeIndex !== -1 && isPlaying) {
        const element = segmentRefs.current.get(activeIndex);
        if (element && containerRef.current) {
          const container = containerRef.current;
          const elementTop = element.offsetTop;
          const elementHeight = element.offsetHeight;
          const containerHeight = container.clientHeight;
          const scrollTop = container.scrollTop;
          
          // Check if element is not fully visible
          if (elementTop < scrollTop || elementTop + elementHeight > scrollTop + containerHeight) {
            container.scrollTo({
              top: elementTop - containerHeight / 2 + elementHeight / 2,
              behavior: 'smooth'
            });
          }
        }
      }
    }
  }, [currentTime, segments, activeSegmentIndex, linkMode, isPlaying]);

  const handleSegmentClick = (segment: Segment) => {
    if (linkMode !== 'text') {
      setCurrentTime(segment.start);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Group segments by chapters
  const segmentsByChapter = chapters.map(chapter => ({
    ...chapter,
    segments: segments.filter(
      seg => seg.start >= chapter.startTime && seg.end <= chapter.endTime
    )
  }));

  return (
    <div className="transcript-view h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-green-400">
          {t('transcription_text')}
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          {segments.length} segments • Click any segment to jump
        </p>
      </div>

      {/* Transcript Content */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-6"
      >
        {segmentsByChapter.length > 0 ? (
          // Display by chapters
          segmentsByChapter.map((chapter, chapterIdx) => (
            <div
              key={chapter.id || chapterIdx}
              id={`transcript-chapter-${chapterIdx}`}
              className={`chapter-section p-4 rounded-lg border ${
                chapterIdx === currentChapter 
                  ? 'border-purple-500/50 bg-purple-900/10' 
                  : 'border-gray-700/50 bg-black/20'
              }`}
            >
              {/* Chapter Header */}
              <div className="mb-4 pb-3 border-b border-gray-700">
                <h4 className="text-base font-semibold text-purple-400">
                  Chapter {chapterIdx + 1}: {chapter.title}
                </h4>
                <p className="text-xs text-gray-500 mt-1">
                  {formatTime(chapter.startTime)} - {formatTime(chapter.endTime)}
                </p>
              </div>

              {/* Chapter Segments */}
              <div className="space-y-3">
                {chapter.segments.map((segment: Segment, segIdx: number) => {
                  const globalIndex = segments.indexOf(segment);
                  const isActive = globalIndex === activeSegmentIndex;
                  const isHovered = globalIndex === hoveredSegmentIndex;

                  return (
                    <div
                      key={segIdx}
                      ref={(el) => {
                        if (el) segmentRefs.current.set(globalIndex, el);
                      }}
                      className={`segment-item p-3 rounded-lg cursor-pointer transition-all ${
                        isActive 
                          ? 'bg-purple-900/30 border border-purple-500/50 shadow-lg shadow-purple-500/20' 
                          : isHovered 
                          ? 'bg-white/5 border border-gray-600/50' 
                          : 'hover:bg-white/5 border border-transparent'
                      }`}
                      onClick={() => handleSegmentClick(segment)}
                      onMouseEnter={() => setHoveredSegmentIndex(globalIndex)}
                      onMouseLeave={() => setHoveredSegmentIndex(null)}
                    >
                      <div className="flex items-start gap-3">
                        {/* Timestamp */}
                        <span className={`text-xs font-mono mt-0.5 ${
                          isActive ? 'text-purple-400' : 'text-blue-400'
                        }`}>
                          {formatTime(segment.start)}
                        </span>

                        {/* Text */}
                        <p className={`flex-1 text-sm leading-relaxed ${
                          isActive ? 'text-white' : 'text-gray-300'
                        }`}>
                          {segment.speaker && (
                            <span className="font-medium text-cyan-400 mr-2">
                              {segment.speaker}:
                            </span>
                          )}
                          {segment.text}
                        </p>
                      </div>

                      {/* Active Indicator */}
                      {isActive && (
                        <div className="mt-2 h-0.5 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          // Fallback to flat segments display
          <div className="space-y-3">
            {segments.map((segment, index) => {
              const isActive = index === activeSegmentIndex;
              const isHovered = index === hoveredSegmentIndex;

              return (
                <div
                  key={index}
                  ref={(el) => {
                    if (el) segmentRefs.current.set(index, el);
                  }}
                  className={`segment-item p-3 rounded-lg cursor-pointer transition-all ${
                    isActive 
                      ? 'bg-purple-900/30 border border-purple-500/50 shadow-lg shadow-purple-500/20' 
                      : isHovered 
                      ? 'bg-white/5 border border-gray-600/50' 
                      : 'hover:bg-white/5 border border-transparent'
                  }`}
                  onClick={() => handleSegmentClick(segment)}
                  onMouseEnter={() => setHoveredSegmentIndex(index)}
                  onMouseLeave={() => setHoveredSegmentIndex(null)}
                >
                  <div className="flex items-start gap-3">
                    <span className={`text-xs font-mono mt-0.5 ${
                      isActive ? 'text-purple-400' : 'text-blue-400'
                    }`}>
                      {formatTime(segment.start)}
                    </span>
                    <p className={`flex-1 text-sm leading-relaxed ${
                      isActive ? 'text-white' : 'text-gray-300'
                    }`}>
                      {segment.text}
                    </p>
                  </div>
                  {isActive && (
                    <div className="mt-2 h-0.5 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}