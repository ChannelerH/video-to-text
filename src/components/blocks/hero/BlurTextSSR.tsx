// 这是服务端渲染版本，不需要 "use client"
import '@/app/blur-text.css';

interface BlurTextSSRProps {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: 'words' | 'letters';
  spanClassName?: string;
}

export default function BlurTextSSR({
  text = '',
  delay = 80,
  className = '',
  animateBy = 'words',
  spanClassName = '',
}: BlurTextSSRProps) {
  const elements = animateBy === 'words' ? text.split(' ') : text.split('');
  
  return (
    <p 
      className={`blur-text-wrapper blur-text-animate ${className}`}
      data-blur-text="true"
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