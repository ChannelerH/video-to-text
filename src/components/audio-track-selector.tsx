"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Globe, Mic, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface AudioTrack {
  languageCode: string;
  trackType: 'original' | 'dubbed-auto';
  displayName: string;
  formats: number;
}

interface AudioTrackSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (languageCode: string) => void;
  tracks: AudioTrack[];
  videoTitle?: string;
}

export default function AudioTrackSelector({
  isOpen,
  onClose,
  onSelect,
  tracks,
  videoTitle
}: AudioTrackSelectorProps) {
  const t = useTranslations('audio_track_selector');
  const [selectedTrack, setSelectedTrack] = useState<string>('');

  // 默认选择原始音轨或第一个音轨
  React.useEffect(() => {
    if (tracks.length > 0 && !selectedTrack) {
      const originalTrack = tracks.find(t => t.trackType === 'original');
      setSelectedTrack(originalTrack?.languageCode || tracks[0].languageCode);
    }
  }, [tracks, selectedTrack]);

  const handleConfirm = () => {
    if (selectedTrack) {
      onSelect(selectedTrack);
      onClose();
    }
  };

  const handleSkip = () => {
    // 不选择特定语言，使用默认
    onSelect('');
    onClose();
  };

  // 分组音轨
  const originalTracks = tracks.filter(t => t.trackType === 'original');
  const dubbedTracks = tracks.filter(t => t.trackType === 'dubbed-auto');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t('title') || 'Select Audio Track'}
          </DialogTitle>
          {videoTitle && (
            <div className="font-medium text-sm text-muted-foreground mt-2 mb-1 line-clamp-2" title={videoTitle}>
              {videoTitle}
            </div>
          )}
          <DialogDescription className="text-sm">
            {t('description') || 'Choose your preferred language for transcription'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow overflow-y-auto py-2 px-1" style={{ maxHeight: 'calc(80vh - 200px)' }}>
          <RadioGroup value={selectedTrack} onValueChange={setSelectedTrack}>
            {/* 原始音轨 */}
            {originalTracks.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <Mic className="h-3.5 w-3.5" />
                  {t('original_tracks') || 'Original Tracks'}
                </div>
                {originalTracks.map((track) => (
                  <div key={track.languageCode} className="flex items-center space-x-2 pl-5 py-1">
                    <RadioGroupItem value={track.languageCode} id={track.languageCode} />
                    <Label 
                      htmlFor={track.languageCode} 
                      className="flex-1 cursor-pointer py-1 flex items-center gap-2"
                    >
                      <span className="font-medium">{track.displayName}</span>
                      {track.languageCode === 'en-US' && (
                        <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                          {t('recommended') || 'Recommended'}
                        </span>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
            )}

            {/* AI 配音音轨 */}
            {dubbedTracks.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('dubbed_tracks') || 'AI-Dubbed Tracks'}
                </div>
                <div className="text-xs text-muted-foreground pl-5 pb-1">
                  {t('dubbed_note') || 'AI-dubbed tracks may have lower transcription accuracy'}
                </div>
                {dubbedTracks.map((track) => (
                  <div key={track.languageCode} className="flex items-center space-x-2 pl-5 py-1">
                    <RadioGroupItem value={track.languageCode} id={track.languageCode} />
                    <Label 
                      htmlFor={track.languageCode} 
                      className="flex-1 cursor-pointer py-1"
                    >
                      <span>{track.displayName}</span>
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </RadioGroup>
        </div>

        <div className="flex gap-3 flex-shrink-0 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleSkip}
            className="flex-1"
          >
            {t('use_default') || 'Use Default Track'}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedTrack}
            className="flex-1"
          >
            {t('confirm') || 'Confirm Selection'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
