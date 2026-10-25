# Pharmacy Tablet App — Complete Phase List

Full breakdown of every phase and sub-phase needed to build the system.
Companion to [ROADMAP.md](ROADMAP.md), which holds the architecture decisions and
the backend findings. This file is the exhaustive checklist.

**15 phases (0–14), grouped into 4 tracks.**

| Track | Phases | Outcome |
| --- | --- | --- |
| A — Foundation | 0, 1, 2 | App boots, pharmacist can log in securely |
| B — Counter dispensing (**Milestone 1**) | 3–10 | Outpatient pharmacy counter live on tablets |
| C — Ward / inpatient (**Milestone 2**) | 11, 12 | Pharmacist ward verification + nurse eMAR |
| D — Extensions | 13, 14 | Shelf-side inventory, deferred items |

Legend: ⚠️ = backend change required · 🎯 = milestone · ○ = optional

---

# TRACK A — FOUNDATION

## Phase 0 — Discovery & environment readiness
*Non-code groundwork. Everything here blocks real deployment, so it goes first.*

| # | Sub-phase | Detail |
| --- | --- | --- |
| 0.1 | Tablet hardware decision | Model, screen size, Android version, camera quality. Sets min SDK, layout breakpoints, and whether Phase 6 scanning is viable in pharmacy lighting. |
| 0.2 | ⚠️ HTTPS + stable hostname | Backend is plain HTTP under XAMPP. PHI over cleartext on hospital Wi-Fi is not acceptable and Android blocks it by default. Needs a real hostname and TLS cert before any pilot. |
| 0.3 | Counter role decision | Is the counter user `pharmacist` or `receptionist` today? Decides whether 0.5 is an addition or a user migration. |
| 0.4 | Test accounts & seed data | A `pharmacist` user, a test warehouse with lots (incl. one high-alert, one LASA, one near-expiry, one recalled), and test prescriptions in each `dispense_status`. |
| 0.5 | ⚠️ **Backend role fix** | Add `pharmacist` to `DispensingService::ROLES` (one line — `PharmacyReportService::ROLES` inherits it) and to the inline role arrays in `DrugInventory/routes.php`. **Nothing in Track B works until this lands.** |
| 0.6 | Wi-Fi coverage check | Walk the pharmacy and wards with the tablet; find dead spots before they surface mid-dispense. |

**Exit:** tablet in hand, HTTPS endpoint reachable from it, pharmacist account returns 200 on `/dispensing`.

---

## Phase 1 — Project foundation & design system

| # | Sub-phase | Detail |
| --- | --- | --- |
| 1.1 | Expo project scaffold | `orientation: "landscape"`, package `com.usintellix.pharmacytablet`, Expo ~54 / RN 0.81 / React 19.1 to match `patient_mobile_app`. |
| 1.2 | Tablet design system | Port `theme.js`; tablet type scale, min 48dp touch targets, high-contrast state colours for safety warnings. |
| 1.3 | `SplitView` primitive | Master–detail landscape layout (list ~35% / detail ~65%). The core difference from the phone app. |
| 1.4 | `DataTable` primitive | Sortable, dense, touch-scrollable table for queues and lot lists. |
| 1.5 | `NumPad` primitive | On-screen numeric entry so the OS keyboard never covers the lot table. |
| 1.6 | `ScanButton` + scanner shell | Placeholder surface, wired for real in Phase 6. |
| 1.7 | API client | Persistent cookie jar, global 401 interceptor, reconnect/retry, typed error envelope. |
| 1.8 | Navigation shell | `@react-navigation/native` drawer + stack; persistent left nav, deep-linkable queue items. |
| 1.9 | TanStack Query setup | Polling, cache invalidation after writes, retry-on-reconnect. |
| 1.10 | EAS build pipeline | `preview` APK profile; confirm side-load onto the real tablet. |

**Exit:** APK installs, shows an empty queue shell in landscape, reaches `GET /ping`.

---

## Phase 2 — Authentication, roles & session safety

| # | Sub-phase | Detail |
| --- | --- | --- |
| 2.1 | Login screen | `POST /login`, tablet-sized form. |
| 2.2 | 2FA | `POST /verify-2fa`, `POST /resend-2fa`. |
| 2.3 | HIPAA login flows | First-login setup, lockout cooldown display, 90-day password expiry, breached-password check — all already in the backend and handled by the patient app; port the handling. |
| 2.4 | Staff role guard | Inverse of the patient app: accept `pharmacist`/`admin`, reject `patient` with "use the Patient app". |
| 2.5 | Secure session persistence | PHPSESSID in `expo-secure-store` (survives restart, not readable as plain storage); `/auth/me` revalidation on resume. |
| 2.6 | Idle auto-lock | Default 3 min, configurable. Required because the tablet is shared. |
| 2.7 | Signed-in identity banner | Current pharmacist's name on every screen — their identity lands in every `created_by` and HIPAA audit row. |
| 2.8 | Logout + session expiry | Always-reachable logout; forced re-login on 401. |

**Exit:** pharmacist logs in with 2FA, session survives restart, locks when idle.

---

# TRACK B — COUNTER DISPENSING (Milestone 1)

## Phase 3 — Dispensing queue & prescription detail (read-only)

| # | Sub-phase | Endpoint / detail |
| --- | --- | --- |
| 3.1 | Queue list | `GET /dispensing` — Rx number, patient, prescriber, date, status. |
| 3.2 | Status filters | `STATUS_LABELS`: To dispense / Partly dispensed / Dispensed / Closed / Nothing to dispense. |
| 3.3 | Filter chips & search | `GET /dispensing/options` — warehouse/location, date range, patient search. |
| 3.4 | Prescription detail pane | `GET /dispensing/show` — medicine lines, dose/sig, qty ordered vs dispensed, diagnosis, notes. |
| 3.5 | Patient safety header | Allergies and high-alert flags shown **before** picking starts, not behind a tab. |
| 3.6 | Live refresh | Poll with visible "last updated" + reconnect banner. |
| 3.7 | Empty/error/loading states | Including the 300-row `QUEUE_LIMIT` the backend applies. |

**Exit:** pharmacist can find any prescription and read everything needed to decide, without the desktop HMS.

---

## Phase 4 — Dispense core ⭐ *highest risk*

| # | Sub-phase | Endpoint / detail |
| --- | --- | --- |
| 4.1 | Lot picker | `GET /drug-inventory`, `GET /warehouses/stock` — lot no., expiry, qty on hand. |
| 4.2 | FEFO default | Pre-select first-expiry-first-out; pharmacist can override. |
| 4.3 | Multi-lot split | One medicine line filled from several lots (`prescription_dispense_items` supports this). |
| 4.4 | Quarantine & recall blocks | Near-expiry quarantined and recalled lots visibly unselectable, with reason. |
| 4.5 | Quantity entry | NumPad, partial-fill, running total vs ordered. |
| 4.6 | Submit dispense | `POST /dispensing` — confirm only on success, no optimistic UI. |
| 4.7 | Labels | `GET /dispensing/labels` on screen; `DSP-YYYY-NNNNN` shown for the paper trail. |
| 4.8 | Void | `POST /dispensing/void` with reason — restores stock, writes `dispense_voided` ledger row. |
| 4.9 | Close | `POST /dispensing/close` — pharmacy closes with what was given. |
| 4.10 | Concurrency & error paths | Insufficient stock, same Rx dispensed from desktop, connection lost mid-submit, `prescriptions.revision` bumped underneath the pharmacist. **This is most of the phase.** |

**Exit:** a tablet dispense produces identical rows to a desktop dispense
(`prescription_dispenses`, `prescription_dispense_items`, `drug_stock_movements`) —
verified by DB comparison, not screenshot.

---

## Phase 5 — Medication safety controls

| # | Sub-phase | Detail |
| --- | --- | --- |
| 5.1 | High-alert second check | `drugs.is_high_alert` → `check_status = 'awaiting'`; dispense held, not handed over. |
| 5.2 | Second-user authentication | Checker signs in inside the check sheet. Backend forbids the preparer checking their own work — the UI must make that legible, not surface a raw error. |
| 5.3 | Check pass / fail | `POST /dispensing/check` → `checked`, or fail → auto-void with reason. |
| 5.4 | "Awaiting check" queue | Dedicated filter so held dispenses can't be forgotten. |
| 5.5 | LASA confirmation | `drugs.is_lasa` — look-alike/sound-alike drugs get an explicit name-confirmation step. |
| 5.6 | Controlled-drug handling | `drugs.controlled_class` — extra confirmation and register visibility. |
| 5.7 | `requires_prescription` guard | Block dispensing an Rx-only drug without a valid prescription line. |
| 5.8 | Storage-condition note | `drugs.storage_condition` shown at handover (cold chain etc.). |

**Exit:** a high-alert dispense cannot be handed over without a second named pharmacist authenticating on the tablet.

---

## Phase 6 — Barcode & QR scanning

| # | Sub-phase | Detail |
| --- | --- | --- |
| 6.1 | ⚠️ Backend lookup endpoints | Three thin wrappers: Rx number → prescription, patient wristband/ID → patient, drug/lot barcode → `drug_id` + `lot_id`. None exist today. |
| 6.2 | Scanner surface | `expo-camera` barcode scanning + `CAMERA` permission in `app.json`. |
| 6.3 | Scan to open an Rx | Scan the printed slip, jump straight to its detail. |
| 6.4 | Patient verification scan | Confirm the right patient at handover. |
| 6.5 | Lot verification scan | **Verify the lot in hand against the lot selected**, before `POST /dispensing`. The main safety payoff. |
| 6.6 | Mismatch hard-stop | Wrong patient / wrong drug / expired / quarantined → unmistakable blocking error. |
| 6.7 | Manual fallback | Always available — dim lighting, damaged or missing barcode. |

**Exit:** a full dispense completes scan-only; a deliberate wrong-lot scan is blocked.

---

## Phase 7 — Payment, discounts & charge slip

| # | Sub-phase | Detail |
| --- | --- | --- |
| 7.1 | Payment capture | `POST /dispensing/payment` — Cash, GCash/e-wallet, Card (terminal), Bank transfer, Check, Other. |
| 7.2 | Statutory discounts | Senior Citizen (RA 9994) 20% and PWD (RA 10754) 20%, **each requiring the ID number**; plus free-rate "Other discount". |
| 7.3 | Indigent patients | `patients.is_indigent` path the backend already models. |
| 7.4 | Charge slip | `GET /dispensing/charge-slip` rendered on screen for the patient. |
| 7.5 | Partial / unpaid states | A dispense may be handed over before payment clears — reflect that honestly. |

**Exit:** payment and the statutory discounts can be completed at the counter on the tablet.

---

## Phase 8 — Refills & clinical verification view

| # | Sub-phase | Detail |
| --- | --- | --- |
| 8.1 | Refill request | `POST /dispensing/refill-request`. |
| 8.2 | Refill decline | `POST /dispensing/refill-decline` with reason. |
| 8.3 | Clinical verification queue (read) | `GET /dispensing/clinical-verifications` — renal adjustment, patient weight, clinical indication, allergy/interaction cross-check. |
| 8.4 | ○ Saving verifications | `POST /dispensing/clinical-verifications/save` — deferred to desktop for Milestone 1; add here if pharmacists ask. |

**Exit:** refills handled at the counter; pharmacist can read clinical verification notes before dispensing.

---

## Phase 9 — Pharmacy dashboard & reports on tablet

| # | Sub-phase | Endpoint |
| --- | --- | --- |
| 9.1 | Pharmacy dashboard | `GET /pharmacy-dashboard` — shift overview. |
| 9.2 | Dispensing log | `GET /pharmacy-reports/dispensing-log`. |
| 9.3 | Dangerous drugs register | `GET /pharmacy-reports/dangerous-drugs`. |
| 9.4 | Unfilled prescriptions | `GET /pharmacy-reports/unfilled`. |
| 9.5 | By prescriber | `GET /pharmacy-reports/by-prescriber`. |
| 9.6 | Report filters | `GET /pharmacy-reports/options`. |

*All of these inherit the Phase 0.5 role fix automatically
(`PharmacyReportService::ROLES = DispensingService::ROLES`).*

**Exit:** end-of-shift reconciliation possible from the tablet.

---

## Phase 10 — Counter hardening, UAT & go-live 🎯

| # | Sub-phase | Detail |
| --- | --- | --- |
| 10.1 | Kiosk / lock-task mode | Tablet can't be navigated out of the app. |
| 10.2 | Crash & error reporting | Plus a diagnostics screen showing backend URL, app version, session state. |
| 10.3 | Performance pass | Queue at the full 300-row limit, large lot lists, long shifts. |
| 10.4 | Soak test | Two-hour continuous shift simulation on the real tablet. |
| 10.5 | **Data-integrity validation** | Tablet dispenses vs desktop dispenses compared at DB level across every path: full, partial, multi-lot, voided, closed, high-alert. |
| 10.6 | HIPAA audit verification | Confirm every tablet action writes the expected `hipaa_audit_logs` rows. |
| 10.7 | Pharmacist UAT | Real pharmacists, real prescriptions, test database. |
| 10.8 | Training & quick-reference | One-page card for the counter. |
| 10.9 | Pilot at one counter | Desktop HMS stays available as fallback. |
| 10.10 | Rollout to all counters | After a clean pilot period. |

**Exit:** 🎯 **Milestone 1 — pharmacy counter app in production.**

---

# TRACK C — WARD / INPATIENT (Milestone 2)

## Phase 11 — Ward mode: pharmacist order verification

| # | Sub-phase | Endpoint |
| --- | --- | --- |
| 11.1 | Counter/Ward mode switch | Driven by role, not a toggle the user can get wrong. |
| 11.2 | Inpatient order queue | `GET /med-orders/queue` (already gated `['admin','pharmacist']`). |
| 11.3 | Order detail & drug lookup | `GET /med-orders/admission`, `GET /med-orders/patient`, `GET /med-orders/drugs`. |
| 11.4 | Verify order | `POST /med-orders/verify`. |
| 11.5 | Reject order | `POST /med-orders/reject` with reason. |
| 11.6 | Cabinet restock queue | `GET /ward-cabinet/restock-queue`. |
| 11.7 | Fill restock | `POST /ward-cabinet/restock/fill`. |
| 11.8 | Ward stock report | `GET /ward-stock-report`. |

**Exit:** pharmacist verifies inpatient med orders and fills ward restocks from the tablet.

---

## Phase 12 — Ward mode: nurse eMAR at the bedside
*Effectively a second app surface, with its own role set (`nurse`, `charge_nurse`).*

| # | Sub-phase | Endpoint / detail |
| --- | --- | --- |
| 12.1 | Nurse role onboarding | Extend the Phase 2 guard to `nurse` / `charge_nurse`. |
| 12.2 | MAR board | `GET /mar/board`, `GET /mar/admission` — time grid, due/overdue emphasised. |
| 12.3 | Give a dose | `POST /mar/give`. |
| 12.4 | Hold / refuse | `POST /mar/hold`, `POST /mar/refuse` with reason. |
| 12.5 | Void / recheck | `POST /mar/void`, `POST /mar/recheck`. |
| 12.6 | **Five-rights scan** | Wristband → order → drug/lot, reusing the Phase 6 scanner. |
| 12.7 | Ward cabinet | `GET /ward-cabinet`, `POST /ward-cabinet/withdraw`, `/return`, `/waste`. |
| 12.8 | DD register | `GET /dd-register`. |
| 12.9 | DD count + witness | `GET|POST /ward-cabinet/dd-count`, `/dd-count/resolve` — needs the same second-user authentication pattern as Phase 5.2. |
| 12.10 | Cabinet override review | `POST /ward-cabinet/override/review`. |
| 12.11 | Supply charges | `GET /mar/supply`. |
| 12.12 | Ward pilot & rollout | One ward first, paper MAR as fallback. |

**Exit:** 🎯 **Milestone 2 — nurse completes a full medication round on the tablet.**

---

# TRACK D — EXTENSIONS

## Phase 13 — ○ Pharmacy inventory on the tablet
*Stock work that is genuinely better standing at the shelf than at a desk.*

| # | Sub-phase | Endpoint |
| --- | --- | --- |
| 13.1 | Scan-driven goods receipt | `POST /drug-inventory/receive`. |
| 13.2 | Stock transfer | `POST /drug-inventory/transfer`. |
| 13.3 | Stock / cycle count | Scanner-driven (schema `231_stock_counts`). |
| 13.4 | Near-expiry quarantine | `GET /drug-inventory/quarantine`, `/scan`, `/release`, `/logs`. |
| 13.5 | Recall sweeps | `GET /drug-inventory/recalls`, `/recalls/detail`, `POST /recalls/status`. |
| 13.6 | Destruction records | `POST /drug-inventory/destroy`, `GET /destroyed`. |

---

## Phase 14 — ○ Deferred items
*Explicitly excluded from Milestones 1 and 2. Listed so they aren't forgotten.*

| # | Item | Note |
| --- | --- | --- |
| 14.1 | Thermal label & slip printing | Bluetooth/network printer. Deferred — labels show on screen, desktop HMS can print. |
| 14.2 | Offline read cache | Read-only queue cache for brief Wi-Fi drops. |
| 14.3 | Offline writes | **Deliberately excluded.** Queuing a controlled-drug stock movement offline is a patient-safety and reconciliation risk. |
| 14.4 | Biometric / PIN quick unlock | Faster re-entry after idle lock on a shared tablet. |
| 14.5 | OTA updates | `expo-updates`, so fixes don't need a side-load per tablet. |
| 14.6 | Multi-language UI | If counter staff need it. |
| 14.7 | iPad support | Codebase is cross-platform already; needs its own build and test pass. |

---

## Effort summary

| Phase | Est. | Cumulative |
| --- | --- | --- |
| 0 — Discovery & env readiness | 2–3 d *(+ infra lead time for HTTPS/hardware)* | — |
| 1 — Project foundation | 4–5 d | ~1.5 w |
| 2 — Auth & session | 1 w | ~2.5 w |
| 3 — Queue & detail | 1 w | ~3.5 w |
| 4 — **Dispense core** | 2 w | ~5.5 w |
| 5 — Safety controls | 1 w | ~6.5 w |
| 6 — Barcode scanning | 1 w | ~7.5 w |
| 7 — Payment & charge slip | 4–5 d | ~8.5 w |
| 8 — Refills & verification view | 2–3 d | ~9 w |
| 9 — Dashboard & reports | 4–5 d | ~9.5 w |
| 10 — Hardening, UAT, go-live | 1.5–2 w | **~11.5 w 🎯 M1** |
| 11 — Pharmacist ward verification | 1 w | ~12.5 w |
| 12 — **Nurse eMAR** | 2–3 w | **~15.5 w 🎯 M2** |
| 13 — ○ Inventory on tablet | 1–2 w | ~17 w |
| 14 — ○ Deferred items | as needed | — |

One full-time developer. **Milestone 1 ≈ 11–12 weeks** including proper validation,
UAT and a pilot; **Milestone 2 ≈ 4 weeks** beyond that.

The earlier ROADMAP.md figure of ~7 weeks to Milestone 1 counted build time only
(its Phases 0–6). This list adds the dashboard/reports surface and, more importantly,
real hardening, data-integrity validation, UAT, training and a pilot — which is the
honest number to plan against for software that moves controlled drugs.

**Critical path:** Phase 0.5 role fix (nothing works without it) → Phase 4 dispense
core (everything after depends on it being correct) → Phase 10.5 data-integrity
validation (the gate on go-live).
