// Flat illustrations (Uber-style product pictures) and map icons, drawn in SVG.
import type { CompareId } from '@/lib/quotes';

type P = { className?: string };

export function DroneArt({ className, camera }: P & { camera?: boolean }) {
  return (
    <svg viewBox="0 0 72 48" className={className} aria-hidden>
      <ellipse cx="14" cy="10" rx="12" ry="2.4" fill="#cfcfcf" />
      <ellipse cx="58" cy="10" rx="12" ry="2.4" fill="#cfcfcf" />
      <rect x="12.8" y="10" width="2.4" height="6" rx="1" fill="#2a2a2a" />
      <rect x="56.8" y="10" width="2.4" height="6" rx="1" fill="#2a2a2a" />
      <rect x="10" y="15" width="52" height="4" rx="2" fill="#2a2a2a" />
      <rect x="26" y="11.5" width="20" height="11.5" rx="5.5" fill="#111" />
      <circle cx="40.5" cy="17.2" r="1.8" fill="#7fd45a" />
      {camera ? (
        <>
          <rect x="32.5" y="23" width="7" height="3" fill="#2a2a2a" />
          <circle cx="36" cy="30.5" r="5.5" fill="#1b1b1b" />
          <circle cx="36" cy="30.5" r="2.4" fill="#4a86c5" />
          <circle cx="37" cy="29.5" r="0.8" fill="#cfe3f7" />
        </>
      ) : (
        <>
          <line x1="36" y1="23" x2="36" y2="31" stroke="#666" strokeWidth="1.2" />
          <rect x="27" y="31" width="18" height="13" rx="2" fill="#d6a46a" />
          <rect x="35" y="31" width="2" height="13" fill="#b9864b" />
        </>
      )}
    </svg>
  );
}

export function CarArt({ className, body = '#2b2b2b', sensor, tall }: P & { body?: string; sensor?: boolean; tall?: boolean }) {
  const light = body.toLowerCase() > '#d';
  return (
    <svg viewBox="0 0 72 40" className={className} aria-hidden>
      <ellipse cx="36" cy="36" rx="30" ry="2.4" fill="#000" opacity=".08" />
      {tall ? (
        <>
          <path d="M5 31 V19 Q5 15 9 14 L19 12.5 L26 6.5 Q28 5.5 31 5.5 H55 Q58.5 5.5 60.5 8.5 L64.5 14.5 Q67.5 15.5 67.5 19.5 V31 Z" fill={body} stroke={light ? '#cfcfcf' : 'none'} strokeWidth="0.8" />
          <path d="M21.5 13 L27.5 7.8 Q29 7 31.5 7 H42 V13 Z" fill="#202a35" />
          <path d="M44.5 7 H54.5 Q57.3 7 58.7 9.3 L61.6 13 H44.5 Z" fill="#202a35" />
        </>
      ) : (
        <>
          <path d="M5 31 L7 23.5 Q9 19.5 14 18.5 L22 17 L30 10.5 Q32 9.3 35 9.3 H48 Q52 9.3 54.5 11.8 L60 17.3 Q66 18.3 67 22.5 L67 31 Z" fill={body} stroke={light ? '#cfcfcf' : 'none'} strokeWidth="0.8" />
          <path d="M25 17 L31.5 11.6 Q33 10.8 35 10.8 H40.5 V17 Z" fill="#202a35" />
          <path d="M43 10.8 H48 Q51 10.8 53 12.8 L57 17 H43 Z" fill="#202a35" />
        </>
      )}
      {sensor && (
        <>
          <rect x="34" y={tall ? 1.5 : 4.5} width="10" height="5" rx="2" fill="#5d5d5d" />
          <rect x="36.5" y={tall ? -0.5 : 2.3} width="5" height="2.6" rx="1.2" fill="#3a3a3a" />
        </>
      )}
      <rect x="63.5" y="21.5" width="3" height="2" rx="1" fill="#ffd36b" />
      <circle cx="19" cy="31" r="6.5" fill="#111" />
      <circle cx="19" cy="31" r="2.8" fill="#9b9b9b" />
      <circle cx="54" cy="31" r="6.5" fill="#111" />
      <circle cx="54" cy="31" r="2.8" fill="#9b9b9b" />
    </svg>
  );
}

export function BikeArt({ className }: P) {
  return (
    <svg viewBox="0 0 72 44" className={className} aria-hidden>
      <ellipse cx="36" cy="41.5" rx="29" ry="2" fill="#000" opacity=".08" />
      <rect x="4" y="14" width="24" height="14" rx="2.5" fill="#1f8f55" />
      <rect x="4" y="14" width="24" height="3.2" rx="1.6" fill="#177345" />
      <circle cx="15" cy="33" r="7.5" fill="none" stroke="#111" strokeWidth="2.6" />
      <circle cx="57" cy="33" r="7.5" fill="none" stroke="#111" strokeWidth="2.6" />
      <path d="M15 33 H33 L44 20 L57 33 M33 33 L29 20 M44 20 L42.5 14 M39 14 H46.5 M29 20 L27 12 H32" stroke="#111" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function VanArt({ className }: P) {
  return (
    <svg viewBox="0 0 72 40" className={className} aria-hidden>
      <ellipse cx="36" cy="36" rx="31" ry="2.3" fill="#000" opacity=".08" />
      <path d="M4 31 V9 Q4 6 7 6 H44 Q47 6 49 8.5 L56 17 L63 19 Q67 20 67 24 V31 Z" fill="#f5f5f5" stroke="#cfcfcf" strokeWidth="0.8" />
      <path d="M46.5 8.6 L53.6 17 H46.5 Z" fill="#202a35" />
      <rect x="4" y="21" width="40" height="3" fill="#f0a33a" />
      <line x1="44.5" y1="6.5" x2="44.5" y2="31" stroke="#d9d9d9" strokeWidth="0.8" />
      <rect x="63.5" y="21.5" width="3" height="2" rx="1" fill="#ffd36b" />
      <circle cx="17" cy="31" r="6.5" fill="#111" />
      <circle cx="17" cy="31" r="2.8" fill="#9b9b9b" />
      <circle cx="54" cy="31" r="6.5" fill="#111" />
      <circle cx="54" cy="31" r="2.8" fill="#9b9b9b" />
    </svg>
  );
}

/** Relay logo: two chevrons passing it on. */
export function RelayMark({ className }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" fill="#000" />
      <path d="M9.5 9.5 16 16l-6.5 6.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.5 9.5 23 16l-6.5 6.5" fill="none" stroke="#fff" strokeOpacity=".5" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CompareArt({ id, className }: P & { id: CompareId }) {
  switch (id) {
    case 'waymo':
      return <CarArt body="#f4f4f4" sensor className={className} />;
    case 'bike':
      return <BikeArt className={className} />;
    case 'van':
      return <VanArt className={className} />;
    default:
      return <CarArt className={className} />;
  }
}

/** A drone seen from above, in a white disc — the live drone on the map. */
const DRONE_TOP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128"><circle cx="32" cy="32" r="29" fill="#ffffff"/><circle cx="32" cy="32" r="29" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="2"/><g stroke="#111" stroke-width="3.2" stroke-linecap="round"><line x1="20" y1="20" x2="44" y2="44"/><line x1="44" y1="20" x2="20" y2="44"/></g><g fill="#fff" stroke="#111" stroke-width="2.4"><circle cx="19" cy="19" r="6.5"/><circle cx="45" cy="19" r="6.5"/><circle cx="19" cy="45" r="6.5"/><circle cx="45" cy="45" r="6.5"/></g><rect x="26" y="26" width="12" height="12" rx="3.5" fill="#111"/><circle cx="32" cy="32" r="2" fill="#7fd45a"/></svg>`;
export const DRONE_ICON_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DRONE_TOP)}`;

export const SHOP_SVG = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9"/><path d="M3 10 5 4h14l2 6"/><path d="M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M10 20v-5h4v5"/></svg>`;

export const PORT_SVG = `<svg viewBox="0 0 32 32" width="100%" height="100%"><rect x="1.5" y="1.5" width="29" height="29" rx="8.5" fill="#000"/><path d="M9.5 9.5 16 16l-6.5 6.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.5 9.5 23 16l-6.5 6.5" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Planned charging sites (Coming soon): a fuel pump and an EV plug. */
export const FUEL_SVG = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22h12"/><path d="M4 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5"/><path d="M4 9h10"/></svg>`;
export const EV_SVG = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>`;
