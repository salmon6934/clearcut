import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.clearcut.mobile',
  appName: 'Clearcut',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    iosScheme: 'ionic',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#10B981',
      sound: 'beep.wav',
    },
    FirebaseMessaging: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
      forceCodeForRefreshToken: false,
    },
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#f5f5f0',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
  },
  ios: {
    contentInset: 'always',
    preferredContentMode: 'mobile',
  },
};

export default config;
