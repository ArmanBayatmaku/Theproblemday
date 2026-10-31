// Drone rental tracking: quote (for Other), pilot on the way, flying, and the results.
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Check, CircleAlert, Download, FastForward, LifeBuoy, Share2, Star, TriangleAlert, X } from 'lucide-react';
import type { LngLat, Pos3 } from '@shared/types';
import { pointInZone } from '@shared/geo';
import { DEMO_ZONES } from '@shared/data/london';
import { useApp } from '@/store';
import { useMapScene } from '@/map/scene';
import { portShort } from '@/lib/drone';
import { dayLabel, hhmm, money, pounds, rng, useNow } from '@/lib/format';
import { PACKAGE_TITLE, PURPOSES, durationLabel, flightArea, liveRental, orbitPath, rentalActive, rentalTitle, type Rental } from '@/lib/rental';
import { Btn, Note, TopBar } from '@/ui/kit';
import { DroneArt } from '@/ui/art';

const STEPS = ['Booked', 'Pilot on the way', 'Flying', 'Ready'];
function stepIndex(r: Rental) {
  if (r.phase === 'travelling' || r.phase === 'setup') return 1;
  if (r.phase === 'flying') return 2;
  if (r.phase === 'done') return 3;
  return 0;
}

function headline(r: Rental, m: number): { title: string; sub: string } {
  const p = r.form.purpose;
  switch (r.phase) {
    case 'quote':
      return { title: 'Getting your quote…', sub: 'A pilot is reading your request' };
    case 'quoted':
      return { title: 'Your quote is ready', sub: 'Fixed price, nothing charged until you accept' };
    case 'scheduled':
      return { title: 'Booked', sub: `${PACKAGE_TITLE[r.pkg]} · ${dayLabel(r.startAt)} at ${hhmm(r.startAt)}` };
    case 'matching':
      return { title: 'Finding your pilot…', sub: 'Checking airspace and weather for the spot' };
    case 'travelling':
      return { title: `${r.pilot.name} is on the way`, sub: `Arrives in ${m} min with the drone` };
    case 'setup':
      return { title: `${r.pilot.name} has arrived`, sub: 'Safety checks, then take-off' };
    case 'flying':
      return { title: p === 'event' ? 'Filming your event' : p === 'roof' ? 'Checking your roof' : 'Flying now', sub: `${m} min left` };
    case 'done':
      if (p === 'roof') return { title: 'Your roof report is ready', sub: `Checked at ${hhmm(r.completedAt ?? Date.now())}` };
      if (p === 'event') return { title: r.pkg === 'pro' ? 'Your event film is ready' : 'Your photos and highlights are ready', sub: 'Download them below' };
      if (p === 'aerial') return { title: 'Your photos are ready', sub: r.pkg === 'pro' ? 'The edited 4K film follows tomorrow morning' : 'Download them below' };
      return { title: 'All done', sub: 'Your files are ready' };
    default:
      return { title: 'Cancelled', sub: 'You haven’t been charged' };
  }
}

export function RentTrack() {
  const { id } = useParams();
  const nav = useNavigate();
  const r = useApp((s) => s.rentals.find((x) => x.id === id));
  const accept = useApp((s) => s.acceptRentalQuote);
  const cancel = useApp((s) => s.cancelRental);
  const skip = useApp((s) => s.skipRental);
  const rate = useApp((s) => s.rateRental);
  const now = useNow(250);
  const [copied, setCopied] = useState(false);
  const l = r ? liveRental(r, now) : undefined;
  const place = r?.form.place;
  const zone = place ? DEMO_ZONES.find((z) => z.active && pointInZone(place.position, z)) : undefined;
  const travelling = r?.phase === 'travelling' || r?.phase === 'matching' || r?.phase === 'scheduled';

  useMapScene(
    r && place
      ? {
          fit: travelling && r.travel.length ? [r.travel[0], place.position] : [place.position],
          fitKey: `${r.id}|${travelling ? 'travel' : 'site'}`,
          fitZoom: 16.4,
          approach: travelling ? (r.travel.map((p) => [p[0], p[1], 0]) as Pos3[]) : undefined,
          route: r.phase === 'flying' ? orbitPath(r) : undefined,
          area: flightArea(r.form),
          drone: l && r.phase !== 'quote' && r.phase !== 'quoted' ? { pos: l.pos, heading: l.heading } : undefined,
          stops: [{ id: 'place', kind: 'dropoff', position: place.position as LngLat, label: place.name }],
          hotZones: zone ? [zone.id] : undefined,
        }
      : {},
    [r?.id, r?.phase, Math.round(now / 250)],
  );

  if (!r || !place) return <Navigate to="/activity" replace />;
  const h = headline(r, Math.max(1, Math.ceil(l?.minutesLeft ?? 0)));
  const step = stepIndex(r);
  const quoting = r.phase === 'quote' || r.phase === 'quoted';
  const share = () => {
    void navigator.clipboard?.writeText(`https://relay.example/r/${r.id.toLowerCase()}`).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <TopBar title={`${rentalTitle(r)}`} onBack={() => nav('/activity')} />
      <div className="flex-1 pb-4">
        <div className="px-5">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-[24px] font-bold tracking-[-0.01em] leading-tight">{h.title}</h1>
              <p className="mt-0.5 text-[15px] text-[#545454]">{h.sub}</p>
            </div>
            {(r.phase === 'travelling' || r.phase === 'flying') && (
              <div className="shrink-0 rounded-xl bg-black text-white px-3 py-2 text-center leading-none">
                <div className="text-[20px] font-bold tabular-nums">{Math.max(1, Math.ceil(l?.minutesLeft ?? 0))}</div>
                <div className="text-[11px] mt-1">min</div>
              </div>
            )}
          </div>

          {!quoting && r.phase !== 'cancelled' && (
            <div className="mt-4">
              <div className="grid grid-cols-4 gap-1.5">
                {STEPS.map((s, i) => (
                  <div key={s} className={clsx('h-1 rounded-full', i < step || r.phase === 'done' ? 'bg-black' : i === step ? 'bg-black progress-pulse' : 'bg-[#e2e2e2]')} />
                ))}
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5 text-[11px]">
                {STEPS.map((s, i) => (
                  <span key={s} className={i <= step ? 'text-black font-semibold' : 'text-[#8f8f8f]'}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {r.phase === 'quote' && (
          <div className="mx-5 mt-4 rounded-2xl bg-[#f6f6f6] p-4">
            <div className="text-[13px] font-semibold text-[#6b6b6b]">Your request</div>
            <p className="mt-1 text-[15px]">{r.form.details}</p>
            <p className="mt-3 text-[13px] text-[#6b6b6b]">
              Estimate {pounds(r.range?.[0] ?? 0)}–{pounds(r.range?.[1] ?? 0)} · {durationLabel(r.form)}
            </p>
            <div className="mt-3 h-1 rounded-full bg-[#e2e2e2] overflow-hidden">
              <div className="h-full w-1/2 bg-black progress-pulse" />
            </div>
          </div>
        )}

        {r.phase === 'quoted' && r.price !== undefined && (
          <div className="mx-5 mt-4 rounded-2xl border-2 border-black p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-semibold">{PACKAGE_TITLE[r.pkg]}</span>
              <span className="text-[28px] font-bold tabular-nums">{money(r.price)}</span>
            </div>
            <div className="mt-2 space-y-1 text-[14px]">
              {r.breakdown.map((x) => (
                <div key={x.label} className="flex justify-between gap-4 text-[#545454]">
                  <span>{x.label}</span>
                  <span className="tabular-nums">{money(x.amount)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-[#6b6b6b]">
              From {r.pilot.name}, for: “{r.form.details}”. Valid for 24 hours.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Btn variant="secondary" size="md" onClick={() => cancel(r.id)}>
                Decline
              </Btn>
              <Btn size="md" onClick={() => accept(r.id)}>
                Accept · {money(r.price)}
              </Btn>
            </div>
          </div>
        )}

        {r.phase === 'done' && <Results r={r} />}

        {r.phase === 'done' && (
          <div className="mx-5 mt-4 flex items-center justify-between">
            <span className="text-[15px] font-semibold">How was {r.pilot.name}?</span>
            <span className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-label={`${n} stars`} onClick={() => rate(r.id, n)}>
                  <Star size={26} className={n <= (r.rating ?? 0) ? 'fill-black text-black' : 'text-[#c4c4c4]'} />
                </button>
              ))}
            </span>
          </div>
        )}

        {!quoting && (
          <div className="mx-5 mt-4 rounded-2xl border border-[#e2e2e2] p-4">
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-full bg-black text-white grid place-items-center text-[18px] font-bold shrink-0">{r.pilot.name[0]}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold">
                  {r.pilot.name} · ★ {r.pilot.rating}
                </div>
                <div className="text-[13px] text-[#6b6b6b]">
                  {PACKAGE_TITLE[r.pkg]} · drone {r.droneId} · from {portShort(r.portName)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[11px] text-[#6b6b6b]">Code</div>
                <div className="text-[18px] font-bold tracking-[0.12em] tabular-nums">{r.code}</div>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <Note icon={<Check size={16} />}>
                {PURPOSES[r.form.purpose].title} at {place.name} · {durationLabel(r.form)}
              </Note>
              {r.phase === 'travelling' && <Note icon={<Check size={16} />}>Show the pilot code {r.code} when they arrive.</Note>}
              {zone && (
                <Note icon={<TriangleAlert size={16} />} tone="red">
                  Inside a no-fly zone (demo)
                </Note>
              )}
            </div>
          </div>
        )}

        {r.phase !== 'cancelled' && r.phase !== 'quoted' && (
          <div className="mx-5 mt-4 grid grid-cols-3 gap-2">
            <Action icon={copied ? <Check size={20} /> : <Share2 size={20} />} label={copied ? 'Link copied' : 'Share link'} onClick={share} />
            <Action icon={<LifeBuoy size={20} />} label="Help" onClick={() => undefined} />
            <Action icon={<X size={20} />} label="Cancel" disabled={!['quote', 'quoted', 'scheduled', 'matching', 'travelling'].includes(r.phase)} onClick={() => cancel(r.id)} />
          </div>
        )}

        <div className="mx-5 mt-4 flex items-center justify-between text-[13px] text-[#6b6b6b]">
          <span>{r.price !== undefined ? `${money(r.price)} · ${PACKAGE_TITLE[r.pkg]}` : 'Personalised quote'}</span>
          {rentalActive(r) && r.phase !== 'quoted' && (
            <button type="button" onClick={() => skip(r.id)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-[#f3f3f3] text-black font-semibold">
              <FastForward size={15} /> Demo: skip ahead
            </button>
          )}
        </div>
        {r.phase === 'cancelled' && (
          <div className="mx-5 mt-4">
            <Note icon={<CircleAlert size={16} />}>Nothing was charged.</Note>
          </div>
        )}
      </div>
    </>
  );
}

/** What the customer gets at the end: photos/film, or a roof report. */
function Results({ r }: { r: Rental }) {
  if (r.form.purpose === 'roof') {
    const g = rng(r.id);
    const findings: { tone: 'red' | 'amber' | 'green'; text: string }[] = [
      { tone: 'amber', text: g() > 0.4 ? 'Gutters: leaves and moss blocking the front downpipe' : 'Gutters: back gutter sagging near the corner' },
      { tone: 'red', text: g() > 0.5 ? 'Roof: 2 slipped tiles next to the chimney' : 'Roof: 1 cracked ridge tile' },
      { tone: 'green', text: 'Chimney and flashing look fine' },
      ...(r.pkg === 'pro' ? [{ tone: 'amber' as const, text: 'Thermal: heat escaping around the loft hatch' }] : []),
    ];
    return (
      <div className="mx-5 mt-4 rounded-2xl bg-[#f6f6f6] p-4">
        <div className="text-[13px] font-semibold text-[#6b6b6b]">What the pilot found</div>
        <div className="mt-2 space-y-2">
          {findings.map((f) => (
            <Note key={f.text} icon={f.tone === 'green' ? <Check size={16} /> : <TriangleAlert size={16} />} tone={f.tone}>
              {f.text}
            </Note>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <Photo key={i} seed={`${r.id}${i}`} roof />
          ))}
        </div>
        <Btn variant="secondary" size="md" className="w-full mt-3">
          <Download size={17} /> Download {r.pkg === 'pro' ? 'report and photos' : 'photos'}
        </Btn>
      </div>
    );
  }
  const what =
    r.form.purpose === 'event'
      ? r.pkg === 'pro'
        ? '3-minute highlights film + all raw footage'
        : `${40 + Math.round((r.form.eventHours ?? 1) * 15)} photos + 1-minute highlights clip`
      : r.form.purpose === 'aerial'
        ? `${20 + Math.round(r.form.aerialMin / 3)} photos + a short video`
        : 'Photos and video from the flight';
  return (
    <div className="mx-5 mt-4 rounded-2xl bg-[#f6f6f6] p-4">
      <div className="text-[13px] font-semibold text-[#6b6b6b]">{what}</div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <Photo key={i} seed={`${r.id}${i}`} />
        ))}
      </div>
      <Btn variant="secondary" size="md" className="w-full mt-3">
        <Download size={17} /> Download all
      </Btn>
    </div>
  );
}

/** Placeholder "aerial photo": rooftops, gardens and a street from above. */
function Photo({ seed, roof }: { seed: string; roof?: boolean }) {
  const g = rng(seed);
  const greens = ['#9cc58a', '#8bb97a', '#a9cf95'];
  const roofs = ['#b4614a', '#8e8e8e', '#a65a46', '#6f7f8c'];
  return (
    <svg viewBox="0 0 120 80" className={clsx('w-full rounded-lg', roof ? 'h-16' : 'h-24')} preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="120" height="80" fill={greens[Math.floor(g() * 3)]} />
      <rect x="0" y={30 + g() * 20} width="120" height="10" fill="#d8d6d0" />
      {Array.from({ length: roof ? 1 : 5 }, (_, i) => {
        const w = roof ? 70 : 18 + g() * 10;
        const x = roof ? 25 : i * 24 + g() * 4;
        const y = roof ? 12 : 6 + g() * 10;
        const h = roof ? 52 : 18 + g() * 6;
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} fill={roofs[Math.floor(g() * roofs.length)]} />
            <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke="#00000030" strokeWidth="1.2" />
          </g>
        );
      })}
      <circle cx={20 + g() * 80} cy={60 + g() * 14} r={6 + g() * 4} fill="#6fa25d" />
    </svg>
  );
}

function Action({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="h-[70px] rounded-xl bg-[#f6f6f6] flex flex-col items-center justify-center gap-1 text-[12px] font-semibold disabled:opacity-35 active:scale-[0.98]">
      {icon}
      {label}
    </button>
  );
}
