// Metro bundler config cho React Native (Expo SDK 58).
//
// CAN THIET: thu vien "mqtt" phai dung ban dung cho trinh duyet (browser build).
// Ban build cho Node.js (build/index.js) se require("url"), require("net"),
// require("tls") -> loi "Unable to resolve module url" khi bundle cho Android/iOS.
//
// resolverMainFields: ["browser", "react-native", "module", "main"]
//   -> lay "browser" truoc (mqtt se dung ban khong can Node built-in modules),
//      nhung VAN phai giu "react-native" truoc "module"/"main" de cac file
//      cua React Native 0.88 (vi du react-native/react-private-interface)
//      resolve duoc. SDK 58 dua "react-native" vao exports map nen
//      unstable_enablePackageExports phai bat.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver = {
  ...config.resolver,
  resolverMainFields: ["browser", "react-native", "module", "main"],
  // Bat exports map de cac package (react-native, mqtt...) resolve dung
  unstable_enablePackageExports: true,
};

module.exports = config;
