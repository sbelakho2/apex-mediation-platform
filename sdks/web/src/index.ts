export type InitializationOptions = {
  apiKey: string;
  publisherId: string;
};

export type InterstitialOptions = {
  placementId: string;
};

type EventHandler = (...args: unknown[]) => void;

class ApexMediationWebSDK {
  private initialized = false;
  private handlers: Record<string, EventHandler[]> = {};

  initialize(options: InitializationOptions): void {
    if (!options.apiKey || !options.publisherId) {
      throw new Error('Invalid initialization options');
    }

    this.initialized = true;
    this.emit('ready');
  }

  on(event: string, handler: EventHandler): void {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }

    this.handlers[event].push(handler);
  }

  requestInterstitial(options: InterstitialOptions): Promise<{ adapter: string; ecpm: number }>
  {
    if (!this.initialized) {
      return Promise.reject(new Error('SDK not initialized'));
    }

    if (!options.placementId) {
      return Promise.reject(new Error('Invalid placementId'));
    }

    return Promise.resolve({ adapter: 'admob', ecpm: 12.3 });
  }

  private emit(event: string, ...args: unknown[]): void {
    const listeners = this.handlers[event] || [];
    listeners.forEach((handler) => handler(...args));
  }
}

export const ApexMediation = new ApexMediationWebSDK();
