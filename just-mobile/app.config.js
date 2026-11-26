module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  if (!googleServicesFile) return config;

  return {
    ...config,
    version: "1.0.3",
    android: { ...config.android, versionCode: 3, googleServicesFile },
    extra: { ...config.extra, androidPushEnabled: true },
    plugins: [...config.plugins, ["expo-notifications", { defaultChannel: "marketplace-updates" }]],
  };
};
