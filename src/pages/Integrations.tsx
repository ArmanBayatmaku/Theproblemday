import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Bot, CloudSun, Map as MapIcon, MapPin, PlugZap, Server, ShieldAlert, TerminalSquare } from 'lucide-react';
import { PROVIDERS } from '@shared/providers';
import { useStore } from '@/store/useStore';
import { ADAPTERS } from '@/integrations/devices/adapters';
import { Badge, Button, Card } from '@/components/ui';
import { OptionIcon } from '@/pages/RequestJob';
import { clock } from '@/lib/format';

interface ServerState {
  ai: { configured: boolean; model: string };
  providers: Record<string, { state: 'internal' | 'configured' | 'simulated' | 'demo'; env?: string[] }>;
  devices: Record<string, { name: string; configured: boolean; env: string }>;
}

const STATE_BADGE: Record<string, { label: string; color: string }> = {
  internal: { label: 'Built in', color: '#8bd450' },
  configured: { label: 'Keys set', color: '#5a9bf0' },
  simulated: { label: 'Simulated', color: '#f0a33a' },
  demo: { label: 'Demo partner', color: '#9aa2ab' },
  offline: { label: 'Server offline', color: '#6c747d' },
};

function useServer() {
  const [state, setState] = useState<ServerState | null | undefined>(undefined);
  const load = () =>
    fetch('/api/integrations', { signal: AbortSignal.timeout(2500) })
      .then((r) => (r.ok ? r.json() : null))
      .then(setState)
      .catch(() => setState(null));
  useEffect(() => {
    void load();
  }, []);
  return { state, reload: load };
}

function TestResult({ value }: { value: unknown }) {
  if (value === undefined) return null;
  return <pre className="mt-2 text-[11px] leading-snug bg-[#16191c] border border-line rounded-lg p-2.5 overflow-auto max-h-40 text-muted whitespace-pre-wrap">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>;
}

export function Integrations() {
  const { state, reload } = useServer();
  const s = useStore();
  const [results, setResults] = useState<Record<string, unknown>>({});
  const offline = state === null;

  const test = async (key: string, url: string, body: unknown) => {
    setResults((r) => ({ ...r, [key]: 'Calling…' }));
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      setResults((r) => ({ ...r, [key]: { status: res.status, ...j } }));
    } catch {
      setResults((r) => ({ ...r, [key]: 'API server not reachable — start it with `npm run dev`.' }));
    }
  };

  const sampleQuote = {
    pickup: { name: "FreshCo King's Cross", address: 'York Way, London N1C', lat: 51.5345, lng: -0.1225 },
    dropoff: { name: 'Camden', address: 'Camden High Street, London NW1', lat: 51.539, lng: -0.1426 },
    weightKg: 2,
    quantity: 1,
    size: 'small',
  };

  const weather = s.weatherLive;
  const feeds = [
    { icon: CloudSun, name: 'Weather', source: 'Open-Meteo (wind at 10/80/120 m, gusts, rain, visibility)', status: weather ? `Live · updated ${clock(weather.fetchedAt)}` : 'Offline — simulated weather in use', ok: !!weather },
    { icon: MapIcon, name: 'Base map & 3D buildings', source: 'OpenFreeMap vector tiles (OpenStreetMap data)', status: 'Loads in the browser; offline fallback map bundled', ok: true },
    { icon: MapPin, name: 'Geocoding', source: 'postcodes.io for UK postcodes + built-in London places', status: 'No key needed', ok: true },
    { icon: ShieldAlert, name: 'Airspace', source: 'Illustrative demo zones (Heathrow & City FRZs, prisons, parks, events)', status: 'Demo data — swap for NATS / CAA feeds before real flights', ok: false },
  ];

  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-4">
        <Card title="Delivery marketplace" sub="Each provider sits behind the same quote / book / cancel / status contract on the API server">
          <div className="grid grid-cols-2 gap-3">
            {PROVIDERS.map((p) => {
              const st = offline ? 'offline' : state?.providers[p.id]?.state ?? p.integration;
              const b = STATE_BADGE[st] ?? STATE_BADGE.simulated;
              return (
                <div key={p.id} className="rounded-xl border border-line p-3.5 bg-panel-2/40">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: `${p.color}1f`, color: p.color }}>
                      <OptionIcon q={{ category: p.category, providerId: p.id } as never} size={17} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[14px]">{p.name}</div>
                      <div className="text-[11px] text-muted">{p.service}</div>
                    </div>
                    <Badge color={b.color}>{b.label}</Badge>
                  </div>
                  <div className="text-xs text-muted mt-2.5 leading-relaxed">{p.description}</div>
                  <div className="text-[11px] text-dim mt-1">{p.limits}</div>
                  <div className="text-[11px] text-text/80 mt-2 leading-relaxed">{p.howToConnect}</div>
                  {p.envVars.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {p.envVars.map((v) => (
                        <code key={v} className="text-[10px] px-1.5 py-0.5 rounded bg-[#16191c] border border-line text-muted">
                          {v}
                        </code>
                      ))}
                    </div>
                  )}
                  <div className="mt-2.5">
                    <Button size="sm" variant="outline" onClick={() => test(p.id, `/api/providers/${p.id}/quote`, sampleQuote)}>
                      Test quote
                    </Button>
                  </div>
                  <TestResult value={results[p.id]} />
                </div>
              );
            })}
            <div className="rounded-xl border border-dashed border-line p-3.5 flex flex-col justify-center text-xs text-muted leading-relaxed">
              <div className="font-semibold text-text text-[13px] mb-1">List another courier</div>
              Add an adapter in <code className="text-[11px]">server/providers/</code> that implements quote, book, cancel and status, register it in <code className="text-[11px]">providers/index.ts</code> and add it to <code className="text-[11px]">shared/providers.ts</code>. It then shows up in every quote.
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="AI assistant">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-lg grid place-items-center bg-violet/15 text-violet shrink-0">
                <Bot size={18} />
              </span>
              <div className="text-xs text-muted leading-relaxed">
                {offline ? (
                  <>The API server isn't running, so the assistant uses the built-in offline parser. Start everything with <code>npm run dev</code>.</>
                ) : state?.ai.configured ? (
                  <>
                    Claude is on (<span className="text-text">{state.ai.model}</span>). Requests are interpreted server-side with tool use; prices are always computed by the app.
                  </>
                ) : (
                  <>
                    Running the offline parser. Add <code className="text-text">ANTHROPIC_API_KEY</code> to <code>.env</code> and restart to use Claude (<span className="text-text">{state?.ai.model ?? 'claude-sonnet-5-5'}</span>).
                  </>
                )}
              </div>
            </div>
          </Card>
          <Card title="API server" actions={<Button size="sm" variant="ghost" onClick={() => void reload()}>Refresh</Button>}>
            <div className="flex items-center gap-2 text-[13px]">
              <Server size={15} className={offline ? 'text-dim' : 'text-green'} />
              {state === undefined ? 'Checking…' : offline ? 'Not reachable on :8787' : 'Running on :8787'}
            </div>
            <div className="mt-3 space-y-1 font-mono text-[11px] text-muted">
              {['GET  /api/health', 'GET  /api/integrations', 'POST /api/assistant', 'POST /api/providers/:id/quote|book|cancel|status', 'POST /api/devices/:protocol/command'].map((e) => (
                <div key={e}>{e}</div>
              ))}
            </div>
          </Card>
          <Card title="Data feeds">
            <div className="space-y-3">
              {feeds.map((f) => (
                <div key={f.name} className="flex gap-3">
                  <f.icon size={16} className={clsx('mt-0.5 shrink-0', f.ok ? 'text-green' : 'text-amber')} />
                  <div>
                    <div className="text-[13px]">{f.name}</div>
                    <div className="text-[11px] text-muted">{f.source}</div>
                    <div className="text-[11px] text-dim">{f.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Machine adapters" sub="How commands reach real hardware. Until an adapter is connected, machines run as digital twins in the simulator.">
        <div className="grid grid-cols-3 gap-3">
          {ADAPTERS.map((a) => {
            const srv = state?.devices?.[a.protocol];
            const count = s.assets.filter((x) => x.protocol === a.protocol && x.ownership !== 'external').length;
            const connected = a.connected || srv?.configured;
            return (
              <div key={a.protocol} className="rounded-xl border border-line p-3.5 bg-panel-2/40">
                <div className="flex items-center gap-2.5">
                  <span className={clsx('w-9 h-9 rounded-lg grid place-items-center', connected ? 'bg-green/15 text-green' : 'bg-panel-3 text-muted')}>
                    {a.protocol === 'sim' ? <TerminalSquare size={17} /> : <PlugZap size={17} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[14px]">{a.name}</div>
                    <div className="text-[11px] text-muted truncate">{a.transport}</div>
                  </div>
                  <Badge color={a.connected ? '#8bd450' : srv?.configured ? '#5a9bf0' : '#6c747d'}>{a.connected ? 'Live' : srv?.configured ? 'URL set' : 'Not connected'}</Badge>
                </div>
                <div className="text-xs text-muted mt-2.5">{a.devices}</div>
                <div className="text-[11px] text-dim mt-1 leading-relaxed">{a.docs}</div>
                <div className="flex items-center justify-between mt-2.5">
                  <span className="text-[11px] text-muted">{count} machine{count === 1 ? '' : 's'} registered</span>
                  {a.envVar && <code className="text-[10px] px-1.5 py-0.5 rounded bg-[#16191c] border border-line text-muted">{a.envVar}</code>}
                </div>
                {a.protocol !== 'sim' && (
                  <div className="mt-2.5">
                    <Button size="sm" variant="outline" onClick={() => test(`dev-${a.protocol}`, `/api/devices/${a.protocol}/command`, { assetId: 'TEST-01', command: 'pause' })}>
                      Dry-run “pause”
                    </Button>
                    <TestResult value={results[`dev-${a.protocol}`]} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
