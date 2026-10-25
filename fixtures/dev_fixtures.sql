-- ========================================================
-- Pharmacy Tablet App -- DEV TEST FIXTURES (Phase 0.4)
--
-- NOT a seed. Deliberately kept OUT of backend/database/seed/ so it can
-- never be applied to production by whoever runs the seed files: these are
-- deliberately broken/unusable lots that exist only so the tablet app's
-- safety paths can be exercised.
--
--   * one EXPIRED lot          -- Phase 4: "expired lots are never used"
--   * one RECALLED lot + an
--     active pharmacy_batch_recall -- Phase 4.4: recalled lot unselectable
--
-- Already present in the dev database, so not created here:
--   * 3 high-alert drugs with lots in stock  -- Phase 5.1 second check
--   * 4 LASA drugs                           -- Phase 5.5
--   * 2 inactive (quarantined) lots          -- Phase 4.4 quarantine
--   * pharmacist account (user 1682)         -- Phase 2
--
-- Cannot be made correctly in SQL, do these through the desktop HMS instead:
--   * a 'partial' prescription -- dispense part of a pending Rx
--   * a 'closed'  prescription -- close one with a reason
--   Writing those rows by hand would leave prescription_dispenses,
--   pharmacy_charges and drug_stock_movements inconsistent with each other,
--   which is worse than not having the fixture.
--
-- Idempotent: re-running changes nothing (guarded on the lot numbers and
-- the recall number). Run against a DEV database only.
--
-- Undo:
--   DELETE FROM pharmacy_batch_recalls WHERE recall_number = 'RC-DEV-0001';
--   DELETE FROM drug_inventory_lots WHERE lot_number IN ('DEV-EXPIRED-001', 'DEV-RECALL-001');
-- ========================================================

-- Target the first warehouse, and two ordinary drugs (not high-alert, not
-- LASA) so these fixtures test expiry and recall in isolation.
SET @wh := (SELECT id FROM warehouses ORDER BY id LIMIT 1);

SET @drug_expired := (
    SELECT d.id FROM drugs d
    WHERE d.deleted_at IS NULL AND d.is_high_alert = 0 AND d.is_lasa = 0
    ORDER BY d.id LIMIT 1
);

SET @drug_recalled := (
    SELECT d.id FROM drugs d
    WHERE d.deleted_at IS NULL AND d.is_high_alert = 0 AND d.is_lasa = 0
      AND d.id <> @drug_expired
    ORDER BY d.id LIMIT 1
);

-- ---------- 1. An expired lot, still holding stock ----------
-- Expired 30 days ago but quantity_on_hand > 0 and is_active = 1: the lot
-- picker must refuse it on expiry alone, not because it is empty or inactive.
INSERT INTO drug_inventory_lots
    (drug_id, lot_number, warehouse_id, quantity_on_hand, expires_date, is_active, created_at)
SELECT @drug_expired, 'DEV-EXPIRED-001', @wh, 100.000,
       DATE_SUB(CURDATE(), INTERVAL 30 DAY), 1, NOW()
WHERE @drug_expired IS NOT NULL
  AND @wh IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM drug_inventory_lots WHERE lot_number = 'DEV-EXPIRED-001'
  );

-- ---------- 2. A recalled lot, in date and in stock ----------
-- Perfectly usable on paper (expires in a year, stock on hand, active) and
-- must be blocked purely because of the recall below.
INSERT INTO drug_inventory_lots
    (drug_id, lot_number, warehouse_id, quantity_on_hand, expires_date, is_active, created_at)
SELECT @drug_recalled, 'DEV-RECALL-001', @wh, 250.000,
       DATE_ADD(CURDATE(), INTERVAL 365 DAY), 1, NOW()
WHERE @drug_recalled IS NOT NULL
  AND @wh IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM drug_inventory_lots WHERE lot_number = 'DEV-RECALL-001'
  );

-- ---------- 3. The active recall covering that lot ----------
INSERT INTO pharmacy_batch_recalls
    (recall_number, drug_id, lot_number, recall_class, reason, fda_advisory_ref,
     status, quarantined_lots_count, quarantined_quantity, initiated_at, notes)
SELECT 'RC-DEV-0001', @drug_recalled, 'DEV-RECALL-001', 'Class II',
       'Dev fixture: dissolution out of specification. Not a real recall.',
       'DEV-ADVISORY-0001', 'active', 1, 250.000, NOW(),
       'Created by pharmacy_tablet_app/fixtures/dev_fixtures.sql for testing.'
WHERE @drug_recalled IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM pharmacy_batch_recalls WHERE recall_number = 'RC-DEV-0001'
  );

-- ---------- Verify ----------
SELECT l.lot_number, l.expires_date, l.quantity_on_hand, l.is_active,
       (l.expires_date < CURDATE()) AS is_expired,
       (r.id IS NOT NULL)           AS is_recalled
FROM drug_inventory_lots l
LEFT JOIN pharmacy_batch_recalls r
       ON r.lot_number = l.lot_number AND r.status = 'active'
WHERE l.lot_number IN ('DEV-EXPIRED-001', 'DEV-RECALL-001');
