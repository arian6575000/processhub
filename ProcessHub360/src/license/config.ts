// ====== PER-APP LICENSE SETTINGS ======
// PROJECT_CODE must match the code registered in the License Hub / Generator. Never put a private key here.
// Run `npm run license:project` once: it creates the keypair (.license/, git-ignored) and writes the PUBLIC key below.
export const PROJECT_CODE = "processhub360";
export const PUBLIC_KEY_HEX = "8f8e560ea62f0706fae0c6acf097c668f1713b89341b871f295c343164f9c21e";
// =======================================
export const KEY_CONFIGURED = /^[0-9a-fA-F]{64}$/.test(PUBLIC_KEY_HEX);
/** Development only: set EXPO_PUBLIC_LICENSE_BYPASS=1 when running `expo start`. Always false in release builds (__DEV__ is false). */
export const DEV_BYPASS = typeof __DEV__ !== "undefined" && __DEV__ && process.env.EXPO_PUBLIC_LICENSE_BYPASS === "1";
