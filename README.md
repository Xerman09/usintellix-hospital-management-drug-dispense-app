# USIntellix Pharmacy Tablet

React Native (Expo) tablet app for medicine dispensing, on top of the existing
USIntellix HMS pharmacy backend.

- **Roadmap:** [ROADMAP.md](ROADMAP.md) — architecture decisions and backend findings
- **Full phase list:** [PHASES.md](PHASES.md) — 15 phases, every endpoint mapped
- **Phase 0:** [PHASE-0-STATUS.md](PHASE-0-STATUS.md) — environment readiness
- **Current state: Phase 1 complete** — project shell, design system, primitives

---

## What works today

The app boots in landscape, shows the permanent left rail, checks the backend
connection on a timer, and renders the dispensing queue shell on **mock data**.
Tapping a row opens the detail pane.

Nothing dispenses yet. `GET /dispensing` is wired in Phase 3; the dispense
itself is Phase 4.

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
