"use client";

import { useState } from 'react';
import { usePlayerStore } from '@/stores/player-store';
import { Edit2, Merge, Split, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ChapterNavigationProps {
  chapters: any[];
  onEditChapter?: (index: number, newTitle: string) => void;
  onMergeChapters?: (index1: number, index2: number) => void;
  onSplitChapter?: (index: number, time: number) => void;
}

export default function ChapterNavigation({
  chapters,
  onEditChapter,
  onMergeChapters,
  onSplitChapter
}: ChapterNavigationProps) {
  const t = useTranslations('tool_interface.results');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());
  
  const {
    currentChapter,
    currentTime,
    jumpToChapter,
    updateChapter,
    mergeChapters: mergeInStore,
    splitChapter: splitInStore
  } = usePlayerStore();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEditStart = (index: number, currentTitle: string) => {
    setEditingIndex(index);
    setEditTitle(currentTitle);
  };

  const handleEditSave = (index: number) => {
    if (editTitle.trim()) {
      updateChapter(index, { title: editTitle.trim() });
      if (onEditChapter) {
        onEditChapter(index, editTitle.trim());
      }
    }
    setEditingIndex(null);
    setEditTitle('');
  };

  const handleEditCancel = () => {
    setEditingIndex(null);
    setEditTitle('');
  };

  const handleMerge = (index: number) => {
    if (index < chapters.length - 1) {
      mergeInStore(index, index + 1);
      if (onMergeChapters) {
        onMergeChapters(index, index + 1);
      }
    }
  };

  const handleSplit = (index: number) => {
    const chapter = chapters[index];
    const midTime = (chapter.startTime + chapter.endTime) / 2;
    splitInStore(index, midTime);
    if (onSplitChapter) {
      onSplitChapter(index, midTime);
    }
  };

  const toggleChapterExpand = (index: number) => {
    const newExpanded = new Set(expandedChapters);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedChapters(newExpanded);
  };

  return (
    <div className="chapter-navigation h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-purple-400">
          {t('chapters')}
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          {chapters.length} chapters • {formatTime(chapters[chapters.length - 1]?.endTime || 0)} total
        </p>
      </div>

      {/* Chapter List */}
      <div className="flex-1 overflow-y-auto">
        {chapters.map((chapter, index) => {
          const isActive = index === currentChapter;
          const isExpanded = expandedChapters.has(index);
          const progress = isActive ? 
            ((currentTime - chapter.startTime) / (chapter.endTime - chapter.startTime)) * 100 : 0;

          return (
            <div
              key={chapter.id || index}
              className={`chapter-item border-b border-gray-800 ${
                isActive ? 'bg-purple-900/20 border-l-4 border-purple-500' : ''
              }`}
            >
              {/* Chapter Header */}
              <div className="p-3 cursor-pointer hover:bg-white/5" onClick={() => jumpToChapter(index)}>
                {/* Title and Time */}
                <div className="flex items-start justify-between mb-2">
                  {editingIndex === index ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave(index);
                        if (e.key === 'Escape') handleEditCancel();
                      }}
                      onBlur={() => handleEditSave(index)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 px-2 py-1 bg-black/40 border border-purple-500 rounded text-sm"
                      autoFocus
                    />
                  ) : (
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleChapterExpand(index);
                          }}
                          className="p-0.5 hover:bg-white/10 rounded"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                        </button>
                        <span className="text-sm font-medium">
                          {index + 1}. {chapter.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 ml-5">
                        <Clock className="w-3 h-3 text-gray-500" />
                        <span className="text-xs text-gray-500">
                          {formatTime(chapter.startTime)} - {formatTime(chapter.endTime)}
                        </span>
                        <span className="text-xs text-gray-600">
                          ({Math.round(chapter.endTime - chapter.startTime)}s)
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Progress Bar */}
                {isActive && (
                  <div className="h-1 bg-gray-700 rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}

                {/* Action Buttons */}
                {editingIndex !== index && (
                  <div className="flex items-center gap-1 mt-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditStart(index, chapter.title);
                      }}
                      className="p-1.5 rounded hover:bg-white/10 transition-colors"
                      title="Rename chapter"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                    
                    {index < chapters.length - 1 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMerge(index);
                        }}
                        className="p-1.5 rounded hover:bg-white/10 transition-colors"
                        title="Merge with next chapter"
                      >
                        <Merge className="w-3 h-3" />
                      </button>
                    )}
                    
                    {chapter.endTime - chapter.startTime > 60 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSplit(index);
                        }}
                        className="p-1.5 rounded hover:bg-white/10 transition-colors"
                        title="Split chapter"
                      >
                        <Split className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Expanded Segments */}
              {isExpanded && chapter.segments && (
                <div className="pl-8 pr-3 pb-3 space-y-1">
                  {chapter.segments.map((segment: any, segIdx: number) => (
                    <div
                      key={segIdx}
                      className="text-xs p-2 bg-black/20 rounded cursor-pointer hover:bg-black/30"
                      onClick={() => {
                        jumpToChapter(index);
                        usePlayerStore.getState().setCurrentTime(segment.start);
                      }}
                    >
                      <span className="text-blue-400 font-mono">
                        [{formatTime(segment.start)}]
                      </span>
                      <span className="ml-2 text-gray-300">
                        {segment.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Controls */}
      <div className="p-3 border-t border-gray-700 text-xs text-gray-500">
        <div className="flex items-center justify-between mb-2">
          <span>Link Mode:</span>
          <select
            value={usePlayerStore.getState().linkMode}
            onChange={(e) => usePlayerStore.getState().setLinkMode(e.target.value as any)}
            className="px-2 py-1 bg-black/40 border border-gray-600 rounded text-xs"
          >
            <option value="both">Audio + Text</option>
            <option value="text">Text Only</option>
            <option value="audio">Audio Only</option>
          </select>
        </div>
        
      </div>
    </div>
  );
}