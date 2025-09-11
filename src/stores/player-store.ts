/**
 * Global player state management
 */

import { create } from 'zustand';

export type LinkMode = 'both' | 'text' | 'audio';
export type ViewMode = 'simple' | 'editor';

interface Chapter {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  segments?: any[];
}

interface PlayerState {
  // Audio state
  audioUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  
  // Chapter state
  chapters: Chapter[];
  currentChapter: number;
  
  // View state
  viewMode: ViewMode;
  linkMode: LinkMode;
  preRoll: 0 | 0.5 | 1 | 2;
  showChapterPanel: boolean;
  showWaveform: boolean;
  
  // Actions
  setAudioUrl: (url: string | null) => void;
  setPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  
  setChapters: (chapters: Chapter[]) => void;
  setCurrentChapter: (index: number) => void;
  updateChapter: (index: number, chapter: Partial<Chapter>) => void;
  mergeChapters: (index1: number, index2: number) => void;
  splitChapter: (index: number, splitTime: number) => void;
  
  setViewMode: (mode: ViewMode) => void;
  setLinkMode: (mode: LinkMode) => void;
  setPreRoll: (seconds: 0 | 0.5 | 1 | 2) => void;
  toggleChapterPanel: () => void;
  toggleWaveform: () => void;
  
  // Navigation
  jumpToTime: (time: number) => void;
  jumpToChapter: (index: number) => void;
  nextChapter: () => void;
  previousChapter: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  // Initial state
  audioUrl: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1,
  volume: 1,
  
  chapters: [],
  currentChapter: -1,
  
  viewMode: 'simple',
  linkMode: 'both',
  preRoll: 1,
  showChapterPanel: true,
  showWaveform: true,
  
  // Actions
  setAudioUrl: (url) => set({ audioUrl: url }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => {
    set({ currentTime: time });
    
    // Update current chapter based on time
    const { chapters } = get();
    const chapterIndex = chapters.findIndex(
      ch => time >= ch.startTime && time < ch.endTime
    );
    if (chapterIndex !== -1 && chapterIndex !== get().currentChapter) {
      set({ currentChapter: chapterIndex });
    }
  },
  setDuration: (duration) => set({ duration }),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),
  setVolume: (volume) => set({ volume }),
  
  setChapters: (chapters) => set({ chapters }),
  setCurrentChapter: (index) => set({ currentChapter: index }),
  
  updateChapter: (index, updates) => {
    const { chapters } = get();
    const newChapters = [...chapters];
    newChapters[index] = { ...newChapters[index], ...updates };
    set({ chapters: newChapters });
  },
  
  mergeChapters: (index1, index2) => {
    const { chapters } = get();
    if (index1 < 0 || index2 >= chapters.length) return;
    
    const newChapters = [...chapters];
    const merged = {
      ...newChapters[index1],
      endTime: newChapters[index2].endTime,
      segments: [
        ...(newChapters[index1].segments || []),
        ...(newChapters[index2].segments || [])
      ]
    };
    
    newChapters.splice(index1, 1, merged);
    newChapters.splice(index2, 1);
    set({ chapters: newChapters });
  },
  
  splitChapter: (index, splitTime) => {
    const { chapters } = get();
    if (index < 0 || index >= chapters.length) return;
    
    const chapter = chapters[index];
    if (splitTime <= chapter.startTime || splitTime >= chapter.endTime) return;
    
    const newChapters = [...chapters];
    const segments = chapter.segments || [];
    const splitIndex = segments.findIndex((seg: any) => seg.start >= splitTime);
    
    const firstChapter = {
      ...chapter,
      endTime: splitTime,
      segments: segments.slice(0, splitIndex)
    };
    
    const secondChapter = {
      ...chapter,
      id: `${chapter.id}-split`,
      title: `${chapter.title} (continued)`,
      startTime: splitTime,
      segments: segments.slice(splitIndex)
    };
    
    newChapters.splice(index, 1, firstChapter, secondChapter);
    set({ chapters: newChapters });
  },
  
  setViewMode: (mode) => set({ viewMode: mode }),
  setLinkMode: (mode) => set({ linkMode: mode }),
  setPreRoll: (seconds) => set({ preRoll: seconds }),
  toggleChapterPanel: () => set((state) => ({ showChapterPanel: !state.showChapterPanel })),
  toggleWaveform: () => set((state) => ({ showWaveform: !state.showWaveform })),
  
  jumpToTime: (time) => {
    const { preRoll } = get();
    const adjustedTime = Math.max(0, time - preRoll);
    set({ currentTime: adjustedTime });
  },
  
  jumpToChapter: (index) => {
    const { chapters, preRoll } = get();
    if (index >= 0 && index < chapters.length) {
      const time = Math.max(0, chapters[index].startTime - preRoll);
      set({ currentTime: time, currentChapter: index });
    }
  },
  
  nextChapter: () => {
    const { currentChapter, chapters } = get();
    if (currentChapter < chapters.length - 1) {
      get().jumpToChapter(currentChapter + 1);
    }
  },
  
  previousChapter: () => {
    const { currentChapter } = get();
    if (currentChapter > 0) {
      get().jumpToChapter(currentChapter - 1);
    }
  }
}));