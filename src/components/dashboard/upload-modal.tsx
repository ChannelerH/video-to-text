'use client';

import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Youtube, X, FileVideo, Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useLocale } from 'next-intl';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'upload' | 'youtube';
}

export default function UploadModal({ isOpen, onClose, mode }: UploadModalProps) {
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const locale = useLocale();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleSubmit = async () => {
    if (mode === 'youtube' && !url) return;
    if (mode === 'upload' && !file) return;

    setIsProcessing(true);
    
    // Store the data in sessionStorage to pass to the main page
    if (mode === 'youtube') {
      sessionStorage.setItem('pendingYoutubeUrl', url);
    } else if (file) {
      // For file upload, we'll need to handle it differently
      // Store file info temporarily
      sessionStorage.setItem('pendingFileUpload', 'true');
      sessionStorage.setItem('pendingFileName', file.name);
    }
    
    // Navigate to main page
    router.push(`/${locale}`);
    onClose();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            {mode === 'upload' ? (
              <>
                <Upload className="w-5 h-5" />
                Upload File
              </>
            ) : (
              <>
                <Youtube className="w-5 h-5" />
                YouTube Link
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="mt-4">
          {mode === 'upload' ? (
            <div
              className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center hover:border-purple-500/50 transition-colors cursor-pointer"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*,audio/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              
              {file ? (
                <div className="space-y-2">
                  <FileVideo className="w-12 h-12 mx-auto text-purple-500" />
                  <p className="text-white font-medium">{file.name}</p>
                  <p className="text-gray-400 text-sm">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-12 h-12 mx-auto text-gray-500" />
                  <p className="text-gray-300">Click to upload or drag and drop</p>
                  <p className="text-gray-500 text-sm">MP4, AVI, MOV, MP3, WAV (max 500MB)</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white placeholder-gray-500"
              />
              <p className="text-gray-400 text-sm">
                Paste a YouTube URL to transcribe the video
              </p>
            </div>
          )}
        </div>
        
        <div className="flex justify-end gap-2 mt-6">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isProcessing || (mode === 'youtube' ? !url : !file)}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              'Start Transcription'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}