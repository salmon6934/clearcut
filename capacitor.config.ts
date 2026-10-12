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
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
      forceCodeForRefreshToken: false,
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
