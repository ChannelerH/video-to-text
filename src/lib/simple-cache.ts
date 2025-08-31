// 简单的内存缓存系统，用于非转录数据的缓存
interface SimpleCacheEntry {
  value: any;
  expiresAt: number;
}

class SimpleCache {
  private cache = new Map<string, SimpleCacheEntry>();

  set(key: string, value: any, expiresAt: number): void {
    this.cache.set(key, { value, expiresAt });
  }

  get(key: string): any {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (Date.now() / 1000 > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  remove(key: string): boolean {
    return this.cache.delete(key);
  }

  cleanup(): number {
    const now = Date.now() / 1000;
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}

// 导出单例实例
export const simpleCache = new SimpleCache();

// 导出便捷函数
export const cacheSet = simpleCache.set.bind(simpleCache);
export const cacheGet = simpleCache.get.bind(simpleCache);
export const cacheRemove = simpleCache.remove.bind(simpleCache);