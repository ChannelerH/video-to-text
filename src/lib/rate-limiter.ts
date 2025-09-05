interface RateLimitEntry {
  count: number;
  firstRequest: number;
  lastRequest: number;
  fingerprint?: string;
  // daily scope
  dayStart?: number; // start timestamp (00:00) for daily window
  dayCount?: number;
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
    fingerprint?: string,
    dailyMax?: number
  ): { allowed: boolean; remaining: number; resetAt: number; dailyRemaining?: number; dailyResetAt?: number } {
    const now = Date.now();
    const entry = this.cache.get(identifier);

    if (!entry) {
      // 新的请求者
      const newEntry: RateLimitEntry = {
        count: 1,
        firstRequest: now,
        lastRequest: now,
        fingerprint,
        dayStart: this.getTodayStart(now),
        dayCount: 1,
      };
      this.cache.set(identifier, newEntry);

      const base = {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: now + windowMs
      };
      if (dailyMax && dailyMax > 0) {
        return { ...base, dailyRemaining: dailyMax - 1, dailyResetAt: (newEntry.dayStart || 0) + 24 * 60 * 60 * 1000 };
      }
      return base;
    }

    // 检查时间窗口
    if (now - entry.firstRequest > windowMs) {
      // 时间窗口已过，重置计数
      entry.count = 1;
      entry.firstRequest = now;
      entry.lastRequest = now;
      entry.fingerprint = fingerprint || entry.fingerprint;

      const base = {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: now + windowMs
      };
      if (dailyMax && dailyMax > 0) {
        entry.dayStart = this.getTodayStart(now);
        entry.dayCount = 1;
        return { ...base, dailyRemaining: dailyMax - 1, dailyResetAt: (entry.dayStart || 0) + 24 * 60 * 60 * 1000 };
      }
      return base;
    }

    // 检查设备指纹变化（可能的规避行为）
    if (fingerprint && entry.fingerprint && fingerprint !== entry.fingerprint) {
      console.warn(`Fingerprint mismatch for ${identifier}: ${entry.fingerprint} -> ${fingerprint}`);
      // 可以选择更严格的处理
    }

    // Daily window check
    if (dailyMax && dailyMax > 0) {
      const today = this.getTodayStart(now);
      if (!entry.dayStart || entry.dayStart !== today) {
        entry.dayStart = today;
        entry.dayCount = 0;
      }
      entry.dayCount = (entry.dayCount || 0) + 1;
      if (entry.dayCount > dailyMax) {
        const resetAt = (entry.dayStart || today) + 24 * 60 * 60 * 1000;
        return { allowed: false, remaining: Math.max(0, maxRequests - entry.count), resetAt, dailyRemaining: 0, dailyResetAt: resetAt };
      }
    }

    // 在时间窗口内
    entry.count++;
    entry.lastRequest = now;

    const allowed = entry.count <= maxRequests;
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetAt = entry.firstRequest + windowMs;
    const resp: { allowed: boolean; remaining: number; resetAt: number; dailyRemaining?: number; dailyResetAt?: number } = { allowed, remaining, resetAt };
    if (dailyMax && dailyMax > 0) {
      const dailyRemaining = Math.max(0, dailyMax - (entry.dayCount || 0));
      resp.dailyRemaining = dailyRemaining;
      resp.dailyResetAt = (entry.dayStart || this.getTodayStart(now)) + 24 * 60 * 60 * 1000;
    }
    return resp;
  }

  private getTodayStart(now: number): number {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
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
