// HIVE API server. Keeps provider keys and the Claude key off the browser.
//   npm run dev   → Vite on :5173 (proxies /api) + this server on :8787
//   npm run build && npm start → this server also serves the built app
import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiConfigured, aiModel, assistantHandler } from './ai/assistant';
import { providerRouter, providerStatus } from './providers';
import { deviceRouter, deviceStatus } from './devices';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: aiConfigured(), model: aiConfigured() ? aiModel() : undefined, time: new Date().toISOString() });
});

app.get('/api/integrations', (_req, res) => {
  res.json({ ai: { configured: aiConfigured(), model: aiModel() }, providers: providerStatus(), devices: deviceStatus() });
});

app.post('/api/assistant', assistantHandler);
app.use('/api/providers', providerRouter);
app.use('/api/devices', deviceRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Production: serve the built web app.
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');
if (fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`HIVE API on http://localhost:${port} — Claude assistant ${aiConfigured() ? `on (${aiModel()})` : 'off (offline parser)'}`);
});
