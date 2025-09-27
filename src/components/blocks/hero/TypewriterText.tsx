// 服务端渲染的打字机效果组件
import '@/app/typewriter.css';

interface TypewriterTextProps {
  text?: string;
  speed?: number; // 每个字符的显示速度（毫秒）
  className?: string;
  spanClassName?: string;
  showCursor?: boolean;
}

export default function TypewriterText({
  text = '',
  speed = 50, // 每个字符50ms，模拟真实打字速度
  className = '',
  spanClassName = '',
  showCursor = true,
}: TypewriterTextProps) {
  const chars = text.split('');
  
  return (
    <span className={`typewriter-wrapper ${className}`}>
      {chars.map((char, index) => {
        // 计算每个字符的动画延迟
        const delay = index * speed;
        
        return (
          <span
            key={index}
            className={`typewriter-char ${spanClassName}`}
            style={{
              animationDelay: `${delay}ms`,
            }}
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        );
      })}
      {showCursor && (
        <span 
          className="typewriter-cursor"
          style={{
            animationDelay: `${chars.length * speed}ms`,
          }}
        />
      )}
    </span>
  );
}