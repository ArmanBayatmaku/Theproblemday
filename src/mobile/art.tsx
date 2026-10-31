// Flat illustrations for vehicles and services (Uber-style product pictures, drawn in SVG).
import type { Mode, ServiceId } from './types';

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

export function ModeArt({ mode, className }: P & { mode: Mode }) {
  switch (mode) {
    case 'drone':
      return <DroneArt className={className} />;
    case 'aerial':
    case 'aerial_pro':
      return <DroneArt camera className={className} />;
    case 'waymo':
    case 'ride_waymo':
      return <CarArt body="#f4f4f4" sensor className={className} />;
    case 'ride_xl':
      return <CarArt body="#3c4a5c" tall className={className} />;
    case 'bike':
      return <BikeArt className={className} />;
    case 'van':
      return <VanArt className={className} />;
    default:
      return <CarArt className={className} />;
  }
}

// ---------- service icons ----------
function Parcel({ x = 0, y = 0, s = 1 }: { x?: number; y?: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M24 6 L41 14 V34 L24 42 L7 34 V14 Z" fill="#d9a066" />
      <path d="M24 6 L41 14 L24 22 L7 14 Z" fill="#ebbd86" />
      <path d="M24 22 V42" stroke="#b97f45" strokeWidth="1.5" />
      <path d="M15.5 10 L32.5 18 V25" stroke="#f6e3c8" strokeWidth="3" fill="none" />
    </g>
  );
}

export function ServiceArt({ id, className }: P & { id: ServiceId }) {
  switch (id) {
    case 'send':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden>
          <Parcel />
        </svg>
      );
    case 'sold':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden>
          <path d="M8 22 L22 8 H38 Q40 8 40 10 V26 L26 40 Q24.5 41.5 23 40 L8 25 Q6.5 23.5 8 22 Z" fill="#1f9d5b" />
          <circle cx="33" cy="15" r="3.2" fill="#fff" />
          <text x="22.5" y="30.5" fontSize="15" fontWeight="800" fill="#fff" textAnchor="middle" fontFamily="Inter, sans-serif">
            £
          </text>
        </svg>
      );
    case 'collect':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden>
          <Parcel x={2} y={6} s={0.82} />
          <circle cx="36" cy="13" r="9" fill="#276ef1" />
          <path d="M36 8.5 V17 M32.2 13.5 L36 17.3 L39.8 13.5" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'return':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden>
          <Parcel x={2} y={6} s={0.82} />
          <circle cx="36" cy="13" r="9" fill="#f08a24" />
          <path d="M40 13 A4 4 0 1 1 36 9 H38.5 M36.8 6.6 L39 9 L36.8 11.4" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'errand':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden>
          <path d="M10 16 H38 L35.5 41 Q35.3 43 33 43 H15 Q12.7 43 12.5 41 Z" fill="#f2994a" />
          <path d="M17 18 V13 Q17 6 24 6 Q31 6 31 13 V18" stroke="#c96f22" strokeWidth="2.6" fill="none" strokeLinecap="round" />
          <circle cx="17" cy="18.5" r="1.6" fill="#c96f22" />
          <circle cx="31" cy="18.5" r="1.6" fill="#c96f22" />
        </svg>
      );
    case 'move':
      return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden>
          <rect x="9" y="12" width="30" height="15" rx="4" fill="#6c63ff" />
          <rect x="4.5" y="20" width="9" height="16" rx="4" fill="#5850e6" />
          <rect x="34.5" y="20" width="9" height="16" rx="4" fill="#5850e6" />
          <rect x="12" y="24" width="24" height="10" rx="3" fill="#8a83ff" />
          <rect x="9" y="36" width="3" height="5" rx="1" fill="#333" />
          <rect x="36" y="36" width="3" height="5" rx="1" fill="#333" />
        </svg>
      );
    case 'ride':
      return <CarArt body="#f4f4f4" sensor className={className} />;
    case 'aerial':
      return <DroneArt camera className={className} />;
  }
}

export function HiveMark({ className }: P) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M16 2.5 28 9.5v13L16 29.5 4 22.5v-13z" fill="#000" />
      <path d="M16 10.5 21 13.4v5.2L16 21.5l-5-2.9v-5.2z" fill="#fff" />
    </svg>
  );
}

/** Small top-down vehicle icons for map markers (SVG strings). */
export function markerSvg(mode: Mode | 'nearby_drone' | 'nearby_car' | 'nearby_waymo' | 'nearby_bike' | 'nearby_van'): string {
  const m = mode.replace('nearby_', '');
  if (m === 'drone' || m === 'aerial' || m === 'aerial_pro')
    return `<svg viewBox="0 0 24 24" width="100%" height="100%"><g stroke="#111" stroke-width="1.7"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></g><g fill="#fff" stroke="#111" stroke-width="1.3"><circle cx="5.5" cy="5.5" r="3.3"/><circle cx="18.5" cy="5.5" r="3.3"/><circle cx="5.5" cy="18.5" r="3.3"/><circle cx="18.5" cy="18.5" r="3.3"/></g><rect x="9" y="9" width="6" height="6" rx="1.8" fill="#111"/></svg>`;
  if (m === 'bike') return `<svg viewBox="0 0 24 24" width="100%" height="100%"><rect x="10.6" y="4" width="2.8" height="17" rx="1.4" fill="#111"/><rect x="7.5" y="2.5" width="9" height="6.5" rx="1.6" fill="#1f8f55"/><rect x="8" y="13" width="8" height="1.6" rx=".8" fill="#111"/></svg>`;
  if (m === 'van') return `<svg viewBox="0 0 24 24" width="100%" height="100%"><rect x="6.2" y="1.5" width="11.6" height="21" rx="2.4" fill="#f7f7f7" stroke="#333" stroke-width="1.1"/><rect x="7.6" y="3" width="8.8" height="3.6" rx="1" fill="#536579"/><rect x="7.6" y="9" width="8.8" height="11.5" rx=".8" fill="#e6e6e6"/></svg>`;
  if (m === 'waymo' || m === 'ride_waymo')
    return `<svg viewBox="0 0 24 24" width="100%" height="100%"><rect x="6.5" y="2" width="11" height="20" rx="3.8" fill="#fbfbfb" stroke="#333" stroke-width="1.1"/><rect x="8" y="5.5" width="8" height="4" rx="1.2" fill="#536579"/><rect x="8" y="15" width="8" height="3" rx="1" fill="#536579"/><circle cx="12" cy="12.3" r="1.7" fill="#333"/></svg>`;
  return `<svg viewBox="0 0 24 24" width="100%" height="100%"><rect x="6.5" y="2" width="11" height="20" rx="3.8" fill="#111"/><rect x="8" y="5.5" width="8" height="4" rx="1.2" fill="#7b8fa3"/><rect x="8" y="15" width="8" height="3" rx="1" fill="#7b8fa3"/></svg>`;
}
