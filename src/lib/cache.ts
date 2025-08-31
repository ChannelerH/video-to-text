import { TranscriptionResult } from './replicate';

export interface CacheEntry {
  id: string;
  contentType: 'youtube' | 'user_file';
  contentKey: string;
  userId?: string;
  
  // 转录结果
  transcriptionData: TranscriptionResult;
  formats: {
    txt?: string;
    srt?: string;
    vtt?: string;
    json?: string;
    md?: string;
  };
  
  // 元数据
  originalUrl?: string;
  videoTitle?: string;
  language: string;
  duration: number;
  fileSize?: number;
  
  // 时间管理
  createdAt: Date;
  expiresAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
}

export interface CacheOptions {
  ttlDays?: number;
  userId?: string;
}

export class TranscriptionCache {
  private cache = new Map<string, CacheEntry>();
  
  /**
   * 生成缓存键
   */
  private generateCacheKey(contentType: 'youtube' | 'user_file', identifier: string, userId?: string): string {
    if (contentType === 'youtube') {
      return `youtube:${identifier}`;
    } else {
      return `user:${userId}:${identifier}`;
    }
  }

  /**
   * 获取用户等级对应的缓存时长（天数）
   */
  private getUserCacheTTL(userTier: string): number {
    const ttlMap: Record<string, number> = {
      free: 0,        // 免费用户不缓存
      day_pass: 7,    // 日通用户7天
      monthly: 30,    // 月付用户30天
      yearly: 90,     // 年付用户90天
    };
    
    return ttlMap[userTier] || 0;
  }

  /**
   * 存储转录结果到缓存
   */
  async set(
    contentType: 'youtube' | 'user_file',
    identifier: string, // videoId 或 fileHash
    transcriptionData: TranscriptionResult,
    formats: CacheEntry['formats'],
    metadata: {
      originalUrl?: string;
      videoTitle?: string;
      fileSize?: number;
      userTier?: string;
    },
    options: CacheOptions = {}
  ): Promise<void> {
    const cacheKey = this.generateCacheKey(contentType, identifier, options.userId);
    
    // 计算过期时间
    let ttlDays = options.ttlDays;
    if (!ttlDays) {
      if (contentType === 'youtube') {
        ttlDays = 90; // YouTube内容缓存90天
      } else {
        ttlDays = this.getUserCacheTTL(metadata.userTier || 'free');
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (ttlDays * 24 * 60 * 60 * 1000));

    const entry: CacheEntry = {
      id: crypto.randomUUID(),
      contentType,
      contentKey: cacheKey,
      userId: options.userId,
      transcriptionData,
      formats,
      originalUrl: metadata.originalUrl,
      videoTitle: metadata.videoTitle,
      language: transcriptionData.language,
      duration: transcriptionData.duration,
      fileSize: metadata.fileSize,
      createdAt: now,
      expiresAt,
      lastAccessedAt: now,
      accessCount: 1,
    };

    this.cache.set(cacheKey, entry);
    
    console.log(`Cached transcription: ${cacheKey}, expires: ${expiresAt.toISOString()}`);
  }

  /**
   * 从缓存获取转录结果
   */
  async get(
    contentType: 'youtube' | 'user_file',
    identifier: string,
    userId?: string
  ): Promise<CacheEntry | null> {
    const cacheKey = this.generateCacheKey(contentType, identifier, userId);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (entry.expiresAt < new Date()) {
      this.cache.delete(cacheKey);
      console.log(`Expired cache entry removed: ${cacheKey}`);
      return null;
    }

    // 更新访问信息
    entry.lastAccessedAt = new Date();
    entry.accessCount += 1;
    
    console.log(`Cache hit: ${cacheKey}, access count: ${entry.accessCount}`);
    return entry;
  }

  /**
   * 检查缓存是否存在
   */
  async exists(
    contentType: 'youtube' | 'user_file',
    identifier: string,
    userId?: string
  ): Promise<boolean> {
    const entry = await this.get(contentType, identifier, userId);
    return entry !== null;
  }

  /**
   * 删除缓存条目
   */
  async delete(
    contentType: 'youtube' | 'user_file',
    identifier: string,
    userId?: string
  ): Promise<boolean> {
    const cacheKey = this.generateCacheKey(contentType, identifier, userId);
    return this.cache.delete(cacheKey);
  }

  /**
   * 清理过期的缓存条目
   */
  async cleanup(): Promise<number> {
    const now = new Date();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} expired cache entries`);
    }

    return cleanedCount;
  }

  /**
   * 清理用户相关的所有缓存
   */
  async clearUserCache(userId: string): Promise<number> {
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.userId === userId) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    console.log(`Cleaned up ${cleanedCount} cache entries for user: ${userId}`);
    return cleanedCount;
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): {
    total: number;
    youtube: number;
    userFiles: number;
    expired: number;
  } {
    const now = new Date();
    let total = 0;
    let youtube = 0;
    let userFiles = 0;
    let expired = 0;

    for (const entry of this.cache.values()) {
      total++;
      
      if (entry.expiresAt < now) {
        expired++;
      }
      
      if (entry.contentType === 'youtube') {
        youtube++;
      } else {
        userFiles++;
      }
    }

    return { total, youtube, userFiles, expired };
  }

  /**
   * 计算缓存命中率
   */
  getCacheMetrics(): {
    hitRate: number;
    totalAccess: number;
    avgAccessPerEntry: number;
  } {
    let totalAccess = 0;
    let entryCount = 0;

    for (const entry of this.cache.values()) {
      totalAccess += entry.accessCount;
      entryCount++;
    }

    const avgAccessPerEntry = entryCount > 0 ? totalAccess / entryCount : 0;
    
    // 简单估算命中率（基于平均访问次数）
    const hitRate = avgAccessPerEntry > 1 ? (avgAccessPerEntry - 1) / avgAccessPerEntry : 0;

    return {
      hitRate: Math.round(hitRate * 100) / 100,
      totalAccess,
      avgAccessPerEntry: Math.round(avgAccessPerEntry * 100) / 100,
    };
  }
}

// 导出单例实例
export const transcriptionCache = new TranscriptionCache();

