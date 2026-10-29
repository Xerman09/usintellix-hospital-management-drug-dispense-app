# Two-hour soak test (Phase 10.4)

A shift is two to eight hours with the app never closed. Everything that
matters here only shows up over time: a leak in the queue poll, a session that
quietly dies, the camera failing to release, the tablet getting hot enough to
throttle.

**This cannot be run from a development machine.** It needs the tablet, on
hospital Wi-Fi, for two unbroken hours. Nothing in this repository has been run
on hardware, so none of the below is known to pass — it is the procedure, not a
result.

---

## Setup

- the real tablet, pinned, on hospital Wi-Fi
- a test database with at least 50 dispensable prescriptions — the queue is
  capped at 300 rows and a 5-row queue proves nothing about scrolling 300
- battery at 100%, **unplugged** (plugged in hides both the drain and the heat)
- a watch, and a sheet of paper

Record before you start:

```bash
php tools/verify_dispense_integrity.php > soak-before.txt
```

---

## The loop

Repeat for two hours. Roughly 10 minutes a lap, so about 12 laps.

1. Work the queue: tap through all nine tabs.
2. Open five prescriptions, scrolling the queue between each.
3. Scan two Rx barcodes and two wristbands.
4. Dispense one medicine, partly.
5. Open Reports, look at the dashboard and two reports.
6. Let it sit idle for four minutes so it locks, then unlock.
7. Every third lap: open **Status** and write down the numbers.

Every half hour, write down:

| | 0:00 | 0:30 | 1:00 | 1:30 | 2:00 |
| --- | --- | --- | --- | --- | --- |
| Battery % | | | | | |
| Queue load, seconds | | | | | |
| Dispense confirm, seconds | | | | | |
| Crashes on Status | | | | | |
| Tablet warm to touch? | | | | | |
| Scan first-try success, out of 4 | | | | | |

---

## What fails the soak

| | Why it matters |
| --- | --- |
| **Any crash on the Status screen** | the pharmacist saw a blank screen mid-shift |
| **Queue load at 2:00 noticeably slower than at 0:00** | something is accumulating. Note the figure |
| **More than ~25% battery per hour** | a shift outlives the charge, and a flat tablet mid-dispense is the worst case |
| **The camera failing to open after many scans** | a released camera that was not re-acquired. Fatal: the wristband scan is required |
| **Being signed out without being idle** | the session is not surviving a backgrounded app |
| **Hot enough to be unpleasant to hold** | it will throttle, and staff will stop using it |
| **Scan first-try success dropping over the two hours** | likely heat or a dirty lens; note which |

---

## Afterwards

```bash
php tools/verify_dispense_integrity.php > soak-after.txt
diff soak-before.txt soak-after.txt
```

Every dispensing made during the soak should appear under **tablet** and be
clean. A finding here that the before-run did not have is a defect the soak
produced, which is exactly what two hours of real use is for.

Then undo what the soak created, so the test database does not fill up with
practice dispensings:

- undo each dispensing from the app, with "soak test" as the reason
- check the ledger for payments left behind if you took any

---

## What a soak test does not tell you

Nothing about a second tablet. Two tablets at two counters working the same
prescriptions is a different test, and the thing to watch there is two
pharmacists dispensing the same slip within seconds of each other. The backend
locks the prescription row for the length of the transaction, which should make
the second one fail cleanly rather than double-give — **should**, because it
has never been tried with two real clients. Do it before the second counter
goes live, not after.
