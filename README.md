# USIntellix Pharmacy Tablet

React Native (Expo) tablet app for medicine dispensing, on top of the existing
USIntellix HMS pharmacy backend.

- **Roadmap:** [ROADMAP.md](ROADMAP.md) — architecture decisions and backend findings
- **Full phase list:** [PHASES.md](PHASES.md) — 15 phases, every endpoint mapped
- **Phase 0:** [PHASE-0-STATUS.md](PHASE-0-STATUS.md) — environment readiness
- **Current state: Phase 4 complete** — shell, design system, auth, queue, **dispensing**

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

Payment and the charge slip are Phase 7; the high-alert second check is Phase 5
(a dispensing that needs one is held, and the sheet says so).

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
2. **A row can show `valid_until` in the past while `is_expired` is false,**
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
