# Phase 10 — counter hardening, UAT and go-live

**Six of the ten sub-phases are done. Four cannot be done from a development
machine, and are written up as procedures instead of results.** The dividing
line is the tablet: everything that can be settled in code, in the database or
on paper is settled; everything that needs the hardware, the hospital Wi-Fi or
two real pharmacists is prepared and waiting.

| # | Sub-phase | State |
| --- | --- | --- |
| 10.1 | Kiosk / lock-task mode | **Half done** — manifest and Back guard shipped; the native `startLockTask()` call is not written. `tools/KIOSK-SETUP.md` |
| 10.2 | Crash & error reporting + diagnostics | **Done** |
| 10.3 | Performance pass | **Done** at the logic layer; frame timing needs the device |
| 10.4 | Soak test | **Procedure only** — `docs/SOAK-TEST.md`. Needs two unbroken hours on the tablet |
| 10.5 | **Data-integrity validation** | **Done** — `tools/verify_dispense_integrity.php`, run live, tablet column clean |
| 10.6 | HIPAA audit verification | **Done** — and it found that dispensing wrote no audit rows at all |
| 10.7 | Pharmacist UAT | **Script only** — `docs/UAT-SCRIPT.md`. Needs two pharmacists |
| 10.8 | Training & quick reference | **Done** — `docs/COUNTER-CARD.md` |
| 10.9 | Pilot at one counter | Blocked on 0.1, 0.2, 10.4 and 10.7 |
| 10.10 | Rollout | Blocked on a clean pilot |

---

## 10.5 — Data-integrity validation

`tools/verify_dispense_integrity.php` is read-only, opens no transaction, and is
safe to run against the live database as often as you like. It walks every
dispensing and asserts the invariants the dispensing path is supposed to keep,
then **reports the failures grouped by client**.

That grouping needed something that did not exist. The tablet and the desktop
post to the same endpoints as the same accounts, so **nothing in the database
said which of the two made a dispensing** — and "compare tablet dispensings
with desktop dispensings" was therefore impossible to even ask. Three pieces
close that:

- the tablet sends `X-Client-Channel: tablet` and a matching `User-Agent`
- `backend/app/Core/Channel.php` resolves the header, then the agent, then CLI
- `prescription_dispenses.created_via` records it
  (`backend/database/schema/332_dispensing_client_channel.sql`, applied, and
  idempotent — re-running it is a no-op)

The value is a **claim made by the client**, not proof. It is fit for
operational attribution during a pilot and useless as a security control;
nothing is authorised on it. `DispensingService::ensureChannelColumn()` adds
the column at runtime if the migration was never applied, guarded by a static
flag and called **before** the transaction opens — because DDL implicitly
commits in MySQL, and that is precisely the bug that made dispensing
non-atomic in Phase 4.

### What it checks

Numbering and placeholders · orphaned dispensings, items, charges and movements
· one `dispensed` stock movement per medicine line, with the matching sign and
quantity · an undone dispensing reversing every line to a net of zero · one
charge per prescription line, with `quantity x unit_price`, the discount
arithmetic and the net · the header totals equalling the sum of its charges ·
voided dispensings cancelling their charges and recording who and why · the
high-alert second check being present and by a different person · payments
never exceeding the net · no line given more than prescribed, per fill, using
**the dispensing service's own quantity parsing** so it cannot drift from the
rule enforced at the counter · stock never negative · every lot's movements
adding up to what is on the shelf · closed prescriptions staying closed · refill
requests answered by a real dispensing.

### What it found

Run against all 11 dispensings in the database:

```
By client
  tablet        3 dispensing(s)   clean
  unknown       8 dispensing(s)   4 finding(s)
```

All four findings trace to **one hand-inserted row**, `DSP-TEST-1792679961`,
written straight into the database on 22 October — it kept its placeholder
dispense number, its prescription line no longer exists, it was never charged,
and the lot it came from is 10 short in the ledger. It is in no file in this
repository; it is somebody's SQL test fixture. It is also a good advertisement
for the validator: that is exactly the shape of damage hand-written SQL leaves,
and it is why Phase 8 refused to fake `partial` and `closed` prescriptions the
same way.

One finding is reported but does **not** fail the run: `DSP-2026-00201` was
second-checked but nothing in it is high-alert today. That is honest about a
limit — `drugs.is_high_alert` is current state while `check_status` is a
historical fact, and nothing records the flag as it stood at the time, so a
mismatch can equally mean a skipped check or a Drug Catalog edit since. The
direction that could hide a missed safety step is still reported for a human;
the harmless one is information.

### The paths, exercised

The first run said `multi-lot`, `high-alert` and `closed` were **not
exercised** — "not exercised means not verified. These paths have no rows to
check, so the invariants for them are untested, not satisfied." So they were
exercised, as the tablet, through the real services, and then undone:

| Path | How | Result |
| --- | --- | --- |
| Partial | 50 of a prescribed 150 | `partial`, stamped `tablet` |
| Multi-lot | the remaining 100, more than one lot holds | spanned 2 lots, `dispensed` |
| High-alert | insulin glargine | `awaiting`; the preparer was refused; a second user passed it |
| Payment | ₱7,200 in full, then ₱1 more | accepted, then refused |
| Voided | undoing all three | stock back, charges cancelled, refund flagged |

All three tablet dispensings came out clean. Then they were voided, the
prescriptions cancelled and the test payment row removed, so the only residue
is voided history — which is retained by design.

**`closed` is still unexercised.** `close()` has no reverse, so creating one
would leave a permanently closed prescription in the database to prove a point.
Close one from the desktop during UAT and re-run the validator.

---

## 10.6 — HIPAA audit verification

The sub-phase was *"confirm every tablet action writes the expected
`hipaa_audit_logs` rows."* It did not. **The entire Dispensing module contained
no audit logging at all** — not one call to `AuditLogger` in nine files.
Handing a controlled medicine to a patient, undoing it, closing a prescription,
taking payment, printing a label: none of it was in the audit trail. That was
true of the desktop HMS too, since it is the same service.

Now logged, in `DispensingService` **after the transaction commits** (an audit
row states what happened; failing to write one must never undo medicine that
has already left the shelf):

| Action | Category |
| --- | --- |
| `DISPENSE_MEDICINE` | `CLINICAL_DATA` |
| `VOID_DISPENSE` | `CLINICAL_DATA` |
| `SECOND_CHECK_DISPENSE` | `CLINICAL_DATA` |
| `CLOSE_PRESCRIPTION` | `CLINICAL_DATA` |
| `RECORD_PHARMACY_PAYMENT` | `CLINICAL_DATA` |
| `REQUEST_PRESCRIPTION_REFILL` / `DECLINE_PRESCRIPTION_REFILL` | `CLINICAL_DATA` |

and in `DispensingController`, for reads and prints:

| Action | Category |
| --- | --- |
| `VIEW_CHART` — opening a prescription | `CHART_ACCESS` |
| `PRINT_MEDICINE_LABELS` | `EXPORT_PRINT` |
| `PRINT_PHARMACY_CHARGE_SLIP` | `EXPORT_PRINT` |

Reads and prints are logged in the **controller**, not the service, because
`chargeSlip()` calls `labels()` internally — logging there would record two
prints for one.

Two deliberate choices:

- **The queue is not logged.** It polls every 30 seconds. Logging it would add
  roughly a thousand rows per tablet per shift and bury the rows that say who
  opened whose record. Opening a specific patient's prescription is logged;
  looking at the board is not.
- **The description names the record, never the patient.** `patient_id` is
  already a column; repeating the name would put more PHI in the log than the
  log needs. A row reads:

  > `Dispensed DSP-2026-00206 against prescription RX-2026-00319 from Main Pharmacy: 1 medicine line(s), 1 lot movement(s), net PHP 7,200.00, high-alert, awaiting second check (from the pharmacy tablet).`

Verified live: 3 of 3 tablet dispensings in the trail, each with the acting user
and role, the patient id, the tablet's own user agent, the client named in the
description, and no patient name anywhere.

### A finding that is not mine to fix

`hipaa_audit_logs` carries a SHA-256 hash chain, and
`AuditLogger::verifyIntegrity()` says it is **broken at row #11, dated 21
September 2026** — a month before this app existed. A full scan puts **604 of
1,680 rows** off the chain, scattered throughout rather than at one point,
which reads like many rows written by a path that computes the payload
differently, or racing writers reading the same previous hash, rather than one
tampering event. The five rows this phase added chain correctly: the break
count was 604 before and 604 after.

**The chain has not been repaired, and should not be.** Recomputing the hashes
would erase the only evidence of what happened and is indistinguishable from
tampering. It needs investigating by date against who had access. Until then,
the trail's tamper-evidence is void from 21 September onwards — which is a
HIPAA finding the hospital owns, and worth raising before a pilot puts more
PHI access through it.

---

## 10.1 — Kiosk mode

A dispensing tablet must not be a general-purpose Android device: a
prescription with a name, a diagnosis and a medicine list is on that screen, and
a patient leaning over the counter can see it.

**Shipped:**

- `plugins/withKioskAndroid.js` — an Expo config plugin putting
  `android:lockTaskMode="if_whitelisted"`, `resizeableActivity="false"`,
  `immersive="true"` and `excludeFromRecents="true"` on the main activity.
  `if_whitelisted`, deliberately, not `always`: `always` would lock a debug
  build into an app nobody can leave on a device with no device owner to
  release it. The transform is exported pure and has 15 assertions against it,
  including that it throws rather than quietly producing a non-kiosk APK.
- the hardware **Back** button never leaves the app. Inside, it goes back a
  screen; at the first screen Android's default is to exit to the launcher,
  which would put a signed-in pharmacy session behind whatever the next person
  opens.
- immersive status and navigation bars in `app.json`.

**Not shipped:** the native `DevicePolicyManager.setLockTaskPackages()` +
`startLockTask()` call. With the manifest attribute and a device owner set,
Android enters lock task when the app asks — and nothing asks yet. So Option B
in `tools/KIOSK-SETUP.md` is half done: manifest ready, provisioning
documented, native call unwritten. **Start the pilot on screen pinning**
(Option A, one minute, no wipe) and add the native module during it — it is the
part that cannot be tested without the hardware anyway.

Kiosk mode stops someone **leaving** the app. It does nothing about the person
already in it, which at a shared counter is the likelier problem. That is the
three-minute idle lock, which is separate and always on.

---

## 10.2 — Crash reporting and diagnostics

**No crash-reporting service.** Sentry and Crashlytics work by posting the
error, its stack and whatever context the app attached to someone else's
servers — and on this app that context is a prescription. Sending it off-site
is a disclosure to a business associate; that is a decision for the hospital's
HIPAA officer and a signed BAA, not a library default.

So `src/api/crashLog.js` keeps crashes **on the device**, in memory, wiped on
restart, and sends nothing anywhere. It still redacts, because someone will
photograph the Diagnostics screen and send it to IT over a chat app: patient
numbers, Rx and DSP numbers, e-mail addresses, `PHPSESSID` and any run of six
or more digits are masked **keeping their shape** (`RX-••••`, not
`[redacted]`), because the shape is what leaves the message readable as a bug
report. Short numbers survive — `expected 2 lots, got 0` and `server returned
422` are the useful part.

- `ErrorBoundary` around the content area, not the whole app, so a render error
  in Reports does not take the rail and the identity bar with it and "Reload
  this screen" leaves the pharmacist where they were. It shows no stack: the
  pharmacist cannot act on one and it may carry a patient's details. It says
  the two things that matter at a counter — that anything already saved is
  safe, and to check the prescription's history before giving again.
- a global handler for throws outside render (timers, handlers, rejected
  promises) that records and then **hands straight back** to the previous
  handler, so the development red screen and the production crash both still
  happen. Swallowing them would hide the error from everyone.
- a **Diagnostics** screen (rail: *Status*) showing version, platform, device,
  build type, server address, whether the transport is HTTPS, the request
  timeout, a connection test with its latency, who is signed in, whether a
  checker session is open, the idle lock, whether the wristband scan is
  required, and the crash list. **No patient data at all** — it is the one
  screen likely to be photographed.

It does not claim to know whether Android has the app pinned. That cannot be
read from JS without a native module, so the screen says so and tells you to
press Home instead.

---

## 10.3 — Performance pass

Two real problems at the 300-row cap, both about re-rendering rather than
first paint:

1. **`DataTable` rebuilt every mounted row on every keystroke.** FlatList calls
   `renderItem` again for each mounted row whenever its identity changes, and
   `QueueScreen` rebuilt its `columns` array on every render — which includes
   every character typed into the search box. The row is now a `React.memo`
   component and the columns are a `useMemo`, so a keystroke no longer re-renders
   twenty rows of cells. The memo compares `item` by identity on purpose:
   react-query replaces row objects when the data changes and keeps them when it
   does not, so identity *is* the "has this row changed" signal.
2. **`rowFlags()` and `medicineSummary()` ran inside each row's render.** Now
   `queueViews.rowModel()` works a row's display out once and caches it in a
   `WeakMap` keyed on the row object — a WeakMap so the models, and the patient
   names in them, are not kept alive after the queue has moved on.

Measured over 300 rows: **0.25 ms to build all the models, 0.020 ms per
re-render** — 12× cheaper, and the test asserts the ratio rather than a wall
time, so it does not become a flaky benchmark on a slower machine.

Also tuned the list for a landscape tablet (`initialNumToRender` 20,
`maxToRenderPerBatch` 20, `windowSize` 11, `removeClippedSubviews`), since the
phone-shaped defaults leave blank space on first paint and while flinging.

**What this does not tell you:** actual frame timing on the tablet. These are
logic-layer measurements. Whether the split view is usable at your tablet's
width, and whether scrolling 300 rows is smooth on a 2 GB device, needs the
device.

---

## Verification

| | |
| --- | --- |
| JS suites | **13 suites, 467 assertions, all passing** |
| New this phase | `crash_test` (49), `rowmodel_test` (29), `kiosk_test` (15) |
| Live database | the validator run before, during and after the path exercise |
| Audit trail | 5 rows read back in full and checked field by field |
| Bundle | clean, exit 0, 2.72 MB Android bundle |
| Migration | applied, then re-run to prove it is idempotent |

---

## What stands between here and Milestone 1

Nothing in code. Four things needing the world:

1. **A tablet.** Phase 0.1. Nothing in this app has ever run on hardware, and
   the camera's barcode decoding has never been exercised at all. It has been
   flagged every phase since Phase 1 and it is still the biggest unknown.
2. **HTTPS and a stable hostname.** Phase 0.2. `.env` points at `127.0.0.1`,
   and the Diagnostics screen will say *"HTTP — not safe for a pilot"* until
   that changes. Prescriptions crossing hospital Wi-Fi in the clear is a
   blocker, not a note.
3. **The soak test** (`docs/SOAK-TEST.md`) — two unbroken hours.
4. **Pharmacist UAT** (`docs/UAT-SCRIPT.md`) — two pharmacists, a test
   database, the real counter. Case 7.2 (Wi-Fi dropped mid-dispense, three
   times, checking the history each time) is the most important case in the
   document.

And one thing the hospital should decide separately: **the broken audit hash
chain**. It is not a tablet problem, it predates this app by a month, and it is
the kind of finding that matters more at an audit than anything in this phase.
