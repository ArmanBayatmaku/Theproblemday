import { useMemo, useState } from 'react';
import { ArrowLeft, Briefcase, Clock3, House, LoaderCircle, MapPin, Navigation, Search, X } from 'lucide-react';
import type { Place } from '@shared/types';
import { LONDON_PLACES } from '@shared/data/london';
import { geocode } from '@/integrations/geocode';
import { useApp } from './store';

const POSTCODE = /^[a-z]{1,2}\d[a-z\d]?\s*(\d[a-z]{2})?$/i;

function Row({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-4 px-5 py-3 text-left active:bg-[#f6f6f6]">
      <span className="w-10 h-10 rounded-full bg-[#eeeeee] grid place-items-center shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 border-b border-[#eeeeee] pb-3 -mb-3">
        <span className="block text-[16px] font-medium truncate">{title}</span>
        {sub && <span className="block text-[14px] text-[#6b6b6b] truncate">{sub}</span>}
      </span>
    </button>
  );
}

/** Full-screen place search, Uber style: saved places, recents, London areas and UK postcodes. */
export function PlacePicker({ title, onPick, onClose }: { title: string; onPick: (p: Place) => void; onClose: () => void }) {
  const home = useApp((s) => s.home);
  const work = useApp((s) => s.work);
  const recents = useApp((s) => s.recents);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return LONDON_PLACES.filter((p) => p.name.toLowerCase().includes(t) || p.aliases?.some((a) => a.includes(t))).slice(0, 8);
  }, [q]);
  const looksLikePostcode = POSTCODE.test(q.trim());

  const lookup = async () => {
    const text = q.trim();
    if (!text) return;
    if (results[0] && !looksLikePostcode) return onPick({ name: results[0].name, position: results[0].position });
    setBusy(true);
    setErr('');
    const p = await geocode(text, []);
    setBusy(false);
    if (p) onPick({ ...p, name: p.name.toUpperCase() === text.toUpperCase() ? text.toUpperCase() : p.name });
    else setErr(`We couldn’t find “${text}”. Try a full postcode like NW1 8QL.`);
  };

  return (
    <div className="absolute inset-0 z-50 bg-white flex flex-col slide-up">
      <div className="px-3 pt-2 pb-3 shadow-[0_4px_12px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Back" onClick={onClose} className="w-11 h-11 grid place-items-center rounded-full active:bg-[#f3f3f3]">
            <ArrowLeft size={24} />
          </button>
          <div className="text-[17px] font-semibold">{title}</div>
        </div>
        <form
          className="mx-2 mt-1 flex items-center gap-3 h-12 rounded-xl bg-[#f3f3f3] px-4"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup();
          }}
        >
          <Search size={18} className="text-[#6b6b6b] shrink-0" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search an area or postcode" className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-[#8f8f8f]" />
          {busy ? <LoaderCircle size={18} className="animate-spin text-[#6b6b6b]" /> : q && (
            <button type="button" aria-label="Clear" onClick={() => setQ('')}>
              <X size={18} className="text-[#6b6b6b]" />
            </button>
          )}
        </form>
        {err && <div className="mx-3 mt-2 text-[13px] text-[#c13515]">{err}</div>}
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {!q.trim() ? (
          <>
            <Row icon={<Navigation size={18} />} title="Current location" sub={`${home.address ?? 'Near you'} (demo)`} onClick={() => onPick({ ...home, name: 'Current location' })} />
            <Row icon={<House size={18} />} title="Home" sub={home.address} onClick={() => onPick(home)} />
            <Row icon={<Briefcase size={18} />} title="Work" sub={work.address} onClick={() => onPick(work)} />
            {recents.length > 0 && <div className="px-5 pt-5 pb-1 text-[13px] font-semibold text-[#6b6b6b]">Recent</div>}
            {recents.map((r) => (
              <Row key={r.name} icon={<Clock3 size={18} />} title={r.name} sub={r.address ?? 'London'} onClick={() => onPick(r)} />
            ))}
          </>
        ) : (
          <>
            {looksLikePostcode && <Row icon={<Search size={18} />} title={`Find ${q.trim().toUpperCase()}`} sub="Look up this postcode" onClick={() => void lookup()} />}
            {results.map((p) => (
              <Row key={p.name} icon={<MapPin size={18} />} title={p.name} sub="London" onClick={() => onPick({ name: p.name, position: p.position })} />
            ))}
            {!results.length && !looksLikePostcode && <div className="px-5 py-6 text-[15px] text-[#6b6b6b]">No matches yet. Try an area (Hackney, Brixton) or a postcode.</div>}
          </>
        )}
      </div>
    </div>
  );
}
