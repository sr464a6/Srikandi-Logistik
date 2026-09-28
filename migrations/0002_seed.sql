-- Demo-only seed data. Password for every demo user: Demo123!
INSERT OR IGNORE INTO users (id, name, email, password_hash, role) VALUES
  (1, 'Administrator', 'admin@srikandi.local', 'demo-hash', 'ADMIN'),
  (2, 'Production Manager', 'manager@srikandi.local', 'demo-hash', 'MANAGER'),
  (3, 'Operator Produksi', 'operator@srikandi.local', 'demo-hash', 'OPERATOR'),
  (4, 'QC Inspector', 'qc@srikandi.local', 'demo-hash', 'QC'),
  (5, 'Warehouse', 'warehouse@srikandi.local', 'demo-hash', 'WAREHOUSE');

INSERT OR IGNORE INTO suppliers (code, name, contact, phone, payment_terms, rating) VALUES
  ('SUP-001', 'PT Baja Nusantara', 'Budi', '0812-1111-2222', 'NET 30', 4.7),
  ('SUP-002', 'CV Plastik Jaya', 'Rina', '0813-3333-4444', 'NET 14', 4.2),
  ('SUP-003', 'PT Kemasan Prima', 'Dimas', '0811-5555-6666', 'NET 30', 4.5);

INSERT OR IGNORE INTO customers (code, name, contact, phone, address) VALUES
  ('CUS-001', 'PT Sukses Abadi', 'Andri', '0812-7777-8888', 'Surabaya'),
  ('CUS-002', 'PT Maju Bersama', 'Sari', '0813-9999-0000', 'Sidoarjo');

INSERT OR IGNORE INTO materials (sku, name, category, unit, min_stock, current_stock, location) VALUES
  ('MAT-0001', 'Steel Coil 1.2mm', 'RAW MATERIAL', 'KG', 5000, 8200, 'RACK-A1'),
  ('MAT-0002', 'Plastic Resin ABS', 'RAW MATERIAL', 'KG', 3000, 1800, 'RACK-B2'),
  ('MAT-0003', 'Carton Box L', 'PACKAGING', 'PCS', 1000, 650, 'RACK-C1'),
  ('MAT-0004', 'Industrial Lubricant', 'MAINTENANCE', 'L', 250, 390, 'MRO-01'),
  ('MAT-0005', 'Label Roll 50mm', 'PACKAGING', 'ROLL', 100, 120, 'RACK-C2');

INSERT OR IGNORE INTO production_orders (code, product_name, quantity, unit, priority, status, machine, planned_start, planned_end, notes, created_by) VALUES
  ('PO-26001', 'Bracket Assembly A', 12000, 'PCS', 'HIGH', 'RUNNING', 'LINE-02', date('now'), date('now','+2 day'), 'Batch pelanggan A', 2),
  ('PO-26002', 'Housing ABS X2', 8000, 'PCS', 'MEDIUM', 'PLANNED', 'INJ-04', date('now','+1 day'), date('now','+3 day'), 'Menunggu material resin', 2),
  ('PO-26003', 'Bracket Assembly B', 6500, 'PCS', 'URGENT', 'QC', 'LINE-01', date('now','-1 day'), date('now'), 'Prioritas ekspor', 2),
  ('PO-26004', 'Packaging Set Z', 15000, 'PCS', 'LOW', 'DONE', 'PACK-01', date('now','-4 day'), date('now','-2 day'), 'Selesai tanpa rework', 2);

INSERT OR IGNORE INTO qc_inspections (code, production_order_id, inspector_id, result, sample_size, defect_count, remarks, inspected_at) VALUES
  ('QC-26001', 3, 4, 'REWORK', 200, 9, 'Dimensi edge perlu dikoreksi', datetime('now','-2 hour')),
  ('QC-26002', 4, 4, 'PASS', 150, 1, 'Within control limit', datetime('now','-1 day'));

INSERT OR IGNORE INTO maintenance_work_orders (code, machine, type, priority, status, scheduled_date, technician, issue) VALUES
  ('WO-26001', 'LINE-02', 'PREVENTIVE', 'MEDIUM', 'IN_PROGRESS', date('now'), 'Agus', 'Preventive service 250 jam'),
  ('WO-26002', 'INJ-04', 'CORRECTIVE', 'HIGH', 'OPEN', date('now','+1 day'), 'Rudi', 'Temperature controller intermittent'),
  ('WO-26003', 'PACK-01', 'INSPECTION', 'LOW', 'DONE', date('now','-2 day'), 'Agus', 'Safety guard inspection');
