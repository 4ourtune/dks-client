const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);

// Remove deprecated options from default config to avoid warnings
if (defaultConfig.server) {
  delete defaultConfig.server.runInspectorProxy;
}

const config = {
  server: {
    port: 8082,
  },
};

module.exports = mergeConfig(defaultConfig, config);
