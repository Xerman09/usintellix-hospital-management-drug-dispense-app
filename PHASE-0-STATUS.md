# Phase 0 — Discovery & Environment Readiness: status

**Date:** 2026-10-22
**Phase:** 0 of 14 (see [PHASES.md](PHASES.md))

| # | Sub-phase | Status |
| --- | --- | --- |
| 0.1 | Tablet hardware decision | ⏸ **needs you** |
| 0.2 | HTTPS + stable hostname | ⏸ **needs IT** |
| 0.3 | Counter role decision | ✅ **settled — addition, not migration** |
| 0.4 | Test accounts & seed data | ✅ **done** (one gap left to you) |
| 0.5 | Backend role fix | ✅ **done & verified** |
| 0.6 | Wi-Fi coverage check | ⏸ **needs you (physical)** |

---

## 0.5 — Backend role fix ✅

**Implemented differently from the roadmap, and better.** The roadmap said to add
`pharmacist` to `DispensingService::ROLES`. While reading `RoleMiddleware` I found
the codebase already has a documented mechanism for exactly this situation —
`backend/config/role_access.php`, whose own header says:

> *"The nursing roles were added later, so instead of editing hundreds of route
> lists… grants: extra routes a role may call, by HTTP method and path."*

`pharmacist` already had a grants block there; it simply had no pharmacy paths and
no write grants at all. `RoleAccess::CLOSED_ROLE_SETS` confirms grants *can* open
`['admin','receptionist','doctor']` routes — only admin-only and patient-only
routes are sealed.

**Why grants beat editing the constant:**

- **Per-method precision.** The pharmacist gets `GET` on stock and `POST` on the
  dispensing workflow, while receiving/transferring/destroying stock stays with
  admin. Editing `DispensingService::ROLES` would have handed over every
  `/drug-inventory` write at once, including `DELETE`.
- **No blast radius.** The constant is also read by
  `PharmacyReportService::ROLES`, so editing it silently changes the reports
  module's gate too. The grant does what it says and nothing else.
- **It's the house pattern**, so the next person reading the file finds the change
  where the comments say to look.

**Changed:** `backend/config/role_access.php` — the `pharmacist` grants block.
Reads added: `/dispensing`, `/dispensing/*`, `/drug-inventory`,
`/drug-inventory/*`, `/warehouses/*`, `/pharmacy-dashboard`,
`/pharmacy-reports/*`. Writes added (POST only): dispense, check, void, close,
payment, refill-request, refill-decline, labels/customize,
clinical-verifications/save.

**Verified** with a 32-case check against the real config and the real
`RoleAccess` class (`scratchpad/check_roles.php`): **ALL PASS**, covering

- every `/dispensing` read and write the tablet app needs → allowed
- `POST /drug-inventory/receive|transfer|destroy`, `PUT`/`DELETE /drug-inventory`,
  `POST /warehouses`, `POST /warehouses/stock-levels` → still denied
- regression: `receptionist` and `doctor` unchanged (allow), `nurse` and `patient`
  still denied

**Not committed.** The change sits in the working tree. Note the HMS repo also has
unrelated in-progress work there (a pharmacy-compounding feature, modified
`DrugInventory/routes.php` plus new untracked files) — that is not mine and I left
it alone.

---

## 0.3 — Counter role decision ✅

**Answer: adding the role, not migrating users.** Evidence from the database:

- A `pharmacist` role exists ("Pharmacy Staff") with **1 user** (`pharmacist`,
  id 1682, active, unlocked, password set 2026-10-15, `must_change_password = 0`).
- **Total dispenses ever recorded: 1**, by an `admin` user, dated 2026-10-22.

So there is no established receptionist-at-the-counter practice to migrate away
from — this is a dev/demo dataset. The `pharmacist` role is free to be the counter
user, which is what 0.5 now enables.

Role distribution for reference: doctor 11, admin 4, receptionist 2, accountant 1,
charge_nurse 1, pharmacist 1; nurse/cna/lab_technician/clinician and the rest 0.

---

## 0.4 — Test accounts & seed data ✅

**Already present in the dev database** (no work needed):

| Fixture | Count | Needed by |
| --- | --- | --- |
| Pharmacist account | 1 (usable) | Phase 2 |
| Drugs | 29 | Phase 3–4 |
| Lots, all in stock | 38 | Phase 4 |
| Warehouses | 3 | Phase 4 |
| High-alert drugs **with lots in stock** | 3 | Phase 5.1 second check |
| LASA drugs | 4 | Phase 5.5 |
| Inactive / quarantined lots | 2 | Phase 4.4 |
| Near-expiry lots (≤60 days) | 2 | Phase 4.4 |
| Pending prescriptions | 5 | Phase 3 |

**Gaps found and filled** — `fixtures/dev_fixtures.sql`, applied to the dev
database and verified:

- `DEV-EXPIRED-001` — expired 30 days ago but **in stock and active**, so the lot
  picker must refuse it on expiry alone (there were zero expired lots before).
- `DEV-RECALL-001` + recall `RC-DEV-0001` (Class II, active) — a lot that is
  otherwise perfectly usable (expires 2027-10-22, 250 on hand, active) and must be
  blocked purely by the recall (there were zero recalls before).

The script is **idempotent** (verified: ran twice, still 2 lots / 1 recall),
carries its own undo, and is deliberately **outside `backend/database/seed/`** so
the project's seed convention can never carry these deliberately-broken rows into
production.

**Gap left to you:** no prescription is in `partial` or `closed` state, so the
Phase 3.2 status filters can't be fully exercised yet. I did not fake these in
SQL on purpose — writing those rows by hand would leave `prescription_dispenses`,
`pharmacy_charges` and `drug_stock_movements` inconsistent with each other, which
is worse than having no fixture. **Please create them through the desktop HMS:**
partly dispense one of the 5 pending prescriptions, and close another with a reason.

---

## Still open

### 0.1 — Tablet hardware *(needs you)*
Model, screen size, Android version, camera quality. Decides min SDK, the layout
breakpoints for Phase 1.3's `SplitView`, and whether Phase 6 barcode scanning is
viable in pharmacy lighting.

### 0.2 — HTTPS + stable hostname *(needs IT — the real blocker)*
`backend/.env` currently points at `DB_HOST=127.0.0.1` and the API is served over
plain HTTP from XAMPP. Confirmed working: `GET /dispensing` returns **HTTP 401**
unauthenticated, so routing and `AuthMiddleware` are healthy over HTTP.

For a pilot this needs a stable hostname and a TLS certificate. PHI over cleartext
on hospital Wi-Fi isn't acceptable, and Android blocks cleartext by default —
`patient_mobile_app` works around that with a network-security exception that
should **not** be carried into a staff app.

Also worth resolving: the HMS `CLAUDE.md` says the real database is a remote host,
but `.env` currently points to local. Before any pilot, confirm which database the
tablet will actually talk to.

### 0.6 — Wi-Fi coverage *(needs you — physical)*
Walk the pharmacy counter and the wards with the tablet and find the dead spots.
This matters more than usual because the app deliberately **does not** queue
dispenses offline.

### One verification I couldn't complete
Phase 0's exit criterion is "pharmacist account returns 200 on `/dispensing`". I
proved the authorisation layer with the 32-case check against the real class and
config, and proved the route and auth middleware respond over HTTP. The remaining
step is a real login as `pharmacist`, which needs that account's password — I won't
reset a user credential to test it. Either give me the test password, or log in as
`pharmacist` on the desktop HMS and confirm the Dispensing screen now opens.

---

## Phase 0 exit criteria

| Criterion | Status |
| --- | --- |
| Authorisation lets a pharmacist dispense | ✅ verified (32/32 checks) |
| Other roles unaffected | ✅ verified |
| Stock writes still admin-only | ✅ verified |
| Test fixtures cover the safety paths | ✅ except `partial` / `closed` Rx |
| Pharmacist account usable | ✅ exists, active, unlocked |
| End-to-end 200 on `/dispensing` | ⏸ needs the test password |
| Tablet in hand | ⏸ 0.1 |
| HTTPS endpoint reachable from it | ⏸ 0.2 |

**Phase 1 (project scaffold) is not blocked** by any of the open items — it needs
no tablet and no HTTPS. Only the pilot in Phase 10 truly depends on 0.1/0.2/0.6.
