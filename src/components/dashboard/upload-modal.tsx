'use client';

import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Youtube, X, FileVideo, Loader2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import { MultipartUploader } from '@/lib/multipart-upload';
import { useToast, ToastNotification } from '@/components/toast-notification';

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
  const { toast, showToast, hideToast } = useToast();

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
    try {
      if (mode === 'youtube') {
        // Start async job for YouTube URL
        const resp = await fetch('/api/transcribe/async', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'youtube_url',
            content: url,
            action: 'transcribe',
            options: {}
          })
        });
        const data = await resp.json();
        if (!resp.ok || !data?.success || !data?.job_id) throw new Error(data?.error || 'Failed to start job');
        router.push(`/${locale}/dashboard/transcriptions?highlight=${encodeURIComponent(data.job_id)}`);
        onClose();
        return;
      }

      // Upload file to R2: multipart (large) or presigned PUT with CORS-fallback
      const modeHint = file!.type.startsWith('audio/') ? 'audio' : 'video';
      let r2Key = '';
      let fileUrl = '';

      if (MultipartUploader.shouldUseMultipart(file!.size)) {
        // Multipart upload for large files
        const uploader = new MultipartUploader();
        const abort = new AbortController();
        try {
          const result = await uploader.upload({
            file: file!,
            abortSignal: abort.signal,
            onProgress: () => {}
          });
          r2Key = result?.key || '';
          fileUrl = result?.downloadUrl || result?.publicUrl || '';
        } catch (e) {
          throw new Error('Multipart upload failed');
        }
      } else {
        // Presign then PUT
        const presignResp = await fetch('/api/upload/presigned', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file!.name, fileType: file!.type || 'application/octet-stream', fileSize: file!.size, mode: modeHint })
        });
        const presign = await presignResp.json();
        if (!presignResp.ok || !presign?.success) throw new Error(presign?.error || 'Failed to get upload URL');
        const { uploadUrl, key, publicUrl, downloadUrl } = presign.data as { uploadUrl: string; key: string; publicUrl: string; downloadUrl?: string };
        r2Key = key;
        try {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadUrl);
            if (file!.type) xhr.setRequestHeader('Content-Type', file!.type);
            xhr.onload = () => (xhr.status === 200 || xhr.status === 204) ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
            xhr.onerror = () => reject(new Error('Upload error'));
            xhr.onabort = () => reject(new Error('Upload aborted'));
            xhr.send(file);
          });
          fileUrl = downloadUrl || publicUrl;
        } catch (e) {
          // CORS fallback to /api/upload
          const form = new FormData();
          form.append('file', file!);
          form.append('mode', modeHint);
          const up = await fetch('/api/upload', { method: 'POST', body: form });
          const js = await up.json();
          if (!up.ok || !js?.success) throw new Error(js?.error || 'Upload failed');
          r2Key = js.data?.r2Key || js.data?.key || r2Key;
          fileUrl = js.data?.publicUrl || js.data?.replicateUrl || '';
        }
      }

      // Start transcription
      const startResp = await fetch('/api/transcribe/async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'file_upload',
          content: fileUrl,
          action: 'transcribe',
          options: { r2Key, originalFileName: file!.name }
        })
      });
      const startData = await startResp.json();
      if (!startResp.ok || !startData?.success || !startData?.job_id) throw new Error(startData?.error || 'Failed to start job');
      router.push(`/${locale}/dashboard/transcriptions?highlight=${encodeURIComponent(startData.job_id)}`);
      onClose();
    } catch (e) {
      console.error('Quick action failed:', e);
      showToast('error', 'Failed to start transcription', e instanceof Error ? e.message : 'Please try again');
      setIsProcessing(false);
    }
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
        <ToastNotification type={toast.type} title={toast.title} message={toast.message} isOpen={toast.isOpen} onClose={hideToast} />
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
