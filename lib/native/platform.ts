import { Capacitor } from '@capacitor/core';

export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform();
}

export function getPlatform(): 'android' | 'ios' | 'web' {
  if (typeof window === 'undefined') return 'web';
  return Capacitor.getPlatform() as 'android' | 'ios' | 'web';
}
