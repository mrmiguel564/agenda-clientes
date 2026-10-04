// Worker: API (/api/*) con Hono. Las páginas (public/) las sirve Workers Static Assets.
import { Hono } from 'hono';
import vet from '../presets/vet.js';
import { init, all, run, nowIso } from './db.js';
import { loadDevice } from './lib/auth.js';
import { HttpError } from './lib/util.js';
import * as B from './lib/bookings.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';

// Rubro de este despliegue. Para otro rubro: agrega su preset y cámbialo aquí.
const preset = vet;

const app = new Hono();

app.use('/api/*', async (c, next) => {
  await init(c.env.DB, preset);
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'no-store');
});
app.use('/api/*', loadDevice);

app.route('/api/admin', adminRoutes(preset));
app.route('/api', publicRoutes(preset));

app.notFound((c) => c.json({ error: 'No encontrado.' }, 404));
app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  if (err instanceof SyntaxError) return c.json({ error: 'Datos inválidos.' }, 400);
  console.error('[worker]', (err && err.stack) || err);
  return c.json({ error: 'Ocurrió un error. Intenta nuevamente.' }, 500);
});

// Tareas programadas (cron): vence reservas sin confirmar, limpia límites, anonimiza inactivos
async function scheduled(env){
  await init(env.DB, preset);
  const now = nowIso();
  await run(env.DB, "UPDATE booking SET status = 'expired' WHERE status = 'pending' AND hold_expires_at < ?1", now);
  await run(env.DB, 'DELETE FROM rate_limit WHERE reset_at < ?1', Math.floor(Date.now() / 1000));
  // Ley 21.719: tutores sin actividad por 24 meses y sin horas futuras
  const limitDate = new Date(Date.now() - 730 * 86400000).toISOString();
  const rows = await all(env.DB,
    `SELECT t.id FROM tutor t WHERE t.anonymized = 0 AND t.last_seen < ?1
       AND NOT EXISTS (SELECT 1 FROM booking b WHERE b.tutor_id = t.id AND b.start_at > ?2 AND b.status IN ('pending','confirmed'))`, limitDate, now);
  for (const r of rows) await B.anonymizeTutor(env.DB, r.id);
}

export default {
  fetch: app.fetch,
  scheduled: (event, env, ctx) => ctx.waitUntil(scheduled(env)),
};
