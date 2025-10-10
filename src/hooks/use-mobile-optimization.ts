import { useEffect, useState } from 'react';

/**
 * Hook for mobile device detection and optimization
 */
export function useMobileOptimization() {
  const [isMobile, setIsMobile] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check if mobile device
    const checkMobile = () => {
      const mobile = window.innerWidth < 768 || 
                    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(mobile);
    };

    // Check if touch device
    const checkTouch = () => {
      const hasTouch = 'ontouchstart' in window || 
                      navigator.maxTouchPoints > 0;
      setIsTouch(hasTouch);
    };

    // Check reduced motion preference
    const checkMotionPreference = () => {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      
      const handleChange = (e: MediaQueryListEvent) => {
        setPrefersReducedMotion(e.matches);
      };
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    };

    // Initial checks
    checkMobile();
    checkTouch();
    const cleanup = checkMotionPreference();

    // Resize listener
    const handleResize = () => {
      checkMobile();
    };

    window.addEventListener('resize', handleResize);
    
    // Add mobile-specific optimizations without freezing scroll
    if (isMobile) {
      document.body.classList.add('touch-device');
    } else {
      document.body.classList.remove('touch-device');
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      document.body.classList.remove('touch-device');
      cleanup();
    };
  }, [isMobile]);

  return {
    isMobile,
    isTouch,
    prefersReducedMotion,
    // Helper functions
    getAnimationDuration: () => {
      if (prefersReducedMotion) return '0s';
      if (isMobile) return '0.2s';
      return '0.3s';
    },
    shouldAnimate: () => !prefersReducedMotion && !isMobile,
    getTouchTargetSize: () => isMobile ? 48 : 44,
  };
}

/**
 * Hook for optimizing images on mobile
 */
export function useMobileImageOptimization() {
  const { isMobile } = useMobileOptimization();
  
  const getImageSizes = (desktop: string, mobile?: string) => {
    if (!mobile) return desktop;
    return isMobile ? mobile : desktop;
  };
  
  const getImageQuality = () => {
    return isMobile ? 75 : 90;
  };
  
  const shouldLazyLoad = (priority: boolean = false) => {
    return !priority && isMobile;
  };
  
  return {
    getImageSizes,
    getImageQuality,
    shouldLazyLoad,
  };
}

/**
 * Hook for viewport management
 */
export function useViewport() {
  const [viewport, setViewport] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    ...viewport,
    isMobile: viewport.width < 640,
    isTablet: viewport.width >= 640 && viewport.width < 1024,
    isDesktop: viewport.width >= 1024,
  };
}
