# Pharmacist UAT script (Phase 10.7)

Run this with **two pharmacists** on a **test database**, on the **real
tablet**, at the **real counter**, standing up. Not at a desk with a mouse.

Each case says what to do and what should happen. Write what actually happened.
A case that "worked but felt wrong" is a finding — note it. The point of UAT is
not to prove the app works; it is to find out what the people who have to use
it all day think of it.

Before you start: `php tools/verify_dispense_integrity.php` and keep the
output. Run it again at the end and compare.

---

## Setup

| | |
| --- | --- |
| Tablet | pinned (see `tools/KIOSK-SETUP.md`), on hospital Wi-Fi |
| Server | `https://` — if Diagnostics says HTTP, stop. That is a blocker, not a note |
| Accounts | two pharmacists, each knowing their own password |
| Data | at least: one plain prescription, one with a high-alert medicine, one with a refill, one partly dispensed, one for a senior citizen, one patient with a recorded allergy |

If the test database has no prescription for a high-alert medicine, make one
first. The second check is the control most worth testing and it cannot be
tested without one.

---

## 1. Signing in

| # | Do | Expect |
| --- | --- | --- |
| 1.1 | Sign in | Queue, with counts on the tabs |
| 1.2 | Sign in with the wrong password 5 times | locked out, with the wait counting down |
| 1.3 | Sign in, then leave it 3 minutes | locked; the queue is still behind it |
| 1.4 | Unlock | straight back to where you were, no 2FA again |
| 1.5 | Sign in as a doctor or a nurse | refused, saying this account cannot dispense |
| 1.6 | Sign out, hand to the other pharmacist, they sign in | their name in the bar, not yours |

**Watch for:** how long the sign-in takes when the counter is busy. If it is
slow enough to be annoying, people will share a login, and then 1.6 and the
whole second check are worthless.

---

## 2. Finding the prescription

| # | Do | Expect |
| --- | --- | --- |
| 2.1 | Scan the Rx barcode on a paper slip | that prescription opens |
| 2.2 | Scan a slip that is already fully dispensed | it opens, and says so |
| 2.3 | Scan something that is not an Rx barcode | a clear "not a prescription", no crash |
| 2.4 | Search a patient's surname | matching slips |
| 2.5 | Search a patient number | that patient's slips |
| 2.6 | Tap through every queue tab | each loads; counts match what is listed |

**Watch for:** the camera. Does it read a creased slip? A slip under the
counter's own light? At arm's length? This is the thing that has never been
tested on hardware, so spend real time here.

---

## 3. Giving a medicine

| # | Do | Expect |
| --- | --- | --- |
| 3.1 | Open a plain prescription | medicines, prescribed/given/remaining, allergies at the top |
| 3.2 | Try to dispense without scanning the wristband | refused, pointing at the scan |
| 3.3 | Scan the wristband | the patient confirms, the dispense unlocks |
| 3.4 | Type the patient number instead of scanning | same result |
| 3.5 | Scan a DIFFERENT patient's wristband | red STOP, wrong patient, no way past it |
| 3.6 | Give the full quantity | confirmed with a DSP number |
| 3.7 | Give less than prescribed | accepted; the slip shows partly dispensed |
| 3.8 | Give the rest | accepted; the slip shows dispensed |
| 3.9 | Try to give more than prescribed | refused, saying how much is left |
| 3.10 | Dispense something whose first lot cannot cover it | spans two lots, both shown |
| 3.11 | Pick a lot by hand | that lot is used |
| 3.12 | Try to pick an expired or recalled lot | it is listed, disabled, with the reason |

**Watch for:** the number pad. Is it reachable one-handed while holding a box?

---

## 4. The high-alert second check

| # | Do | Expect |
| --- | --- | --- |
| 4.1 | Dispense a high-alert medicine | "awaiting check", not handed over |
| 4.2 | Try to check it yourself | refused: you prepared it |
| 4.3 | Second pharmacist signs in on the check sheet | accepted; the first stays signed in |
| 4.4 | Confirm who the identity bar names after 4.3 | still the first pharmacist |
| 4.5 | Try to pass with a point unticked | refused |
| 4.6 | Tick all and pass | checked; it can be handed over |
| 4.7 | On another one, fail the check | undone, stock back, reason recorded |

**Watch for:** 4.3 and 4.4. If the second pharmacist signing in displaces the
first, say so immediately — it is the thing most likely to make staff route
around the control.

---

## 5. Money

| # | Do | Expect |
| --- | --- | --- |
| 5.1 | Dispense for a senior citizen with an ID number | 20% off, ID recorded |
| 5.2 | Senior discount with no ID number | refused |
| 5.3 | Senior discount for a patient under 60 | refused |
| 5.4 | PWD discount with an ID | 20% off |
| 5.5 | Another discount with no reason | refused |
| 5.6 | Take payment in full | settled |
| 5.7 | Take part payment | the balance owed is right |
| 5.8 | Try to overpay | refused, saying what is owed |
| 5.9 | Print the charge slip | totals match; the discount is itemised |
| 5.10 | Undo a dispensing that was paid for | undone, AND it tells you a refund is owed |

**Watch for:** 5.10. The app cannot refund — it only tells you. Make sure the
pharmacist reads that line, because if they do not, the patient is out of
pocket.

---

## 6. Refills and verification

| # | Do | Expect |
| --- | --- | --- |
| 6.1 | Dispense a refill the patient requested | the request is answered |
| 6.2 | Decline a refill with a reason | declined; the patient can see why |
| 6.3 | Try a refill past the refill period | refused, with the date |
| 6.4 | Open a prescription on clinical-verification hold | the hold is shown, dispensing blocked |
| 6.5 | Work the "To verify" tab | matches the desktop's list |

---

## 7. When things go wrong

| # | Do | Expect |
| --- | --- | --- |
| 7.1 | Turn Wi-Fi off, then open the queue | a plain "cannot reach the pharmacy server", no spinner forever |
| 7.2 | Turn Wi-Fi off mid-dispense, then on | nothing dispensed twice. **Check the history** |
| 7.3 | Walk to the far end of the pharmacy and back | reconnects on its own |
| 7.4 | Let the battery go under 15% | still usable |
| 7.5 | Rotate the tablet | stays landscape |
| 7.6 | Press Home, Overview, Back | cannot leave the app; Back goes back a screen |
| 7.7 | Open **Status** | server address, version, who is signed in, no patient data |

**7.2 is the most important case in this document.** A dispensing that happens
twice is a patient taking a double dose. Do it at least three times, and check
the prescription history after every one.

---

## 8. Side by side with the desktop

| # | Do | Expect |
| --- | --- | --- |
| 8.1 | Dispense on the tablet, open the slip on the desktop | identical |
| 8.2 | Dispense on the desktop, refresh the tablet | appears |
| 8.3 | Open the same slip on both, dispense on the desktop, then the tablet | the tablet refuses or shows the new state — it must not double-give |
| 8.4 | Undo on the desktop, look at the tablet | reflected after a refresh |
| 8.5 | `php tools/verify_dispense_integrity.php` | the **tablet** column is clean |

8.5 is the whole point of the pilot. If the tablet column has findings the
desktop column does not, stop and read them.

---

## Afterwards

Ask both pharmacists, and write down the answers:

1. Would you rather use this or the desktop, at a busy counter?
2. What did you have to do twice because the first attempt did not register?
3. What made you want to find a way around it?
4. Did anything make you unsure whether a medicine had been given?
5. What would you not want to explain to a patient?

Question 3 matters most. A safety control that staff route around is worse than
one that is not there, because it looks like it is working.

---

## Blockers

Stop the pilot and fix, before anything else:

- any case where a medicine could be given twice
- any case where a STOP can be got past
- the second check being passable by the preparer
- the server reachable over plain HTTP
- the tablet leaving the app to the launcher with a session open
- the tablet column in 8.5 showing findings the desktop's does not
