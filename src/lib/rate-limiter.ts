interface RateLimitEntry {
  count: number;
  firstRequest: number;
  lastRequest: number;
  fingerprint?: string;
}

export class RateLimiter {
  private cache: Map<string, RateLimitEntry> = new Map();
  private readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  private cleanupTimer: NodeJS.Timeout;

  constructor() {
    // 定期清理过期条目
    this.cleanupTimer = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
  }

  /**
   * 检查IP是否超过限制
   */
  checkLimit(
    identifier: string, 
    maxRequests: number, 
    windowMs: number,
    fingerprint?: string
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = this.cache.get(identifier);

    if (!entry) {
      // 新的请求者
      this.cache.set(identifier, {
        count: 1,
        firstRequest: now,
        lastRequest: now,
        fingerprint
      });

      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: now + windowMs
      };
    }

    // 检查时间窗口
    if (now - entry.firstRequest > windowMs) {
      // 时间窗口已过，重置计数
      entry.count = 1;
      entry.firstRequest = now;
      entry.lastRequest = now;
      entry.fingerprint = fingerprint || entry.fingerprint;

      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: now + windowMs
      };
    }

    // 检查设备指纹变化（可能的规避行为）
    if (fingerprint && entry.fingerprint && fingerprint !== entry.fingerprint) {
      console.warn(`Fingerprint mismatch for ${identifier}: ${entry.fingerprint} -> ${fingerprint}`);
      // 可以选择更严格的处理
    }

    // 在时间窗口内
    entry.count++;
    entry.lastRequest = now;

    const allowed = entry.count <= maxRequests;
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetAt = entry.firstRequest + windowMs;

    return { allowed, remaining, resetAt };
  }

  /**
   * 获取请求统计
   */
  getStats(identifier: string): RateLimitEntry | undefined {
    return this.cache.get(identifier);
  }

  /**
   * 清理过期条目
   */
  private cleanup() {
    const now = Date.now();
    const expireTime = 24 * 60 * 60 * 1000; // 24 hours

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.lastRequest > expireTime) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 销毁定时器
   */
  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}

// 预览请求限制配置 - 更严格的限制策略
export const PREVIEW_LIMITS = {
  ANONYMOUS: {
    maxRequests: 1,        // 未登录每小时只能1次预览（90秒截断）
    windowMs: 60 * 60 * 1000,  // 1小时时间窗口
    dailyMax: 3           // 每日最多3次
  },
  AUTHENTICATED: {
    maxRequests: 5,        // 登录用户每小时5次预览
    windowMs: 60 * 60 * 1000,  // 1小时时间窗口
    dailyMax: 20          // 每日最多20次
  },
  SUSPICIOUS: {
    maxRequests: 1,        // 可疑用户限制更严
    windowMs: 24 * 60 * 60 * 1000  // 24小时
  }
};

// 用户配额限制
export const USER_QUOTAS = {
  FREE: {
    monthlyHours: 0.5,     // 30分钟/月
    dailyRequests: 5       // 每日5次请求
  },
  BASIC: {
    monthlyHours: 5,       // 5小时/月
    dailyRequests: 50      // 每日50次请求
  },
  PRO: {
    monthlyHours: 20,      // 20小时/月
    dailyRequests: 200     // 每日200次请求
  },
  PREMIUM: {
    monthlyHours: Infinity, // 无限制
    dailyRequests: Infinity // 无限制
  }
};