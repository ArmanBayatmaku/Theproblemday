// Drone rental options: Drone + pilot or Pro, with prices (or a personalised quote for "Other").
import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Check, CircleAlert, Clock3, Sparkles, UserRound, Wind } from 'lucide-react';
import { pointInZone } from '@shared/geo';
import { DEMO_ZONES } from '@shared/data/london';
import { useApp, useWeather } from '@/store';
import { useMapScene } from '@/map/scene';
import { dayLabel, hhmm, money, pounds } from '@/lib/format';
import { PURPOSES, durationLabel, flightArea, quoteRental, rentProblem, type RentOption, type RentPackage } from '@/lib/rental';
import { Badge, Btn, Note, PaymentRow, Section, StickyFooter, TopBar } from '@/ui/kit';
import { DroneArt } from '@/ui/art';

export function RentOptions() {
  const nav = useNavigate();
  const f = useApp((s) => s.rentForm);
  const set = useApp((s) => s.setRentForm);
  const book = useApp((s) => s.bookRental);
  const weather = useWeather();
  const [now] = useState(() => Date.now());
  const [pkg, setPkg] = useState<RentPackage>('pilot');
  const problem = rentProblem(f);
  const opts = useMemo(() => (problem ? [] : quoteRental(f, weather, now)), [f, weather, now, problem]);
  const zone = f.place ? DEMO_ZONES.find((z) => z.active && pointInZone(f.place!.position, z)) : undefined;

  useMapScene(
    {
      fit: f.place ? [f.place.position] : undefined,
      fitKey: `rentopt|${f.place?.position.join()}`,
      fitZoom: 15.6,
      stops: f.place ? [{ id: 'place', kind: 'dropoff', position: f.place.position, label: f.place.name }] : [],
      area: f.place ? flightArea(f) : undefined,
      hotZones: zone ? [zone.id] : undefined,
      ports: true,
    },
    [f.place?.position.join(), f.purpose],
  );

  if (problem || !opts.length || !f.place) return <Navigate to="/rent" replace />;
  const sel = opts.find((o) => o.pkg === pkg) ?? opts[0];
  const later = f.when.mode === 'later';

  const fix = () => {
    if (sel.fix === 'later') set({ when: { mode: 'later', at: now + 3 * 3600_000 - (now % 1_800_000) } });
    nav('/rent');
  };

  return (
    <>
      <TopBar title={PURPOSES[f.purpose].title} onBack={() => nav('/rent')} />
      <div className="flex-1">
        <div className="px-5 space-y-3">
          {opts.map((o) => (
            <PackageCard key={o.pkg} o={o} on={o.pkg === sel.pkg} onClick={() => setPkg(o.pkg)} />
          ))}
          {!sel.available && sel.reason && (
            <>
              <Note icon={<CircleAlert size={17} />} tone="red">
                {sel.reason}
              </Note>
              <Btn variant="secondary" size="md" className="w-full" onClick={fix}>
                {sel.fix === 'later' ? 'Schedule it for later' : 'Choose another place'}
              </Btn>
            </>
          )}
        </div>

        <Section title="Details" className="pt-6">
          <div className="rounded-xl border border-[#e2e2e2] divide-y divide-[#eeeeee] text-[14px]">
            <Row label="Where" value={f.place.name} />
            <Row label="When" value={later ? `${dayLabel(sel.startAt)} at ${hhmm(sel.startAt)}` : `As soon as possible · pilot in about ${sel.pilotEtaMin} min`} />
            <Row label="How long" value={durationLabel(f)} />
            {f.purpose === 'event' && f.eventNote && <Row label="Event" value={f.eventNote} />}
            {f.purpose === 'other' && <Row label="Request" value={f.details} />}
          </div>
        </Section>

        {sel.available && (
          <Section>
            <div className="space-y-2">
              {sel.notes.map((n) => (
                <Note key={n} icon={/Breezy|gust/.test(n) ? <Wind size={17} /> : /quote/.test(n) ? <Sparkles size={17} /> : /pilot is about/.test(n) ? <UserRound size={17} /> : <Clock3 size={17} />} tone={/Breezy/.test(n) ? 'amber' : 'grey'}>
                  {n}
                </Note>
              ))}
              <Note icon={<UserRound size={17} />}>Pilots hold a UK flyer ID and operator licence, and every flight is insured.</Note>
            </div>
          </Section>
        )}
      </div>

      <StickyFooter>
        {!sel.quote && <PaymentRow />}
        <Btn
          className="w-full"
          disabled={!sel.available}
          onClick={() => {
            const r = book(sel);
            nav(`/rental/${r.id}`, { replace: true });
          }}
        >
          {!sel.available ? 'Not available' : sel.quote ? 'Request a quote' : `Book ${sel.title} · ${money(sel.price ?? 0)}`}
        </Btn>
      </StickyFooter>
    </>
  );
}

function PackageCard({ o, on, onClick }: { o: RentOption; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={clsx('w-full text-left rounded-2xl p-4 transition', on ? 'border-2 border-black' : 'border-2 border-[#e2e2e2] hover:border-[#bdbdbd]')}>
      <div className="flex items-center gap-3">
        <DroneArt camera className="w-[68px] h-[46px] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-bold">{o.title}</span>
            {o.pkg === 'pro' && <Badge tone="black">4K</Badge>}
          </div>
          <div className="text-[13px] text-[#545454]">{o.tagline}</div>
        </div>
        <div className="text-right shrink-0">
          {o.price !== undefined ? (
            <div className={clsx('text-[20px] font-bold tabular-nums', !o.available && 'text-[#a6a6a6] line-through')}>{money(o.price)}</div>
          ) : (
            <>
              <div className="text-[12px] text-[#6b6b6b]">Estimate</div>
              <div className="text-[16px] font-bold tabular-nums">
                {pounds(o.range![0])}–{pounds(o.range![1])}
              </div>
            </>
          )}
        </div>
      </div>
      {on && (
        <div className="mt-3 space-y-1.5">
          {o.includes.map((t) => (
            <div key={t} className="flex gap-2 text-[14px]">
              <Check size={17} className="mt-[1px] shrink-0" />
              <span>{t}</span>
            </div>
          ))}
          {o.breakdown.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#eeeeee] space-y-1 text-[13px]">
              {o.breakdown.map((l) => (
                <div key={l.label} className="flex justify-between gap-4 text-[#545454]">
                  <span>{l.label}</span>
                  <span className="tabular-nums">{money(l.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {o.quote && <p className="mt-2 text-[13px] text-[#6b6b6b]">Personalised quote: final price confirmed by a pilot before you pay.</p>}
        </div>
      )}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 px-3.5 py-2.5">
      <span className="w-20 shrink-0 text-[#6b6b6b]">{label}</span>
      <span className="flex-1 min-w-0 font-medium break-words">{value}</span>
    </div>
  );
}
