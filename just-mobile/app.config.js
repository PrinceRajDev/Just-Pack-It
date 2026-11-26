module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  if (!googleServicesFile && process.env.ANDROID_PUSH_ENABLED !== "1") return config;

  return {
    ...config,
    version: "1.0.3",
    android: { ...config.android, versionCode: 3, ...(googleServicesFile ? { googleServicesFile } : {}) },
    extra: { ...config.extra, androidPushEnabled: true },
    plugins: [...config.plugins, ["expo-notifications", { defaultChannel: "marketplace-updates" }]],
  };
};
