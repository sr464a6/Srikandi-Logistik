import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { audit, clearSessionCookie, createSession, getCurrentUser, getSessionId, hashPassword, requireAuth, requireRole, setSessionCookie, verifyPassword, type AppEnv } from './auth';

const app = new Hono<AppEnv>();

const json = (data: unknown, status?: 200 | 201 | 400 | 401 | 403 | 404 | 500) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

app.get('/api/health', (c) => c.json({ ok: true, service: 'pt-srikandi-factory', env: c.env.APP_ENV, time: new Date().toISOString() }));

app.post('/api/auth/login', zValidator('json', z.object({ email: z.string().email(), password: z.string().min(6) })), async (c) => {
  const { email, password } = c.req.valid('json');
  const user = await c.env.DB.prepare('SELECT id, name, email, role, password_hash FROM users WHERE email = ? AND is_active = 1').bind(email.toLowerCase()).first<any>();
  if (!user || !(await verifyPassword(password, user.password_hash))) return c.json({ error: 'Email atau password salah' }, 401);
  const session = await createSession(c.env.DB, user.id);
  setSessionCookie(c, session.id, session.expires);
  await audit(c, 'LOGIN', 'session', session.id, { email: user.email });
  return c.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/logout', requireAuth, async (c) => {
  const sid = getSessionId(c);
  if (sid) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
  clearSessionCookie(c);
  return c.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (c) => c.json({ user: c.get('user') }));

app.get('/api/dashboard', requireAuth, async (c) => {
  const [materials, prod, qc, maint, stock, lowStock] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS value FROM materials WHERE is_active = 1').first<any>(),
    c.env.DB.prepare(`SELECT status, COUNT(*) AS value FROM production_orders GROUP BY status`).all<any>(),
    c.env.DB.prepare(`SELECT result, COUNT(*) AS value FROM qc_inspections GROUP BY result`).all<any>(),
    c.env.DB.prepare(`SELECT status, COUNT(*) AS value FROM maintenance_work_orders GROUP BY status`).all<any>(),
    c.env.DB.prepare(`SELECT COALESCE(SUM(current_stock),0) AS value FROM materials`).first<any>(),
    c.env.DB.prepare(`SELECT id, sku, name, current_stock, min_stock, unit FROM materials WHERE is_active = 1 AND current_stock < min_stock ORDER BY (current_stock - min_stock) ASC LIMIT 8`).all<any>()
  ]);
  return c.json({ materials: materials.value, prod: prod.results, qc: qc.results, maint: maint.results, totalStock: stock.value, lowStock: lowStock.results });
});

app.get('/api/materials', requireAuth, async (c) => {
  const q = c.req.query('q')?.trim();
  const sql = q ? `SELECT * FROM materials WHERE is_active=1 AND (sku LIKE ? OR name LIKE ? OR category LIKE ?) ORDER BY name` : `SELECT * FROM materials WHERE is_active=1 ORDER BY name`;
  const params = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ items: result.results });
});

app.post('/api/materials', requireAuth, requireRole(['ADMIN', 'MANAGER', 'WAREHOUSE']), zValidator('json', z.object({ sku: z.string().min(3), name: z.string().min(2), category: z.string().min(2), unit: z.string().min(1), min_stock: z.number().nonnegative(), current_stock: z.number().nonnegative().default(0), location: z.string().min(1) })), async (c) => {
  const data = c.req.valid('json');
  try {
    const r = await c.env.DB.prepare(`INSERT INTO materials (sku,name,category,unit,min_stock,current_stock,location) VALUES (?,?,?,?,?,?,?)`).bind(data.sku, data.name, data.category, data.unit, data.min_stock, data.current_stock, data.location).run();
    await audit(c, 'CREATE', 'material', String(r.meta.last_row_id), data);
    return c.json({ id: r.meta.last_row_id }, 201);
  } catch {
    return c.json({ error: 'SKU sudah terdaftar atau data tidak valid' }, 400);
  }
});

app.get('/api/production-orders', requireAuth, async (c) => {
  const status = c.req.query('status');
  const search = c.req.query('q')?.trim();
  let where = '1=1'; const params: any[] = [];
  if (status) { where += ' AND p.status = ?'; params.push(status); }
  if (search) { where += ' AND (p.code LIKE ? OR p.product_name LIKE ? OR p.machine LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const result = await c.env.DB.prepare(`SELECT p.*, u.name AS creator_name FROM production_orders p LEFT JOIN users u ON u.id=p.created_by WHERE ${where} ORDER BY p.id DESC`).bind(...params).all();
  return c.json({ items: result.results });
});

app.post('/api/production-orders', requireAuth, requireRole(['ADMIN','MANAGER','OPERATOR']), zValidator('json', z.object({ code: z.string().min(4), product_name: z.string().min(2), quantity: z.number().positive(), unit: z.string().min(1), priority: z.enum(['LOW','MEDIUM','HIGH','URGENT']), machine: z.string().optional(), planned_start: z.string().optional(), planned_end: z.string().optional(), notes: z.string().optional() })), async (c) => {
  const d = c.req.valid('json'); const u = c.get('user') as any;
  try {
    await c.env.DB.prepare(`INSERT INTO production_orders (code,product_name,quantity,unit,priority,machine,planned_start,planned_end,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(d.code,d.product_name,d.quantity,d.unit,d.priority,d.machine??null,d.planned_start??null,d.planned_end??null,d.notes??null,u.id).run();
    await audit(c,'CREATE','production_order',d.code,d);
    return c.json({ ok:true },201);
  } catch { return c.json({ error:'Kode production order sudah ada atau data invalid' },400); }
});

app.patch('/api/production-orders/:id/status', requireAuth, requireRole(['ADMIN','MANAGER','OPERATOR','QC']), zValidator('json', z.object({ status: z.enum(['PLANNED','RUNNING','QC','DONE','CANCELLED']) })), async (c) => {
  const id = Number(c.req.param('id')); const { status } = c.req.valid('json');
  const now = new Date().toISOString();
  const extra = status === 'RUNNING' ? ', actual_start = COALESCE(actual_start, ?)' : status === 'DONE' ? ', actual_end = ?' : '';
  const bind = status === 'RUNNING' ? [status, now, id] : status === 'DONE' ? [status, now, id] : [status, id];
  await c.env.DB.prepare(`UPDATE production_orders SET status = ? ${extra} WHERE id = ?`).bind(...bind).run();
  await audit(c,'STATUS_CHANGE','production_order',String(id),{status});
  return c.json({ ok:true });
});

app.get('/api/purchase-orders', requireAuth, async (c) => {
  const result = await c.env.DB.prepare(`SELECT po.*, s.name AS supplier_name FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id ORDER BY po.id DESC`).all();
  return c.json({ items: result.results });
});

app.get('/api/suppliers', requireAuth, async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM suppliers WHERE is_active=1 ORDER BY name').all();
  return c.json({ items: result.results });
});

app.post('/api/purchase-orders', requireAuth, requireRole(['ADMIN','MANAGER','WAREHOUSE']), zValidator('json', z.object({ code: z.string().min(4), supplier_id: z.number().int().positive(), expected_date: z.string().optional(), notes: z.string().optional(), items: z.array(z.object({ material_id: z.number().int().positive(), quantity: z.number().positive(), unit_price: z.number().nonnegative() })).min(1) })), async (c) => {
  const d = c.req.valid('json'); const u = c.get('user') as any;
  const total = d.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const batch: D1PreparedStatement[] = [c.env.DB.prepare(`INSERT INTO purchase_orders (code,supplier_id,status,expected_date,total_amount,notes,created_by) VALUES (?,?,?,?,?,?,?)`).bind(d.code,d.supplier_id,'SUBMITTED',d.expected_date??null,total,d.notes??null,u.id)];
  // ID retrieval is not guaranteed inside batch; insert PO first then items below.
  try {
    const r = await batch[0].run();
    const poId = Number(r.meta.last_row_id);
    for (const item of d.items) {
      await c.env.DB.prepare(`INSERT INTO purchase_order_items (purchase_order_id,material_id,quantity,unit_price) VALUES (?,?,?,?)`).bind(poId,item.material_id,item.quantity,item.unit_price).run();
    }
    await audit(c,'CREATE','purchase_order',String(poId),{code:d.code,total});
    return c.json({ id:poId },201);
  } catch { return c.json({ error:'Gagal membuat purchase order' },400); }
});

app.get('/api/qc-inspections', requireAuth, async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT q.*, p.code AS production_code, p.product_name, u.name AS inspector_name
    FROM qc_inspections q
    LEFT JOIN production_orders p ON p.id=q.production_order_id
    LEFT JOIN users u ON u.id=q.inspector_id
    ORDER BY q.id DESC
  `).all();
  return c.json({ items: result.results });
});

app.post('/api/qc-inspections', requireAuth, requireRole(['ADMIN','MANAGER','QC']), zValidator('json', z.object({ code:z.string().min(4), production_order_id:z.number().int().positive(), result:z.enum(['PENDING','PASS','FAIL','REWORK']), sample_size:z.number().int().positive(), defect_count:z.number().int().nonnegative(), remarks:z.string().optional() })), async (c) => {
  const d=c.req.valid('json'); const u=c.get('user') as any;
  await c.env.DB.prepare(`INSERT INTO qc_inspections (code,production_order_id,inspector_id,result,sample_size,defect_count,remarks,inspected_at) VALUES (?,?,?,?,?,?,?,?)`).bind(d.code,d.production_order_id,u.id,d.result,d.sample_size,d.defect_count,d.remarks??null,new Date().toISOString()).run();
  await audit(c,'CREATE','qc_inspection',d.code,d);
  return c.json({ok:true},201);
});

app.get('/api/maintenance/work-orders', requireAuth, async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM maintenance_work_orders ORDER BY id DESC').all();
  return c.json({ items: result.results });
});

app.post('/api/maintenance/work-orders', requireAuth, requireRole(['ADMIN','MANAGER','OPERATOR']), zValidator('json', z.object({ code:z.string().min(4), machine:z.string().min(2), type:z.enum(['PREVENTIVE','CORRECTIVE','INSPECTION']), priority:z.enum(['LOW','MEDIUM','HIGH','CRITICAL']), scheduled_date:z.string().optional(), technician:z.string().optional(), issue:z.string().optional() })), async (c) => {
  const d=c.req.valid('json');
  await c.env.DB.prepare(`INSERT INTO maintenance_work_orders (code,machine,type,priority,scheduled_date,technician,issue) VALUES (?,?,?,?,?,?,?)`).bind(d.code,d.machine,d.type,d.priority,d.scheduled_date??null,d.technician??null,d.issue??null).run();
  await audit(c,'CREATE','maintenance_work_order',d.code,d);
  return c.json({ok:true},201);
});

app.patch('/api/maintenance/work-orders/:id/status', requireAuth, requireRole(['ADMIN','MANAGER','OPERATOR']), zValidator('json', z.object({ status:z.enum(['OPEN','IN_PROGRESS','DONE']), resolution:z.string().optional() })), async (c) => {
  const id=Number(c.req.param('id')); const d=c.req.valid('json');
  const completed = d.status==='DONE' ? new Date().toISOString() : null;
  await c.env.DB.prepare(`UPDATE maintenance_work_orders SET status=?, resolution=COALESCE(?, resolution), completed_date=COALESCE(?, completed_date) WHERE id=?`).bind(d.status,d.resolution??null,completed,id).run();
  await audit(c,'STATUS_CHANGE','maintenance_work_order',String(id),d);
  return c.json({ok:true});
});

app.get('/api/stock-movements', requireAuth, async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT sm.*, m.sku, m.name AS material_name, u.name AS user_name
    FROM stock_movements sm
    JOIN materials m ON m.id=sm.material_id
    LEFT JOIN users u ON u.id=sm.created_by
    ORDER BY sm.id DESC LIMIT 100
  `).all();
  return c.json({items: result.results});
});

app.post('/api/stock-movements', requireAuth, requireRole(['ADMIN','MANAGER','WAREHOUSE','OPERATOR']), zValidator('json', z.object({ material_id:z.number().int().positive(), movement_type:z.enum(['IN','OUT','ADJUSTMENT']), quantity:z.number().positive(), notes:z.string().optional() })), async (c) => {
  const d=c.req.valid('json'); const u=c.get('user');
  const signed = d.movement_type === 'OUT' ? -d.quantity : d.quantity;
  const update = await c.env.DB.prepare(`UPDATE materials SET current_stock = current_stock + ? WHERE id = ? AND current_stock + ? >= 0`).bind(signed,d.material_id,signed).run();
  if ((update.meta.changes ?? 0) !== 1) return c.json({error:'Stock tidak cukup atau material tidak ditemukan'},400);
  const r = await c.env.DB.prepare(`INSERT INTO stock_movements (material_id,movement_type,quantity,reference_type,notes,created_by) VALUES (?,?,?,?,?,?)`).bind(d.material_id,d.movement_type,d.quantity,'MANUAL',d.notes??null,u.id).run();
  await audit(c,'STOCK_MOVE','material',String(d.material_id),d);
  return c.json({id:r.meta.last_row_id},201);
});

app.get('/api/audit-logs', requireAuth, requireRole(['ADMIN','MANAGER']), async (c) => {
  const result = await c.env.DB.prepare(`SELECT a.*, u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100`).all();
  return c.json({items:result.results});
});

app.get('/api/users', requireAuth, requireRole(['ADMIN']), async (c) => {
  const result = await c.env.DB.prepare('SELECT id,name,email,role,is_active,created_at FROM users ORDER BY id').all();
  return c.json({items:result.results});
});

app.post('/api/users', requireAuth, requireRole(['ADMIN']), zValidator('json', z.object({ name:z.string().min(2), email:z.string().email(), password:z.string().min(8), role:z.enum(['ADMIN','MANAGER','OPERATOR','QC','WAREHOUSE']) })), async (c) => {
  const d=c.req.valid('json');
  const hash=await hashPassword(d.password);
  try {
    const r=await c.env.DB.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)').bind(d.name,d.email.toLowerCase(),hash,d.role).run();
    await audit(c,'CREATE','user',String(r.meta.last_row_id),{email:d.email,role:d.role});
    return c.json({id:r.meta.last_row_id},201);
  } catch { return c.json({error:'Email sudah terdaftar'},400); }
});

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

export default app;
