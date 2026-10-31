// Drone rental form: what it's for, where, how long (events must say), when.
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Building2, Camera, ChevronRight, CircleAlert, House, MapPin, PartyPopper, Sparkles } from 'lucide-react';
import type { Place } from '@shared/types';
import { pointInZone } from '@shared/geo';
import { DEMO_ZONES } from '@shared/data/london';
import { useApp } from '@/store';
import { useMapScene } from '@/map/scene';
import { money } from '@/lib/format';
import { shortZone } from '@/lib/quotes';
import { AERIAL_MINUTES, EVENT_HOURS, OTHER_HOURS, PURPOSES, flightArea, rentProblem, type RentPurpose } from '@/lib/rental';
import { Btn, Chip, Note, Section, Segmented, StickyFooter, TextArea, TextInput, TopBar } from '@/ui/kit';
import { PlacePicker } from '@/ui/PlacePicker';
import { WhenPicker, firstSlot } from '@/ui/WhenPicker';

const ICON: Record<RentPurpose, ReactNode> = {
  aerial: <Camera size={22} strokeWidth={1.8} />,
  event: <PartyPopper size={22} strokeWidth={1.8} />,
  roof: <House size={22} strokeWidth={1.8} />,
  other: <Sparkles size={22} strokeWidth={1.8} />,
};

const AERIAL_PRICE: Record<number, number> = { 15: 29, 30: 49, 60: 89 };

export function Rent() {
  const nav = useNavigate();
  const f = useApp((s) => s.rentForm);
  const set = useApp((s) => s.setRentForm);
  const remember = useApp((s) => s.remember);
  const [picker, setPicker] = useState(false);
  const problem = rentProblem(f);
  const zone = f.place ? DEMO_ZONES.find((z) => z.active && pointInZone(f.place!.position, z)) : undefined;

  useMapScene(
    {
      fit: f.place ? [f.place.position] : undefined,
      fitKey: `rent|${f.place?.position.join()}`,
      fitZoom: 15.6,
      stops: f.place ? [{ id: 'place', kind: 'dropoff', position: f.place.position, label: f.place.name }] : [],
      area: f.place ? flightArea(f) : undefined,
      hotZones: zone ? [zone.id] : undefined,
      ports: true,
    },
    [f.place?.position.join(), f.purpose, zone?.id],
  );

  return (
    <>
      <TopBar title="Drone rental" onBack={() => nav('/')} />
      <div className="flex-1">
        <div className="px-5 pt-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">Rent a drone with a pilot</h1>
          <p className="mt-1 text-[15px] text-[#545454]">A licensed pilot comes to you with the drone. Choose what it’s for.</p>
        </div>

        <Section title="What’s it for?" className="pt-5">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(PURPOSES) as RentPurpose[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => set({ purpose: p })}
                className={clsx('text-left rounded-xl border p-3 transition', f.purpose === p ? 'border-black ring-1 ring-black' : 'border-[#e2e2e2] hover:border-[#bdbdbd]')}
              >
                {ICON[p]}
                <div className="mt-2 text-[15px] font-semibold leading-tight">{PURPOSES[p].title}</div>
                <div className="mt-0.5 text-[12px] text-[#6b6b6b] leading-snug">{PURPOSES[p].hint}</div>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Where?">
          <button type="button" onClick={() => setPicker(true)} className="w-full flex items-center gap-4 rounded-2xl border border-[#e2e2e2] px-4 py-3 text-left hover:bg-[#fafafa]">
            <MapPin size={20} className="shrink-0" />
            <span className="flex-1 min-w-0">
              <span className={clsx('block text-[16px] truncate', f.place ? 'font-semibold' : 'text-[#8f8f8f]')}>{f.place?.name ?? 'Add the address'}</span>
              {f.place?.address && f.place.address !== f.place.name && f.place.address !== 'London' && <span className="block text-[13px] text-[#6b6b6b] truncate">{f.place.address}</span>}
            </span>
            <ChevronRight size={18} className="text-[#a6a6a6]" />
          </button>
          {zone && (
            <div className="mt-3">
              <Note icon={<CircleAlert size={17} />} tone="red">
                This spot is inside a no-fly zone ({shortZone(zone.name)}, demo). Choose a place outside the red area.
              </Note>
            </div>
          )}
        </Section>

        {f.purpose === 'aerial' && (
          <Section title="How long in the air?">
            <div className="flex gap-2 flex-wrap">
              {AERIAL_MINUTES.map((m) => (
                <Chip key={m} active={f.aerialMin === m} onClick={() => set({ aerialMin: m })}>
                  {m} min · {money(AERIAL_PRICE[m]).replace('.00', '')}
                </Chip>
              ))}
            </div>
          </Section>
        )}

        {f.purpose === 'event' && (
          <Section title="How long is the event?" aside={<span className="text-[12px] font-semibold text-[#c5221f]">Required</span>}>
            <p className="-mt-1 mb-3 text-[13px] text-[#6b6b6b] leading-snug">Event pilots are paid by the hour, so we need the length to price it.</p>
            <div className="flex gap-2 flex-wrap">
              {EVENT_HOURS.map((h) => (
                <Chip key={h} active={f.eventHours === h} onClick={() => set({ eventHours: h })}>
                  {h} h
                </Chip>
              ))}
            </div>
            {f.eventHours ? (
              <p className="mt-3 text-[13px] text-[#545454]">
                Drone + pilot: {f.eventHours} h × £69 + £15 setup = <b className="text-black">{money(f.eventHours * 69 + 15)}</b>. Pro: <b className="text-black">{money(f.eventHours * 119 + 15)}</b>.
              </p>
            ) : (
              <p className="mt-3 text-[13px] font-medium text-[#c5221f]">Pick how many hours to see the price.</p>
            )}
            <label className="block mt-4">
              <span className="block text-[13px] font-medium text-[#545454] mb-1.5">About the event (optional)</span>
              <TextInput value={f.eventNote} onChange={(e) => set({ eventNote: e.target.value.slice(0, 120) })} placeholder="e.g. Garden wedding, about 80 guests" />
            </label>
          </Section>
        )}

        {f.purpose === 'roof' && (
          <Section title="What kind of building?">
            <Segmented
              value={f.building}
              onChange={(v) => set({ building: v })}
              options={[
                { value: 'house', label: <><House size={16} /> House</> },
                { value: 'large', label: <><Building2 size={16} /> Flats or larger</> },
              ]}
            />
          </Section>
        )}

        {f.purpose === 'other' && (
          <Section title="What do you need?" aside={<span className="text-[12px] font-semibold text-[#c5221f]">Required</span>}>
            <TextArea value={f.details} onChange={(e) => set({ details: e.target.value.slice(0, 400) })} placeholder="e.g. Photos of my allotment for a planning application, or a fence and tree survey for my landlord" />
            <div className="mt-4 text-[13px] font-medium text-[#545454] mb-2">Roughly how long?</div>
            <div className="flex gap-2 flex-wrap">
              {OTHER_HOURS.map((o) => (
                <Chip key={o.label} active={(f.otherHours ?? -1) === o.value} onClick={() => set({ otherHours: o.value })}>
                  {o.label}
                </Chip>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-[#6b6b6b] leading-snug">Personalised billing: a pilot reads your request and sends a fixed price. Nothing is charged until you accept it.</p>
          </Section>
        )}

        <Section title="When?">
          <div className="flex gap-2">
            <Chip active={f.when.mode === 'now'} onClick={() => set({ when: { mode: 'now' } })}>
              As soon as possible
            </Chip>
            <Chip active={f.when.mode === 'later'} onClick={() => f.when.mode !== 'later' && set({ when: { mode: 'later', at: firstSlot(Date.now()) } })}>
              Schedule
            </Chip>
          </div>
          {f.when.mode === 'later' && <WhenPicker at={f.when.at} onChange={(at) => set({ when: { mode: 'later', at } })} />}
        </Section>
      </div>

      <StickyFooter>
        {problem && f.place && <p className="mb-2 text-center text-[13px] font-medium text-[#6b6b6b]">{problem}</p>}
        <Btn className="w-full" disabled={!!problem} onClick={() => nav('/rent/options')}>
          See options
        </Btn>
      </StickyFooter>

      {picker && (
        <PlacePicker
          title="Where should the drone fly?"
          onPick={(p: Place) => {
            set({ place: p });
            remember(p);
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </>
  );
}
