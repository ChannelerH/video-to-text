import crypto from 'crypto';

interface AbuseSignal {
  type: 'rapid_requests' | 'pattern_match' | 'quota_exceeded' | 'suspicious_ua' | 'proxy_detected';
  severity: 'low' | 'medium' | 'high';
  description: string;
}

interface UserBehavior {
  requestCount: number;
  uniqueVideos: Set<string>;
  requestTimestamps: number[];
  userAgents: Set<string>;
  ips: Set<string>;
  suspicionScore: number;
}

export class AbuseDetector {
  private userBehaviors: Map<string, UserBehavior> = new Map();
  private blockedUsers: Set<string> = new Set();
  private readonly BEHAVIOR_WINDOW = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * 生成设备指纹
   */
  generateFingerprint(params: {
    userAgent: string;
    acceptLanguage?: string;
    acceptEncoding?: string;
    screenResolution?: string;
    timezone?: string;
  }): string {
    const data = JSON.stringify(params);
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * 检测可疑行为
   */
  detectAbuse(userId: string, request: {
    ip: string;
    userAgent: string;
    videoId?: string;
    timestamp?: number;
  }): AbuseSignal[] {
    const signals: AbuseSignal[] = [];
    const now = request.timestamp || Date.now();

    // 获取或创建用户行为记录
    let behavior = this.userBehaviors.get(userId);
    if (!behavior) {
      behavior = {
        requestCount: 0,
        uniqueVideos: new Set(),
        requestTimestamps: [],
        userAgents: new Set(),
        ips: new Set(),
        suspicionScore: 0
      };
      this.userBehaviors.set(userId, behavior);
    }

    // 更新行为数据
    behavior.requestCount++;
    behavior.requestTimestamps.push(now);
    behavior.userAgents.add(request.userAgent);
    behavior.ips.add(request.ip);
    if (request.videoId) {
      behavior.uniqueVideos.add(request.videoId);
    }

    // 清理旧的时间戳
    behavior.requestTimestamps = behavior.requestTimestamps.filter(
      ts => now - ts < this.BEHAVIOR_WINDOW
    );

    // 1. 检测快速请求模式
    const recentRequests = behavior.requestTimestamps.filter(
      ts => now - ts < 60000 // 最近1分钟
    );
    if (recentRequests.length > 10) {
      signals.push({
        type: 'rapid_requests',
        severity: 'high',
        description: `${recentRequests.length} requests in 1 minute`
      });
      behavior.suspicionScore += 10;
    }

    // 2. 检测重复视频模式（可能在测试系统）
    if (behavior.uniqueVideos.size === 1 && behavior.requestCount > 5) {
      signals.push({
        type: 'pattern_match',
        severity: 'medium',
        description: 'Repeated requests for same video'
      });
      behavior.suspicionScore += 5;
    }

    // 3. 检测多IP/UA（可能使用代理）
    if (behavior.ips.size > 5 || behavior.userAgents.size > 3) {
      signals.push({
        type: 'proxy_detected',
        severity: 'high',
        description: `Multiple IPs (${behavior.ips.size}) or UAs (${behavior.userAgents.size})`
      });
      behavior.suspicionScore += 15;
    }

    // 4. 检测可疑User Agent
    const suspiciousUAs = ['bot', 'crawl', 'spider', 'scraper', 'curl', 'wget'];
    if (suspiciousUAs.some(ua => request.userAgent.toLowerCase().includes(ua))) {
      signals.push({
        type: 'suspicious_ua',
        severity: 'medium',
        description: 'Bot-like user agent detected'
      });
      behavior.suspicionScore += 8;
    }

    // 根据怀疑分数决定是否阻止
    if (behavior.suspicionScore >= 30) {
      this.blockedUsers.add(userId);
    }

    return signals;
  }

  /**
   * 检查用户是否被阻止
   */
  isBlocked(userId: string): boolean {
    return this.blockedUsers.has(userId);
  }

  /**
   * 获取用户怀疑分数
   */
  getSuspicionScore(userId: string): number {
    const behavior = this.userBehaviors.get(userId);
    return behavior?.suspicionScore || 0;
  }

  /**
   * 重置用户状态（管理员操作）
   */
  resetUser(userId: string) {
    this.userBehaviors.delete(userId);
    this.blockedUsers.delete(userId);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalUsers: this.userBehaviors.size,
      blockedUsers: this.blockedUsers.size,
      suspiciousUsers: Array.from(this.userBehaviors.entries())
        .filter(([_, behavior]) => behavior.suspicionScore > 10)
        .map(([userId, behavior]) => ({
          userId,
          score: behavior.suspicionScore,
          requestCount: behavior.requestCount
        }))
    };
  }
}