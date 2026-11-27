module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const pushEnabled = !!googleServicesFile || process.env.ANDROID_PUSH_ENABLED === "1";

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      ...(androidMapsKey ? { runtimeVersion: `${config.version}-android-maps` } : {}),
    },
    extra: { ...config.extra, androidPushEnabled: pushEnabled, androidMapsEnabled: !!androidMapsKey },
    plugins: [
      ...(config.plugins ?? []),
      ...(pushEnabled ? [["expo-notifications", { defaultChannel: "marketplace-updates" }]] : []),
      ...(androidMapsKey ? [["react-native-maps", { androidGoogleMapsApiKey: androidMapsKey }]] : []),
    ],
  };
};
