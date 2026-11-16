// Metro bundler config cho React Native (Expo).
//
// CAN THIET: thu vien "mqtt" phai dung ban dung cho trinh duyet (browser build).
// Ban build cho Node.js (build/index.js) se require("url"), require("net"),
// require("tls") -> loi "Unable to resolve module url" khi bundle cho Android/iOS.
//
// resolverMainFields: ["browser", "module", "main"]  -> lay "browser" truoc,
// giup Metro chon file da dong goi cho web (khong can Node built-in modules).
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver = {
  ...config.resolver,
  resolverMainFields: ["browser", "module", "main"],
  // Mot so thu vien can fallback ve ban CommonJS
  unstable_enablePackageExports: false,
};

module.exports = config;
