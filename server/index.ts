// Relay API server. Keeps provider keys off the browser.
//   npm run dev   → Vite on :5173 (proxies /api) + this server on :8787
//   npm run build && npm start → this server also serves the built app
import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { providerRouter, providerStatus } from './providers';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/integrations', (_req, res) => {
  res.json({ providers: providerStatus() });
});

app.use('/api/providers', providerRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Production: serve the built web app (/ and /mobile/).
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    const mobile = req.path.startsWith('/mobile');
    res.sendFile(path.join(dist, mobile ? 'mobile/index.html' : 'index.html'));
  });
}

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`Relay API on http://localhost:${port}`);
});
