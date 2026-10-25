# USIntellix Pharmacy Tablet

React Native (Expo) tablet app for medicine dispensing, on top of the existing
USIntellix HMS pharmacy backend.

- **Roadmap:** [ROADMAP.md](ROADMAP.md) — architecture decisions and backend findings
- **Full phase list:** [PHASES.md](PHASES.md) — 15 phases, every endpoint mapped
- **Phase 0:** [PHASE-0-STATUS.md](PHASE-0-STATUS.md) — environment readiness
- **Current state: Phase 2 complete** — shell, design system, primitives, authentication

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

After signing in: the left rail, the connection banner, and the dispensing
queue shell on **mock data**.

Nothing dispenses yet. `GET /dispensing` is wired in Phase 3; the dispense
itself is Phase 4.

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
