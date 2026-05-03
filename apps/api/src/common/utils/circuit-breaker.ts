export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  openMs: number;
  halfOpenMaxCalls?: number;
}

export interface CircuitBreakerSnapshot {
  state: CircuitState;
  failures: number;
  openedAt: number | null;
  reopensIn: number | null;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private openedAt: number | null = null;
  private halfOpenInflight = 0;

  constructor(
    private readonly name: string,
    private readonly opts: CircuitBreakerOptions,
  ) {}

  canAttempt(): boolean {
    if (this.state === 'closed') return true;

    if (this.state === 'open') {
      if (this.openedAt === null) return false;
      if (Date.now() - this.openedAt >= this.opts.openMs) {
        this.state = 'half_open';
        this.halfOpenInflight = 0;
      } else {
        return false;
      }
    }

    if (this.state === 'half_open') {
      const max = this.opts.halfOpenMaxCalls ?? 1;
      if (this.halfOpenInflight >= max) return false;
      this.halfOpenInflight++;
      return true;
    }

    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
    this.halfOpenInflight = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    if (this.state === 'half_open') {
      this.trip();
      return;
    }

    this.failures++;
    if (this.failures >= this.opts.failureThreshold) {
      this.trip();
    }
  }

  snapshot(): CircuitBreakerSnapshot {
    const reopensIn =
      this.state === 'open' && this.openedAt !== null
        ? Math.max(0, this.opts.openMs - (Date.now() - this.openedAt))
        : null;

    return {
      state: this.state,
      failures: this.failures,
      openedAt: this.openedAt,
      reopensIn,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.openedAt = null;
    this.halfOpenInflight = 0;
  }

  private trip(): void {
    this.state = 'open';
    this.openedAt = Date.now();
    this.halfOpenInflight = 0;
  }
}
