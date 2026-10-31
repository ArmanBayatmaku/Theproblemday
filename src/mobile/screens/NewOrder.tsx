import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Camera, ChevronRight, Image as ImageIcon, X } from 'lucide-react';
import type { Place } from '@shared/types';
import { useApp } from '../store';
import { AERIAL_PURPOSES, ITEM_KINDS, MOVE_ITEMS, RETURN_POINTS, returnPlace, serviceById, SIZES } from '../services';
import { formReady } from '../quotes';
import { ServiceArt } from '../art';
import { PlacePicker } from '../PlacePicker';
import { Btn, Chip, dayLabel, Divider, hhmm, Section, Stepper, Switch, TextInput, TopBar } from '../ui';
import type { OrderForm, ServiceId } from '../types';

function StopRow({ shape, label, place, placeholder, onClick, last }: { shape: 'circle' | 'square'; label: string; place?: Place; placeholder: string; onClick: () => void; last?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-4 px-4 py-3.5 text-left active:bg-[#f6f6f6] relative">
      <span className={clsx('w-3 h-3 bg-black shrink-0 relative z-10', shape === 'circle' ? 'rounded-full' : 'rounded-[2px]')} />
      <span className="flex-1 min-w-0">
        <span className="block text-[12px] font-semibold text-[#6b6b6b]">{label}</span>
        <span className={clsx('block text-[16px] truncate', place ? 'font-semibold' : 'text-[#8f8f8f]')}>{place ? (place.name === 'Home' || place.name === 'Work' ? `${place.name} · ${place.address ?? ''}` : place.name) : placeholder}</span>
      </span>
      <ChevronRight size={18} className="text-[#a6a6a6]" />
      {!last && <span className="absolute left-[21px] top-[43px] h-[calc(100%-14px)] w-[2px] bg-black" />}
    </button>
  );
}

function CardChoice({ active, title, sub, onClick, right }: { active: boolean; title: string; sub?: string; onClick: () => void; right?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={clsx('w-full text-left rounded-xl px-4 py-3 border-2 transition', active ? 'border-black bg-white' : 'border-transparent bg-[#f3f3f3]')}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold">{title}</div>
          {sub && <div className="text-[13px] text-[#6b6b6b] leading-snug">{sub}</div>}
        </div>
        {right}
      </div>
    </button>
  );
}

function ToggleRow({ title, sub, checked, onChange }: { title: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-[16px] font-medium">{title}</div>
        {sub && <div className="text-[13px] text-[#6b6b6b] leading-snug">{sub}</div>}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function WhenPicker({ f, set, ride }: { f: OrderForm; set: (p: Partial<OrderForm>) => void; ride: boolean }) {
  const today = startOfDay(Date.now());
  const days = Array.from({ length: 6 }, (_, i) => today + i * 86400_000);
  const at = f.when.mode === 'later' ? f.when.at : undefined;
  const day = at ? startOfDay(at) : today;
  const slots: number[] = [];
  for (let h = 7; h <= 21; h++) for (const m of [0, 30]) {
    const t = day + (h * 60 + m) * 60_000;
    if (t > Date.now() + 30 * 60_000) slots.push(t);
  }
  const pickDay = (d: number) => {
    const keepTime = at ? at - startOfDay(at) : 10 * 3600_000;
    let t = d + keepTime;
    if (t < Date.now() + 30 * 60_000) t = Math.ceil((Date.now() + 45 * 60_000) / 1_800_000) * 1_800_000;
    set({ when: { mode: 'later', at: t } });
  };
  return (
    <>
      <div className="flex gap-2">
        <Chip active={f.when.mode === 'now'} onClick={() => set({ when: { mode: 'now' } })}>
          {ride ? 'Now' : 'As soon as possible'}
        </Chip>
        <Chip active={f.when.mode === 'later'} onClick={() => pickDay(today)}>
          Schedule
        </Chip>
      </div>
      {at && (
        <div className="mt-4 space-y-3 fade-in">
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
            {days.map((d) => (
              <Chip key={d} active={d === day} onClick={() => pickDay(d)} className="!h-9 !px-3.5 !text-[14px]">
                {dayLabel(d)}
              </Chip>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5">
            {slots.map((t) => (
              <Chip key={t} active={t === at} onClick={() => set({ when: { mode: 'later', at: t } })} className="!h-9 !px-3.5 !text-[14px]">
                {hhmm(t)}
              </Chip>
            ))}
            {!slots.length && <span className="text-[14px] text-[#6b6b6b] py-2">No more slots today, so pick another day.</span>}
          </div>
        </div>
      )}
    </>
  );
}

export function NewOrder() {
  const { service = 'send' } = useParams();
  const nav = useNavigate();
  const draft = useApp((s) => s.draft);
  const startDraft = useApp((s) => s.startDraft);
  const setDraft = useApp((s) => s.setDraft);
  const photo = useApp((s) => s.photo);
  const setPhoto = useApp((s) => s.setPhoto);
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [label, setLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!draft || draft.service !== service) startDraft(service as ServiceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

  if (!draft || draft.service !== service) return null;
  const f = draft;
  const info = serviceById(service);
  const missing = formReady(f);

  const onPick = (p: Place) => {
    if (picker === 'from') setDraft({ from: p, ...(f.service === 'return' ? { to: returnPlace(f.returnPoint, p) } : {}) });
    if (picker === 'to') setDraft({ to: p });
    setPicker(null);
  };
  const onPhoto = (file?: File) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setPhoto(String(r.result));
    r.readAsDataURL(file);
  };

  return (
    <div className="h-full relative flex flex-col bg-white">
      <TopBar onBack={() => nav('/')} />
      <div className="flex-1 overflow-y-auto pb-36 no-scrollbar">
        <div className="px-5 pb-2 flex items-start gap-3">
          <div className="flex-1">
            <h1 className="text-[26px] leading-[1.15] font-bold tracking-[-0.02em]">{info.headline}</h1>
            <p className="text-[15px] text-[#5e5e5e] mt-1.5 leading-snug">{info.blurb}</p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[#f3f3f3] grid place-items-center shrink-0">
            <ServiceArt id={info.id} className="w-9 h-9" />
          </div>
        </div>

        <div className="mx-5 mt-4 rounded-2xl border border-[#e6e6e6] overflow-hidden">
          {!info.single && (
            <StopRow
              shape="circle"
              label={info.fromLabel}
              place={f.from}
              placeholder={f.service === 'collect' ? 'Seller’s address or postcode' : f.service === 'errand' ? 'Shop, office or address' : 'Add a pickup'}
              onClick={() => setPicker('from')}
            />
          )}
          {!info.single && <div className="mx-4 border-t border-[#efefef] ml-12" />}
          {f.service === 'return' ? (
            <div className="px-4 py-3.5 flex items-center gap-4">
              <span className="w-3 h-3 bg-black rounded-[2px]" />
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] font-semibold text-[#6b6b6b]">{info.toLabel}</span>
                <span className="block text-[16px] font-semibold truncate">{f.to?.name ?? 'Choose below'}</span>
              </span>
            </div>
          ) : (
            <StopRow shape="square" label={info.toLabel} place={f.to} placeholder={f.service === 'sold' ? 'Buyer’s postcode or area' : f.service === 'ride' ? 'Where to?' : 'Add a drop-off'} onClick={() => setPicker('to')} last />
          )}
        </div>

        {f.service === 'return' && (
          <Section title="Where should it go?">
            <div className="space-y-2">
              {RETURN_POINTS.map((r) => (
                <CardChoice key={r.id} active={f.returnPoint === r.id} title={r.label} sub={r.hint} onClick={() => f.from && setDraft({ returnPoint: r.id, to: returnPlace(r.id, f.from) })} />
              ))}
            </div>
            <div className="mt-2">
              <ToggleRow title="Print my label for me" sub="+£0.50 · the courier brings it printed" checked={f.printLabel} onChange={(printLabel) => setDraft({ printLabel })} />
              <label className="flex items-center gap-3 h-12 px-4 rounded-xl bg-[#f3f3f3] text-[15px] font-medium cursor-pointer">
                <ImageIcon size={18} /> {label || 'Upload your return label or QR code'}
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setLabel(e.target.files?.[0]?.name ?? '')} />
              </label>
            </div>
          </Section>
        )}

        {info.item && <Divider />}
        {info.item && (
          <Section title={f.service === 'errand' ? 'What should we pick up?' : 'What is it?'}>
            {f.service === 'errand' ? (
              <textarea
                value={f.errandText}
                onChange={(e) => setDraft({ errandText: e.target.value })}
                rows={3}
                placeholder="e.g. My keys from reception, ask for Jo. Or a prescription in my name."
                className="w-full rounded-xl bg-[#f3f3f3] px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-black resize-none placeholder:text-[#8f8f8f]"
              />
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {ITEM_KINDS.map((k) => (
                    <Chip key={k} active={f.itemKind === k} onClick={() => setDraft({ itemKind: k })} className="!h-9 !text-[14px] !px-3.5">
                      {k}
                    </Chip>
                  ))}
                </div>
                <TextInput className="mt-3" value={f.itemNote} onChange={(e) => setDraft({ itemNote: e.target.value })} placeholder={f.service === 'sold' ? 'e.g. Denim jacket, size M' : 'Add a short description'} />
              </>
            )}

            <div className="mt-5 text-[15px] font-semibold">How big is it?</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {SIZES.map((s) => (
                <CardChoice key={s.id} active={f.size === s.id} title={s.label} sub={`${s.hint} · up to ${s.kg < 1 ? `${s.kg * 1000} g` : `${s.kg} kg`}`} onClick={() => setDraft({ size: s.id })} />
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3">
              {photo ? (
                <div className="relative w-20 h-20 rounded-xl overflow-hidden">
                  <img src={photo} alt="Your item" className="w-full h-full object-cover" />
                  <button type="button" aria-label="Remove photo" onClick={() => setPhoto(undefined)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white grid place-items-center">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} className="w-20 h-20 rounded-xl border-2 border-dashed border-[#d0d0d0] grid place-items-center text-[#6b6b6b]">
                  <Camera size={24} />
                </button>
              )}
              <div className="flex-1 text-[14px] text-[#5e5e5e] leading-snug">{photo ? 'Looks good. The courier will see this.' : 'Add a photo so the courier picks up the right thing.'}</div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
            </div>

            <div className="mt-2 divide-y divide-[#f0f0f0]">
              <ToggleRow title="Fragile" sub="We’ll pick a smooth option and handle it gently" checked={f.fragile} onChange={(fragile) => setDraft({ fragile })} />
              <div className="flex items-center gap-4 py-3">
                <div className="flex-1">
                  <div className="text-[16px] font-medium">What’s it worth?</div>
                  <div className="text-[13px] text-[#6b6b6b]">Covered up to £250 at no extra cost</div>
                </div>
                <div className="flex items-center gap-1 h-11 w-28 rounded-xl bg-[#f3f3f3] px-3">
                  <span className="text-[16px] text-[#6b6b6b]">£</span>
                  <input inputMode="decimal" value={f.value ?? ''} onChange={(e) => setDraft({ value: e.target.value ? Math.max(0, Number(e.target.value) || 0) : undefined })} placeholder="0" className="w-full bg-transparent outline-none text-[16px]" />
                </div>
              </div>
            </div>
          </Section>
        )}

        {f.service === 'sold' && (
          <>
            <Divider />
            <Section title="Who pays for delivery?">
              <div className="space-y-2">
                <CardChoice active={!f.buyerPays} title="I’ll pay" sub="Add it to your price, or you’ve already charged them" onClick={() => setDraft({ buyerPays: false })} />
                <CardChoice active={f.buyerPays} title="My buyer pays" sub="We text them a link to pay. Nothing moves until they do." onClick={() => setDraft({ buyerPays: true })} />
              </div>
              <TextInput className="mt-3" value={f.buyerName} onChange={(e) => setDraft({ buyerName: e.target.value })} placeholder="Buyer’s first name (optional)" />
              <p className="text-[13px] text-[#6b6b6b] mt-2">They get a live tracking link by text. No app needed.</p>
            </Section>
          </>
        )}

        {f.service === 'collect' && (
          <>
            <Divider />
            <Section title="Before we collect">
              <ToggleRow title="Check it first" sub="+£1.00 · the courier sends photos from the seller’s door, and only collects once you say yes" checked={f.checkFirst} onChange={(checkFirst) => setDraft({ checkFirst })} />
              <TextInput value={f.sellerName} onChange={(e) => setDraft({ sellerName: e.target.value })} placeholder="Seller’s name (optional)" />
            </Section>
          </>
        )}

        {f.service === 'errand' && (
          <>
            <Divider />
            <Section title="Need us to buy it?">
              <ToggleRow title="Buy it for me" sub="+£1.50 · we pay at the till and you pay us back from the receipt" checked={f.buyForMe} onChange={(buyForMe) => setDraft({ buyForMe })} />
              {f.buyForMe && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-[16px] font-medium">Spend up to</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[17px] font-semibold tabular-nums">£{f.budget}</span>
                    <Stepper value={f.budget / 5} min={1} max={40} onChange={(v) => setDraft({ budget: v * 5 })} />
                  </div>
                </div>
              )}
            </Section>
          </>
        )}

        {f.service === 'move' && (
          <>
            <Divider />
            <Section title="What are you moving?">
              <div className="divide-y divide-[#f0f0f0]">
                {MOVE_ITEMS.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-2.5">
                    <span className="text-[16px]">{m.label}</span>
                    <Stepper value={f.moveItems[m.id] ?? 0} max={m.id === 'boxes' ? 30 : 4} onChange={(v) => setDraft({ moveItems: { ...f.moveItems, [m.id]: v } })} />
                  </div>
                ))}
              </div>
            </Section>
            <Divider />
            <Section title="Do you need a hand?">
              <div className="space-y-2">
                {([0, 1, 2] as const).map((h) => (
                  <CardChoice key={h} active={f.helpers === h} title={h === 0 ? 'Just the van' : `${h} helper${h > 1 ? 's' : ''}`} sub={h === 0 ? 'You load, the driver helps with light things' : h === 1 ? '+£24 · for a few big things' : '+£48 · they do all the lifting'} onClick={() => setDraft({ helpers: h })} />
                ))}
              </div>
              <div className="flex items-center justify-between pt-4">
                <div>
                  <div className="text-[16px] font-medium">Stairs without a lift</div>
                  <div className="text-[13px] text-[#6b6b6b]">Floors at either end · £6 each</div>
                </div>
                <Stepper value={f.stairs} max={6} onChange={(stairs) => setDraft({ stairs })} />
              </div>
            </Section>
          </>
        )}

        {f.service === 'ride' && (
          <>
            <Divider />
            <Section title="Who’s going?">
              <div className="flex items-center justify-between">
                <span className="text-[16px]">Passengers</span>
                <Stepper value={f.passengers} min={1} max={6} onChange={(passengers) => setDraft({ passengers })} />
              </div>
            </Section>
          </>
        )}

        {f.service === 'aerial' && (
          <>
            <Divider />
            <Section title="What’s the shoot for?">
              <div className="space-y-2">
                {AERIAL_PURPOSES.map((p) => (
                  <CardChoice key={p.id} active={f.aerialPurpose === p.id} title={p.label} sub={p.hint} onClick={() => setDraft({ aerialPurpose: p.id })} />
                ))}
              </div>
              <div className="mt-5 text-[15px] font-semibold">How long?</div>
              <div className="mt-2 flex gap-2">
                {([15, 30, 60] as const).map((m) => (
                  <Chip key={m} active={f.aerialMinutes === m} onClick={() => setDraft({ aerialMinutes: m })}>
                    {m} min
                  </Chip>
                ))}
              </div>
              <p className="text-[13px] text-[#6b6b6b] mt-3 leading-snug">An approved remote pilot flies it. We check no-fly zones and the wind before you pay, and they’ll ask before filming anyone.</p>
            </Section>
          </>
        )}

        <Divider />
        <Section title="When?">
          <WhenPicker f={f} set={setDraft} ride={f.service === 'ride'} />
        </Section>
      </div>

      <div className="absolute bottom-0 inset-x-0 bg-white px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-20">
        {missing && <div className="text-[13px] text-[#6b6b6b] text-center mb-2">{missing}</div>}
        <Btn className="w-full" disabled={!!missing} onClick={() => nav(`/new/${service}/choose`)}>
          See prices
        </Btn>
      </div>

      {picker && <PlacePicker title={picker === 'from' ? info.fromLabel || 'Pickup' : info.toLabel} onPick={onPick} onClose={() => setPicker(null)} />}
    </div>
  );
}
