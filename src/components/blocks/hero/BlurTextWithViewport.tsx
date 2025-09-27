"use client";

import { useEffect, useRef } from 'react';
import '@/app/blur-text.css';

interface BlurTextWithViewportProps {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: 'words' | 'letters';
  spanClassName?: string;
  threshold?: number;
  rootMargin?: string;
}

// 这个版本支持视口检测，但仍然是轻量级的
export default function BlurTextWithViewport({
  text = '',
  delay = 120,
  className = '',
  animateBy = 'words',
  spanClassName = '',
  threshold = 0.1,
  rootMargin = '0px',
}: BlurTextWithViewportProps) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const elements = animateBy === 'words' ? text.split(' ') : text.split('');
  
  useEffect(() => {
    if (!ref.current) return;
    
    const element = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          element.classList.add('blur-text-animate');
          observer.unobserve(element);
        }
      },
      { threshold, rootMargin }
    );
    
    observer.observe(element);
    
    return () => observer.disconnect();
  }, [threshold, rootMargin]);
  
  return (
    <p 
      ref={ref}
      className={`blur-text-wrapper ${className}`}
    >
      {elements.map((segment, index) => {
        const animationDelay = (index * delay) / 1000;
        
        return (
          <span
            key={index}
            className={`blur-text-span ${spanClassName || ''}`}
            style={{
              animationDelay: `${animationDelay}s`,
            }}
          >
            {segment === ' ' ? '\u00A0' : segment}
            {animateBy === 'words' && index < elements.length - 1 && '\u00A0'}
          </span>
        );
      })}
    </p>
  );
}