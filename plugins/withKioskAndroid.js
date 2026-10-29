const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Phase 10.1 -- make the tablet hold still.
 *
 * A dispensing counter tablet must not be a general-purpose Android device.
 * The pharmacist should not be able to swipe into a browser, and nor should a
 * patient leaning over the counter: a prescription with a name, a diagnosis
 * and a medicine list is on that screen.
 *
 * Android gives three ways to do this, and only the third is really a kiosk:
 *
 *   1. Screen pinning, turned on by the person holding the tablet. One tap to
 *      start, a long press on Back + Overview to leave. No code at all. Good
 *      enough to stop an accidental swipe, useless against someone who wants
 *      out.
 *   2. LOCK TASK MODE with the app whitelisted by a device owner. The app
 *      calls startLockTask() and Android refuses Home, Overview, the status
 *      bar shade and notifications. Leaving needs the device owner, not a
 *      gesture. This is what a hospital actually wants.
 *   3. A full MDM / COSU deployment. Correct for a fleet, much more than one
 *      pilot counter needs.
 *
 * This plugin prepares the MANIFEST side of (2), which is all that can be done
 * from the app's own source:
 *
 *   android:lockTaskMode="if_whitelisted"  the activity enters lock task
 *                                          automatically when a device owner
 *                                          has whitelisted this package, and
 *                                          behaves normally when none has --
 *                                          so a plain debug build still runs.
 *   android:resizeableActivity="false"     no split screen, no freeform window
 *                                          beside another app.
 *   android:immersive="true"               full screen, system bars hidden.
 *   android:excludeFromRecents="true"      the app does not sit in Overview as
 *                                          a card someone can flick away.
 *
 * The other half -- making this tablet a device owner and whitelisting the
 * package -- is a provisioning step on the device itself and cannot live in
 * the source. tools/KIOSK-SETUP.md has those commands.
 *
 * Nothing here REPLACES the idle lock. Lock task stops someone leaving the
 * app; the three-minute idle lock stops the person who is already in it
 * reading the last patient's prescription. They solve different problems.
 */

/** The attributes a kiosked main activity carries. Exported for testing. */
const KIOSK_ACTIVITY_ATTRIBUTES = {
  'android:lockTaskMode': 'if_whitelisted',
  'android:resizeableActivity': 'false',
  'android:immersive': 'true',
  'android:excludeFromRecents': 'true',
};

/**
 * Apply the kiosk attributes to a parsed AndroidManifest.
 *
 * Pure: takes the manifest object, returns it changed. Separated from the
 * Expo plugin wrapper so it can be tested without running a prebuild.
 *
 * @param {Object} manifest the `manifest` object from @expo/config-plugins
 * @returns {Object} the same manifest, with MainActivity kiosked
 * @throws {Error} when there is no launcher activity to apply it to -- failing
 *   loudly beats producing an APK that silently is not a kiosk
 */
function applyKioskManifest(manifest) {
  const application = manifest?.manifest?.application?.[0];
  if (!application) throw new Error('withKioskAndroid: no <application> in AndroidManifest.xml');

  const activities = application.activity || [];
  const main = activities.find(
    (a) => a?.$?.['android:name'] === '.MainActivity'
  ) || activities[0];

  if (!main) throw new Error('withKioskAndroid: no activity to put into lock task mode');

  main.$ = { ...main.$, ...KIOSK_ACTIVITY_ATTRIBUTES };
  return manifest;
}

module.exports = function withKioskAndroid(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = applyKioskManifest(cfg.modResults);
    return cfg;
  });
};

module.exports.applyKioskManifest = applyKioskManifest;
module.exports.KIOSK_ACTIVITY_ATTRIBUTES = KIOSK_ACTIVITY_ATTRIBUTES;
