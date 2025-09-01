'use client';

import React from 'react';
import { useAsyncTranscription } from '@/hooks/useAsyncTranscription';

export function AsyncTranscriptionExample() {
  const {
    status,
    progress,
    result,
    error,
    startTranscription,
    cancelTask,
    isLoading,
    isCompleted,
    isFailed
  } = useAsyncTranscription({
    onProgress: (progress) => {
      console.log(`Progress: ${progress}%`);
    },
    onComplete: (result) => {
      console.log('Transcription completed:', result);
    },
    onError: (error) => {
      console.error('Transcription failed:', error);
    },
    pollInterval: 2000 // 每 2 秒轮询一次
  });

  const handleTranscribe = async () => {
    try {
      const taskId = await startTranscription(
        'youtube_url',
        'https://www.youtube.com/watch?v=YOUR_VIDEO_ID',
        {
          language: 'en',
          formats: ['txt', 'srt']
        }
      );
      console.log('Task created with ID:', taskId);
    } catch (error) {
      console.error('Failed to start transcription:', error);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Async Transcription Demo</h2>
      
      <div className="space-y-4">
        {/* 状态显示 */}
        <div className="bg-gray-100 p-4 rounded">
          <p>Status: <span className="font-semibold">{status}</span></p>
          {isLoading && (
            <div className="mt-2">
              <p>Progress: {progress}%</p>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* 错误显示 */}
        {isFailed && error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            Error: {error}
          </div>
        )}

        {/* 结果显示 */}
        {isCompleted && result && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            <h3 className="font-bold mb-2">Transcription Complete!</h3>
            <pre className="text-sm overflow-auto max-h-60">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        {/* 控制按钮 */}
        <div className="flex gap-4">
          <button
            onClick={handleTranscribe}
            disabled={isLoading}
            className={`px-4 py-2 rounded font-medium ${
              isLoading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isLoading ? 'Processing...' : 'Start Transcription'}
          </button>

          {isLoading && (
            <button
              onClick={cancelTask}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}