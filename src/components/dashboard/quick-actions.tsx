'use client';

import { useState } from 'react';
import { Upload, Youtube } from 'lucide-react';
import UploadModal from './upload-modal-new';

interface QuickActionsProps {
  locale: string;
}

export default function QuickActions({ locale }: QuickActionsProps) {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    mode: 'upload' | 'youtube';
  }>({ isOpen: false, mode: 'upload' });

  const openModal = (mode: 'upload' | 'youtube') => {
    setModalState({ isOpen: true, mode });
  };

  const closeModal = () => {
    setModalState({ ...modalState, isOpen: false });
  };

  return (
    <>
      <div>
        <h3 className="text-sm font-medium text-gray-400 mb-4">Quick Actions</h3>
        <div className="space-y-3">
          <button
            onClick={() => openModal('upload')}
            className="flex items-center justify-center gap-2 w-full py-2.5 
              bg-purple-600 hover:bg-purple-700 text-white rounded-lg 
              font-medium text-sm transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload File
          </button>
          <button
            onClick={() => openModal('youtube')}
            className="flex items-center justify-center gap-2 w-full py-2.5 
              bg-gray-900/50 hover:bg-gray-900/70 text-gray-300 rounded-lg 
              font-medium text-sm border border-gray-800 transition-colors"
          >
            <Youtube className="w-4 h-4" />
            YouTube Link
          </button>
        </div>
      </div>
      
      <UploadModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        mode={modalState.mode}
      />
    </>
  );
}