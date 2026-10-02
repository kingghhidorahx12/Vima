const { createRunOncePlugin } = require('expo/config-plugins');
const withMaps = require('react-native-maps/app.plugin').default;
const { version } = require('react-native-maps/package.json');

// Keep the SDK key in android.config (excluded from public Expo config), never plugin options.
module.exports = createRunOncePlugin((config) => withMaps(config, {
  androidGoogleMapsApiKey: config.android?.config?.googleMaps?.apiKey,
}), 'react-native-maps', version);
