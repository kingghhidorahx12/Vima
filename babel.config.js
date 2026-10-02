module.exports = function (api) {
  api.cache(true);
  // Expo SDK 57 configures the Worklets plugin in this preset.
  return { presets: ['babel-preset-expo'] };
};
