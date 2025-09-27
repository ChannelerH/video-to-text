"use client";

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
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
  X,
  ChevronDown,
  FileText,
  Download
} from 'lucide-react';
import { Volume2 } from 'lucide-react';
import PreviewIndicator from '@/components/preview-indicator';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { UpgradeModal } from '@/components/upgrade-modal';
import { useAppContext } from '@/contexts/app';
import { suggestSpeakerNames } from '@/lib/speaker-suggest';

interface ThreeColumnEditorProps {
  audioUrl?: string | null;
  segments: any[];
  chapters: any[];
  speakers?: any[];
  transcription: any;
  onClose?: () => void;
  backHref?: string;
  onSegmentsUpdate?: (segments: any[]) => void;
  isPreviewMode?: boolean;
  originalDurationSec?: number;
  jobId: string;
}

export default function ThreeColumnEditor({ 
  audioUrl, 
  segments: initialSegments, 
  chapters: initialChapters, 
  speakers: initialSpeakers,
  transcription,
  onClose,
  backHref,
  onSegmentsUpdate,
  isPreviewMode,
  originalDurationSec,
  jobId
}: ThreeColumnEditorProps) {
  const tPaywall = useTranslations('paywall');
  const { userTier } = useAppContext();
  const isFreeTier = (userTier || 'free') === 'free';
  
  // Show warning if no audio URL
  useEffect(() => {
    if (!audioUrl) {
      toast.warning('No audio file available for this transcription');
    }
  }, [audioUrl]);
  
  // Debug toggle: run in console -> localStorage.setItem('debug-audio','1') to enable
  const DEBUG = typeof window !== 'undefined' && window.localStorage?.getItem?.('debug-audio') === '1';
  const dlog = (...args: any[]) => { if (DEBUG) console.log('[EditorAudio]', ...args); };
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState<null | 'docx' | 'pdf' | 'txt' | 'srt' | 'vtt' | 'json' | 'md'>(null);
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [editingChapter, setEditingChapter] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [currentSpeed, setCurrentSpeed] = useState(1);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(false); // Default off
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<any>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [waveformReady, setWaveformReady] = useState(false);
  const [audioLoading, setAudioLoading] = useState(true);
  const [linkMode, setLinkMode] = useState<'both'|'text'|'audio'>('both');
  const [preRollLocal, setPreRollLocal] = useState<0|0.5|1|2>(1);
  // 手动高亮：用于暂停或仅文本联动时也能高亮选中的句子
  const [manualHighlightIdx, setManualHighlightIdx] = useState<number | null>(null);
  const [splitModal, setSplitModal] = useState<{open:boolean; index:number|null; segmentIndex:number}>({ open:false, index:null, segmentIndex:0 });
  const [mergeModal, setMergeModal] = useState<{open:boolean; index:number|null}>({ open:false, index:null });
  const [segmentSplitModal, setSegmentSplitModal] = useState<{open:boolean; segmentIndex:number|null; splitPosition:number}>({ open:false, segmentIndex:null, splitPosition:0 });
  const [segments, setSegments] = useState(initialSegments);
  // Speakers (derived from diarization in segments)
  const [speakers, setSpeakers] = useState<{ id: string; label: string; color: string }[]>([]);
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [speakerSuggestions, setSpeakerSuggestions] = useState<Record<string, { name: string; score: number }[]>>({});
  const [groupBySpeaker, setGroupBySpeaker] = useState<boolean>(false);
  const [generatedSummary, setGeneratedSummary] = useState<string>("");
  const [generatingSummary, setGeneratingSummary] = useState<boolean>(false);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);
  const [generatingChapters, setGeneratingChapters] = useState<boolean>(false);
  const hasShownAudioLoadedToast = useRef(false);
  const [changingSpeakerForSegment, setChangingSpeakerForSegment] = useState<number | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  // Intelligent recommendation: suggest PRO high accuracy
  const recommend = (() => {
    try {
      const uniqueSpeakers = Array.from(new Set((segments || []).map((s: any) => s.speaker).filter(Boolean))).length;
      const durationSec = Number(transcription?.duration || transcription?.duration_sec || 0);
      const reasons: string[] = [];
      if (uniqueSpeakers >= 2) reasons.push(tPaywall('multiple_speakers'));
      if (durationSec >= 3600) reasons.push(tPaywall('long_audio'));
      if (reasons.length === 0) return null;
      return { reasons, durationSec };
    } catch { return null; }
  })();
  
  // Generate consistent color for speaker name
  const getSpeakerColor = (speakerName: string | null | undefined): string => {
    if (!speakerName) return '#6b7280'; // gray for no speaker
    
    // Check if color already assigned in speakers array
    const existingSpeaker = speakers.find(s => s.id === speakerName);
    if (existingSpeaker?.color) {
      return existingSpeaker.color;
    }
    
    // More diverse colors to reduce collision chance
    const colors = [
      '#f97316', // orange
      '#3b82f6', // blue
      '#10b981', // emerald
      '#8b5cf6', // violet
      '#eab308', // yellow
      '#ef4444', // red
      '#06b6d4', // cyan
      '#ec4899', // pink
      '#14b8a6', // teal
      '#a855f7', // purple
      '#22c55e', // green
      '#f59e0b', // amber
      '#84cc16', // lime
      '#0ea5e9', // sky
      '#6366f1', // indigo
      '#d946ef'  // fuchsia
    ];
    
    // Get already used colors
    const usedColors = speakers.map(s => s.color).filter(Boolean);
    
    // Try to find an unused color first
    const availableColors = colors.filter(c => !usedColors.includes(c));
    if (availableColors.length > 0) {
      // Use hash to pick from available colors for consistency
      let hash = 0;
      for (let i = 0; i < speakerName.length; i++) {
        hash = speakerName.charCodeAt(i) * 31 + ((hash << 5) - hash);
      }
      return availableColors[Math.abs(hash) % availableColors.length];
    }
    
    // If all colors are used, use hash to pick one
    let hash = 0;
    for (let i = 0; i < speakerName.length; i++) {
      hash = speakerName.charCodeAt(i) * 31 + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };
  
  const {
    isPlaying,
    currentTime,
    duration,
    currentChapter,
    chapters,
    volume,
    setPlaying,
    setCurrentTime,
    setDuration,
    jumpToChapter,
    setChapters,
    updateChapter,
    setVolume,
    setCurrentChapter
  } = usePlayerStore();

  const previousJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    if (previousJobIdRef.current === jobId) return;
    previousJobIdRef.current = jobId;
    setChapters([]);
    setCurrentChapter(-1);
    setCurrentTime(0);
    setPlaying(false);
    setDuration(0);
    setSegments(initialSegments);
  }, [jobId, initialSegments, setChapters, setCurrentChapter, setCurrentTime, setPlaying, setDuration]);


  // Initialize chapters once, or when there are no chapters yet.
  // Avoid overriding user edits on unrelated re-renders (e.g., transcription object changes).
  useEffect(() => {
    if (chapters && chapters.length > 0) return; // already initialized; don't clobber edits

    // Set default chapter if no chapters exist
    const chaptersToUse = initialChapters.length > 0 && !initialChapters[0]?._needsAIGeneration 
      ? initialChapters 
      : [{
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
  }, [chapters, initialChapters, transcription, jobId]);
  
  
  // Generate AI chapters
  const generateAIChapters = async () => {
    if (generatingChapters) return;
    
    setGeneratingChapters(true);
    try {
      const targetJobId = jobId;
      if (!targetJobId) {
        throw new Error('Missing job id for AI chapter request');
      }
      console.log('Generating AI chapters for job:', targetJobId);
      toast.info('Generating AI chapters... This may take a moment.');
      
      const response = await fetch(`/api/transcriptions/${targetJobId}/chapters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          segments: segments,
          options: {
            language: transcription?.language || 'auto',
            generateSummary: false
          }
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        if (result.data?.chapters && result.data.chapters.length > 0) {
          console.log('AI chapters generated:', result.data.chapters.length);
          setChapters(result.data.chapters);
          toast.success('AI chapters generated successfully');
        } else {
          toast.warning('No chapters generated. Try manual splitting instead.');
        }
      } else {
        // Handle specific error cases
        if (response.status === 403) {
          if (result.error?.includes('本月次数已用尽') || result.error?.includes('monthly limit')) {
            toast.error(
              <div className="flex flex-col gap-1">
                <span>You've used all 10 free AI chapters this month</span>
                <a href="/pricing" className="text-blue-400 hover:text-blue-300 underline text-sm">
                  Upgrade to Pro for unlimited AI features
                </a>
              </div>
            );
          } else if (result.error?.includes('今日次数已达上限') || result.error?.includes('daily limit')) {
            toast.error('Daily AI chapter limit reached. Try again tomorrow.');
          } else {
            toast.error(
              <div className="flex flex-col gap-1">
                <span>AI chapters not available for your plan</span>
                <a href="/pricing" className="text-blue-400 hover:text-blue-300 underline text-sm">
                  Upgrade to unlock AI features
                </a>
              </div>
            );
          }
        } else {
          toast.error(result.error || 'Failed to generate AI chapters. Please try again.');
        }
      }
    } catch (error) {
      console.error('Failed to generate AI chapters:', error);
      toast.error('Error generating chapters. Please try manual splitting.');
    } finally {
      setGeneratingChapters(false);
    }
  };

  // Initialize speakers from segments
  useEffect(() => {
    try {
      // Get unique speaker values from segments
      const uniqueSpeakers = Array.from(new Set((segments || []).map((s: any) => s.speaker).filter(Boolean))).map(String);
      if (uniqueSpeakers.length === 0) {
        setSpeakers([]);
        return;
      }
      
      // If we have initial speakers with proper labels, use them
      if (initialSpeakers && initialSpeakers.length > 0) {
        // Map segment speakers to initial speaker labels if they match IDs
        const mappedSpeakers = uniqueSpeakers.map(speakerValue => {
          const initialSpeaker = initialSpeakers.find(s => s.id === speakerValue);
          if (initialSpeaker) {
            return initialSpeaker;
          }
          // Otherwise treat as direct name
          return {
            id: speakerValue,
            label: speakerValue,
            color: getSpeakerColor(speakerValue)
          };
        });
        setSpeakers(mappedSpeakers);
      } else {
        // Create speakers from unique values
        const newSpeakers = uniqueSpeakers.map(name => ({
          id: name,
          label: name,
          color: getSpeakerColor(name)
        }));
        setSpeakers(newSpeakers);
      }
    } catch {}
  }, [segments, initialSpeakers]);

  // Handle click outside of export dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setShowExportDropdown(false);
      }
    };

    if (showExportDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportDropdown]);

  // Handle export for different formats
  const handleExport = async (format: 'txt' | 'srt' | 'vtt' | 'json' | 'md' | 'docx' | 'pdf') => {
    // Allow DOCX/PDF in preview mode; server route enforces 5-minute trim for Free

    try {
      setExporting(format);
      setShowExportDropdown(false);
      
      // Show preview warning for free users
      if (isPreviewMode) {
        toast.info('Exporting first 5 minutes only (Free preview)', {
          duration: 4000,
          icon: '⚠️'
        });
      }
      
      const jobId = (typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : '') as string;
      const a = document.createElement('a');
      
      if (format === 'docx' || format === 'pdf') {
        a.href = `/api/transcriptions/${jobId}/export?format=${format}`;
      } else {
        // 使用统一的 simple formats 路由，后端会对 Free 进行 5 分钟裁剪
        a.href = `/api/transcriptions/${jobId}/file?format=${format}`;
      }
      
      a.click();
      
      // Add a delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Success message with preview reminder
      if (isPreviewMode) {
        toast.success(`${format.toUpperCase()} exported (first 5 minutes)`, {
          description: 'Upgrade to export full content'
        });
      } else {
        toast.success(`${format.toUpperCase()} exported successfully`);
      }
    } catch (error) {
      toast.error(`Failed to export ${format.toUpperCase()}`);
    } finally {
      setExporting(null);
    }
  };

  // Initialize WaveSurfer
  useEffect(() => {
    console.log('[Audio Debug] WaveSurfer init effect running. audioUrl:', audioUrl, 'waveformRef:', !!waveformRef.current);
    
    // Clean up existing instance if any
    if (wavesurferRef.current) {
      console.log('[Audio Debug] Cleaning up existing WaveSurfer instance');
      try {
        wavesurferRef.current.destroy();
      } catch (e) {
        console.error('[Audio Debug] Error destroying existing instance:', e);
      }
      wavesurferRef.current = null;
    }
    
    if (!waveformRef.current) {
      console.log('[Audio Debug] No waveform container element');
      return;
    }
    
    if (!audioUrl) {
      console.log('[Audio Debug] No audio URL provided');
      return;
    }
    
    // Validate audio URL
    try {
      const url = new URL(audioUrl, window.location.origin);
      dlog('Loading audio from:', url.href);
    } catch (e) {
      console.warn('Invalid audio URL:', audioUrl);
      toast.error('Invalid audio URL');
      return;
    }

    console.log('[Audio Debug] Creating WaveSurfer instance...');
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
    
    console.log('[Audio Debug] WaveSurfer instance created:', !!wavesurfer);

    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    regionsRef.current = regions;
    
    // Store wavesurfer ref immediately after creation
    wavesurferRef.current = wavesurfer;
    console.log('[Audio Debug] wavesurferRef.current set:', !!wavesurferRef.current);
    
    try { (window as any).__wavesurfer = wavesurfer; } catch {}
    
    // Use proxy to avoid CORS issues
    let playUrl = audioUrl;
    
    // If the URL is external (not relative), use proxy
    if (audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
      playUrl = `/api/media/proxy?url=${encodeURIComponent(audioUrl)}`;
      console.log('[Audio Debug] Using proxy for external URL');
    }
    
    // Debug: Log the actual URL being loaded
    console.log('[Audio Debug] Loading audio from URL:', playUrl);
    console.log('[Audio Debug] Original URL:', audioUrl);
    dlog('wavesurfer.load()', playUrl);
    
    // Load audio with detailed error handling
    console.log('[Audio Debug] Loading audio from URL:', playUrl);
    setAudioLoading(true);  // Start loading
    
    wavesurfer.load(playUrl).then(() => {
      console.log('[Audio Debug] Audio loaded successfully');
      setWaveformReady(true);  // Set ready immediately after successful load
      setAudioLoading(false);  // Loading complete
    }).catch((error) => {
      console.error('[Audio Debug] Failed to load audio:', error);
      setWaveformReady(false);
      setAudioLoading(false);  // Stop loading even on error
      
      // More detailed error message
      if (error.message?.includes('CORS')) {
        toast.error('Audio blocked by CORS policy. Using proxy...');
        // Try with proxy if CORS error
        const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(audioUrl)}`;
        console.log('[Audio Debug] Retrying with proxy:', proxyUrl);
        setAudioLoading(true);  // Restart loading for proxy
        wavesurfer.load(proxyUrl).then(() => {
          console.log('[Audio Debug] Audio loaded via proxy');
          setWaveformReady(true);
          setAudioLoading(false);
        }).catch((proxyError) => {
          console.error('[Audio Debug] Proxy also failed:', proxyError);
          toast.error('Unable to load audio file');
          setAudioLoading(false);
        });
      } else {
        toast.error(`Failed to load audio: ${error.message || 'Unknown error'}`);
      }
    });
    
    wavesurfer.on('ready', () => {
      dlog('Event: ready; duration=', wavesurfer.getDuration());
      setWaveformReady(true);  // Ensure it's set on ready event too
      setAudioLoading(false);  // Ensure loading is false
      setDuration(wavesurfer.getDuration());
      // Set initial volume
      wavesurfer.setVolume(volume);
      
      // Show success message only once
      if (!hasShownAudioLoadedToast.current) {
        toast.success('Audio loaded successfully! Ready to play.');
        hasShownAudioLoadedToast.current = true;
      }
      
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
      dlog('Event: seeking', { progress, time });
    });

    // Keep state in sync with wavesurfer
    wavesurfer.on('play', () => { dlog('Event: play'); setPlaying(true); });
    wavesurfer.on('pause', () => { dlog('Event: pause'); setPlaying(false); });
    wavesurfer.on('error', (err: any) => {
      console.error('WaveSurfer error:', err);
      toast.error('Audio playback error');
    });

    regions.on('region-clicked', (region: any) => {
      wavesurfer.setTime(region.start);
      setCurrentTime(region.start);
      dlog('Region clicked -> setTime', region.start);
      toast.success(`Jumped to ${formatTime(region.start)} · ${region.content || ''}`);
    });

    // wavesurferRef.current already set above after creation

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

  // Rebuild waveform regions when chapters change
  useEffect(() => {
    if (!wavesurferRef.current || !regionsRef.current || !waveformReady) return;
    const regions = regionsRef.current;
    try {
      if (typeof regions.clearRegions === 'function') {
        regions.clearRegions();
      } else {
        const all = regions.getRegions ? regions.getRegions() : [];
        all.forEach((r: any) => r.remove && r.remove());
      }
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
    } catch (e) {
      console.warn('Rebuild regions failed', e);
    }
  }, [chapters, waveformReady]);

  // Build suggestions when segments update
  useEffect(() => {
    try {
      if (!segments || segments.length === 0) return;
      const hasSpeaker = segments.some((s: any) => !!s.speaker);
      if (!hasSpeaker) return;
      const sug = suggestSpeakerNames(segments as any);
      setSpeakerSuggestions(sug);
    } catch (e) {
      console.warn('Speaker suggestion failed:', e);
    }
  }, [segments]);

  // Sync playback state
  useEffect(() => {
    if (!wavesurferRef.current || !waveformReady) return;
    
    // Check current wavesurfer playing state to avoid unnecessary calls
    const wsIsPlaying = wavesurferRef.current.isPlaying();
    
    if (isPlaying && !wsIsPlaying) {
      // Need to start playing
      dlog('Effect: start playing');
      wavesurferRef.current.play().catch((err: any) => {
        console.error('Play error:', err);
        setPlaying(false); // Reset state on error
      });
    } else if (!isPlaying && wsIsPlaying) {
      // Need to pause
      dlog('Effect: pause audio');
      wavesurferRef.current.pause();
    }
  }, [isPlaying, waveformReady]);

  // Sync time when jumping - DISABLED as it interferes with seeking
  // useEffect(() => {
  //   if (!wavesurferRef.current || !waveformReady) return;
    
  //   const wsTime = wavesurferRef.current.getCurrentTime();
  //   if (Math.abs(wsTime - currentTime) > 0.5) {
  //     dlog('Effect: setTime to store currentTime', { wsTime, currentTime });
  //     wavesurferRef.current.setTime(currentTime);
  //   }
  // }, [currentTime, waveformReady]);

  // Helper: scroll transcript to segment index
  const scrollToSegmentIndex = (idx: number) => {
    if (idx < 0 || !transcriptRef.current) return;
    const segmentEl = transcriptRef.current.querySelector(`[data-segment="${idx}"]`) as HTMLElement | null;
    if (!segmentEl) return;
    const container = transcriptRef.current;
    const top = (segmentEl.offsetTop - container.offsetTop) - 12; // 顶部预留 12px
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  // Auto-scroll to active segment whenever time changes (disabled to prevent jumping during edits)
  // useEffect(() => {
  //   const activeSegmentIdx = segments.findIndex(
  //     seg => currentTime >= seg.start && currentTime < seg.end
  //   );
  //   if (activeSegmentIdx !== -1) {
  //     scrollToSegmentIndex(activeSegmentIdx);
  //     setManualHighlightIdx(activeSegmentIdx);
  //   }
  // }, [currentTime, segments]);

  // Keyboard shortcuts - only when enabled
  useHotkeys('space', (e) => {
    if (!shortcutsEnabled) return;
    e.preventDefault();
    if (typeof window !== 'undefined' && window.localStorage?.getItem?.('debug-audio') === '1') {
      console.log('[EditorAudio] Hotkey: space pressed, toggle playback');
    }
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

  // Persist current edits to server
  const persistEdits = async (
    chaptersOverride?: any[],
    segmentsOverride?: any[],
    speakersOverride?: any[]
  ) => {
    try {
      setSaving(true);
      const body = {
        chapters: chaptersOverride ?? usePlayerStore.getState().chapters,
        segments: segmentsOverride ?? segments,
        speakers: speakersOverride ?? speakers,
        updatedAt: new Date().toISOString()
      };
      const url = typeof window !== 'undefined' ? window.location.pathname : '';
      const jobId = url.split('/').pop();
      const res = await fetch(`/api/transcriptions/${jobId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('save failed');
      toast.success('Saved');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const startEditChapter = (index: number, title: string) => {
    setEditingChapter(index);
    setEditTitle(title);
  };

  const saveChapterTitle = () => {
    if (editingChapter !== null && editTitle.trim()) {
      const newTitle = editTitle.trim();
      updateChapter(editingChapter, { title: newTitle });
      // Auto-save on rename
      const latestChapters = usePlayerStore.getState().chapters;
      persistEdits(latestChapters, segments);
    }
    setEditingChapter(null);
    setEditTitle('');
  };

  // Open split modal to select segment split point
  const openSplitModal = (index: number) => {
    const ch = chapters[index];
    if (!ch) return;
    const chapterSegments = ch.segments || [];
    if (chapterSegments.length < 2) {
      toast.error('Chapter needs at least 2 segments to split');
      return;
    }
    // Default to middle segment
    const defaultSegmentIndex = Math.floor(chapterSegments.length / 2);
    setSplitModal({ open:true, index, segmentIndex: defaultSegmentIndex });
  };
  const confirmSplit = () => {
    if (splitModal.index === null) return;
    const idx = splitModal.index;
    const ch = chapters[idx];
    if (!ch) return;
    
    const chapterSegments = ch.segments || [];
    if (splitModal.segmentIndex < 1 || splitModal.segmentIndex >= chapterSegments.length) {
      toast.error('Invalid split position');
      return;
    }
    
    // Split at the selected segment boundary
    const splitSegment = chapterSegments[splitModal.segmentIndex];
    const splitTime = splitSegment.start;
    
    // Create two new chapters
    const firstSegments = chapterSegments.slice(0, splitModal.segmentIndex);
    const secondSegments = chapterSegments.slice(splitModal.segmentIndex);
    
    const newChapters = [...chapters];
    const firstChapter = {
      ...ch,
      endTime: splitTime,
      segments: firstSegments
    };
    const secondChapter = {
      ...ch,
      id: `${ch.id}-split-${Date.now()}`,
      title: `${ch.title} (continued)`,
      startTime: splitTime,
      segments: secondSegments
    };
    
    newChapters.splice(idx, 1, firstChapter, secondChapter);
    setChapters(newChapters);
    
    setTimeout(() => {
      try { jumpToChapter(idx); } catch {}
    }, 0);
    
    toast.success(`Split chapter into ${firstSegments.length} and ${secondSegments.length} segments`);
    setSplitModal({ open:false, index:null, segmentIndex:0 });
  };

  // Merge modal actions
  const openMergeModal = (index: number) => setMergeModal({ open:true, index });
  const doMergePrev = () => {
    const idx = mergeModal.index ?? -1;
    if (idx <= 0) return;
    
    const newChapters = [...chapters];
    const left = newChapters[idx - 1];
    const right = newChapters[idx];
    
    // Rebuild segments based on the merged time range to avoid duplicates
    const mergedSegments = segments.filter((seg: any) => 
      seg.start >= left.startTime && seg.start < right.endTime
    );
    
    const mergedChapter = {
      ...left,
      endTime: right.endTime,
      segments: mergedSegments
    };
    
    newChapters.splice(idx - 1, 2, mergedChapter);
    setChapters(newChapters);
    
    setTimeout(() => { try { jumpToChapter(idx - 1); } catch {} }, 0);
    toast.success('Merged with previous chapter');
    setMergeModal({ open:false, index:null });
  };
  
  const doMergeNext = () => {
    const idx = mergeModal.index ?? -1;
    if (idx < 0 || idx >= chapters.length - 1) return;
    
    const newChapters = [...chapters];
    const left = newChapters[idx];
    const right = newChapters[idx + 1];
    
    // Rebuild segments based on the merged time range to avoid duplicates
    const mergedSegments = segments.filter((seg: any) => 
      seg.start >= left.startTime && seg.start < right.endTime
    );
    
    const mergedChapter = {
      ...left,
      endTime: right.endTime,
      segments: mergedSegments
    };
    
    newChapters.splice(idx, 2, mergedChapter);
    setChapters(newChapters);
    
    setTimeout(() => { try { jumpToChapter(idx); } catch {} }, 0);
    toast.success('Merged with next chapter');
    setMergeModal({ open:false, index:null });
  };

  const mergeWithPrevious = (index: number) => {
    openMergeModal(index);
  };

  const splitAtCurrentTime = (index: number) => {
    openSplitModal(index);
  };

  // Merge two segments
  const mergeSegments = (firstIdx: number, secondIdx: number) => {
    if (firstIdx < 0 || secondIdx >= segments.length) return;
    
    const first = segments[firstIdx];
    const second = segments[secondIdx];
    
    // Create merged segment
    const mergedSegment = {
      ...first,
      end: second.end,
      text: first.text + ' ' + second.text
    };
    
    // Update segments array
    const newSegments = [...segments];
    newSegments.splice(firstIdx, 2, mergedSegment);
    
    // Update segments state
    setSegments(newSegments);
    
    // Update chapters to reflect the new segments
    const newChapters = chapters.map((chapter: any) => {
      // More lenient filtering: segment overlaps with chapter time range
      const chapterSegments = newSegments.filter((seg: any) => 
        seg.start < chapter.endTime && seg.end > chapter.startTime
      );
      return {
        ...chapter,
        segments: chapterSegments
      };
    });
    
    setChapters(newChapters);
    
    // Call callback if provided
    if (onSegmentsUpdate) {
      onSegmentsUpdate(newSegments);
    }
    
    toast.success('Merged segments');
  };

  // Open segment split modal
  const openSegmentSplitModal = (segmentIdx: number) => {
    const segment = segments[segmentIdx];
    if (!segment || !segment.text || segment.text.length < 10) {
      toast.error('Segment too short to split');
      return;
    }
    
    // Check if segment duration is too short
    const duration = segment.end - segment.start;
    if (duration < 2) {
      toast.error('Segment duration less than 2 seconds, cannot split');
      return;
    }
    
    // Default split position at middle of text
    const defaultPosition = Math.floor(segment.text.length / 2);
    setSegmentSplitModal({ 
      open: true, 
      segmentIndex: segmentIdx, 
      splitPosition: defaultPosition 
    });
  };

  // Confirm segment split
  const confirmSegmentSplit = () => {
    if (segmentSplitModal.segmentIndex === null) return;
    
    const segment = segments[segmentSplitModal.segmentIndex];
    if (!segment) return;
    
    const splitPos = segmentSplitModal.splitPosition;
    const text1 = segment.text.substring(0, splitPos).trim();
    const text2 = segment.text.substring(splitPos).trim();
    
    if (!text1 || !text2) {
      toast.error('Invalid split position');
      return;
    }
    
    // Calculate time split based on text proportion
    const totalDuration = segment.end - segment.start;
    const splitTime = segment.start + (totalDuration * (splitPos / segment.text.length));
    
    // Create two new segments
    const firstSegment = {
      ...segment,
      end: splitTime,
      text: text1
    };
    
    const secondSegment = {
      ...segment,
      start: splitTime,
      text: text2
    };
    
    // Update segments array
    const newSegments = [...segments];
    newSegments.splice(segmentSplitModal.segmentIndex, 1, firstSegment, secondSegment);
    
    // Update segments state
    setSegments(newSegments);
    
    // Update chapters to reflect the new segments
    const newChapters = chapters.map((chapter: any) => {
      // More lenient filtering: segment overlaps with chapter time range
      const chapterSegments = newSegments.filter((seg: any) => 
        seg.start < chapter.endTime && seg.end > chapter.startTime
      );
      return {
        ...chapter,
        segments: chapterSegments
      };
    });
    
    setChapters(newChapters);
    
    // Call callback if provided
    if (onSegmentsUpdate) {
      onSegmentsUpdate(newSegments);
    }
    
    toast.success('Split segment');
    setSegmentSplitModal({ open: false, segmentIndex: null, splitPosition: 0 });
  };

  return (
    <div className="w-full h-full bg-gray-950 flex flex-col overflow-hidden">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900/50 flex-shrink-0">
        <div className="text-xs text-gray-400">Editor View</div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              await persistEdits(chapters, segments);
            }}
            className={`px-3 py-1.5 text-xs rounded ${saving ? 'bg-gray-700 text-gray-300' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {/* Export dropdown */}
          <div className="relative" ref={exportDropdownRef}>
            <button
              onClick={() => setShowExportDropdown(!showExportDropdown)}
              disabled={exporting !== null}
              className="px-3 py-1.5 text-xs rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 inline-flex items-center gap-1.5"
            >
              {exporting ? (
                <>
                  <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Download className="w-3 h-3" />
                  <span>Export</span>
                  {isPreviewMode && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">5 min</span>
                  )}
                  <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
            
            {/* Dropdown menu */}
            {showExportDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-50">
                <div className="py-1">
                  <button
                    onClick={() => handleExport('docx')}
                    className="w-full px-3 py-2 text-xs text-left hover:bg-gray-800 text-gray-200 flex items-center gap-2"
                  >
                    <FileText className="w-3 h-3" />
                    <span>Word (.docx)</span>
                  </button>
                  <button
                    onClick={() => handleExport('pdf')}
                    className="w-full px-3 py-2 text-xs text-left hover:bg-gray-800 text-gray-200 flex items-center gap-2"
                  >
                    <FileText className="w-3 h-3" />
                    <span>PDF (.pdf)</span>
                  </button>
                  <div className="border-t border-gray-800 my-1"></div>
                  <button
                    onClick={() => handleExport('txt')}
                    className="w-full px-3 py-2 text-xs text-left hover:bg-gray-800 text-gray-200 flex items-center gap-2"
                  >
                    <Download className="w-3 h-3" />
                    <span>Plain Text (.txt)</span>
                  </button>
                  <button
                    onClick={() => handleExport('srt')}
                    className="w-full px-3 py-2 text-xs text-left hover:bg-gray-800 text-gray-200 flex items-center gap-2"
                  >
                    <Download className="w-3 h-3" />
                    <span>SubRip (.srt)</span>
                  </button>
                  <button
                    onClick={() => handleExport('vtt')}
                    className="w-full px-3 py-2 text-xs text-left hover:bg-gray-800 text-gray-200 flex items-center gap-2"
                  >
                    <Download className="w-3 h-3" />
                    <span>WebVTT (.vtt)</span>
                  </button>
                  {/* Free 用户不提供 JSON/MD 导出 */}
                  {!isFreeTier && (
                    <>
                      <button
                        onClick={() => handleExport('json')}
                        className="w-full px-3 py-2 text-xs text-left hover:bg-gray-800 text-gray-200 flex items-center gap-2"
                      >
                        <Download className="w-3 h-3" />
                        <span>JSON (.json)</span>
                      </button>
                      <button
                        onClick={() => handleExport('md')}
                        className="w-full px-3 py-2 text-xs text-left hover:bg-gray-800 text-gray-200 flex items-center gap-2"
                      >
                        <Download className="w-3 h-3" />
                        <span>Markdown (.md)</span>
                      </button>
                    </>
                  )}
                </div>
                {isPreviewMode && (
                  <div className="px-3 py-2 border-t border-gray-800 bg-amber-500/10">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-amber-400 font-medium">Preview Mode (First 5 min)</span>
                        <a href="/pricing" className="text-[10px] text-blue-400 hover:text-blue-300 underline">
                          Upgrade for full content
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {onClose && (
            <button
              onClick={() => onClose()}
              className="p-1.5 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>
      {/* Preview mode indicator for Free users */}
      {isPreviewMode && (
        <div className="mx-4 mb-3">
          <PreviewIndicator
            totalSeconds={(Math.max(originalDurationSec || 0, Math.floor(duration || 0)) || transcription?.duration_sec || transcription?.duration || 0) as number}
            previewSeconds={300}
            locale={typeof window !== 'undefined' ? window.location.pathname.split('/')[1] : 'en'}
            forceShow
          />
        </div>
      )}

      {/* Intelligent recommendation bar */}
      {recommend && (
        <div className="mx-4 -mt-2 mb-3 p-3 rounded-lg border border-purple-400/30 bg-purple-500/5 text-purple-200 text-sm flex items-center justify-between gap-3 flex-wrap">
          <div>
            {tPaywall('intelligent_recommendation', { reasons: recommend.reasons.join(' / ') })}
          </div>
          <a href="/pricing" className="px-3 py-1.5 rounded bg-purple-400/20 hover:bg-purple-400/30 text-xs">{tPaywall('view_pro_plan')}</a>
        </div>
      )}
      {/* Upgrade modal before full export */}
      <UpgradeModal 
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        requiredTier={userTier === 'free' ? 'basic' : 'pro'}
        feature={userTier === 'free' ? 'Speaker diarization' : 'Advanced speaker features'}
        currentTier={userTier as 'free' | 'basic' | 'pro'}
      />
      
      {/* Main Content Area - Three Columns - Takes remaining space minus audio player */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Panel - Chapters */}
        <div className="w-64 border-r border-gray-800 flex flex-col bg-gray-950/50 flex-shrink-0 h-full">
          <div className="p-4 border-b border-gray-800 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-white">Chapters</h4>
              </div>
              {chapters.length === 1 && chapters[0].title === 'Full Transcription' && (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={generateAIChapters}
                      disabled={generatingChapters}
                      className="px-3 py-1.5 text-xs bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                    >
                      {generatingChapters ? (
                        <>
                          <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span>Generate Chapters</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
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
                  onClick={() => {
                    // 先处理音频跳转（联动受 linkMode 控制）
                    if (linkMode !== 'text') {
                      const ws = wavesurferRef.current;
                      const dur = ws?.getDuration?.() || duration || 0;
                      const target = Math.max(0, chapter.startTime - preRollLocal);
                      try {
                        if (ws && dur > 0) ws.seekTo(target / dur); else ws?.setTime?.(target);
                      } catch {}
                      setCurrentTime(target);
                    }
                    // 文本始终滚动到该章节第一句
                    const segIdx = Math.max(0, segments.findIndex(s => s.start >= chapter.startTime));
                    setManualHighlightIdx(segIdx);
                    scrollToSegmentIndex(segIdx);
                    toast.success(`Jumped to ${formatTime(chapter.startTime)} · ${chapter.title}`);
                  }}
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
                    
                    {editingChapter !== idx && (
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
        <div className="flex-1 flex flex-col bg-gray-950/30 h-full min-w-0">
          <div className="p-4 border-b border-gray-800 flex-shrink-0 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-medium text-white">Transcript</h4>
              <p className="text-xs text-gray-500 mt-1">
                {segments.length} segments • Click to position
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>Group by speaker</span>
              <button
                onClick={() => setGroupBySpeaker(v => !v)}
                className={`px-2 py-1 rounded border ${groupBySpeaker ? 'border-purple-500 text-purple-300 bg-purple-500/10' : 'border-gray-700 text-gray-400 hover:bg-gray-800'}`}
              >{groupBySpeaker ? 'On' : 'Off'}</button>
            </div>
          </div>
          
          <div ref={transcriptRef} className="flex-1 overflow-y-auto p-4 relative scroll-smooth min-h-0">
            {groupBySpeaker ? (
              <div className="space-y-4">
                {(() => {
                  const groups: Array<{ speaker?: string; start: number; end: number; text: string }> = [];
                  let cur: any = null;
                  for (const s of segments as any[]) {
                    const sid = s.speaker ? String(s.speaker) : undefined;
                    if (!cur) { cur = { speaker: sid, start: s.start, end: s.end, text: String(s.text||'').trim() }; continue; }
                    if (cur.speaker === sid) { cur.end = s.end; cur.text += (cur.text ? ' ' : '') + String(s.text||'').trim(); }
                    else { groups.push(cur); cur = { speaker: sid, start: s.start, end: s.end, text: String(s.text||'').trim() }; }
                  }
                  if (cur) groups.push(cur);
                  return groups.map((g, i) => {
                    // Display logic: for numeric IDs show "Speaker N", for others show as-is
                    let speakerName = 'Speaker';
                    if (g.speaker) {
                      if (/^\d+$/.test(g.speaker)) {
                        // If it's a pure number, display as "Speaker N"
                        speakerName = `Speaker ${g.speaker}`;
                      } else {
                        // For non-numeric values, display as-is
                        speakerName = g.speaker;
                      }
                    }
                    // Use the original g.speaker value for color calculation to match right panel
                    const speakerColor = getSpeakerColor(g.speaker);
                    return (
                      <div key={i} className="space-y-2">
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px] font-semibold" style={{ backgroundColor: speakerColor }}>
                            {speakerName.charAt(0).toUpperCase()}
                          </div>
                          <div className="text-sm font-medium text-gray-300">{speakerName}</div>
                          <div className="opacity-70">{formatTime(g.start)} - {formatTime(g.end)}</div>
                        </div>
                        <div
                          className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 text-sm leading-7 text-gray-200 hover:border-gray-700 cursor-pointer"
                          onClick={() => {
                            const ws = wavesurferRef.current; const dur = ws?.getDuration?.() || duration || 0; const t = Math.max(0, g.start);
                            setCurrentTime(t); if (ws && dur > 0) { try { ws.seekTo(t / dur); } catch {} }
                          }}
                        >
                          {g.text}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
            segments.map((segment, idx) => {
              const isActive = (currentTime >= segment.start && currentTime < segment.end) || manualHighlightIdx === idx;
              // Display logic: for numeric IDs show "Speaker N" (1-based), for others show as-is
              let speakerName = null;
              if (segment.speaker) {
                if (/^\d+$/.test(segment.speaker)) {
                  // If it's a pure number, display as "Speaker N" (1-based)
                  const n = parseInt(String(segment.speaker), 10);
                  speakerName = `Speaker ${isNaN(n) ? segment.speaker : n + 1}`;
                } else {
                  // For non-numeric values, display as-is
                  speakerName = segment.speaker;
                }
              }
              // Use the original segment.speaker value for color calculation to match right panel
              const speakerColor = getSpeakerColor(segment.speaker);
              
              return (
                <div
                  key={idx}
                  data-segment={idx}
                  onClick={() => {
                    // Jump to segment position (without auto-playing)
                    const ws = wavesurferRef.current;
                    const dur = ws?.getDuration?.() || duration || 0;
                    const t = Math.max(0, segment.start);
                    
                    // Set time position in store (critical for play button to know where to start)
                    setCurrentTime(t);
                    
                    // Highlight segment immediately
                    setManualHighlightIdx(idx);
                    scrollToSegmentIndex(idx);
                    
                    // Seek wavesurfer to position
                    if (ws && dur > 0) {
                      try {
                        const seekPosition = t / dur;
                        ws.seekTo(seekPosition);
                        console.log('[Audio Debug] Segment clicked - seeked to:', t, 'seconds (', seekPosition * 100, '%)');
                        
                        // If currently playing, pause it
                        if (isPlaying) {
                          ws.pause();
                          setPlaying(false);
                        }
                        toast.success(`Position set to ${formatTime(segment.start)}`);
                      } catch (err) {
                        console.error('Seek error:', err);
                      }
                    } else {
                      console.log('[Audio Debug] Segment clicked but no wavesurfer - just set time to:', t);
                    }
                  }}
                className={`group mb-3 p-3 rounded-lg cursor-pointer transition-all ${
                    isActive 
                      ? 'bg-purple-500/10 border-l-2 border-purple-500' 
                      : 'hover:bg-gray-800/30'
                  }`}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-1">
                        {isActive && isPlaying && (
                          <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                        )}
                        <span className={`text-xs font-mono ${
                          isActive ? 'text-purple-400' : 'text-gray-500'
                        }`}>
                          {formatTime(segment.start)}
                        </span>
                      </div>
                      
                      {changingSpeakerForSegment === idx ? (
                        <input
                          type="text"
                          className="px-2 py-0.5 text-xs bg-gray-800 border border-gray-700 rounded text-white"
                          defaultValue={speakerName || ''}
                          placeholder="Enter speaker name"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const newSpeakerName = (e.target as HTMLInputElement).value.trim();
                              
                              // Check if the name actually changed
                              const currentSpeakerName = segment.speaker || '';
                              if (newSpeakerName === currentSpeakerName) {
                                // No change, just close the input
                                setChangingSpeakerForSegment(null);
                                return;
                              }
                              
                              // Update only this specific segment's speaker
                              const updatedSegments = segments.map((seg: any, i: number) => {
                                if (i === idx) {
                                  return { ...seg, speaker: newSpeakerName || null };
                                }
                                return seg;
                              });
                              
                              setSegments(updatedSegments);
                              persistEdits(undefined, updatedSegments, speakers);
                              setChangingSpeakerForSegment(null);
                              toast.success('Speaker updated');
                            } else if (e.key === 'Escape') {
                              setChangingSpeakerForSegment(null);
                            }
                          }}
                          onBlur={(e) => {
                            const newSpeakerName = e.target.value.trim();
                            
                            // Check if the name actually changed
                            const currentSpeakerName = segment.speaker || '';
                            if (newSpeakerName === currentSpeakerName) {
                              // No change, just close the input
                              setChangingSpeakerForSegment(null);
                              return;
                            }
                            
                            // Update only this specific segment's speaker
                            const updatedSegments = segments.map((seg: any, i: number) => {
                              if (i === idx) {
                                return { ...seg, speaker: newSpeakerName || null };
                              }
                              return seg;
                            });
                            
                            setSegments(updatedSegments);
                            persistEdits(undefined, updatedSegments, speakers);
                            setChangingSpeakerForSegment(null);
                          }}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          className="shrink-0 px-1.5 py-0.5 text-[10px] rounded text-white font-medium"
                          style={{ backgroundColor: speakerName ? speakerColor : '#6b7280' }}
                        >
                          {speakerName || 'No Speaker'}
                        </span>
                      )}
                      <p className={`flex-1 text-sm leading-relaxed ${
                        isActive ? 'text-white' : 'text-gray-300'
                      }`}>
                        {segment.text}
                      </p>
                      
                      {/* Show buttons when active or on hover */}
                      <div className={`flex items-center gap-1 transition-opacity ${
                        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}>
                        {/* Edit speaker button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isFreeTier) { setShowUpgrade(true); return; }
                            setChangingSpeakerForSegment(idx);
                          }}
                          className="px-2 py-1 text-[10px] bg-purple-600 hover:bg-purple-700 rounded text-white"
                          title="Edit speaker name"
                        >
                          Speaker
                        </button>
                        
                        {/* Merge with previous segment */}
                        {idx > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              mergeSegments(idx - 1, idx);
                            }}
                            className="px-2 py-1 text-[10px] bg-blue-600 hover:bg-blue-700 rounded text-white"
                            title="Merge with previous segment"
                          >
                            Merge ↑
                          </button>
                        )}
                        
                        {/* Split segment */}
                        {segment.text && segment.text.length > 10 && (segment.end - segment.start) >= 2 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openSegmentSplitModal(idx);
                            }}
                            className="px-2 py-1 text-[10px] bg-green-600 hover:bg-green-700 rounded text-white"
                            title="Split this segment"
                          >
                            Split
                          </button>
                        )}
                        
                        {/* Copy text */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyText(segment.text, idx);
                          }}
                          className="p-1 hover:bg-gray-700 rounded"
                        >
                          {copiedIndex === idx ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3 text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
            )}
          </div>
        </div>

        {/* Right Panel - Speakers & AI Summary */}
        <div className="w-64 border-l border-gray-800 bg-gray-950/40 flex-shrink-0 flex flex-col h-full">
          <div className="p-4 border-b border-gray-800 flex-shrink-0">
            <h4 className="text-sm font-medium text-white">Speakers & AI Tools</h4>
            <p className="text-xs text-gray-500 mt-1">Diarization & AI features</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {speakers.length === 0 && (
              <div className="text-xs text-gray-500 p-3 bg-gray-900/40 rounded border border-gray-800">No diarization found in this transcription.</div>
            )}
            {speakers.map((sp) => {
              const segCount = segments.filter((s: any) => s.speaker === sp.id || s.speaker === sp.label).length;
              const sugs = (speakerSuggestions[sp.id] || []).slice(0,3);
              
              // Display logic: for numeric IDs show "Speaker N" (1-based), for others show as-is
              let displayName = sp.label;
              if (/^\d+$/.test(sp.id)) {
                const n = parseInt(sp.id, 10);
                displayName = `Speaker ${isNaN(n) ? sp.id : n + 1}`;
              } else if (!sp.label || sp.label === sp.id) {
                displayName = sp.id;
              }
              
              return (
                <div key={sp.id} className="bg-gray-900/40 rounded border border-gray-800 p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{ backgroundColor: sp.color }}>
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      {editingSpeakerId === sp.id ? (
                        <input
                          defaultValue={displayName}
                          onBlur={(e) => { 
                            const newLabel = e.target.value.trim();
                            if (newLabel && newLabel !== displayName) {
                              // Update all segments with this speaker ID to use the new name
                              const updatedSegments = segments.map((seg: any) => {
                                if (seg.speaker === sp.id) {
                                  return { ...seg, speaker: newLabel };
                                }
                                return seg;
                              });
                              
                              // Check if the new label already exists in speakers
                              const existingSpeaker = speakers.find(s => s.id === newLabel);
                              const newColor = existingSpeaker ? existingSpeaker.color : getSpeakerColor(newLabel);
                              
                              // Update speakers array with new id and label
                              const updatedSpeakers = speakers.map(x => 
                                x.id === sp.id 
                                  ? { ...x, id: newLabel, label: newLabel, color: newColor } 
                                  : x
                              );
                              
                              setSegments(updatedSegments);
                              setSpeakers(updatedSpeakers);
                              persistEdits(undefined, updatedSegments, updatedSpeakers);
                            }
                            setEditingSpeakerId(null);
                          }}
                          onKeyDown={(e) => { 
                            if (e.key === 'Enter') { 
                              e.preventDefault(); // Prevent form submission
                              const newLabel = (e.target as HTMLInputElement).value.trim();
                              if (newLabel && newLabel !== displayName) {
                                // Update all segments with this speaker ID to use the new name
                                const updatedSegments = segments.map((seg: any) => {
                                  if (seg.speaker === sp.id) {
                                    return { ...seg, speaker: newLabel };
                                  }
                                  return seg;
                                });
                                
                                // Check if the new label already exists in speakers
                                const existingSpeaker = speakers.find(s => s.id === newLabel);
                                const newColor = existingSpeaker ? existingSpeaker.color : getSpeakerColor(newLabel);
                                
                                // Update speakers array with new id and label
                                const updatedSpeakers = speakers.map(x => 
                                  x.id === sp.id 
                                    ? { ...x, id: newLabel, label: newLabel, color: newColor } 
                                    : x
                                );
                                
                                setSegments(updatedSegments);
                                setSpeakers(updatedSpeakers);
                                persistEdits(undefined, updatedSegments, updatedSpeakers);
                              }
                              setEditingSpeakerId(null);
                            } 
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditingSpeakerId(null);
                            }
                          }}
                          className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                          autoFocus
                        />
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-white">{displayName}</div>
                          <button onClick={() => {
                            if (isFreeTier) { setShowUpgrade(true); return; }
                            console.log('Rename button clicked for speaker:', sp.id);
                            setEditingSpeakerId(sp.id);
                          }} className="text-xs text-gray-400 hover:text-gray-200">Rename</button>
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">{segCount} segments</div>
                    </div>
                  </div>
                  {sugs.length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-400 mb-1">Suggested:</div>
                      <div className="flex flex-wrap gap-2">
                        {sugs.map((sug, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              if (isFreeTier) { setShowUpgrade(true); return; }
                              // Update all segments with this speaker ID to use the new name
                              const updatedSegments = segments.map((seg: any) => {
                                if (seg.speaker === sp.id) {
                                  return { ...seg, speaker: sug.name };
                                }
                                return seg;
                              });
                              
                              // Check if the suggested name already exists in speakers
                              const existingSpeaker = speakers.find(s => s.id === sug.name);
                              const newColor = existingSpeaker ? existingSpeaker.color : getSpeakerColor(sug.name);
                              
                              // Update speakers array with new id and label
                              const updatedSpeakers = speakers.map(x => 
                                x.id === sp.id 
                                  ? { ...x, id: sug.name, label: sug.name, color: newColor } 
                                  : x
                              );
                              
                              setSegments(updatedSegments);
                              setSpeakers(updatedSpeakers);
                              persistEdits(undefined, updatedSegments, updatedSpeakers);
                            }}
                            className="px-2 py-0.5 text-xs rounded bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30"
                            title={`Score ${Math.round(sug.score)}`}
                          >{sug.name}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            
            {/* AI Summary Section */}
            <div className="mt-4 pt-4 border-t border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <h5 className="text-sm font-medium text-white">AI Summary</h5>
                {generatedSummary && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedSummary);
                      setCopiedSummary(true);
                      setTimeout(() => setCopiedSummary(false), 2000);
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded transition-all hover:bg-gray-800"
                    style={{ color: copiedSummary ? '#10b981' : '#9ca3af' }}
                  >
                    {copiedSummary ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSummary ? 'Copied' : 'Copy'}</span>
                  </button>
                )}
              </div>
              
              {!generatedSummary ? (
                <div className="flex flex-col gap-1">
                  <button
                    onClick={async () => {
                      if (generatingSummary) return;
                      
                      setGeneratingSummary(true);
                      try {
                        const jobId = (typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : '') as string;
                        console.log('Generating summary for job:', jobId);
                        
                        const response = await fetch(`/api/transcriptions/${jobId}/summary`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            segments: segments,
                            options: {
                              language: transcription?.language || 'auto',
                              maxLength: 200
                            }
                          })
                        });
                        
                        const data = await response.json();
                        
                        if (response.ok) {
                          if (data.data && data.data.summary) {
                            console.log('Summary generated:', data.data.summary);
                            toast.success('Summary generated successfully');
                            setGeneratedSummary(data.data.summary);
                          }
                        } else {
                          // Handle specific error cases
                          if (response.status === 403) {
                            toast.error(
                              <div className="flex flex-col gap-1">
                                <span>{data.error}</span>
                                <a href="/pricing" className="text-blue-400 hover:text-blue-300 underline text-sm">
                                  Upgrade to unlock AI features
                                </a>
                              </div>
                            );

                            // if (data.error?.includes('本月次数已用尽') || data.error?.includes('monthly limit')) {
                            //   toast.error(
                            //     <div className="flex flex-col gap-1">
                            //       <span>You've used all 10 free AI summaries this month</span>
                            //       <a href="/pricing" className="text-blue-400 hover:text-blue-300 underline text-sm">
                            //         Upgrade to Pro for unlimited AI features
                            //       </a>
                            //     </div>
                            //   );
                            // } else {
                            //   toast.error(
                            //     <div className="flex flex-col gap-1">
                            //       <span>AI summary not available for your plan</span>
                            //       <a href="/pricing" className="text-blue-400 hover:text-blue-300 underline text-sm">
                            //         Upgrade to unlock AI features
                            //       </a>
                            //     </div>
                            //   );
                            // }
                          } else {
                            toast.error(data.error || 'Failed to generate summary');
                          }
                        }
                      } catch (error) {
                        console.error('Error generating summary:', error);
                        toast.error('Failed to generate summary');
                      } finally {
                        setGeneratingSummary(false);
                      }
                    }}
                    disabled={generatingSummary}
                    className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2"
                  >
                    {generatingSummary ? (
                      <>
                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        <span>Generate Summary</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-gray-900/40 rounded-lg border border-gray-800">
                  <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-wrap">
                    {generatedSummary}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom Panel - Audio Player Controls - Always visible at bottom */}
      <div className="border-t border-gray-800 bg-gray-900/80 px-4 py-3 flex-shrink-0 relative z-10">
        {/* Waveform Container - Hidden but kept in DOM for WaveSurfer */}
        <div ref={waveformRef} className="hidden" />
        
        <div className="flex items-center gap-3">
          {/* Play Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => jumpToChapter(Math.max(0, currentChapter - 1))}
              className="p-1.5 hover:bg-gray-800/50 rounded transition-all"
            >
              <SkipBack className="w-4 h-4 text-white" />
            </button>
            
            <button
              onClick={() => {
                console.log('[Audio Debug] Play button clicked. isPlaying:', isPlaying, 'waveformReady:', waveformReady);
                
                if (!wavesurferRef.current) {
                  console.error('[Audio Debug] No wavesurfer instance!');
                  toast.error('Audio player not initialized');
                  return;
                }
                
                if (!waveformReady) {
                  console.error('[Audio Debug] Waveform not ready!');
                  if (audioLoading) {
                    toast.info('Audio is loading... Please wait a moment');
                  } else {
                    toast.error('Audio failed to load. Please refresh the page');
                  }
                  return;
                }
                
                // Direct control within user gesture to comply with browser autoplay policy
                if (isPlaying) {
                  console.log('[Audio Debug] Pausing audio...');
                  wavesurferRef.current.pause();
                  setPlaying(false);
                } else {
                  // Get current position from wavesurfer first
                  const wsCurrentTime = wavesurferRef.current.getCurrentTime();
                  const dur = wavesurferRef.current.getDuration();
                  
                  console.log('[Audio Debug] Play button state:', {
                    storeCurrentTime: currentTime,
                    wavesurferCurrentTime: wsCurrentTime,
                    duration: dur
                  });
                  
                  // If wavesurfer is at 0 but store has a position, seek first
                  if (wsCurrentTime === 0 && currentTime > 0 && dur > 0) {
                    console.log('[Audio Debug] WaveSurfer at 0, seeking to store position:', currentTime);
                    wavesurferRef.current.seekTo(currentTime / dur);
                    // Small delay to ensure seek completes
                    setTimeout(() => {
                      if (wavesurferRef.current) {
                        wavesurferRef.current.play().then(() => {
                          console.log('[Audio Debug] Play successful after seek');
                          setPlaying(true);
                        }).catch((err) => {
                          console.error('[Audio Debug] Play failed:', err);
                          toast.error(`Play failed: ${err.message || 'Unknown error'}`);
                        });
                      }
                    }, 50);
                  } else {
                    // Play from current wavesurfer position
                    console.log('[Audio Debug] Playing from wavesurfer position:', wsCurrentTime);
                    wavesurferRef.current.play().then(() => {
                      console.log('[Audio Debug] Play successful');
                      setPlaying(true);
                    }).catch((err) => {
                      console.error('[Audio Debug] Play failed:', err);
                      toast.error(`Play failed: ${err.message || 'Unknown error'}`);
                    });
                  }
                }
              }}
              className="p-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-all"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 text-white" />
              ) : (
                <Play className="w-5 h-5 text-white ml-0.5" />
              )}
            </button>
            
            <button
              onClick={() => jumpToChapter(Math.min(chapters.length - 1, currentChapter + 1))}
              className="p-1.5 hover:bg-gray-800/50 rounded transition-all"
            >
              <SkipForward className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Time and Progress */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-400">
                {formatTime(Math.min(currentTime, duration))}
              </span>
              <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                <motion.div
                  className="h-full bg-purple-600"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
              </div>
              <span className="text-xs font-mono text-gray-400">
                {formatTime(duration || 0)}
              </span>
            </div>
          </div>

          {/* Settings Controls */}
          <div className="flex items-center gap-4">
            {/* Volume */}
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-gray-400" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  if (wavesurferRef.current) wavesurferRef.current.setVolume(v);
                }}
                className="w-28 accent-purple-600"
              />
            </div>

            {/* Playback Speed */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Speed</span>
              <div className="flex gap-1">
                {[0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => (
                  <button
                    key={speed}
                    onClick={() => {
                      if (wavesurferRef.current) {
                        wavesurferRef.current.setPlaybackRate(speed);
                        setCurrentSpeed(speed);
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded ${
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
          </div>
        </div>
      </div>
      
      {/* Merge Modal */}
      <Dialog open={mergeModal.open} onOpenChange={(o)=> setMergeModal(m => ({...m, open:o}))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Merge Chapters</DialogTitle>
            <DialogDescription>Select how to merge this chapter</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2">
            <button
              className="px-3 py-1.5 rounded bg-gray-800 text-gray-200 hover:bg-gray-700 disabled:opacity-50"
              onClick={doMergePrev}
              disabled={(mergeModal.index ?? 0) <= 0}
            >Merge with previous</button>
            <button
              className="px-3 py-1.5 rounded bg-gray-800 text-gray-200 hover:bg-gray-700 disabled:opacity-50"
              onClick={doMergeNext}
              disabled={(mergeModal.index ?? -1) >= chapters.length - 1}
            >Merge with next</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Split Modal */}
      <Dialog open={splitModal.open} onOpenChange={(o)=> setSplitModal(s => ({...s, open:o}))}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Split Chapter</DialogTitle>
            <DialogDescription>Select where to split this chapter</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 my-4 max-h-[400px]">
            {(() => {
              const ch = chapters[splitModal.index ?? 0];
              if (!ch) return null;
              const chapterSegments = ch.segments || [];
              return chapterSegments.map((segment: any, idx: number) => (
                <div 
                  key={idx}
                  className="relative"
                >
                  {idx > 0 && (
                    <button
                      onClick={() => setSplitModal(s => ({...s, segmentIndex: idx}))}
                      className={`w-full py-2 mb-2 border-t-2 border-dashed transition-colors ${
                        splitModal.segmentIndex === idx 
                          ? 'border-purple-500 bg-purple-500/10' 
                          : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/30'
                      }`}
                    >
                      <span className="text-xs text-purple-400">
                        {splitModal.segmentIndex === idx ? '← Split here →' : 'Click to split here'}
                      </span>
                    </button>
                  )}
                  <div className={`p-3 rounded ${
                    idx < splitModal.segmentIndex ? 'bg-blue-900/20' : 'bg-green-900/20'
                  }`}>
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-mono text-gray-500">
                        {formatTime(segment.start)}
                      </span>
                      <p className="flex-1 text-sm text-gray-300">
                        {segment.text}
                      </p>
                    </div>
                  </div>
                </div>
              ));
            })()}
          </div>
          <div className="flex items-center justify-between border-t pt-4">
            <div className="text-sm text-gray-400">
              {(() => {
                const ch = chapters[splitModal.index ?? 0];
                if (!ch) return null;
                const segs = ch.segments || [];
                const firstCount = splitModal.segmentIndex;
                const secondCount = segs.length - splitModal.segmentIndex;
                return `Will split into: ${firstCount} segments | ${secondCount} segments`;
              })()}
            </div>
            <div className="flex items-center gap-2">
              <button 
                className="px-3 py-1.5 rounded bg-gray-800 text-gray-200 hover:bg-gray-700" 
                onClick={()=> setSplitModal({ open:false, index:null, segmentIndex:0 })}
              >
                Cancel
              </button>
              <button 
                className="px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700" 
                onClick={confirmSplit}
                disabled={!splitModal.segmentIndex || splitModal.segmentIndex >= (chapters[splitModal.index ?? 0]?.segments?.length ?? 0)}
              >
                Confirm Split
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Segment Split Modal */}
      <Dialog open={segmentSplitModal.open} onOpenChange={(o)=> setSegmentSplitModal(s => ({...s, open:o}))}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Split Segment</DialogTitle>
            <DialogDescription>Choose where to split this segment - by word position or time</DialogDescription>
          </DialogHeader>
          {(() => {
            const segment = segments[segmentSplitModal.segmentIndex ?? -1];
            if (!segment) return null;
            
            const words = segment.text.split(' ');
            const duration = segment.end - segment.start;
            const isLongSegment = duration > 5; // More than 5 seconds
            
            return (
              <div className="space-y-4">
                {/* Show original text with split preview */}
                <div className="p-4 bg-gray-800 rounded-lg">
                  <div className="text-sm mb-2 text-gray-400">Original segment ({formatTime(segment.start)} - {formatTime(segment.end)})</div>
                  <div className="text-sm text-gray-200">
                    <span className="text-blue-300">
                      {segment.text.substring(0, segmentSplitModal.splitPosition)}
                    </span>
                    <span className="text-red-400 font-bold">|</span>
                    <span className="text-green-300">
                      {segment.text.substring(segmentSplitModal.splitPosition)}
                    </span>
                  </div>
                </div>
                
                {/* Word-based split slider */}
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Split by character position</label>
                  <input
                    type="range"
                    min={10}
                    max={Math.max(10, segment.text.length - 10)}
                    value={segmentSplitModal.splitPosition}
                    onChange={(e) => setSegmentSplitModal(s => ({...s, splitPosition: Number(e.target.value)}))}
                    className="w-full accent-purple-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Character {segmentSplitModal.splitPosition} of {segment.text.length}</span>
                    <span>Word ~{Math.floor(segmentSplitModal.splitPosition / (segment.text.length / words.length))} of {words.length}</span>
                  </div>
                </div>
                
                {/* Quick word split buttons */}
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Quick split at word boundary</label>
                  <div className="flex flex-wrap gap-2">
                    {words.map((word: string, idx: number) => {
                      if (idx === 0 || idx === words.length - 1) return null;
                      const position = segment.text.indexOf(words.slice(0, idx + 1).join(' ')) + words.slice(0, idx + 1).join(' ').length;
                      return (
                        <button
                          key={idx}
                          onClick={() => setSegmentSplitModal(s => ({...s, splitPosition: position}))}
                          className={`px-2 py-1 text-xs rounded ${
                            segmentSplitModal.splitPosition === position
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                          }`}
                        >
                          After "{word}"
                        </button>
                      );
                    }).filter(Boolean).slice(0, 10)}
                  </div>
                </div>
                
                {/* Time-based split for long segments */}
                {isLongSegment && (
                  <div className="space-y-2">
                    <label className="text-sm text-gray-400">Or split by time (for long segments)</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const midPoint = Math.floor(segment.text.length / 2);
                          setSegmentSplitModal(s => ({...s, splitPosition: midPoint}));
                        }}
                        className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded text-gray-300"
                      >
                        Split at middle ({formatTime(segment.start + duration/2)})
                      </button>
                      <button
                        onClick={() => {
                          const thirdPoint = Math.floor(segment.text.length / 3);
                          setSegmentSplitModal(s => ({...s, splitPosition: thirdPoint}));
                        }}
                        className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded text-gray-300"
                      >
                        Split at 1/3 ({formatTime(segment.start + duration/3)})
                      </button>
                      <button
                        onClick={() => {
                          const twoThirdPoint = Math.floor(segment.text.length * 2 / 3);
                          setSegmentSplitModal(s => ({...s, splitPosition: twoThirdPoint}));
                        }}
                        className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 rounded text-gray-300"
                      >
                        Split at 2/3 ({formatTime(segment.start + duration*2/3)})
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Action buttons */}
                <div className="flex items-center justify-end gap-2 pt-4 border-t">
                  <button 
                    className="px-3 py-1.5 rounded bg-gray-800 text-gray-200 hover:bg-gray-700" 
                    onClick={()=> setSegmentSplitModal({ open:false, segmentIndex:null, splitPosition:0 })}
                  >
                    Cancel
                  </button>
                  <button 
                    className="px-3 py-1.5 rounded bg-purple-600 text-white hover:bg-purple-700" 
                    onClick={confirmSegmentSplit}
                  >
                    Confirm Split
                  </button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
