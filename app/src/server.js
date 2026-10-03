const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const db = require('./db');
const jobs = require('./jobs');
const { loadDevice } = require('./middleware/device');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const { HttpError } = require('./lib/util');

const VERTICALS = ['vet'];
const vertical = VERTICALS.includes(process.env.VERTICAL) ? process.env.VERTICAL : 'vet';
const preset = require(`../presets/${vertical}.js`);

let secret = process.env.COOKIE_SECRET;
if (!secret || secret.startsWith('cambia-esto')) {
  console.warn('[server] COOKIE_SECRET no configurado: se usa uno temporal (las sesiones se pierden al reiniciar).');
  secret = secret || crypto.randomBytes(32).toString('hex');
}
if (!process.env.ADMIN_PASSWORD) console.warn('[server] ADMIN_PASSWORD no configurado: el panel /admin no permitirá ingresar.');

const app = express();
app.disable('x-powered-by');
// Detrás de Cloudflare Tunnel u otro proxy: TRUST_PROXY=1 (número de saltos) para que req.ip sea la IP real
if (process.env.TRUST_PROXY) {
  const tp = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(tp) ? Number(tp) : tp === 'true' ? true : tp);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
        'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
        'img-src': ["'self'", 'data:'],
        'upgrade-insecure-requests': null,
      },
    },
  })
);
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser(secret));

app.use('/api/admin', adminRoutes(preset));
app.use('/api', loadDevice, publicRoutes(preset));
app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado.' }));

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Datos inválidos.' });
  console.error('[server]', err);
  res.status(500).json({ error: 'Ocurrió un error. Intenta nuevamente.' });
});

(async () => {
  await db.init(preset);
  jobs.start();
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`[server] ${preset.negocio.nombre} (${vertical}) en http://localhost:${port}`));
})().catch((err) => {
  console.error('[server] no se pudo iniciar:', err);
  process.exit(1);
});
