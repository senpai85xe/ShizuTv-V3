import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shizutv.app',
  appName: 'ShizuTv',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    path: 'android-capacitor',
    allowMixedContent: true,
    backgroundColor: '#111318',
  },
};

export default config;
