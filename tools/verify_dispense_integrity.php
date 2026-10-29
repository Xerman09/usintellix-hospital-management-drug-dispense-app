<?php
/**
 * Phase 10.5 -- dispensing data-integrity validation.
 *
 * READ-ONLY. It opens no transaction and writes nothing, so it is safe to run
 * against the live database during the pilot, as often as you like.
 *
 * What it is for
 * --------------
 * The tablet app and the desktop HMS call the SAME dispensing service, so a
 * dispensing made on the tablet should be indistinguishable in the database
 * from one made on the desktop -- except for prescription_dispenses.created_via,
 * which says which client it was. This checks that claim: it walks every
 * dispensing and asserts the invariants the dispensing path is supposed to
 * maintain, then reports the failures GROUPED BY CLIENT. If the tablet were
 * writing a different shape of data, the tablet column is where it shows.
 *
 * It is a go-live gate, not a test suite: it checks real rows, including rows
 * made years before this app existed. A finding is not automatically the
 * tablet's fault -- read it, then decide.
 *
 * Usage
 * -----
 *   php tools/verify_dispense_integrity.php              # every dispensing
 *   php tools/verify_dispense_integrity.php --since=2026-10-01
 *   php tools/verify_dispense_integrity.php --channel=tablet
 *   php tools/verify_dispense_integrity.php --quiet       # summary only
 *
 * Exit code 0 when every invariant holds, 1 when anything failed, so it can be
 * run from a scheduled job during the pilot.
 */

declare(strict_types=1);

ini_set('display_errors', '1');
error_reporting(E_ALL);

$backend = dirname(__DIR__, 2) . '/usintellix-hospital-management-system/backend';
require_once $backend . '/app/Core/Autoload.php';
\App\Core\Env::load();

use App\Core\AuditLogger;
use App\Core\Database;
use App\Modules\Dispensing\Services\DispensingService;

/* ------------------------------------------------------------------ *
 * Arguments
 * ------------------------------------------------------------------ */

$args = [];
foreach (array_slice($argv, 1) as $arg) {
    if (preg_match('/^--([a-z-]+)(?:=(.*))?$/', $arg, $m)) {
        $args[$m[1]] = $m[2] ?? true;
    }
}
$since = isset($args['since']) && is_string($args['since']) ? $args['since'] : null;
$onlyChannel = isset($args['channel']) && is_string($args['channel']) ? $args['channel'] : null;
$quiet = isset($args['quiet']);

const EPS = 0.005;   // money and quantities are rounded to 2-3 places
const QEPS = 0.0005;

$db = Database::connection();

/* ------------------------------------------------------------------ *
 * Findings
 * ------------------------------------------------------------------ */

/** @var array<int, array{check: string, channel: string, ref: string, detail: string}> */
$findings = [];
$checksRun = [];
$notExercised = [];

function finding(string $check, string $channel, string $ref, string $detail): void
{
    global $findings;
    $findings[] = ['check' => $check, 'channel' => $channel, 'ref' => $ref, 'detail' => $detail];
}

function ran(string $check, int $subjects): void
{
    global $checksRun, $notExercised;
    $checksRun[$check] = $subjects;
    if ($subjects === 0) {
        $notExercised[] = $check;
    }
}

function qty(float $n): string
{
    return rtrim(rtrim(number_format($n, 3, '.', ''), '0'), '.');
}

/* ------------------------------------------------------------------ *
 * Load every dispensing in scope, with its items, charges and ledger
 * ------------------------------------------------------------------ */

$where = ['1 = 1'];
$params = [];
if ($since !== null) {
    $where[] = 'd.dispensed_date >= :since';
    $params['since'] = $since;
}
if ($onlyChannel !== null) {
    $where[] = $onlyChannel === 'unknown' ? 'd.created_via IS NULL' : 'd.created_via = :channel';
    if ($onlyChannel !== 'unknown') {
        $params['channel'] = $onlyChannel;
    }
}

$stmt = $db->prepare(
    "SELECT d.*, p.rx_number, p.status AS rx_status, p.dispense_status, p.deleted_at AS rx_deleted,
            p.closed_at, p.valid_until, p.refill_until
     FROM prescription_dispenses d
     LEFT JOIN prescriptions p ON p.id = d.prescription_id
     WHERE " . implode(' AND ', $where) . "
     ORDER BY d.id"
);
$stmt->execute($params);
$dispenses = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (!$dispenses) {
    echo "No dispensings in scope.\n";
    exit(0);
}

$ids = array_column($dispenses, 'id');
$in = implode(',', array_map('intval', $ids));

// Items, with the drug's high-alert flag and the prescribed line.
$items = $db->query(
    "SELECT i.*, dr.is_high_alert, dr.name AS drug_name, pp.quantity AS prescribed_text, pp.refills,
            du.name AS unit_name, l.deleted_at AS lot_deleted, l.quantity_on_hand AS lot_on_hand
     FROM prescription_dispense_items i
     LEFT JOIN drugs dr ON dr.id = i.drug_id
     LEFT JOIN patient_prescriptions pp ON pp.id = i.prescription_item_id
     LEFT JOIN amount_units du ON du.id = dr.dispensing_unit_id
     LEFT JOIN drug_inventory_lots l ON l.id = i.lot_id
     WHERE i.dispense_id IN ({$in})
     ORDER BY i.id"
)->fetchAll(PDO::FETCH_ASSOC);

$itemsBy = [];
foreach ($items as $it) {
    $itemsBy[(int) $it['dispense_id']][] = $it;
}

$charges = $db->query(
    "SELECT * FROM pharmacy_charges WHERE dispense_id IN ({$in}) ORDER BY id"
)->fetchAll(PDO::FETCH_ASSOC);
$chargesBy = [];
foreach ($charges as $c) {
    $chargesBy[(int) $c['dispense_id']][] = $c;
}

$itemIds = array_map('intval', array_column($items, 'id')) ?: [0];
$movements = $db->query(
    "SELECT * FROM drug_stock_movements
     WHERE source_type = 'prescription_dispense_items' AND source_id IN (" . implode(',', $itemIds) . ")
     ORDER BY id"
)->fetchAll(PDO::FETCH_ASSOC);
$movesBy = [];
foreach ($movements as $m) {
    $movesBy[(int) $m['source_id']][] = $m;
}

$payments = $db->query(
    "SELECT dispense_id, SUM(payment_amount) AS paid, COUNT(*) AS n
     FROM patient_ledger_payments
     WHERE dispense_id IN ({$in}) AND deleted_at IS NULL
     GROUP BY dispense_id"
)->fetchAll(PDO::FETCH_ASSOC);
$paidBy = array_column($payments, null, 'dispense_id');

/** @param array<string, mixed> $d */
$channelOf = fn(array $d): string => $d['created_via'] ?: 'unknown';

/* ------------------------------------------------------------------ *
 * Per-dispensing invariants
 * ------------------------------------------------------------------ */

$byChannel = [];
$highAlertSeen = 0;
$multiLotSeen = 0;
$voidedSeen = 0;
$partialSeen = 0;

foreach ($dispenses as $d) {
    $id = (int) $d['id'];
    $ch = $channelOf($d);
    $ref = $d['dispense_number'] ?: "dispense #{$id}";
    $byChannel[$ch] = ($byChannel[$ch] ?? 0) + 1;

    $mine = $itemsBy[$id] ?? [];
    $myCharges = $chargesBy[$id] ?? [];
    $voided = $d['status'] === 'voided';
    if ($voided) {
        $voidedSeen++;
    }

    /* -- A. the dispensing is identifiable -------------------------- */
    if (!preg_match('/^DSP-\d{4}-\d{5,}$/', (string) $d['dispense_number'])) {
        finding('numbering', $ch, $ref, "dispense_number is '{$d['dispense_number']}' -- a dispensing that kept its placeholder was written by a transaction that did not finish");
    }
    if ($d['rx_number'] === null) {
        finding('orphan', $ch, $ref, "prescription #{$d['prescription_id']} does not exist");
    } elseif ($d['rx_deleted'] !== null) {
        finding('orphan', $ch, $ref, "prescription {$d['rx_number']} is soft-deleted but its dispensing is not");
    }

    /* -- B. it gave something --------------------------------------- */
    if (!$mine) {
        finding('empty', $ch, $ref, 'the dispensing has no medicine lines at all');
        continue;
    }
    if (count(array_unique(array_column($mine, 'lot_id'))) > 1) {
        $multiLotSeen++;
    }

    /* -- C/D. the stock ledger matches the medicine lines ----------- */
    foreach ($mine as $it) {
        $itemId = (int) $it['id'];
        $moves = $movesBy[$itemId] ?? [];
        $out = array_values(array_filter($moves, fn($m) => $m['movement_type'] === 'dispensed'));
        $back = array_values(array_filter($moves, fn($m) => $m['movement_type'] === 'dispense_voided'));
        $line = "{$it['drug_name']} x " . qty((float) $it['quantity']) . " (item #{$itemId})";

        if (count($out) !== 1) {
            finding('ledger', $ch, $ref, count($out) . " 'dispensed' stock movements for {$line}; there must be exactly one");
        } elseif (abs((float) $out[0]['quantity'] + (float) $it['quantity']) > QEPS) {
            finding('ledger', $ch, $ref, "stock movement says " . qty((float) $out[0]['quantity']) . " but the line gave " . qty((float) $it['quantity']) . " of {$line}");
        }

        if ($voided) {
            if (count($back) !== 1) {
                finding('void-ledger', $ch, $ref, count($back) . " 'dispense_voided' movements for {$line}; an undone dispensing must put each line back exactly once");
            }
            $net = array_sum(array_map(fn($m) => (float) $m['quantity'], $moves));
            if (abs($net) > QEPS) {
                finding('void-ledger', $ch, $ref, "the stock movements for {$line} net to " . qty($net) . ", not zero -- undoing it did not fully return the stock");
            }
        } elseif ($back) {
            finding('void-ledger', $ch, $ref, "{$line} has a 'dispense_voided' movement although the dispensing is '{$d['status']}'");
        }

        if ($it['prescription_item_id'] !== null && $it['prescribed_text'] === null) {
            finding('orphan', $ch, $ref, "prescription line #{$it['prescription_item_id']} behind {$line} no longer exists");
        }
        if ((float) $it['quantity'] <= 0) {
            finding('quantity', $ch, $ref, "{$line} gave a quantity of " . qty((float) $it['quantity']));
        }
    }

    /* -- E. one charge per medicine line, arithmetic intact --------- */
    $givenByLine = [];
    foreach ($mine as $it) {
        $k = (int) $it['prescription_item_id'];
        $givenByLine[$k] = round(($givenByLine[$k] ?? 0) + (float) $it['quantity'], 3);
    }
    $chargeByLine = [];
    foreach ($myCharges as $c) {
        $k = (int) $c['prescription_item_id'];
        if (isset($chargeByLine[$k])) {
            finding('charges', $ch, $ref, "prescription line #{$k} is charged twice on the same dispensing");
        }
        $chargeByLine[$k] = $c;
    }

    $rate = (float) ($d['discount_rate'] ?? 0);
    foreach ($givenByLine as $lineId => $given) {
        $c = $chargeByLine[$lineId] ?? null;
        if (!$c) {
            finding('charges', $ch, $ref, "prescription line #{$lineId} was given " . qty($given) . " but never charged");
            continue;
        }
        if (abs((float) $c['quantity'] - $given) > QEPS) {
            finding('charges', $ch, $ref, "line #{$lineId} charged for " . qty((float) $c['quantity']) . " but " . qty($given) . " was given");
        }
        $gross = round($given * (float) $c['unit_price'], 2);
        if (abs($gross - (float) $c['gross_amount']) > EPS) {
            finding('charges', $ch, $ref, "line #{$lineId}: " . qty($given) . " x {$c['unit_price']} should be {$gross}, the charge says {$c['gross_amount']}");
        }
        $off = round((float) $c['gross_amount'] * $rate / 100, 2);
        if (abs($off - (float) $c['discount_amount']) > EPS) {
            finding('discount', $ch, $ref, "line #{$lineId}: a {$rate}% discount on {$c['gross_amount']} is {$off}, the charge says {$c['discount_amount']}");
        }
        $net = round((float) $c['gross_amount'] - (float) $c['discount_amount'], 2);
        if (abs($net - (float) $c['net_amount']) > EPS) {
            finding('charges', $ch, $ref, "line #{$lineId}: net should be {$net}, the charge says {$c['net_amount']}");
        }
    }
    foreach ($chargeByLine as $lineId => $c) {
        if (!isset($givenByLine[$lineId])) {
            finding('charges', $ch, $ref, "line #{$lineId} is charged but nothing was given from it");
        }
    }

    /* -- F. the header adds up to its charges ----------------------- */
    foreach ([['gross_amount', 'gross'], ['discount_amount', 'discount'], ['net_amount', 'net']] as [$col, $word]) {
        $sum = round(array_sum(array_map(fn($c) => (float) $c[$col], $myCharges)), 2);
        if (abs($sum - (float) $d[$col]) > EPS) {
            finding('totals', $ch, $ref, "{$word}: the dispensing says {$d[$col]}, its charges add to {$sum}");
        }
    }

    /* -- G. undoing it cancelled its money -------------------------- */
    if ($voided) {
        foreach ($myCharges as $c) {
            if ($c['status'] !== 'voided') {
                finding('void-charges', $ch, $ref, "charge #{$c['id']} is still '{$c['status']}' on an undone dispensing");
            }
        }
        foreach (['voided_at', 'voided_by', 'void_reason'] as $col) {
            if ($d[$col] === null || $d[$col] === '') {
                finding('void-record', $ch, $ref, "undone but {$col} is empty -- there is no record of who undid it or why");
            }
        }
    }

    /* -- H. the high-alert second check -----------------------------
     *
     * Both directions of this comparison are weak on their own, and it is
     * worth being clear why: drugs.is_high_alert is CURRENT state, while
     * check_status is what was true when the medicine was handed over.
     * Flagging a drug high-alert, or unflagging it, changes the first and not
     * the second, so a mismatch can mean a skipped check OR an edit to the
     * Drug Catalog since. Nothing records the flag as it stood at the time.
     *
     * So the direction that could mean a missed safety step is reported for a
     * human to settle, and the harmless direction is reported as information
     * and kept out of the pass / fail count.
     */
    $hasHighAlert = (bool) array_filter($mine, fn($i) => (int) $i['is_high_alert'] === 1);
    if ($hasHighAlert) {
        $highAlertSeen++;
        if (!in_array($d['check_status'], ['awaiting', 'checked'], true)) {
            finding('high-alert', $ch, $ref, 'contains a high-alert medicine but check_status is ' . var_export($d['check_status'], true)
                . ' -- either the second check was skipped, or this medicine was flagged high-alert after it was dispensed');
        }
    } elseif ($d['check_status'] !== null) {
        finding('catalog-changed', $ch, $ref, "was second-checked ('{$d['check_status']}') but nothing in it is high-alert today -- the Drug Catalog flag changed after it was dispensed");
    }
    if ($d['check_status'] === 'checked') {
        if ($d['checked_by'] === null || $d['checked_at'] === null) {
            finding('high-alert', $ch, $ref, 'marked checked without recording who checked it or when');
        } elseif ((int) $d['checked_by'] === (int) $d['created_by']) {
            finding('high-alert', $ch, $ref, "checked by the same user (#{$d['created_by']}) who prepared it -- a second check must be a second person");
        }
    }

    /* -- I. money taken never exceeds money owed -------------------- */
    $paid = round((float) ($paidBy[$id]['paid'] ?? 0), 2);
    if ($paid > (float) $d['net_amount'] + EPS) {
        finding('payments', $ch, $ref, "PHP {$paid} taken against a net of {$d['net_amount']}");
    }
    if ($voided && $paid > EPS) {
        finding('refund-owed', $ch, $ref, "PHP {$paid} was paid and the dispensing was then undone -- the patient is owed a refund (not a defect, but it must be settled in the ledger)");
    }
}

ran('per-dispensing invariants', count($dispenses));
ran('voided path', $voidedSeen);
ran('multi-lot path', $multiLotSeen);
ran('high-alert path', $highAlertSeen);

/* ------------------------------------------------------------------ *
 * J. No line was given more than it was prescribed
 *
 * Uses the dispensing service's OWN quantity parsing and fill arithmetic, so
 * this cannot drift from the rule the service enforces at the counter.
 * ------------------------------------------------------------------ */

$lineIds = array_values(array_unique(array_filter(array_map(fn($i) => (int) $i['prescription_item_id'], $items))));
$overGiven = 0;
foreach ($lineIds as $lineId) {
    $row = null;
    foreach ($items as $it) {
        if ((int) $it['prescription_item_id'] === $lineId) {
            $row = $it;
            break;
        }
    }
    if (!$row || $row['prescribed_text'] === null) {
        continue;
    }
    $prescribed = DispensingService::parseQuantity((string) $row['prescribed_text'], $row['unit_name']);
    if ($prescribed === null) {
        continue;   // free-text quantity ("as directed"): nothing to compare against
    }

    // Every fill of this line, as the service groups them.
    $perFill = [];
    foreach ($items as $it) {
        if ((int) $it['prescription_item_id'] !== $lineId) {
            continue;
        }
        $parent = null;
        foreach ($dispenses as $d) {
            if ((int) $d['id'] === (int) $it['dispense_id']) {
                $parent = $d;
                break;
            }
        }
        if (!$parent || $parent['status'] === 'voided') {
            continue;   // an undone dispensing gave nothing
        }
        $f = (int) $it['fill_number'];
        $perFill[$f] = round(($perFill[$f] ?? 0) + (float) $it['quantity'], 3);
    }

    $refills = (int) ($row['refills'] ?? 0);
    foreach ($perFill as $fill => $given) {
        if ($given > $prescribed + QEPS) {
            $overGiven++;
            finding('over-dispensed', 'any', "line #{$lineId}", "fill {$fill} gave " . qty($given) . " of a prescribed " . qty($prescribed) . " {$row['unit_name']}");
        }
        if ($fill > $refills + 1) {
            $overGiven++;
            finding('over-dispensed', 'any', "line #{$lineId}", "fill {$fill} exists but the prescription allows " . $refills . " refill(s)");
        }
    }
}
ran('prescribed-quantity ceiling', count($lineIds));

/* ------------------------------------------------------------------ *
 * K. Stock is never negative, and the ledger explains the shelf
 * ------------------------------------------------------------------ */

$negative = $db->query(
    "SELECT id, lot_number, quantity_on_hand FROM drug_inventory_lots WHERE deleted_at IS NULL AND quantity_on_hand < 0"
)->fetchAll(PDO::FETCH_ASSOC);
foreach ($negative as $lot) {
    finding('stock', 'any', "lot {$lot['lot_number']}", "quantity_on_hand is {$lot['quantity_on_hand']} -- more was dispensed than the lot held");
}

$drift = $db->query(
    "SELECT l.id, l.lot_number, l.quantity_on_hand, COALESCE(SUM(m.quantity), 0) AS ledger
     FROM drug_inventory_lots l
     LEFT JOIN drug_stock_movements m ON m.lot_id = l.id
     WHERE l.deleted_at IS NULL
     GROUP BY l.id, l.lot_number, l.quantity_on_hand
     HAVING ABS(l.quantity_on_hand - ledger) > 0.001"
)->fetchAll(PDO::FETCH_ASSOC);
foreach ($drift as $lot) {
    finding('stock-ledger', 'any', "lot {$lot['lot_number']}",
        "the shelf says {$lot['quantity_on_hand']} but its movements add to {$lot['ledger']} -- a difference of "
        . qty((float) $lot['quantity_on_hand'] - (float) $lot['ledger']) . ", so some change to this lot never reached the ledger");
}
ran('stock vs ledger', (int) $db->query("SELECT COUNT(*) FROM drug_inventory_lots WHERE deleted_at IS NULL")->fetchColumn());

/* ------------------------------------------------------------------ *
 * L. Orphans in the other direction
 * ------------------------------------------------------------------ */

$orphanItems = (int) $db->query(
    "SELECT COUNT(*) FROM prescription_dispense_items i
     LEFT JOIN prescription_dispenses d ON d.id = i.dispense_id WHERE d.id IS NULL"
)->fetchColumn();
if ($orphanItems) {
    finding('orphan', 'any', 'prescription_dispense_items', "{$orphanItems} medicine line(s) belong to no dispensing");
}

$orphanCharges = (int) $db->query(
    "SELECT COUNT(*) FROM pharmacy_charges c
     LEFT JOIN prescription_dispenses d ON d.id = c.dispense_id
     WHERE c.dispense_id IS NOT NULL AND d.id IS NULL"
)->fetchColumn();
if ($orphanCharges) {
    finding('orphan', 'any', 'pharmacy_charges', "{$orphanCharges} charge(s) point at a dispensing that does not exist");
}

$orphanMoves = (int) $db->query(
    "SELECT COUNT(*) FROM drug_stock_movements m
     LEFT JOIN prescription_dispense_items i ON i.id = m.source_id
     WHERE m.source_type = 'prescription_dispense_items' AND i.id IS NULL"
)->fetchColumn();
if ($orphanMoves) {
    finding('orphan', 'any', 'drug_stock_movements', "{$orphanMoves} stock movement(s) reference a medicine line that does not exist");
}

/* ------------------------------------------------------------------ *
 * M. Closed prescriptions stay closed
 * ------------------------------------------------------------------ */

$closed = $db->query(
    "SELECT p.id, p.rx_number, p.closed_at, p.closed_by, p.close_reason,
            (SELECT COUNT(*) FROM prescription_dispenses d
              WHERE d.prescription_id = p.id AND d.status = 'completed' AND d.created_at > p.closed_at) AS after_close
     FROM prescriptions p
     WHERE p.dispense_status = 'closed' AND p.deleted_at IS NULL"
)->fetchAll(PDO::FETCH_ASSOC);
foreach ($closed as $rx) {
    foreach (['closed_at', 'closed_by', 'close_reason'] as $col) {
        if ($rx[$col] === null || $rx[$col] === '') {
            finding('closed', 'any', $rx['rx_number'], "closed but {$col} is empty");
        }
    }
    if ((int) $rx['after_close'] > 0) {
        finding('closed', 'any', $rx['rx_number'], "{$rx['after_close']} dispensing(s) were made after it was closed on {$rx['closed_at']}");
    }
}
ran('closed path', count($closed));

/* ------------------------------------------------------------------ *
 * N. Refill requests answered by a real dispensing
 * ------------------------------------------------------------------ */

$badRefills = $db->query(
    "SELECT r.id, r.status, r.dispense_id, d.status AS dispense_status
     FROM prescription_refill_requests r
     LEFT JOIN prescription_dispenses d ON d.id = r.dispense_id
     WHERE (r.status = 'dispensed' AND (r.dispense_id IS NULL OR d.id IS NULL OR d.status <> 'completed'))
        OR (r.status = 'pending' AND r.dispense_id IS NOT NULL)"
)->fetchAll(PDO::FETCH_ASSOC);
foreach ($badRefills as $r) {
    finding('refills', 'any', "refill request #{$r['id']}",
        $r['status'] === 'pending'
            ? "still pending but already linked to dispensing #{$r['dispense_id']}"
            : "marked dispensed against dispensing #" . var_export($r['dispense_id'], true) . " which is " . var_export($r['dispense_status'], true));
}
ran('refill links', (int) $db->query("SELECT COUNT(*) FROM prescription_refill_requests")->fetchColumn());

/* ------------------------------------------------------------------ *
 * O/P. The audit trail (Phase 10.6)
 *
 * Dispensing only began writing hipaa_audit_logs rows in Phase 10, so
 * coverage is measured from the first such row onwards -- counting older
 * dispensings as unlogged would say nothing useful.
 * ------------------------------------------------------------------ */

$firstAudit = $db->query(
    "SELECT MIN(created_at) FROM hipaa_audit_logs WHERE action = '" . AuditLogger::ACTION_DISPENSE_MEDICINE . "'"
)->fetchColumn();

$auditSummary = [];
if ($firstAudit) {
    $stmt = $db->prepare(
        "SELECT d.id, d.dispense_number, d.created_via, d.created_at,
                (SELECT COUNT(*) FROM hipaa_audit_logs a
                  WHERE a.action = :action AND a.description LIKE CONCAT('%', d.dispense_number, '%')) AS logged
         FROM prescription_dispenses d
         WHERE d.created_at >= :first
         ORDER BY d.id"
    );
    $stmt->execute(['action' => AuditLogger::ACTION_DISPENSE_MEDICINE, 'first' => $firstAudit]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $ch = $row['created_via'] ?: 'unknown';
        $auditSummary[$ch] ??= ['total' => 0, 'logged' => 0];
        $auditSummary[$ch]['total']++;
        if ((int) $row['logged'] > 0) {
            $auditSummary[$ch]['logged']++;
        } else {
            finding('audit', $ch, $row['dispense_number'], 'no DISPENSE_MEDICINE row in hipaa_audit_logs -- this dispensing is not in the audit trail');
        }
    }
}

$chain = AuditLogger::verifyIntegrity();

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

$line = str_repeat('-', 78);

echo "\nDISPENSING DATA-INTEGRITY VALIDATION\n{$line}\n";
echo 'Database : ' . ($_ENV['DB_DATABASE'] ?? '?') . ' on ' . ($_ENV['DB_HOST'] ?? '?') . "\n";
echo 'Scope    : ' . count($dispenses) . ' dispensing(s)'
    . ($since ? " dispensed on or after {$since}" : ' (all time)')
    . ($onlyChannel ? ", client '{$onlyChannel}'" : '') . "\n";
echo 'Run at   : ' . date('Y-m-d H:i:s') . "\n";
if ($onlyChannel !== null) {
    echo "\nNote: --channel narrows the per-dispensing checks only. The checks that are\n"
       . "about the database as a whole -- stock against the ledger, orphans, closed\n"
       . "prescriptions, refill links -- always run, and their findings are labelled\n"
       . "[any] rather than attributed to a client.\n";
}
echo "\n";

echo "By client\n{$line}\n";
ksort($byChannel);
foreach ($byChannel as $ch => $n) {
    $failed = count(array_filter($findings, fn($f) => $f['channel'] === $ch));
    printf("  %-10s %4d dispensing(s)   %s\n", $ch, $n, $failed ? "{$failed} finding(s)" : 'clean');
}
if (!isset($byChannel['tablet'])) {
    echo "\n  No dispensing has been made from the tablet yet, so there is nothing\n"
       . "  to compare against the desktop. Until there is, this run only proves\n"
       . "  the invariants hold for the desktop's own rows.\n";
}

echo "\nPaths exercised\n{$line}\n";
foreach ($checksRun as $name => $n) {
    printf("  %-32s %s\n", $name, $n > 0 ? "{$n} subject(s)" : 'NONE -- not exercised');
}
if ($notExercised) {
    echo "\n  Not exercised means not verified. These paths have no rows to check,\n"
       . "  so the invariants for them are untested, not satisfied.\n";
}

echo "\nAudit trail (10.6)\n{$line}\n";
if (!$firstAudit) {
    echo "  No DISPENSE_MEDICINE rows at all: dispensing audit logging has never run.\n";
} else {
    echo "  Logging live since {$firstAudit}\n";
    foreach ($auditSummary as $ch => $s) {
        printf("  %-10s %d of %d dispensing(s) in the audit trail\n", $ch, $s['logged'], $s['total']);
    }
}
$auditRows = (int) $db->query("SELECT COUNT(*) FROM hipaa_audit_logs")->fetchColumn();
printf("  Tamper chain: %s -- %d of %d row(s) verified\n",
    ($chain['valid'] ?? false) ? 'intact' : 'BROKEN',
    (int) ($chain['total_verified'] ?? 0),
    $auditRows);
if (!($chain['valid'] ?? false)) {
    if (isset($chain['corrupted_id'])) {
        echo "  Stops at audit row #{$chain['corrupted_id']}. AuditLogger::verifyIntegrity() reports\n"
           . "  the FIRST break and gives up there, so that is a floor, not a count.\n";
    }
    echo "  A broken chain is not something to repair: recomputing the hashes would\n"
       . "  erase the only evidence of what happened, and is indistinguishable from\n"
       . "  tampering. It needs investigating by date against who had access.\n";
}

echo "\nFindings\n{$line}\n";
if (!$findings) {
    echo "  None. Every invariant above holds for every dispensing in scope.\n";
} else {
    $grouped = [];
    foreach ($findings as $f) {
        $grouped[$f['check']][] = $f;
    }
    foreach ($grouped as $check => $group) {
        printf("\n  %s -- %d\n", strtoupper($check), count($group));
        if ($quiet) {
            continue;
        }
        foreach ($group as $f) {
            printf("    [%s] %s: %s\n", $f['channel'], $f['ref'], $f['detail']);
        }
    }
}

// Two kinds of finding are reported but do not fail the run: one is a business
// matter rather than a data defect (a refund the ledger still owes), the other
// cannot be judged from the data at all (a Drug Catalog flag changed since).
const INFORMATIONAL = ['refund-owed', 'catalog-changed'];
$real = array_filter($findings, fn($f) => !in_array($f['check'], INFORMATIONAL, true));
printf("\n%s\n%s  --  %d finding(s), %d needing a decision\n%s\n",
    $line,
    $real ? 'FAILED' : 'PASSED',
    count($findings),
    count($real),
    $line);

exit($real ? 1 : 0);
