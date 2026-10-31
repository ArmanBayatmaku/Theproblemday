// /api/providers — one route set for every marketplace provider.
// Configured adapters make real calls; everything else answers with `simulated: true` so the web
// app keeps using its built-in simulated pricing.
import { Router } from 'express';
import { NotConnectedError, type ProviderAdapter } from './types';
import { uberDirect } from './uber-direct';
import { waymo } from './waymo';

export const ADAPTERS: Record<string, ProviderAdapter> = {
  [uberDirect.id]: uberDirect,
  [waymo.id]: waymo,
};

/** Demo partners and the internal drone network have no external API. */
const INTERNAL = new Set(['hive-air']);
const DEMO = new Set(['thames-express', 'cityhop']);

export function providerStatus() {
  return {
    'hive-air': { state: 'internal' as const },
    ...Object.fromEntries(Object.values(ADAPTERS).map((a) => [a.id, { state: a.configured() ? ('configured' as const) : ('simulated' as const), env: a.env }])),
    'thames-express': { state: 'demo' as const },
    cityhop: { state: 'demo' as const },
  };
}

export const providerRouter = Router();

providerRouter.get('/', (_req, res) => res.json(providerStatus()));

providerRouter.post('/:id/:action', async (req, res) => {
  const { id, action } = req.params;
  if (INTERNAL.has(id)) return res.json({ simulated: false, internal: true, message: 'Hive Air is dispatched by this platform — no external call needed.' });
  if (DEMO.has(id)) return res.json({ simulated: true, message: `${id} is a fictional demo partner.` });
  const adapter = ADAPTERS[id];
  if (!adapter) return res.status(404).json({ error: `Unknown provider ${id}` });
  if (!adapter.configured()) return res.json({ simulated: true, message: `${adapter.name} is not connected — quotes are simulated. Set ${adapter.env.join(', ')} to connect.` });
  try {
    if (action === 'quote') return res.json(await adapter.quote(req.body));
    if (action === 'book') return res.json(await adapter.book(req.body));
    if (action === 'cancel') {
      await adapter.cancel(String(req.body?.bookingId));
      return res.json({ ok: true });
    }
    if (action === 'status') return res.json(await adapter.status(String(req.body?.bookingId)));
    return res.status(404).json({ error: `Unknown action ${action}` });
  } catch (err) {
    if (err instanceof NotConnectedError) return res.status(409).json({ simulated: true, error: err.message });
    console.error(`[providers:${id}:${action}]`, err);
    return res.status(502).json({ error: err instanceof Error ? err.message : 'Provider error' });
  }
});
