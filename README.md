# USIntellix Pharmacy Tablet

React Native (Expo) tablet app for medicine dispensing, on top of the existing
USIntellix HMS pharmacy backend.

- **Roadmap:** [ROADMAP.md](ROADMAP.md) — architecture decisions and backend findings
- **Full phase list:** [PHASES.md](PHASES.md) — 15 phases, every endpoint mapped
- **Phase 0:** [PHASE-0-STATUS.md](PHASE-0-STATUS.md) — environment readiness
- **Current state: Phase 9 complete** — the whole counter workflow, plus **dashboard and reports**.
  Only Phase 10 (hardening, UAT, pilot) stands between this and Milestone 1.

---

## What works today

Nothing is reachable without signing in. The app handles every way the backend
can answer a login:

| Backend response | What the app does |
| --- | --- |
| `200 data.user` | signs in (role-checked) |
| `200 data.requires_2fa` | 6-digit code step, with resend cooldown |
| `200 dev_mode` | shows the code **and** warns that mail is unconfigured |
| `401 locked` | lockout notice with a minute countdown |
| `401 password_expired` | 90-day renewal form |
| `401 password_breached` | compromised-credential replacement |
| `401 errors` | per-field validation messages |
| `401` (bad / suspended / decommissioned) | the server's own message |
| `must_change_password` | forced first-login setup |

Plus: role guard (a `patient` is sent to the Patient app, any other role
refused), session restored from secure storage on launch and revalidated
against `/auth/me`, a 3-minute idle lock, the signed-in pharmacist's name on
every screen, and a 401 from anywhere returning to sign-in.

After signing in, the **live dispensing queue**:

- All nine backend views as chips — To fill, To verify, Awaiting check,
  Refills, Partly filled, Expired, Dispensed, Closed, All — each showing the
  backend's own backlog count, not the length of the loaded page
- Debounced search over Rx number, patient name and patient number
- Row badges: dispense status (using the backend's `status_label`), awaiting
  second check, dangerous drug, expired, refill requested, not verified,
  nothing to fill
- Polls every 30s with a live "Updated 12s ago", because the desktop HMS works
  the same prescriptions; the 300-row cap is surfaced rather than hidden
- Prescription detail: safety header first (allergies, high-alert, dangerous
  drug, duplicate therapy, why it cannot be filled), then each medicine line
  with prescribed / given / still-owed, which fill is under way, and how much
  usable stock exists

And **dispensing works**: pick a location, enter quantities on the NumPad, choose
a lot or let the server allocate, then dispense. Plus undoing a dispensing
(void), closing a prescription, and the dispensing history per prescription.

### Three backend rules that shape the dispensing screen

1. **One location per dispensing.** `dispense()` takes a single `warehouse_id`
   and only sees lots there, so the location is chosen first — the sheet ranks
   locations by how many of the prescription's medicines each can fully cover.
2. **Splitting across lots is automatic, not manual.** Omit `lot_id` and the
   server takes earliest-expiry-first across every usable lot at that location,
   splitting a line as needed. Pin a `lot_id` and *only* that lot is used — if
   it is short the line is refused rather than topped up. The same line twice in
   one request is rejected, so a client cannot describe its own split. "Earliest
   expiry first" is therefore the default, and the picker previews exactly which
   lots will be drawn from.
3. **FEFO order is `expires_date IS NULL, expires_date, id`** — dated lots
   first, soonest first, undated last. `fefoCompare()` reproduces it exactly so
   the preview cannot disagree with what the server does.

### Payment, discounts and the charge slip

Payment is taken per dispensing — from the success screen straight after
dispensing, or later from the dispensing history, where each entry shows `PAID`
or how much is still due. Partial payments are allowed and the remaining
balance is the server's figure, not arithmetic done here.

**The order is enforced, not explained.** A dispensing whose high-alert second
check is still outstanding cannot be paid for: it has not been handed over yet,
the backend refuses it, and the sheet offers no way to send it.

Discounts are applied on the **dispense** call, not the payment:

| Discount | Rate | Requires |
| --- | --- | --- |
| Senior Citizen (RA 9994) | 20% | ID number **and patient aged 60+** |
| PWD (RA 10754) | 20% | ID number |
| Other | 0–100% | a rate and a written reason |

The senior **age rule** is checked on the tablet as well as the server, using
the patient's age from the detail payload, so the pharmacist is told before the
whole dispensing is rejected. An unknown age is left to the server.

The charge slip shows on screen for the patient to read — printing is out of
scope, and the desktop HMS prints the same slip from the same endpoint. Totals
are the server's figures rather than re-added from the lines: each line is
rounded and then the dispensing total is rounded, so re-adding could disagree
by a centavo on a discounted slip, and a receipt that does not add up is worse
than no receipt.

**A paid-then-voided dispensing shows a refund due.** The server returns a
negative balance there — the charges are cancelled but the money was taken.
Clamping that to zero and calling it "settled" would quietly hide money owed
back to the patient, so the slip names it and says to refund through billing.

### Refills: dispensing one is not requesting one

Two different actions, and the app keeps them apart:

- **Dispense a refill** — the patient is here, so give it now. Done from the
  dispensing sheet (`item.can_refill`).
- **Record a refill request** — the patient is *not* here; they rang, or someone
  asked for them. The pharmacy fills it later.

Both need the current fill finished and a refill left inside the refill period.
Requesting also needs no request already waiting, because the backend allows one
pending request per medicine. A *declined* request does not block a new one.

Pending requests appear on the prescription and in the queue's **Refills** view.
**A decline needs a reason and the patient sees it** — the backend says so
explicitly, so the prompt does too.

### Clinical verification (read-only)

The verification screen reads **two sources**, because neither alone is the list
a pharmacist wants:

| Tab | Source | Why |
| --- | --- | --- |
| To verify | the queue's `to_verify` view | A prescription with **no verification record at all** cannot appear in a list of records — and those are exactly the ones needing attention |
| On hold | records with `Rejected` / `Intervention Needed` / `Clarification Requested` | `dispense()` refuses these outright, so a prescription that "won't dispense" is findable |
| Approved | records with `Approved` | for looking back |

Recording a decision stays on the desktop (Phase 8.4): the form covers renal
function, weight-based dosing, indication and interaction cross-checks — a
sit-down job, not a counter one. The screen says so rather than hiding it.

### Dashboard and reports

A **Dashboard** (stock value, low stock, expiry buckets, transfers, work
waiting, last stock movements) plus the four pharmacy reports: **dispensing
log**, **dangerous drugs register**, **unfilled prescriptions** and **by
prescriber**. Shared date-range presets and location/prescriber filters come
from `/pharmacy-reports/options`.

Two details that are not just rendering rows:

- **Expiry buckets are labelled from the server's own thresholds**
  (`expiry_soon_days` / `expiry_watch_days`), so the wording cannot drift from
  the numbers the dashboard actually used.
- **"All time" omits the date keys entirely** rather than sending empty
  strings — the server reads a missing key as "no limit", which is not the same
  thing as an empty one.

**The dangerous drugs register leads with its verdict.** Its purpose is whether
the book balance matches the shelf, so anything that does not reconcile is
pulled to the top, sorted by the size of the discrepancy, and stated with both
figures ("2 capsule shortfall: the register says 150, the shelf has 148"). A
controlled-substance discrepancy is a legal matter, not a rounding nuisance, so
it is never softened — and a surplus is reported as plainly as a shortfall. The
server's own `reconciled` flag wins over the tablet's arithmetic where they
disagree.

### Scanning

Three scan points, each backed by a lookup that returns a **verdict**, not just
a match — the server compares what was scanned against what the pharmacist is
about to do:

| Scan | Where | Matched on |
| --- | --- | --- |
| Rx number | queue → opens that prescription | `prescriptions.rx_number`, exactly |
| Wristband | dispensing sheet, before handover | `patients.patient_no` |
| Pack barcode or lot | dispensing sheet, per medicine | `drugs.barcode` (EAN-13) then `drug_inventory_lots.lot_number` |

`patients.id_document_number` is deliberately **not** searchable: it is
field-level encrypted, and a passport or national ID number is not something a
pharmacy counter should be able to look up. The patient scan returns age rather
than date of birth, for the same reason — it is an identity check, not a chart.

**A mismatch is refused, not merely reported.** Each verdict carries a severity,
and `STOP` blocks the dispense button: wrong patient, wrong medicine, a lot
that is expired or under recall, a pinned lot that is not the pack in hand, or a
scan the server could not check at all. `ScanButton` never hands a `STOP` to its
caller via `onAccept`, so a mismatch cannot be mistaken for a pass; it reports
it through `onVerdict` instead, which is what keeps the dispense blocked even if
the sheet is simply closed. Changing a quantity or lot clears that line's scan,
because the earlier scan no longer describes what is about to be dispensed.

`WARN` is not a refusal — a cancelled or closed prescription still opens, since
the pharmacist needs to see why it cannot be filled.

Barcode types are limited to what pharmacy labels carry (EAN/UPC, Code 128/39,
QR, Data Matrix, ITF-14). **Manual entry is permanent, not a stopgap**: pharmacy
barcodes get scuffed and fridges are badly lit, and a camera that cannot read a
pack must never be why a patient waits.

### The wristband scan is mandatory

Dispensing is blocked until the patient is confirmed. This is safe to require
precisely because **manual entry of the patient number is always available** in
the scan window — a dead camera, a scuffed wristband, or a relative collecting
on the patient's behalf does not stop the counter.

The gate lives in one pure function, `dispenseGate()` in
[scanVerdict.js](src/api/scanVerdict.js), rather than spread through the
dispensing screen. It blocks on three things, in this order:

1. **Any blocking pack scan** — judged first, so a wrong medicine is named as
   the reason even if the wristband is also outstanding.
2. **A patient mismatch.**
3. **An unmet requirement** — not scanned yet, or scanned without a verdict. A
   `WARN` does not satisfy it: a scan that merely identified somebody confirms
   nothing.

It also refuses when the prescription carries **no patient id at all**, because
the server could then never be asked "is this the right patient" and the
requirement would be unsatisfiable — the pharmacist is told to report it rather
than left tapping a dead button. `detail.patient.id` falls back to
`prescription.patient_id` so one missing field cannot cause that.

Set `CONFIG.REQUIRE_PATIENT_SCAN = false` in
[config.js](src/constants/config.js) to run without it.

### The high-alert second check, and the two-session problem

A dispensing containing a high-alert medicine is written `check_status =
'awaiting'` and must not be handed over until a **second person** confirms it.
The backend reads the acting user from the PHP session cookie and refuses the
person who prepared it — so a "confirm" button on the preparer's screen would be
no check at all. The checker has to be genuinely signed in.

Signing them in on the primary session would sign the **preparer out**, mid-shift,
on a shared counter tablet. So `client.js` keeps a **second cookie jar**: in
memory only, never written to secure storage, discarded as soon as the check is
done, and explicitly logged out server-side. Each cookie is its own PHP session,
so the two coexist. A 401 on the checker's session can never sign the preparer out.

Two routes, chosen by the backend's own `can_check` flag:

| `can_check` | Route | What happens |
| --- | --- | --- |
| `true` | self | The signed-in pharmacist did not prepare it, so they are already a valid second checker — no second sign-in |
| `false` | second user | They prepared it, so a colleague signs in on the secondary session; the preparer stays signed in |

The checker ticks five points (patient, medicine and strength, quantity, lot and
expiry, label and directions) — all five, because the backend refuses anything
less — and may leave a note that is stored on the record.

**Failing a check is not a rejection, it is a void.** There is no reject
endpoint: `check()` only accepts `confirmed = true`. So the fail button undoes
the dispensing with a reason, which is what `241_dispensing_controls.sql`
describes.

Verified live, 22 assertions: the preparer is refused ("someone else has to
check it"), an unconfirmed check is refused, the dispensing is still `awaiting`
after both refusals, a second user succeeds with `checked_by` set to them, it
cannot be checked twice, and the prescription's `awaiting_check` returns to 0.

### Idle lock behaviour

Locking **keeps** the session cookie and asks only for the password again,
rather than signing out. Dropping the session would force a fresh 2FA every few
idle minutes at a busy counter, and a safety control staff find unusable gets
switched off — which is worse than one they accept. Someone else taking over
uses "Sign out instead", which ends the session properly and is recorded.

The username on the lock screen is fixed to whoever is signed in, so it cannot
be used to switch accounts without a real sign-out.

## Run it

```bash
cd c:\xampp\htdocs\ims\pharmacy_tablet_app
npm install
npm start
```

Then `a` for an Android emulator, or scan the QR with Expo Go on a tablet.

### Point it at the backend

`src/constants/config.js` resolves the API host in this order:

1. `app.json` → `expo.extra.apiBaseUrl`, when set
2. Android emulator → `10.0.2.2` (reaches the host machine's XAMPP)
3. otherwise → `localhost`

**A physical tablet cannot reach `10.0.2.2`.** Set `expo.extra.apiBaseUrl` to a
host the tablet can see:

```json
"extra": { "apiBaseUrl": "https://hms.example.local/ims/usintellix-hospital-management-system/backend/public" }
```

The connection banner turns amber whenever the API is still plain `http://`,
because that is PHI over hospital Wi-Fi — see Phase 0.2.

### Build an APK

```bash
npm run build:apk:eas
```

## Layout

```
src/
├── api/          client.js (cookie jar + typed envelope), auth, dispensing, inventory
├── components/   SplitView, DataTable, NumPad, ScanButton, SideNav, Badge, ConnectionBanner
├── constants/    config.js (API host), theme.js (design tokens + safety colours)
├── navigation/   AppShell.js — rail + routed content
├── query/        queryClient.js — react-query defaults
├── screens/      QueueScreen (mock), PlaceholderScreen
└── store/        session.js — who is signed in
```

## Conventions

Plain JavaScript with JSDoc, matching `patient_mobile_app` so one team can
maintain both. `THEME` holds every colour, space and type size — no literal
colours in components, with one exception: the modal backdrop's rgba.

Two rules worth knowing before changing anything:

- **`THEME.safety` colours are reserved.** One colour per hazard (high-alert,
  LASA, controlled, expired, recalled, quarantined, near-expiry), used nowhere
  else. If "HIGH ALERT" red starts appearing on ordinary buttons, it stops
  meaning anything.
- **Status words come from the backend.** `THEME.status` mirrors
  `DispensingService::STATUS_LABELS` exactly. The tablet does not invent its
  own name for a state the backend already names.

## Deliberate deviations from the roadmap

- **A permanent side rail, not `@react-navigation/drawer`.** A drawer hides
  navigation behind a gesture to save width; a landscape tablet has width to
  spare. It also keeps `react-native-reanimated` and `react-native-gesture-handler`
  out of a side-loaded APK.
- **No web target.** `patient_mobile_app` carries a web dev server; this app is
  Android-tablet only, so that machinery is omitted rather than maintained.
- **NPP acknowledgement is not gated on.** The patient app blocks chart access
  until the Notice of Privacy Practices is signed (HIPAA § 164.520), and
  `/auth/npp-acknowledge` works for any user, so the same gate could be applied
  here. It is not, because § 164.520 is a notice given *to patients* — making a
  pharmacist sign one to dispense would be inventing a requirement. The call is
  wired in `AuthService.acknowledgeNpp` if the compliance officer says otherwise.

## Open backend issues found while building Phase 3

Not fixed here — they need a decision, and two of them affect the desktop HMS
as much as the tablet.

1. **`latest_weight_kg` silently defaults to `68.0`** when no weight is
   recorded, and nothing in the payload distinguishes a measured 68 kg from
   the placeholder. The tablet therefore does **not** display patient weight —
   showing a default as if it were measured is worse than showing nothing,
   especially for paediatric dosing. Needs a nullable field before any
   weight-based dosing display (Phase 8).
2. **`storage_condition` is double-encoded in the database.** It reads
   `Room temperature (15-30 Â°C)` — a UTF-8 degree sign stored through a latin1
   connection. The app displays the column as-is rather than guessing at a
   repair; it needs fixing in the data, not the client.
3. **A row can show `valid_until` in the past while `is_expired` is false,**
   because expiry is judged on `fillable_until`. The app therefore never
   computes expiry itself and always uses the backend's `is_expired`.

## Backend changes made for this app

Both are in `usintellix-hospital-management-system`, not here:

- **Phase 0.5** — `backend/config/role_access.php`: the `pharmacist` grants
  block gained the pharmacy paths. Reads on dispensing, stock, warehouses,
  dashboard and reports; writes on the dispensing workflow only.
- **Phase 2** — `AuthController::updateExpiredPassword()` and
  `updateBreachedPassword()` read the granted user from `$result['data']['user']`.
  They previously read `$result['user']`, which the service never returns, so
  both endpoints answered with `data.user = null` after a successful password
  change. The desktop frontend hits the same endpoints.
  `passwordUpdate()` in `src/api/auth.js` also falls back to `/auth/me`, so the
  tablet works against an HMS build from before that fix.
- **`/dispensing/clinical-verifications` had never worked** (Phase 8) — both its
  methods were declared `index(Request $request)` / `save(Request $request)`,
  but `Router` dispatches with `$instance->$methodName()` and passes nothing, so
  every call threw `ArgumentCountError` and returned a 500. `save()` was broken
  twice over: it also called `$request->attribute()` and `$request->body()`,
  neither of which exists on `Core\Request`.

  Fixed by constructing the `Request` inside each method and taking the body
  from `all()` and the user from the session, as every other controller in the
  codebase does. The route now answers (401 unauthenticated instead of 500), and
  the service underneath was always fine — which is why `detail()` could show a
  verification record while the queue endpoint could not be called at all.
- **`is_indigent` exposed** (Phase 7) — `detail().patient` now carries it, so the
  pharmacist can see it before charging.

  **It is not applied to anything.** My own roadmap claimed the backend "models
  the indigent path" for pharmacy discounts; that was wrong. `is_indigent` is
  used only in the Patients and Reports modules — there is no indigent discount
  rule in dispensing or charging, and inventing one would be a policy decision,
  not a gap to fill. An indigent patient is discounted, if at all, through the
  `other` discount with a recorded reason.
- **Scan lookups added** (Phase 6) — `GET /dispensing/scan/rx`,
  `/dispensing/scan/patient` and `/dispensing/scan/lot`, in a new
  `ScanLookupService` + `ScanController`. Each takes what the pharmacist is
  about to do (`expected_patient_id`, `expected_drug_id`, `warehouse_id`) and
  answers with the verdict, so the tablet never decides for itself whether two
  identifiers mean the same thing. Lot dispensability reuses the very same
  `NearExpiryQuarantineService::isLotBlocked` and
  `PharmacyBatchRecallService::isLotRecalled` that `dispense()` uses, so a scan
  cannot call a lot fine that dispensing would refuse. All three are reads and
  are already covered by the Phase 0.5 `/dispensing/*` grant. 36 assertions
  against live data.
- **Drug safety attributes were not exposed** (Phase 5) — `detail()` returned
  only `is_high_alert`, so the LASA, controlled-class, prescription-only and
  storage flags the catalog already holds (schema `215_drug_registration_enhancements`)
  could not be shown at all. Each item now also carries `is_lasa`,
  `controlled_class`, `requires_prescription` and `storage_condition`.

  `controlled_class` holds the literal string `'None'` for ordinary medicines
  (28 of 35 in this catalog), so it is normalised to `null` — otherwise every
  drug reads as controlled and the badge meant to single out the 7 dangerous
  drugs means nothing.
- **Dispensing was not atomic** (Phase 4) — `dispense()` opened a transaction and
  took `SELECT … FOR UPDATE` row locks, then called
  `PrescriptionVerificationService::ensureTableExists()` and, per candidate lot,
  `PharmacyBatchRecallService::isLotRecalled()`. Both run
  `CREATE TABLE IF NOT EXISTS`, and **MySQL implicitly COMMITs on DDL even when
  nothing changes** — so the transaction ended early, the row locks were
  released, and every following insert ran in autocommit. `commit()` then threw
  *"There is no active transaction"*, the `catch` block's `rollBack()` threw on
  top of it, and the caller got a fatal error **for a dispensing that had really
  happened** and could not be rolled back.

  Fixed by giving `PharmacyBatchRecallService::ensureTableExists()` the same
  `$schemaChecked` guard its sibling service already had, and warming both up
  *before* the transaction opens, so the inner calls are no-ops. Verified: a
  dispense + void round trip passes 16 assertions (stock, FEFO over eligible
  lots only, ledger, charges, status, reversal), and five refusal paths write
  nothing at all.

  This affected the desktop HMS identically — it is the same service.
- **Recalled lots** — `DispensingService::detail()` no longer offers a lot under
  an active recall. Its `lots[]` filtered on `is_active`, `is_quarantined`,
  quantity and the 60-day expiry window but never joined
  `pharmacy_batch_recalls`, so a recalled lot was pickable; `dispense()` refused
  it, but only once the whole dispensing was submitted — after the pharmacist
  had chosen the lot and entered a quantity. Recalled lots are now excluded for
  the same reason quarantined and near-expiry ones already were, matching
  `isLotRecalled`'s `active`/`quarantined` statuses.

  **The desktop benefits with no frontend change**: its lot dropdown is built
  straight from `item.lots` (`frontend/src/modules/dispensing/dispensing.js`
  lines 170 and 243).

  Withheld stock is not hidden. Each item also carries **`recalled_lots[]`**
  (lot number, location, quantity, recall number, class, reason) — with **no lot
  id**, so nothing there can be submitted. The tablet shows it under the
  medicine, because a pharmacist who counts 450 on the shelf and sees 200 in the
  app will otherwise assume the app is wrong.
