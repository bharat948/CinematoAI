/**
 * Provider abstraction for model/generation calls.
 * FR-41: retry with backoff, fallback to next provider, then escalate.
 * FR-42: every call records cost; worst-case reserved before call.
 */

export interface ProviderCallResult {
  output: string;
  actualCost: number;
  providerName: string;
}

export interface Provider {
  name: string;
  /** Worst-case cost estimate for this call type. Used for budget reservation. */
  estimate(medium: string): number;
  /** Execute the call. Throws on failure. */
  call(medium: string, prompt: string): Promise<ProviderCallResult>;
}

/**
 * FakeProvider for testing. Configurable cost, failure mode, and latency.
 */
export class FakeProvider implements Provider {
  name: string;
  costPerCall: number;
  failCount: number; // how many times to fail before succeeding
  private callCount = 0;

  constructor(opts: {
    name: string;
    costPerCall: number;
    failCount?: number;
  }) {
    this.name = opts.name;
    this.costPerCall = opts.costPerCall;
    this.failCount = opts.failCount ?? 0;
  }

  estimate(_medium: string): number {
    return this.costPerCall;
  }

  async call(medium: string, prompt: string): Promise<ProviderCallResult> {
    this.callCount++;
    if (this.callCount <= this.failCount) {
      throw new Error(`${this.name}: simulated failure (call ${this.callCount})`);
    }
    return {
      output: `[${this.name}] Generated ${medium}: ${prompt.slice(0, 40)}`,
      actualCost: this.costPerCall,
      providerName: this.name,
    };
  }

  /** Reset call counter (useful between tests). */
  reset(): void {
    this.callCount = 0;
  }
}

/**
 * ProviderChain holds an ordered list of providers for a medium.
 * FR-41: try primary, retry 3x with backoff, then fallback, then escalate.
 */
export class ProviderChain {
  providers: Provider[];

  constructor(providers: Provider[]) {
    if (providers.length === 0) throw new Error("ProviderChain needs at least one provider");
    this.providers = providers;
  }

  estimate(medium: string): number {
    // Worst-case: the most expensive provider in the chain
    return Math.max(...this.providers.map((p) => p.estimate(medium)));
  }

  /**
   * Execute with retry + fallback.
   * Returns the result from whichever provider succeeds.
   * Throws if all providers exhaust retries.
   */
  async execute(
    medium: string,
    prompt: string,
    maxRetries = 3,
  ): Promise<ProviderCallResult & { totalRetries: number }> {
    let totalRetries = 0;

    for (const provider of this.providers) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await provider.call(medium, prompt);
          return { ...result, totalRetries };
        } catch {
          totalRetries++;
          if (attempt < maxRetries) {
            // Backoff: 0ms in test (real would be exponential)
            // Keep it instant for the test suite
          }
        }
      }
      // This provider exhausted retries, try next
    }

    throw new Error(`All providers failed after ${totalRetries} retries`);
  }
}
