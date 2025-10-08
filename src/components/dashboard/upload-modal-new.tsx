'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Upload, Youtube, FileVideo, Loader2, AlertCircle, 
  CheckCircle2, Mic2, Zap, X, FileAudio,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import { useToast, ToastNotification } from '@/components/toast-notification';
import { TranscriptionService } from '@/lib/transcription-service';
import { useAppContext } from '@/contexts/app';
import { cn } from '@/lib/utils';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'upload' | 'youtube';
}

type ProcessingStage = 'idle' | 'uploading' | 'processing' | 'transcribing' | 'preparing' | 'complete' | 'error';

// Global loading overlay component
const LoadingOverlay = () => (
  <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <Loader2 className="w-12 h-12 animate-spin text-purple-500" />
      <p className="text-white text-lg font-medium">Opening editor...</p>
    </div>
  </div>
);

export default function UploadModal({ isOpen, onClose, mode }: UploadModalProps) {
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<ProcessingStage>('idle');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showGlobalLoading, setShowGlobalLoading] = useState(false);
  
  // Advanced options
  const [enableDiarization, setEnableDiarization] = useState(false);
  const [highAccuracy, setHighAccuracy] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const transcriptionAbortControllerRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const isCancellingRef = useRef(false);
  const wasCancelledRef = useRef(false);
  const router = useRouter();
  const locale = useLocale();
  const { toast, showToast, hideToast } = useToast();
  const { userTier } = useAppContext();
  
  // Check user permissions
  const normalizedTier = String(userTier || 'free').toLowerCase();
  const tierId = normalizedTier.includes('premium')
    ? 'premium'
    : normalizedTier.includes('pro')
      ? 'pro'
      : normalizedTier.includes('basic')
        ? 'basic'
        : normalizedTier;
  const canUseDiarization = ['basic', 'pro', 'premium'].includes(tierId);
  const canUseHighAccuracy = tierId === 'pro' || tierId === 'premium';

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file size (500MB limit for Quick Actions)
      if (selectedFile.size > 500 * 1024 * 1024) {
        showToast('error', 'File too large', 'Maximum file size is 500MB');
        return;
      }
      setFile(selectedFile);
      setUrl(''); // Clear URL if file is selected
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      if (droppedFile.size > 500 * 1024 * 1024) {
        showToast('error', 'File too large', 'Maximum file size is 500MB');
        return;
      }
      setFile(droppedFile);
      setUrl('');
    }
  }, [showToast]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const resetState = () => {
    // Reset all state to initial values
    setStage('idle');
    setProgress(0);
    setStatusMessage('');
    setJobId(null);
    setFile(null);
    setUrl('');
    setShowAdvanced(false);
    setShowGlobalLoading(false);
    setEnableDiarization(false);
    setHighAccuracy(false);
    jobIdRef.current = null;
    uploadAbortControllerRef.current = null;
    transcriptionAbortControllerRef.current = null;
    isCancellingRef.current = false;
    
    // Reset file input value
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Clear any running poll interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (uploadAbortControllerRef.current) {
        uploadAbortControllerRef.current.abort();
      }
      if (transcriptionAbortControllerRef.current) {
        transcriptionAbortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  const cancelInFlight = useCallback(async () => {
    if (isCancellingRef.current) {
      return;
    }

    isCancellingRef.current = true;
    wasCancelledRef.current = true;
    hideToast();

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      uploadAbortControllerRef.current = null;
    }

    if (transcriptionAbortControllerRef.current) {
      transcriptionAbortControllerRef.current.abort();
      transcriptionAbortControllerRef.current = null;
    }

    const currentJobId = jobIdRef.current;
    if (currentJobId) {
      try {
        await TranscriptionService.cancelJob(currentJobId);
      } catch (error) {
        const expectedErrors = new Set(['not_cancellable', 'not_found', 'forbidden', 'unauthorized']);
        if (!(error instanceof Error) || !expectedErrors.has(error.message)) {
          console.error('Failed to cancel transcription job:', error);
        }
      }
      jobIdRef.current = null;
    }

    isCancellingRef.current = false;
  }, [hideToast]);

  const handleSubmit = async () => {
    if (mode === 'youtube' && !url) {
      showToast('error', 'Missing URL', 'Please enter a YouTube URL');
      return;
    }
    if (mode === 'upload' && !file) {
      showToast('error', 'No file selected', 'Please select a file to upload');
      return;
    }

    try {
      isCancellingRef.current = false;
      wasCancelledRef.current = false;
      setStage('uploading');
      setProgress(0);
      
      let transcriptionJobId: string;
      
      if (mode === 'youtube') {
        setStatusMessage('Starting YouTube transcription...');
        const controller = new AbortController();
        transcriptionAbortControllerRef.current = controller;
        try {
          transcriptionJobId = await TranscriptionService.startYouTubeTranscription(url, {
            highAccuracy,
            enableDiarization
          }, { signal: controller.signal });
        } finally {
          transcriptionAbortControllerRef.current = null;
        }
      } else {
        // Upload file first
        setStatusMessage(`Uploading ${file!.name}...`);
        const uploadController = new AbortController();
        uploadAbortControllerRef.current = uploadController;
        let uploadResult: { key: string; url: string } | null = null;
        try {
          uploadResult = await TranscriptionService.uploadFile(
            file!,
            file!.type.startsWith('audio/') ? 'audio' : 'video',
            (uploadProgress) => {
              const validProgress = typeof uploadProgress === 'number' && !isNaN(uploadProgress) 
                ? Math.round(uploadProgress) 
                : 0;
              setProgress(validProgress);
              setStatusMessage(`Uploading... ${validProgress}%`);
            },
            { signal: uploadController.signal }
          );
        } finally {
          uploadAbortControllerRef.current = null;
        }

        if (isCancellingRef.current) {
          return;
        }

        if (!uploadResult) {
          throw new Error('Upload did not complete');
        }

        const { key, url: fileUrl } = uploadResult;
        
        // Start transcription
        setStage('processing');
        setStatusMessage('Starting transcription...');
        const transcriptionController = new AbortController();
        transcriptionAbortControllerRef.current = transcriptionController;
        try {
          transcriptionJobId = await TranscriptionService.startFileTranscription(
            fileUrl,
            key,
            file!.name,
            {
              highAccuracy,
              enableDiarization
            },
            { signal: transcriptionController.signal }
          );
        } finally {
          transcriptionAbortControllerRef.current = null;
        }
      }
      
      if (isCancellingRef.current) {
        return;
      }

      setJobId(transcriptionJobId);
      jobIdRef.current = transcriptionJobId;
      setStage('transcribing');
      setStatusMessage('Transcribing... Please wait...');
      
      // Wait a bit before starting to poll (give DB time to save the record)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Poll for transcription completion
      let pollAttempts = 0;
      const maxAttempts = 150; // 5 minutes max (150 * 2 seconds)
      
      pollIntervalRef.current = setInterval(async () => {
        pollAttempts++;
        if (isCancellingRef.current) {
          return;
        }
        
        // Check if we should stop polling due to timeout BEFORE making the request
        if (pollAttempts > maxAttempts) {
          if (isCancellingRef.current || !jobIdRef.current) {
            return;
          }
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setStatusMessage('Taking longer than expected. Redirecting to transcriptions...');
          
          const transcriptionsUrl = `/${locale}/dashboard/transcriptions?highlight=${encodeURIComponent(transcriptionJobId)}`;
          
          setTimeout(() => {
            if (isCancellingRef.current || !jobIdRef.current) {
              return;
            }
            router.push(transcriptionsUrl);
            onClose();
            resetState();
          }, 1500);
          return;
        }
        
        try {
          const statusResponse = await fetch(`/api/transcribe/status/${transcriptionJobId}`);
          
          // Handle 404 in the first few attempts (job might not be in DB yet)
          if (!statusResponse.ok && statusResponse.status === 404 && pollAttempts <= 3) {
            setStatusMessage(`Initializing transcription... (${pollAttempts}/3)`);
            return; // Continue polling
          }
          
          if (!statusResponse.ok) {
            throw new Error(`Status check failed: ${statusResponse.status}`);
          }
          
          const statusData = await statusResponse.json();
          if (isCancellingRef.current || !jobIdRef.current) {
            return;
          }

          if (statusData.status === 'completed') {
            // Success! IMMEDIATELY clear interval to stop polling
            // Stop polling immediately
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            
            // Close modal and show global loading
            onClose();
            setShowGlobalLoading(true);
            
            // Small delay to ensure loading overlay is visible
            setTimeout(() => {
              if (!jobIdRef.current) {
                return;
              }
              router.push(`/${locale}/dashboard/editor/${transcriptionJobId}`);
            }, 100);
          } else if (statusData.status === 'failed' || statusData.status === 'error') {
            // Failed
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setStage('error');
            setStatusMessage('Transcription failed. Please try again.');
            showToast('error', 'Transcription failed', statusData.error || 'Unknown error occurred');
          } else if (statusData.status === 'cancelled') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setStage('idle');
            setStatusMessage('Transcription cancelled');
          } else {
            // Still processing - show actual status
            const progressPercent = pollAttempts / maxAttempts * 100;
            
            // Show the actual status from the API
            const statusMessages: Record<string, string> = {
              'queued': 'Waiting in queue...',
              'processing': 'Processing audio...',
              'downloading': 'Downloading media...',
              'transcribing': 'Transcribing audio...',
              'refining': 'Almost ready...'
            };
            
            // Preemptively show loading when nearing completion
            if (statusData.status === 'refining') {
              setStatusMessage('🚀 Preparing editor...');
              setProgress(98);
              setStage('preparing'); // Show fast green spinner
            } else if (statusData.status === 'transcribing' && pollAttempts > 10) {
              // After 20 seconds of transcribing, show preparing state
              setStatusMessage('⚡ Almost ready! Preparing editor...');
              setProgress(95);
              setStage('preparing'); // Start showing preparing state early
            } else {
              // Normal status display
              const statusMsg = statusMessages[statusData.status] || statusData.message || `Processing... (${statusData.status})`;
              setStatusMessage(`${statusMsg} ${Math.round(progressPercent)}%`);
              setProgress(Math.min(progressPercent, 95));
              
              // Update stage based on status
              if (statusData.status === 'transcribing') {
                setStage('transcribing');
              } else {
                setStage('processing');
              }
            }
          }
        } catch (error) {
          console.error('Error polling transcription status:', error);
          // Don't stop polling on transient errors
        }
      }, 2000); // Poll every 2 seconds
      
    } catch (error) {
      if (isCancellingRef.current || wasCancelledRef.current) {
        return;
      }
      console.error('Transcription error:', error);
      setStage('error');
      setStatusMessage(error instanceof Error ? error.message : 'An error occurred');
      showToast('error', 'Transcription failed', error instanceof Error ? error.message : 'Please try again');
    }
  };

  const getFileIcon = () => {
    if (!file) return <Upload className="w-8 h-8 text-gray-400" />;
    if (file.type.startsWith('audio/')) return <FileAudio className="w-8 h-8 text-blue-500" />;
    return <FileVideo className="w-8 h-8 text-purple-500" />;
  };

  const getStageIcon = () => {
    switch (stage) {
      case 'uploading':
        return <Upload className="w-5 h-5 animate-pulse" />;
      case 'processing':
      case 'transcribing':
        return <Loader2 className="w-5 h-5 animate-spin" />;
      case 'preparing':
        // Fast spinning loader with green color when preparing
        return <Loader2 className="w-5 h-5 animate-spin text-green-500" style={{ animationDuration: '0.5s' }} />;
      case 'complete':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };

  // Handle dialog close - make sure to stop any ongoing processes
  const handleDialogClose = () => {
    const closeModal = async () => {
      const hasActiveProcess =
        stage !== 'idle' ||
        jobIdRef.current !== null ||
        uploadAbortControllerRef.current !== null ||
        transcriptionAbortControllerRef.current !== null;

      if (hasActiveProcess) {
        await cancelInFlight();
      }

      resetState();
      onClose();
    };

    void closeModal();
  };

  return (
    <>
      {/* Global loading overlay */}
      {showGlobalLoading && <LoadingOverlay />}
      
      <Dialog 
        open={isOpen} 
        onOpenChange={(open) => {
          if (!open) {
            handleDialogClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg bg-gray-900 border-gray-800">
        <ToastNotification 
          type={toast.type} 
          title={toast.title} 
          message={toast.message} 
          isOpen={toast.isOpen} 
          onClose={hideToast} 
        />
        
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            {mode === 'upload' ? (
              <>
                <Upload className="w-5 h-5 text-purple-500" />
                Upload & Transcribe
              </>
            ) : (
              <>
                <Youtube className="w-5 h-5 text-red-500" />
                YouTube Transcription
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* File/URL Input Section */}
          {mode === 'upload' ? (
            <div
              className={cn(
                "relative border-2 border-dashed rounded-xl p-6 transition-all",
                "hover:border-purple-500/50 hover:bg-purple-500/5",
                file ? "border-purple-500 bg-purple-500/10" : "border-gray-700",
                stage !== 'idle' && "pointer-events-none opacity-60"
              )}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => stage === 'idle' && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*"
                onChange={handleFileSelect}
                className="hidden"
                disabled={stage !== 'idle'}
              />
              
              <div className="flex flex-col items-center text-center">
                {getFileIcon()}
                
                {file ? (
                  <>
                    <p className="mt-2 text-white font-medium truncate max-w-full">
                      {file.name}
                    </p>
                    <p className="text-gray-400 text-sm">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    {stage === 'idle' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                          // Reset the file input value to allow re-selecting the same file
                          if (fileInputRef.current) {
                            fileInputRef.current.value = '';
                          }
                        }}
                        className="mt-2 text-xs text-gray-500 hover:text-red-400"
                      >
                        Remove file
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-gray-300">
                      Drop your file here or click to browse
                    </p>
                    <p className="text-gray-500 text-sm mt-1">
                      Supports MP4, MP3, WAV, and more (max 500MB)
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-gray-300">YouTube URL</Label>
              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 bg-gray-800 border-gray-700 text-white"
                  disabled={stage !== 'idle'}
                />
                {url && stage === 'idle' && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setUrl('')}
                    className="text-gray-500 hover:text-red-400"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Advanced Options */}
          <div className="border-t border-gray-800 pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
              disabled={stage !== 'idle'}
            >
              {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Advanced Options
            </button>
            
            {showAdvanced && (
              <div className="mt-4 space-y-3">
                {/* High Accuracy Mode */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-500" />
                    <Label htmlFor="high-accuracy" className="text-sm text-gray-300">
                      High Accuracy Mode
                    </Label>
                    {!canUseHighAccuracy && (
                      <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">
                        Pro only
                      </span>
                    )}
                  </div>
                  <Switch
                    id="high-accuracy"
                    checked={highAccuracy}
                    onCheckedChange={setHighAccuracy}
                    disabled={!canUseHighAccuracy || stage !== 'idle'}
                  />
                </div>

                {/* Speaker Diarization */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mic2 className="w-4 h-4 text-blue-500" />
                    <Label htmlFor="diarization" className="text-sm text-gray-300">
                      Speaker Detection
                    </Label>
                    {!canUseDiarization && (
                      <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">
                        Basic+
                      </span>
                    )}
                  </div>
                  <Switch
                    id="diarization"
                    checked={enableDiarization}
                    onCheckedChange={setEnableDiarization}
                    disabled={!canUseDiarization || stage !== 'idle'}
                  />
                </div>

              </div>
            )}
          </div>

          {/* Progress Section */}
          {stage !== 'idle' && (
            <div className="border-t border-gray-800 pt-4">
              <div className="flex items-center gap-2 mb-2">
                {getStageIcon()}
                <span className={`text-sm transition-colors duration-300 ${
                  stage === 'complete' ? 'text-green-400 font-medium' : 
                  stage === 'error' ? 'text-red-400' : 
                  'text-gray-300'
                }`}>
                  {statusMessage}
                </span>
              </div>
              
              {(stage === 'uploading' || stage === 'processing' || stage === 'transcribing' || stage === 'preparing') && (
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      stage === 'preparing' 
                        ? 'bg-gradient-to-r from-green-500 to-green-600' 
                        : 'bg-gradient-to-r from-purple-500 to-purple-600'
                    }`}
                    style={{ 
                      width: `${
                        stage === 'preparing' ? 98 :
                        stage === 'transcribing' ? 75 : 
                        (typeof progress === 'number' ? progress : 0)
                      }%` 
                    }}
                  />
                </div>
              )}
              
              {jobId && (
                <p className="text-xs text-gray-500 mt-2">Job ID: {jobId}</p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleDialogClose}
              className="border-gray-700 text-gray-300 hover:bg-gray-800"
              disabled={stage === 'uploading' || stage === 'processing' || stage === 'transcribing'}
            >
              Cancel
            </Button>
            
            <Button
              onClick={handleSubmit}
              disabled={
                stage !== 'idle' ||
                (mode === 'youtube' ? !url : !file)
              }
              className="bg-purple-600 hover:bg-purple-700 text-white min-w-[120px]"
            >
              {stage === 'idle' ? (
                'Start'
              ) : stage === 'complete' ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Complete
                </>
              ) : (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
