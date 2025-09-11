'use client';

import { useState } from 'react';
import { Upload, Youtube, ArrowRight } from 'lucide-react';
import UploadModal from './upload-modal';

interface DashboardActionsProps {
  locale: string;
  uploadTitle: string;
  uploadDesc: string;
  youtubeTitle: string;
  youtubeDesc: string;
}

export default function DashboardActions({ locale, uploadTitle, uploadDesc, youtubeTitle, youtubeDesc }: DashboardActionsProps) {
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <button
          onClick={() => openModal('upload')}
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600/10 to-pink-600/10 
            border border-purple-500/20 p-6 hover:border-purple-500/40 transition-all duration-300 text-left"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-transparent 
            opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 
                shadow-lg shadow-purple-600/20">
                <Upload className="w-6 h-6 text-white" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-500 group-hover:text-purple-400 
                transform group-hover:translate-x-1 transition-all" />
            </div>
            
            <h3 className="text-xl font-semibold text-white mb-2">{uploadTitle}</h3>
            <p className="text-sm text-gray-400">{uploadDesc}</p>
          </div>
        </button>

        <button
          onClick={() => openModal('youtube')}
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-pink-600/10 to-red-600/10 
            border border-pink-500/20 p-6 hover:border-pink-500/40 transition-all duration-300 text-left"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-pink-600/5 to-transparent 
            opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-pink-600 to-red-600 
                shadow-lg shadow-pink-600/20">
                <Youtube className="w-6 h-6 text-white" />
              </div>
              <ArrowRight className="w-5 h-5 text-gray-500 group-hover:text-pink-400 
                transform group-hover:translate-x-1 transition-all" />
            </div>
            
            <h3 className="text-xl font-semibold text-white mb-2">{youtubeTitle}</h3>
            <p className="text-sm text-gray-400">{youtubeDesc}</p>
          </div>
        </button>
      </div>
      
      <UploadModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        mode={modalState.mode}
      />
    </>
  );
}
