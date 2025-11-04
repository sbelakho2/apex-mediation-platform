import { describe, it, expect } from 'vitest';
import { ApexMediation } from '../src/index';

describe('ApexMediation Web SDK', () => {
  it('throws when not initialized', async () => {
    await expect(ApexMediation.requestInterstitial({ placementId: 'main' })).rejects.toThrow(
      'SDK not initialized'
    );
  });
});
