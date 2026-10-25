# Pharmacy Tablet App — Phased Roadmap

**Product:** USIntellix Pharmacy Tablet (medicine dispensing)
**Framework:** React Native (Expo), Android tablet, landscape
**Location:** `C:\xampp\htdocs\ims\pharmacy_tablet_app`
**Backend:** existing USIntellix HMS PHP API (`usintellix-hospital-management-system/backend/public`)
**Date:** 2026-10-22

> **See also [PHASES.md](PHASES.md)** — the complete phase list (15 phases, 0–14,
> broken into sub-phases with every endpoint mapped). This file holds the
> architecture decisions and backend findings; that one is the build checklist.
> The phase numbering differs: PHASES.md splits this file's Phase 0 into a
> discovery/environment phase plus a project-foundation phase, and adds the
> dashboard/reports surface and a full hardening-and-UAT phase.

---

## 0. What this app is (and is not)

This is a **thin tablet client over an already-complete backend**. The HMS backend
has a full pharmacy stack built and migrated:

| Backend module | What it already does |
| --- | --- |
| `Dispensing` | Prescription queue, clinical verification, lot-level dispense, high-alert second check, auxiliary labels, void, close, refill request/decline, payment, charge slip |
| `DrugInventory` | Drug catalog, lots, receive, transfer, destroy, batch recalls, near-expiry quarantine, warehouses, min/max stock levels |
| `InpatientOrders` | Inpatient med orders, pharmacist verification queue, MAR board (give/hold/refuse/void/recheck), ward cabinets, restock queue, DD register, DD count |

So **almost no new backend work is required**. The roadmap is overwhelmingly
client-side. Where a backend change *is* needed, it is called out explicitly
(Phase 1 and Phase 5 only).

**Out of scope** (decided, not oversight):

- Label / charge-slip **printing to a thermal printer** — labels and slips will be
  shown on screen and can be produced from the desktop HMS. Revisit after Phase 9.
- **Offline writes.** The app requires connectivity to dispense. A brief Wi-Fi drop
  shows a clear "reconnecting" state and retries; it does not queue dispenses locally.
  (Queuing a controlled-drug movement offline is a patient-safety and
  reconciliation risk, so this is a deliberate exclusion.)

---

## 1. Known gaps found in the existing backend

These are real findings from reading the code, and they shape Phase 1 and Phase 5.

1. **`pharmacist` role cannot reach the dispensing endpoints.**
   `backend/database/seed/*` seeds a `pharmacist` role ("Pharmacy Staff"), and
   `InpatientOrders/routes.php` correctly gates its pharmacist queues on
   `['admin', 'pharmacist']`. But
   `DispensingService::ROLES = ['admin', 'receptionist', 'doctor']` — **`pharmacist`
   is missing** — and every `/dispensing/*` route plus all of
   `DrugInventory/routes.php` uses that same trio. A pharmacist logging into this
   app today would be rejected from the counter workflow. Phase 1 fixes this.

2. **No barcode-lookup endpoints.** Nothing resolves a scanned Rx number, patient
   wristband, or drug/lot barcode to an id. Phase 5 adds three small lookup endpoints
   rather than making the tablet guess from list payloads.

3. **Auth is PHP session cookies, not tokens.** `backend/app/Modules/Auth/routes.php`
   issues a `PHPSESSID`; the existing patient app keeps it in an in-memory cookie jar
   (`patient_mobile_app/src/api/client.js`). That jar is lost on app restart, which is
   acceptable for a patient phone app but wrong for a shared counter tablet — Phase 1
   addresses session persistence and idle lock explicitly.

4. **`drugs.is_high_alert` drives a mandatory second check** by a *different* user
   (`241_dispensing_controls.sql`: `check_status` `awaiting` → `checked`). On a single
   shared tablet this means a **second user must authenticate to check** — the UI
   cannot just show a confirm button. Phase 4 is dedicated to this.

---

## 2. Target architecture

```
pharmacy_tablet_app/
├── app.json                  # com.usintellix.pharmacytablet, orientation: landscape
├── src/
│   ├── api/                  # one module per backend area
│   │   ├── client.js         # persistent cookie jar + 401/expiry interceptor
│   │   ├── auth.js           # login, 2FA, me, logout, staff-role guard
│   │   ├── dispensing.js     # /dispensing/*
│   │   ├── inventory.js      # /drug-inventory/*, /warehouses/*
│   │   ├── medOrders.js      # /med-orders/*   (Phase 7)
│   │   └── mar.js            # /mar/*, /ward-cabinet/*  (Phase 8)
│   ├── components/           # tablet primitives: DataTable, SplitView, NumPad, ScanButton
│   ├── screens/
│   ├── store/                # session + active-queue state
│   └── constants/            # config.js, theme.js (tablet type scale)
```

**Stack decisions**, aligned with the existing `patient_mobile_app` so one team can
maintain both: Expo ~54, React Native 0.81, React 19.1.

| Concern | Choice | Why |
| --- | --- | --- |
| Navigation | `@react-navigation/native` + drawer/stack | The patient app stacks modals; a counter app needs real routes, deep-linkable queue items, and a persistent left nav. |
| Server state | TanStack Query | The queue needs polling, cache invalidation after dispense, and retry-on-reconnect — all of which it gives for free. |
| Layout | Master–detail split view | Tablet landscape: queue list left (~35%), prescription detail right. The single biggest difference from the phone app. |
| Session storage | `expo-secure-store` | PHPSESSID must survive app restart but must not sit in plain `AsyncStorage` on a shared device. |
| Scanning | `expo-camera` barcode scanning | Already in the Expo SDK; no custom native module, keeps the managed/prebuild workflow. |
| Numeric entry | Custom on-screen NumPad component | Quantity entry on a tablet with gloves; avoids the OS keyboard covering the lot table. |

---

## 3. Phases

Effort assumes **one full-time developer**. Phases 1–6 are the counter app
(the chosen first milestone); 7–8 add the ward/eMAR mode.

### Phase 0 — Project setup & tablet shell
**Goal:** an installable APK that boots on the tablet and proves the network path.
**Est:** 3–4 days

- Scaffold Expo project; `app.json` with `orientation: "landscape"`,
  package `com.usintellix.pharmacytablet`, EAS profile for `preview` APK builds.
- Port and adapt `src/constants/config.js` (LAN IP for the real tablet, not `10.0.2.2`)
  and `theme.js` to a tablet type scale and touch-target sizes (min 48dp).
- Build the `SplitView`, `DataTable` and `ScanButton` shells with mock data.
- Confirm `GET /ping` round-trips from the physical tablet over hospital Wi-Fi.

**Exit:** APK side-loads, shows an empty queue shell, reaches the backend.

---

### Phase 1 — Staff authentication, roles & session safety
**Goal:** a pharmacist can log in on a shared tablet, safely.
**Est:** 1 week — *includes the one mandatory backend change*

- **Backend:** add `pharmacist` to `DispensingService::ROLES`, and to the role arrays
  in `DrugInventory/routes.php` (catalog/lot reads at minimum). Without this the
  entire counter workflow 403s for the role it is built for. Verify against the
  remote DB's seeded roles, not the local XAMPP one.
- Login screen with 2FA (`/login`, `/verify-2fa`, `/resend-2fa`), reusing the
  HIPAA flows the patient app already handles: first-login setup, lockout cooldown,
  90-day expiry, breached-password check.
- **Inverse role guard** of the patient app: accept `pharmacist`/`admin`, reject
  `patient` with "use the Patient app".
- Persistent cookie jar in `expo-secure-store`; `/auth/me` revalidation on resume;
  global 401 → forced re-login.
- **Shared-device hardening:** idle auto-lock (configurable, default 3 min),
  prominent "Log out" always reachable, and the signed-in pharmacist's name shown on
  every screen — because their identity is written into every `created_by` and
  every HIPAA audit row.

**Exit:** pharmacist logs in, session survives restart, locks when idle, and
`/dispensing` returns 200 instead of 403.

---

### Phase 2 — Dispensing queue (read-only)
**Goal:** the queue is usable as a live work board.
**Est:** 1 week

- `GET /dispensing` → master list: Rx number, patient, prescriber, date,
  `dispense_status` (`pending` / `partial` / `dispensed` / `closed` / `none`).
- `GET /dispensing/options` → filter chips (warehouse/location, status, date range)
  and `GET /dispensing/show` → detail pane: medicine lines, dose/sig, quantity
  ordered vs already dispensed, diagnosis, notes.
- Patient header: allergies and high-alert flags surfaced **before** the pharmacist
  starts picking — not behind a tab.
- Auto-refresh poll with a visible "last updated" and reconnect banner.

**Exit:** pharmacist can find any prescription and read everything needed to decide,
on the tablet, without the desktop HMS.

---

### Phase 3 — Dispense a prescription (the core)
**Goal:** the app can actually give medicine out and move stock.
**Est:** 2 weeks — **the highest-risk phase**

- Lot picker per medicine line, driven by `/drug-inventory` + `/warehouses/stock`:
  show lot number, expiry, quantity on hand; default to FEFO; allow splitting one
  line across lots (`prescription_dispense_items` supports this).
- Honour **near-expiry quarantine** and **batch recalls** — a quarantined or
  recalled lot must be visibly unselectable, with the reason shown.
- NumPad quantity entry with partial-fill support; running total vs ordered.
- `POST /dispensing` with full payload; optimistic-free, confirm-on-success only.
- Post-dispense: `GET /dispensing/labels` rendered on screen (auxiliary labels),
  `DSP-YYYY-NNNNN` shown for the paper trail.
- `POST /dispensing/void` with reason (restores stock and writes the ledger),
  and `POST /dispensing/close` for "closed with what was given".
- **Error-path work is most of this phase:** insufficient stock, concurrent dispense
  of the same Rx from the desktop, lost connection mid-submit, prescription revision
  bumped underneath the pharmacist.

**Exit:** a prescription dispensed on the tablet produces the same rows
(`prescription_dispenses`, `prescription_dispense_items`, `drug_stock_movements`) as
one dispensed on the desktop HMS. Verified by DB comparison, not by screenshot.

---

### Phase 4 — High-alert second check
**Goal:** satisfy `dispensing_controls` on a single shared device.
**Est:** 4–5 days

- Detect `check_status = 'awaiting'`; the dispense is held, not handed over.
- **Second-user authentication inline** — the checker signs in within the check
  sheet; the app must not let the preparer check their own work
  (backend enforces "not the one who prepared it"; the UI must make that legible
  rather than surfacing it as a raw error).
- `POST /dispensing/check` → pass (`checked`) or fail (auto-void with reason).
- A dedicated "Awaiting check" queue filter so held dispenses cannot be forgotten.

**Exit:** a high-alert dispense cannot be handed over without a second named
pharmacist's authentication on the tablet.

---

### Phase 5 — Barcode & QR scanning
**Goal:** scanning replaces typing for the three identifiers that matter.
**Est:** 1 week — *includes small backend additions*

- **Backend:** three lookup endpoints (thin wrappers over existing services):
  resolve scanned **Rx number** → prescription, **patient wristband/ID** → patient,
  **drug or lot barcode** → `drug_id` + `lot_id`.
- `expo-camera` scanner surface + `CAMERA` permission in `app.json`.
- Three scan points: open an Rx by scanning the slip; confirm the patient at handover;
  **verify the lot in hand against the lot selected** before `POST /dispensing`.
- Hard-stop on mismatch (wrong patient, wrong drug, expired or quarantined lot) with
  an unmistakable error state — this is the safety payoff of the whole phase.
- Manual entry always available as fallback (dim lighting, damaged barcode).

**Exit:** a full dispense can be completed scan-only, and a deliberate wrong-lot
scan is blocked.

---

### Phase 6 — Payment, charge slip & refills; counter release
**Goal:** the counter workflow is complete end-to-end and goes live.
**Est:** 1 week

- `POST /dispensing/payment` with `DispensingService::PAYMENT_METHODS` and
  `DISCOUNTS` (incl. the indigent/senior discount paths the backend already models).
- `GET /dispensing/charge-slip` rendered for the patient to see on screen.
- `POST /dispensing/refill-request` and `/refill-decline`.
- Read-only view of the pharmacist clinical verification queue
  (`GET /dispensing/clinical-verifications`) so the pharmacist can see renal/weight/
  allergy notes; **saving** verifications stays on the desktop for now.
- Hardening pass: tablet kiosk/lock-task mode, crash reporting, 2-hour shift
  soak test, and a pilot at one counter alongside the desktop as fallback.

**Exit:** 🎯 **Milestone 1 — pharmacy counter app in production at one counter.**

---

### Phase 7 — Ward mode: pharmacist order verification
**Goal:** begin Milestone 2 (inpatient) with the pharmacist's own inpatient queue.
**Est:** 1 week

- `GET /med-orders/queue` (already gated `['admin','pharmacist']`) → verification queue.
- `GET /med-orders/drugs`, `POST /med-orders/verify`, `POST /med-orders/reject`.
- `GET /ward-cabinet/restock-queue` + `POST /ward-cabinet/restock/fill` — the
  pharmacist fills ward cabinet restock requests from the tablet.
- Mode switch in the app shell: **Counter** / **Ward**, driven by role, not a toggle
  the user can get wrong.

**Exit:** pharmacist verifies inpatient med orders and fills restocks on the tablet.

---

### Phase 8 — Ward mode: nurse eMAR at the bedside
**Goal:** a nurse administers doses at the bedside from the tablet.
**Est:** 2–3 weeks — effectively a second app surface, with its own role set
(`nurse`, `charge_nurse`)

- `GET /mar/board` and `/mar/admission` → time-grid MAR, due/overdue emphasised.
- `POST /mar/give`, `/hold`, `/refuse`, `/void`, `/recheck`.
- **Five-rights barcode check** at the bedside, reusing Phase 5's scanner:
  patient wristband → order → drug/lot.
- Ward cabinet withdraw / return / waste (`POST /ward-cabinet/withdraw|return|waste`)
  and the dangerous-drugs register and count
  (`GET /dd-register`, `GET|POST /ward-cabinet/dd-count`) — witness signatures needed,
  same second-user pattern as Phase 4.
- `GET /mar/supply` for supply charges.

**Exit:** 🎯 **Milestone 2 — nurse completes a medication round on the tablet.**

---

### Phase 9 — Pharmacy inventory on the tablet (optional)
**Goal:** stock tasks that are genuinely better on a mobile tablet than at a desk.
**Est:** 1–2 weeks

- Scan-driven **goods receipt** (`POST /drug-inventory/receive`) and
  **stock transfer** (`/transfer`) while standing at the shelf.
- **Stock count / cycle count** with the scanner (schema `231_stock_counts`).
- Near-expiry quarantine scan and release (`/drug-inventory/quarantine/*`),
  and recall sweeps (`/drug-inventory/recalls`).

**Exit:** shelf-side stock work no longer requires walking back to a desktop.

---

## 4. Summary

| Phase | Deliverable | Est. |
| --- | --- | --- |
| 0 | Project setup & tablet shell | 3–4 d |
| 1 | Staff auth, roles, session safety *(+backend role fix)* | 1 w |
| 2 | Dispensing queue (read-only) | 1 w |
| 3 | **Dispense + lot selection + void/close** | 2 w |
| 4 | High-alert second check | 4–5 d |
| 5 | Barcode & QR scanning *(+3 backend lookups)* | 1 w |
| 6 | Payment, charge slip, refills → **counter go-live** | 1 w |
| 7 | Ward mode: pharmacist order verification | 1 w |
| 8 | Ward mode: **nurse eMAR at bedside** | 2–3 w |
| 9 | Pharmacy inventory on tablet (optional) | 1–2 w |

**Milestone 1 (counter, Phases 0–6): ~7 weeks.**
**Milestone 2 (ward/eMAR, Phases 7–8): ~4 weeks more.**

Critical path runs through Phase 1's backend role fix (nothing else works without it)
and Phase 3 (everything after it depends on dispense being correct).

---

## 5. Open questions to settle before Phase 0

1. **Tablet model, OS version and screen size?** Drives the minimum Android API,
   the layout breakpoints, and whether the camera is good enough for Phase 5's
   barcode scanning in pharmacy lighting.
2. **Hospital Wi-Fi reachability.** The backend currently sits behind XAMPP on a
   PC (`http://<host>/ims/...`). Production tablets need a stable hostname and
   **HTTPS** — PHI over plain HTTP on hospital Wi-Fi is not acceptable, and
   Android blocks cleartext by default (the patient app works around this with a
   network-security exception, which should not be carried into this app).
3. **Who is the counter user — `pharmacist` or `receptionist`?** The seeded
   `pharmacist` role is the right answer, but today's desktop users may actually be
   logging in as `receptionist`. Confirm before Phase 1, since it decides whether
   the role fix is an addition or a migration.
4. **One shared tablet per counter, or one per pharmacist?** Shared changes the
   idle-lock timeout, the second-check UX, and whether login can be remembered.
5. **Is on-screen enough for labels and charge slips**, or will the pharmacy insist
   on printing from the tablet in Milestone 1? (Currently deferred.)
