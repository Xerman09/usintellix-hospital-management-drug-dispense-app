# USIntellix Pharmacy Tablet — counter card

*One page. Print it, laminate it, leave it at the counter.*

---

## Starting a shift

1. **Pin the app.** Overview (square) → pin icon on the app's card.
   Do this after every reboot, before you sign in.
2. Sign in with your own HMS account. Not a shared one — the second check and
   the audit trail are both "who did this", and a shared login makes them lie.
3. The screen locks itself after **3 minutes**. Your PIN or password unlocks it;
   you are not signed out, so the queue is where you left it.

---

## Giving a medicine

| | |
| --- | --- |
| 1 | Find the prescription — **Queue**, or **Scan Rx** on the slip |
| 2 | Check the red band at the top: allergies, high-alert, look-alike names |
| 3 | **Scan the patient's wristband.** This is required |
| 4 | Enter how much of each medicine you are giving |
| 5 | Check the lot — earliest expiry is chosen for you. Change it if you must |
| 6 | **Dispense** |
| 7 | Take payment, print the labels and the charge slip |

**The wristband scan cannot be skipped.** If the camera will not read it, type
the patient number instead — the scan sheet has a box for it. That is the
fallback, and it is always there. Do not hand medicine over without one or the
other.

---

## When it stops you

| It says | What it means | What to do |
| --- | --- | --- |
| **Wrong patient** | the wristband is not this prescription's patient | stop; find the right patient or the right slip |
| **Lot under recall** | that batch is quarantined | pick another lot; set the box aside |
| **Expired** / **within 60 days** | the lot cannot be given | pick another lot |
| **Awaiting check** | high-alert medicine | a *second* pharmacist checks it before the patient gets it. Not you — you prepared it |
| **Clinical verification hold** | a pharmacist raised an intervention | resolve it on the desktop first |
| **Nothing to fill** | nothing on the slip is a catalog medicine | the pharmacy has nothing to give; use the desktop |

A red **STOP** is a stop. There is no override on this app, and that is
deliberate.

---

## The high-alert second check

1. The first pharmacist dispenses; it shows **Awaiting check**.
2. A **different** pharmacist opens it and signs in on the check sheet with
   their own account. The tablet keeps you both signed in.
3. They tick every point: patient, medicine, strength, quantity, lot and
   expiry, directions.
4. **Pass** → hand it over. **Fail** → it is undone, and the stock goes back.

The app refuses a check by the person who prepared it. Do not pass the tablet
to a colleague while still signed in as yourself and have them tick the boxes —
that defeats the whole control and the audit trail will name you, not them.

---

## When something looks wrong

- **"Updated 40s ago"** at the top of the queue — someone may have filled this
  slip on the desktop since. Tap it to refresh before you give anything.
- **A dispensing you did not mean to make** — open it and **Undo**, with a
  reason. The stock goes back and the charges are cancelled. If it was paid
  for, refund the patient and record it in the ledger — the app cannot do that
  part for you.
- **The app shows an error screen** — reload it, then open the prescription's
  history and check whether the dispensing actually happened before you give
  anything again. Nothing is recorded until the server confirms it, but check.
- **Nothing loads** — **Status** in the left rail → *Test the connection*.
  Take a photo of that screen for IT; there is nothing on it that identifies a
  patient.

---

## Falling back to the desktop

The desktop HMS does everything this tablet does. If the tablet is lost, flat,
or the counter is busy and you do not trust it, **use the desktop** — the two
work on the same prescriptions and the same stock, and neither has a private
copy of anything.

---

## Ending a shift

**Sign out.** Not just lock — sign out. Locking keeps your session alive, which
is right for a tea break and wrong at the end of a shift.
