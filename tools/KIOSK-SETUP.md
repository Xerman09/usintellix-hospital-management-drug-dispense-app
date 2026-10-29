# Locking the tablet down (Phase 10.1)

The app's half of this is in `plugins/withKioskAndroid.js` and is already in
every build. This is the other half: the tablet has to be told that this app is
allowed to take the screen. That cannot come from the app's own source — by
design, or any app could do it.

Pick one of the two. The first takes a minute; the second is what a hospital
should run.

---

## Option A — Screen pinning (good enough to start the pilot)

No provisioning, no wiping. The pharmacist does it.

1. **Settings → Security → Advanced → Screen pinning** → on.
   Turn **"Ask for PIN before unpinning"** on as well, or anyone can leave with
   a two-finger long press.
2. Open USIntellix Pharmacy.
3. Press **Overview** (the square), then the **pin icon** on the app's card.

What it gives you: Home and Overview stop working, and the hardware Back button
is already blocked by the app itself. Leaving needs the device PIN.

What it does not give you: the notification shade still pulls down, and a
determined person who knows the PIN is out in two seconds. Fine for a pilot
counter with a pharmacist standing at it. Not fine for a tablet left alone.

**It has to be re-pinned after every reboot.** Put that on the counter card.

---

## Option B — Device owner + lock task mode (the real thing)

Lock task mode is what `android:lockTaskMode="if_whitelisted"` in the manifest
is waiting for. Until a device owner whitelists the package the attribute does
nothing at all, which is why a debug build still behaves like a normal app.

### Before you start

- **The tablet must have no accounts on it.** Android refuses to set a device
  owner once a Google account exists. In practice: factory reset, then skip
  every sign-in prompt during setup. Do this before anyone's e-mail is added.
- USB debugging on, `adb devices` showing the tablet.
- The APK installed.

### Steps

```bash
adb install -r pharmacy-tablet.apk
adb shell dpm set-device-owner com.usintellix.pharmacytablet/.MainActivity
```

If that second command answers `Not allowed to set the device owner because
there are already some accounts on the device`, an account slipped in. Factory
reset and try again — there is no way around it.

The app then needs to whitelist itself and start lock task. That is a native
call (`DevicePolicyManager.setLockTaskPackages` plus `Activity.startLockTask`),
so it needs a small native module added to the project. **It is not in this
build.** With the manifest attribute alone and a device owner set, Android
enters lock task when the app asks — and nothing in the app asks yet.

So Option B is **half done**: the manifest is ready, the provisioning is
documented, the native call is not written. Starting the pilot on Option A and
adding the native module during the pilot is the sensible order, because the
native module is the part that cannot be tested without the hardware anyway.

### Undoing it

```bash
adb shell dpm remove-active-admin com.usintellix.pharmacytablet/.MainActivity
```

A device owner survives a normal uninstall. If you hand the tablet to someone
else, remove it or factory reset.

---

## What kiosk mode does NOT do

It stops someone **leaving** the app. It does nothing about the person already
in it — and at a shared counter that is the likelier problem: a pharmacist
walks away and the next person reads the last patient's prescription.

That is the **three-minute idle lock**, which is separate, always on, and has
nothing to do with any of the above. Both, or neither is worth much.

---

## Checking it

There is no API to ask Android "am I pinned?" without a native module, so the
Diagnostics screen does not pretend to know. Check it the way a pharmacist
would:

| Press | If it is locked down |
| --- | --- |
| Back, on the queue | nothing happens |
| Back, in a prescription | goes back to the queue |
| Home | nothing happens |
| Overview | nothing happens |
| Swipe down from the top | nothing happens (Option B only) |
