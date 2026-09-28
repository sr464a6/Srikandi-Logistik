# PT Srikandi Factory OS — Deep Design Spec

## 1. Tujuan sistem
Sistem ini diasumsikan untuk pabrik yang perlu satu control center internal, bukan aplikasi customer-facing. Fokus MVP:
- visibility operasional;
- pencatatan transaksi inti;
- role-based access;
- auditability;
- fondasi yang mudah diperluas menjadi ERP/MES ringan.

## 2. Modul MVP
| Modul | Fungsi | Status starter |
|---|---|---|
| Dashboard | KPI produksi, QC, stok, maintenance | aktif |
| Produksi | Production order + lifecycle status | aktif |
| Inventory | material master + stock balance + ledger | aktif |
| Purchasing | supplier + purchase order API | API aktif, UI PO menyusul |
| QC | inspection, sample, defect, result | aktif |
| Maintenance | work order mesin | aktif |
| User & Role | akun + RBAC | aktif |
| Audit Log | jejak aktivitas | aktif |

## 3. Role model
- ADMIN: konfigurasi, user, audit, semua operasi.
- MANAGER: monitoring dan approval-level operations.
- OPERATOR: transaksi produksi/stock yang diperlukan operator.
- QC: inspeksi dan keputusan kualitas.
- WAREHOUSE: material dan stock movement.

Role di server harus selalu menjadi sumber otoritas; frontend hanya menyembunyikan menu sebagai UX.

## 4. Workflow inti
### Produksi
PLANNED -> RUNNING -> QC -> DONE
                         \-> REWORK (future domain state)
Any state -> CANCELLED sesuai approval policy.

### Inventory
Goods Receipt / IN -> On Hand -> Issue / OUT -> On Hand
Manual ADJUSTMENT hanya untuk user berwenang dan selalu menghasilkan audit event.

### QC
Production Order -> sample inspection -> PASS / FAIL / REWORK.
Untuk production-grade, QC harus menyimpan lot/batch, parameter ukur, spec limits, alat ukur, dan evidence foto.

### Maintenance
OPEN -> IN_PROGRESS -> DONE.
Untuk production-grade, work order perlu downtime start/end, sparepart consumption, failure code, root cause, dan MTTR/MTBF.

## 5. Data model saat ini
- users
- sessions
- materials
- suppliers
- customers
- production_orders
- purchase_orders + purchase_order_items
- qc_inspections
- maintenance_work_orders
- stock_movements
- audit_logs

## 6. Extension menjadi ERP/MES yang lebih dalam
### Master data
- Plant / warehouse / rack / bin
- Machine / work center / line
- Shift / calendar
- Product / SKU
- BOM
- Routing / operation sequence
- UOM conversion
- Supplier qualification
- Customer & delivery terms

### Material & warehouse
- lot/batch number
- expiry where relevant
- serial number where relevant
- reservation
- cycle count
- transfer antar lokasi
- quarantine stock
- goods receipt
- material issue / return
- stock adjustment approval

### Production
- planned order
- MRP-like material requirement
- BOM explosion
- material reservation
- machine scheduling
- shift assignment
- WIP
- scrap
- rework
- finished goods receipt
- production costing

### Quality
- incoming QC
- in-process QC
- final QC
- defect catalogue
- control plan
- inspection checklist
- specification limits
- NCR / CAPA
- supplier quality

### Maintenance
- equipment master
- preventive maintenance calendar
- recurring job plan
- spare parts
- meter reading
- downtime reason
- failure code
- technician assignment
- MTBF / MTTR reporting

### Procurement
- PR -> RFQ -> PO -> GR
- vendor price history
- approval matrix
- payment terms
- supplier performance

## 7. Control & audit
Perubahan stok, status PO/production/QC/maintenance, dan perubahan user harus diaudit. Untuk production-grade:
- gunakan immutable event/ledger untuk stok;
- simpan before/after pada perubahan sensitif;
- tambahkan document number yang idempotent;
- tambahkan approval state terpisah dari operational state;
- batasi akses berdasarkan role + site/warehouse bila perusahaan punya multi-plant.

## 8. Cloudflare target
- React + Vite untuk SPA.
- Hono Worker untuk API.
- D1 untuk relational data.
- Optional R2 untuk attachment/evidence.
- Custom domain di layer Cloudflare.

## 9. Non-functional requirements yang disarankan
- Responsive untuk desktop warehouse / tablet operator.
- Search dan filter pada semua tabel.
- Pagination untuk tabel besar.
- Timezone `Asia/Jakarta` pada UI.
- Export CSV untuk laporan operasional.
- Health endpoint.
- Error logging dan alerting.
- Backup/restore policy D1.
- Retention policy untuk audit logs.

## 10. Hal yang harus disesuaikan dengan pabrik nyata
Starter ini sengaja tidak mengasumsikan detail proses bisnis PT Srikandi yang sebenarnya. Sebelum dipakai produksi, mapping berikut harus dilakukan dengan user lapangan:
1. jenis produk dan BOM;
2. alur material masuk/keluar;
3. kode mesin/line;
4. shift kerja;
5. approval pembelian;
6. metode QC dan batas spesifikasi;
7. siapa yang boleh melakukan stock adjustment;
8. alur rework/scrap;
9. kebutuhan invoice/sales order;
10. laporan wajib untuk manajemen.
