import type { ExpoConfig } from 'expo/config';

import { appVariant } from './config/appVariant.cjs';
const { variant, suffix } = appVariant(process.env);
const config: ExpoConfig = {
  name: variant === 'production' ? 'Vima' : `Vima ${variant === 'qa' ? 'QA' : 'Dev'}`,
  slug: 'vima',
  owner: 'kingghidorahx12',
  extra: {
    eas: { projectId: '30422aec-d22b-40f0-8008-c6a316633fd8' },
  },
  version: '0.0.2',
  runtimeVersion: { policy: 'appVersion' },
  updates: { url: 'https://u.expo.dev/30422aec-d22b-40f0-8008-c6a316633fd8' },
  scheme: `vima${suffix.replace('.', '-')}`,
  platforms: ['ios', 'android'],
  icon: './assets/brand/vima_app_icon_final_1024.png',
  ios: {
    bundleIdentifier: `com.kingghhidorahx12.vima${suffix}`,
    icon: './assets/brand/vima_app_icon_final_1024.png',
  },
  android: {
    package: `com.kingghhidorahx12.vima${suffix}`,
    icon: './assets/brand/vima_app_icon_final_1024.png',
    adaptiveIcon: {
      foregroundImage: './assets/brand/vima_app_icon_final_1024.png',
      backgroundColor: '#0B0F0E',
    },
  },
  plugins: [
    'expo-router',
    ['expo-dev-client', { addGeneratedScheme: variant === 'development' }],
    '@maplibre/maplibre-react-native',
    'expo-secure-store',
    'expo-sqlite',
    'expo-font',
    'expo-image',
    ['expo-splash-screen', {
      image: './assets/brand/vima_splash_lockup_final.png',
      imageWidth: 280,
      resizeMode: 'contain',
      backgroundColor: '#FFFFFF',
      android: { imageWidth: 183 }, // Alpha geometry inside Android's 192dp safe circle; npm run check:splash.
    }],
    ['expo-location', { isAndroidBackgroundLocationEnabled: false, isAndroidForegroundServiceEnabled: false,
      isIosBackgroundLocationEnabled: false }],
  ],
  experiments: { typedRoutes: true },
  // SDK 57 defaults to Hermes and RN 0.86 is New Architecture only.
  // The legacy jsEngine/newArchEnabled config fields have been removed.
};

export default config;
