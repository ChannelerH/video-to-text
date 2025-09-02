'use client';

import React from 'react';
import './pyramid-loader.css';

interface PyramidLoaderProps {
  className?: string;
  size?: 'small' | 'medium' | 'large';
}

export default function PyramidLoader({ className = '', size = 'medium' }: PyramidLoaderProps) {
  const sizeClasses = {
    small: 'w-32 h-32',
    medium: 'w-48 h-48', 
    large: 'w-72 h-72'
  };

  return (
    <div className={`pyramid-loader ${sizeClasses[size]} ${className}`}>
      <div className="wrapper">
        <div className="side side1"></div>
        <div className="side side2"></div>
        <div className="side side3"></div>
        <div className="side side4"></div>
        <div className="shadow"></div>
      </div>
    </div>
  );
}