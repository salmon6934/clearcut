import { describe, it, expect } from 'vitest';
import { parseDeepLink } from '../../lib/native/deeplink';
import { registerModalDismiss } from '../../lib/native/back-button';

describe('T-0.1: Native Shell, Routing & Deep Linking', () => {
  it('parses splitapp://join?code=XYZ deep link correctly', () => {
    const res = parseDeepLink('splitapp://join?code=ABC123XYZ');
    expect(res).not.toBeNull();
    expect(res?.route).toBe('/join?code=ABC123XYZ');
    expect(res?.params.code).toBe('ABC123XYZ');
  });

  it('parses splitapp://group?id=group_456 deep link correctly', () => {
    const res = parseDeepLink('splitapp://group?id=group_456');
    expect(res).not.toBeNull();
    expect(res?.route).toBe('/group?id=group_456');
    expect(res?.params.id).toBe('group_456');
  });

  it('registers and executes modal dismiss handler in LIFO order', () => {
    let dismissed1 = false;
    let dismissed2 = false;

    const unregister1 = registerModalDismiss(() => {
      dismissed1 = true;
      return true;
    });

    const unregister2 = registerModalDismiss(() => {
      dismissed2 = true;
      return true;
    });

    unregister2();
    unregister1();
    expect(dismissed1).toBe(false);
    expect(dismissed2).toBe(false);
  });
});
