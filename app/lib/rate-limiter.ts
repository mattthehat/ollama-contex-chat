/**
 * Rate limiting utilities for upload and query protection
 */

interface RateLimitEntry {
    count: number;
    resetAt: number;
    blocked: boolean;
}

export type RateLimitType = 'upload' | 'query' | 'embedding';

export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    blockDuration?: number; // How long to block after exceeding limit
}

export interface RateLimitResult {
    allowed: boolean;
    limit: number;
    remaining: number;
    resetAt: number;
    retryAfter?: number; // Seconds until retry allowed
}

/**
 * In-memory rate limiter with sliding window
 * In production, use Redis for distributed rate limiting
 */
class RateLimiter {
    private limits = new Map<string, RateLimitEntry>();
    private config: Record<RateLimitType, RateLimitConfig> = {
        upload: {
            maxRequests: 10, // 10 uploads per hour
            windowMs: 60 * 60 * 1000,
            blockDuration: 15 * 60 * 1000, // 15 min block
        },
        query: {
            maxRequests: 60, // 60 queries per minute
            windowMs: 60 * 1000,
        },
        embedding: {
            maxRequests: 100, // 100 embeddings per minute
            windowMs: 60 * 1000,
        },
    };

    /**
     * Check if request is allowed
     */
    check(
        identifier: string,
        type: RateLimitType = 'query'
    ): RateLimitResult {
        const key = `${type}:${identifier}`;
        const now = Date.now();
        const config = this.config[type];

        let entry = this.limits.get(key);

        // Clean up expired entries periodically
        if (this.limits.size > 10000) {
            this.cleanup();
        }

        // Check if currently blocked
        if (entry?.blocked && now < entry.resetAt) {
            return {
                allowed: false,
                limit: config.maxRequests,
                remaining: 0,
                resetAt: entry.resetAt,
                retryAfter: Math.ceil((entry.resetAt - now) / 1000),
            };
        }

        // Reset window if expired
        if (!entry || now > entry.resetAt) {
            entry = {
                count: 1,
                resetAt: now + config.windowMs,
                blocked: false,
            };
            this.limits.set(key, entry);

            return {
                allowed: true,
                limit: config.maxRequests,
                remaining: config.maxRequests - 1,
                resetAt: entry.resetAt,
            };
        }

        // Increment counter
        entry.count++;

        // Check if limit exceeded
        if (entry.count > config.maxRequests) {
            // Block if configured
            if (config.blockDuration) {
                entry.blocked = true;
                entry.resetAt = now + config.blockDuration;
            }

            return {
                allowed: false,
                limit: config.maxRequests,
                remaining: 0,
                resetAt: entry.resetAt,
                retryAfter: Math.ceil((entry.resetAt - now) / 1000),
            };
        }

        return {
            allowed: true,
            limit: config.maxRequests,
            remaining: config.maxRequests - entry.count,
            resetAt: entry.resetAt,
        };
    }

    /**
     * Manually reset a rate limit
     */
    reset(identifier: string, type: RateLimitType): void {
        const key = `${type}:${identifier}`;
        this.limits.delete(key);
    }

    /**
     * Clean up expired entries
     */
    private cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.limits.entries()) {
            if (now > entry.resetAt && !entry.blocked) {
                this.limits.delete(key);
            }
        }
    }

    /**
     * Get current stats
     */
    getStats(): {
        totalKeys: number;
        blockedKeys: number;
        activeKeys: number;
    } {
        const now = Date.now();
        let blocked = 0;
        let active = 0;

        for (const entry of this.limits.values()) {
            if (entry.blocked && now < entry.resetAt) {
                blocked++;
            } else if (now <= entry.resetAt) {
                active++;
            }
        }

        return {
            totalKeys: this.limits.size,
            blockedKeys: blocked,
            activeKeys: active,
        };
    }

    /**
     * Update configuration
     */
    updateConfig(type: RateLimitType, config: Partial<RateLimitConfig>): void {
        this.config[type] = { ...this.config[type], ...config };
    }
}

// Global rate limiter instance
const rateLimiter = new RateLimiter();

/**
 * Check rate limit for a user/IP
 */
export function checkRateLimit(
    identifier: string,
    type: RateLimitType = 'query'
): RateLimitResult {
    return rateLimiter.check(identifier, type);
}

/**
 * Reset rate limit for a user/IP
 */
export function resetRateLimit(
    identifier: string,
    type: RateLimitType
): void {
    rateLimiter.reset(identifier, type);
}

/**
 * Get rate limiter stats
 */
export function getRateLimiterStats() {
    return rateLimiter.getStats();
}

/**
 * Update rate limit configuration
 */
export function updateRateLimitConfig(
    type: RateLimitType,
    config: Partial<RateLimitConfig>
): void {
    rateLimiter.updateConfig(type, config);
}

/**
 * Helper to get identifier from request
 * In production, use actual user ID or IP address
 */
export function getRequestIdentifier(request: Request): string {
    // Try to get IP from various headers (for proxies)
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');

    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }

    if (realIp) {
        return realIp;
    }

    // Fallback to a session identifier if available
    // For now, use a placeholder - in production, use actual user session
    return 'anonymous';
}
