/**
 * Circuit breaker pattern for resilient external service calls
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
    failureThreshold: number; // Number of failures before opening
    successThreshold: number; // Number of successes to close from half-open
    timeout: number; // Time to wait before trying half-open (ms)
    monitoringPeriod?: number; // Time window for failure counting (ms)
}

export interface CircuitBreakerStats {
    state: CircuitState;
    failures: number;
    successes: number;
    totalCalls: number;
    lastFailureTime: number | null;
    nextAttemptTime: number | null;
}

/**
 * Circuit breaker for protecting against cascading failures
 */
export class CircuitBreaker {
    private state: CircuitState = 'closed';
    private failures = 0;
    private successes = 0;
    private totalCalls = 0;
    private lastFailureTime: number | null = null;
    private nextAttemptTime: number | null = null;
    private recentErrors: number[] = [];

    constructor(
        private name: string,
        private config: CircuitBreakerConfig = {
            failureThreshold: 5,
            successThreshold: 2,
            timeout: 60000, // 1 minute
            monitoringPeriod: 120000, // 2 minutes
        }
    ) {}

    /**
     * Execute a function with circuit breaker protection
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        // Check if circuit is open
        if (this.state === 'open') {
            if (this.nextAttemptTime && Date.now() >= this.nextAttemptTime) {
                this.state = 'half-open';
                this.successes = 0;
                console.log(`[CircuitBreaker:${this.name}] Attempting half-open state`);
            } else {
                const waitTime = this.nextAttemptTime
                    ? Math.ceil((this.nextAttemptTime - Date.now()) / 1000)
                    : 0;
                throw new Error(
                    `Circuit breaker "${this.name}" is open. Retry in ${waitTime} seconds.`
                );
            }
        }

        this.totalCalls++;

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    /**
     * Handle successful execution
     */
    private onSuccess(): void {
        this.failures = 0;
        this.recentErrors = [];

        if (this.state === 'half-open') {
            this.successes++;
            console.log(
                `[CircuitBreaker:${this.name}] Half-open success ${this.successes}/${this.config.successThreshold}`
            );

            if (this.successes >= this.config.successThreshold) {
                this.state = 'closed';
                this.successes = 0;
                this.nextAttemptTime = null;
                console.log(`[CircuitBreaker:${this.name}] Closed - service recovered`);
            }
        }
    }

    /**
     * Handle failed execution
     */
    private onFailure(): void {
        const now = Date.now();
        this.failures++;
        this.lastFailureTime = now;
        this.recentErrors.push(now);

        // Clean old errors outside monitoring period
        if (this.config.monitoringPeriod) {
            const cutoff = now - this.config.monitoringPeriod;
            this.recentErrors = this.recentErrors.filter(t => t > cutoff);
        }

        if (this.state === 'half-open') {
            // Failed while half-open, go back to open
            this.state = 'open';
            this.successes = 0;
            this.nextAttemptTime = now + this.config.timeout;
            console.error(
                `[CircuitBreaker:${this.name}] Failed in half-open state, reopening circuit`
            );
        } else if (
            this.state === 'closed' &&
            this.failures >= this.config.failureThreshold
        ) {
            // Too many failures, open circuit
            this.state = 'open';
            this.nextAttemptTime = now + this.config.timeout;
            console.error(
                `[CircuitBreaker:${this.name}] Opening circuit after ${this.failures} failures`
            );
        }
    }

    /**
     * Manually reset the circuit breaker
     */
    reset(): void {
        this.state = 'closed';
        this.failures = 0;
        this.successes = 0;
        this.lastFailureTime = null;
        this.nextAttemptTime = null;
        this.recentErrors = [];
        console.log(`[CircuitBreaker:${this.name}] Manually reset`);
    }

    /**
     * Get current stats
     */
    getStats(): CircuitBreakerStats {
        return {
            state: this.state,
            failures: this.failures,
            successes: this.successes,
            totalCalls: this.totalCalls,
            lastFailureTime: this.lastFailureTime,
            nextAttemptTime: this.nextAttemptTime,
        };
    }

    /**
     * Get failure rate in monitoring period
     */
    getFailureRate(): number {
        if (this.totalCalls === 0) return 0;

        const recentFailures = this.recentErrors.length;
        const monitoringPeriod = this.config.monitoringPeriod || this.config.timeout;
        const windowStart = Date.now() - monitoringPeriod;

        // Calculate calls in monitoring window (approximate)
        const recentCalls = Math.max(recentFailures, this.totalCalls * 0.1);

        return recentFailures / recentCalls;
    }
}

/**
 * Circuit breaker registry for managing multiple breakers
 */
class CircuitBreakerRegistry {
    private breakers = new Map<string, CircuitBreaker>();

    get(
        name: string,
        config?: CircuitBreakerConfig
    ): CircuitBreaker {
        if (!this.breakers.has(name)) {
            this.breakers.set(name, new CircuitBreaker(name, config));
        }
        return this.breakers.get(name)!;
    }

    reset(name: string): void {
        this.breakers.get(name)?.reset();
    }

    getAllStats(): Record<string, CircuitBreakerStats> {
        const stats: Record<string, CircuitBreakerStats> = {};
        for (const [name, breaker] of this.breakers.entries()) {
            stats[name] = breaker.getStats();
        }
        return stats;
    }
}

// Global registry
const registry = new CircuitBreakerRegistry();

/**
 * Get or create a circuit breaker
 */
export function getCircuitBreaker(
    name: string,
    config?: CircuitBreakerConfig
): CircuitBreaker {
    return registry.get(name, config);
}

/**
 * Reset a circuit breaker
 */
export function resetCircuitBreaker(name: string): void {
    registry.reset(name);
}

/**
 * Get stats for all circuit breakers
 */
export function getAllCircuitBreakerStats(): Record<string, CircuitBreakerStats> {
    return registry.getAllStats();
}
