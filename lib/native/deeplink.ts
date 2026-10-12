import { App as CapApp, URLOpenListenerEvent } from '@capacitor/app';
import { isNativePlatform } from './platform';

export function parseDeepLink(urlStr: string): { route: string; params: Record<string, string> } | null {
  try {
    const url = new URL(urlStr);
    // Support splitapp://join?code=TEST or https://splitapp.local/join?code=TEST
    const hostOrPath = url.host || url.pathname.replace(/^\/+/, '');
    const searchParams = Object.fromEntries(url.searchParams.entries());

    if (hostOrPath === 'join' || url.pathname.includes('/join')) {
      const code = searchParams.code || '';
      const claim = searchParams.claim || '';
      let qs = '';
      if (claim) {
        qs = `claim=${encodeURIComponent(claim)}`;
      } else if (code) {
        qs = `code=${encodeURIComponent(code)}`;
      }
      return {
        route: qs ? `/join?${qs}` : '/join',
        params: searchParams,
      };
    }

    if (hostOrPath === 'group' || url.pathname.includes('/group')) {
      const id = searchParams.id || '';
      return {
        route: `/group?id=${encodeURIComponent(id)}`,
        params: searchParams,
      };
    }

    return {
      route: url.pathname + url.search,
      params: searchParams,
    };
  } catch {
    return null;
  }
}

export function initDeepLinkListener(onNavigate: (route: string) => void): () => void {
  if (!isNativePlatform()) return () => {};

  let isSubscribed = true;

  // 1. Check cold launch URL
  CapApp.getLaunchUrl().then((launchUrl) => {
    if (!isSubscribed || !launchUrl?.url) return;
    const parsed = parseDeepLink(launchUrl.url);
    if (parsed) {
      onNavigate(parsed.route);
    }
  });

  // 2. Listen for URL open while app is running in background or foreground
  const handlePromise = CapApp.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
    const parsed = parseDeepLink(event.url);
    if (parsed) {
      onNavigate(parsed.route);
    }
  });

  return () => {
    isSubscribed = false;
    handlePromise.then((h) => h.remove());
  };
}
