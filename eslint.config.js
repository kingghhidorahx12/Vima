const { defineConfig } = require('eslint/config');
const expo = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expo,
  { ignores: ['dist/**', '.validation/**', 'android/**', 'ios/**'] },
  {
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['src/motion/haptics.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: 'expo-haptics', message: 'Use src/motion/haptics semantic events.' }],
        patterns: ['@gorhom/bottom-sheet', 'nativewind', 'react-native-paper', 'tamagui'],
      }],
    },
  },
]);
