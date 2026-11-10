// ====== PER-APP LICENSE SETTINGS ======
// PROJECT_CODE must match the code registered in the License Hub / Generator. Never put a private key here.
// Run `npm run license:project` once: it creates the keypair (.license/, git-ignored) and writes the PUBLIC key below.
export const PROJECT_CODE = "processhub360";
export const PUBLIC_KEY_HEX = "8f8e560ea62f0706fae0c6acf097c668f1713b89341b871f295c343164f9c21e";
// =======================================
// DEVICE_PREFIX: app name at the start of the Device ID ("ProcessHub-87A9-F285-E2DF"); unique per app so licenses never cross apps.
export const DEVICE_PREFIX = "ProcessHub";
// Keep true if any customer already holds a license bound to the old 20-hex ID. Set false once all have new ones.
export const ACCEPT_LEGACY_DEVICE_ID = true;
// Licenses from the old RetailX License Hub carry no project_code. Accept them while the Hub is not updated:
// they must still have a valid signature AND a machine_id that starts with DEVICE_PREFIX (see legacy.ts).
// Set to false once the Hub puts project_code "processhub360" in every ProcessHub license.
export const ACCEPT_LEGACY_NO_PROJECT_CODE = true;
export const KEY_CONFIGURED = /^[0-9a-fA-F]{64}$/.test(PUBLIC_KEY_HEX);
/** Development only: set EXPO_PUBLIC_LICENSE_BYPASS=1 when running `expo start`. Always false in release builds (__DEV__ is false). */
export const DEV_BYPASS = typeof __DEV__ !== "undefined" && __DEV__ && process.env.EXPO_PUBLIC_LICENSE_BYPASS === "1";
