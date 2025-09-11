'use client';

import { useState } from 'react';
import { Zap } from 'lucide-react';
import UploadModal from './upload-modal';

interface EmptyStateButtonProps {
  locale: string;
  t: any;
}

export default function EmptyStateButton({ locale, t }: EmptyStateButtonProps) {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    mode: 'upload' | 'youtube';
  }>({ isOpen: false, mode: 'upload' });

  const openModal = () => {
    setModalState({ isOpen: true, mode: 'upload' });
  };

  const closeModal = () => {
    setModalState({ ...modalState, isOpen: false });
  };

  return (
    <>
      <button
        onClick={openModal}
        className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white 
          rounded-lg font-medium hover:opacity-90 transition-opacity inline-flex items-center gap-2"
      >
        <Zap className="w-4 h-4" />
        {t('actions.upload_file')}
      </button>
      
      <UploadModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        mode={modalState.mode}
      />
    </>
  );
}