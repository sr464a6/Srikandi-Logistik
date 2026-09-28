# Architecture Notes

## Domain model
User/Roles -> operational actions -> audit log.

Materials -> stock movements -> purchasing / production / manual adjustment.
Production Orders -> lifecycle `PLANNED -> RUNNING -> QC -> DONE` (or `CANCELLED`).
QC Inspections reference Production Orders.
Maintenance Work Orders reference machine labels and can be progressed `OPEN -> IN_PROGRESS -> DONE`.

## Cloudflare layout
- React SPA: Vite build output as Workers Static Assets.
- API: Hono inside the same Worker.
- Database: Cloudflare D1 (SQLite-compatible relational model).
- Optional next step: R2 for QC photos, invoices, PO attachments, and maintenance evidence.

## Security model
- HttpOnly + Secure + SameSite session cookie.
- Server-side role checks on every mutation route.
- PBKDF2-SHA-256 password hashes for newly-created users.
- Audit log stores action/entity metadata and a one-way IP hash.

## Transactional roadmap
For actual plant usage, stock-changing flows should become ledger-first and idempotent:
1. create business document;
2. validate available stock / approval;
3. append immutable stock movement;
4. update material balance;
5. audit the business event.

For production execution, add BOM, routing, work centers, shift calendar, material reservation, WIP consumption, finished-good receipt, scrap, rework, and traceability lot/batch numbers.
