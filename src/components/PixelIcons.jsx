/**
 * Digital Pompeii — Illustrated Icon Library
 * SVG path-based icons replacing the old pixel art grid.
 * ps = size multiplier (ps * 8 = rendered px size).
 * Drop-in replacement — same export names and props.
 */

// ── TOMBSTONE ────────────────────────────────────────────────────────────────

export function PixelTombstone({ ps = 4, className = "", style = {} }) {
  const s = ps * 8;
  return (
    <svg width={s} height={s * 1.2} viewBox="0 0 40 48" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      {/* stone body */}
      <path d="M7 20 C7 8 33 8 33 20 L33 38 Q33 40 31 40 L9 40 Q7 40 7 38 Z"
        fill="#2a2438" stroke="#443858" strokeWidth="1.2" />
      {/* stone face highlight */}
      <path d="M10 20 C10 11 30 11 30 20 L30 37 L10 37 Z"
        fill="#322d42" />
      {/* cross */}
      <line x1="20" y1="15" x2="20" y2="32" stroke="#c4882a" strokeWidth="2" strokeLinecap="round" />
      <line x1="14" y1="21" x2="26" y2="21" stroke="#c4882a" strokeWidth="2" strokeLinecap="round" />
      {/* base slab */}
      <rect x="5" y="39" width="30" height="4" rx="1.5"
        fill="#1e1828" stroke="#443858" strokeWidth="1" />
      {/* grass */}
      <path d="M5 43 Q7 40 9 43 Q11 40 13 43 Q15 40 17 43 Q19 40 21 43 Q23 40 25 43 Q27 40 29 43 Q31 40 33 43 Q35 40 37 43"
        fill="none" stroke="#354825" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

// ── SKULL ────────────────────────────────────────────────────────────────────

export function PixelSkull({ ps = 4, className = "", style = {} }) {
  const s = ps * 8;
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      {/* cranium */}
      <path d="M8 22 C8 10 32 10 32 22 C32 29 28 33 20 33 C12 33 8 29 8 22 Z"
        fill="#dccfa8" stroke="#c4b898" strokeWidth="1" />
      {/* cranium shading */}
      <path d="M11 21 C11 13 29 13 29 21 C29 27 26 30 20 30"
        fill="none" stroke="#e8ddc0" strokeWidth="1.5" strokeLinecap="round" />
      {/* left eye socket */}
      <ellipse cx="15" cy="22" rx="4" ry="4.5" fill="#1a1428" />
      <ellipse cx="14.5" cy="21" rx="1.2" ry="1" fill="#2e2840" />
      {/* right eye socket */}
      <ellipse cx="25" cy="22" rx="4" ry="4.5" fill="#1a1428" />
      <ellipse cx="24.5" cy="21" rx="1.2" ry="1" fill="#2e2840" />
      {/* nasal cavity */}
      <path d="M18.5 27 Q20 25 21.5 27 L21 29 Q20 30 19 29 Z" fill="#1a1428" />
      {/* jaw teeth */}
      <rect x="13" y="32" width="3.5" height="4" rx="1" fill="#dccfa8" stroke="#c4b898" strokeWidth="0.7" />
      <rect x="18" y="32" width="4" height="4.5" rx="1" fill="#dccfa8" stroke="#c4b898" strokeWidth="0.7" />
      <rect x="23.5" y="32" width="3.5" height="4" rx="1" fill="#dccfa8" stroke="#c4b898" strokeWidth="0.7" />
    </svg>
  );
}

// ── SCALPEL ──────────────────────────────────────────────────────────────────

export function PixelScalpel({ ps = 4, className = "", style = {} }) {
  const s = ps * 8;
  return (
    <svg width={s * 2.2} height={s * 0.7} viewBox="0 0 88 28" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      {/* handle */}
      <rect x="2" y="11" width="48" height="6" rx="3"
        fill="#4a3220" stroke="#6a4e36" strokeWidth="1" />
      {/* handle grip lines */}
      <line x1="12" y1="12" x2="12" y2="16" stroke="#6a4e36" strokeWidth="1" strokeLinecap="round" />
      <line x1="18" y1="12" x2="18" y2="16" stroke="#6a4e36" strokeWidth="1" strokeLinecap="round" />
      <line x1="24" y1="12" x2="24" y2="16" stroke="#6a4e36" strokeWidth="1" strokeLinecap="round" />
      <line x1="30" y1="12" x2="30" y2="16" stroke="#6a4e36" strokeWidth="1" strokeLinecap="round" />
      {/* blade body */}
      <path d="M50 11 L78 11 L86 14 L78 17 L50 17 Z"
        fill="#c8c8d8" stroke="#9898b0" strokeWidth="0.8" />
      {/* blade edge highlight */}
      <path d="M52 12.5 L76 12.5 L83 14" stroke="#e8e8f0" strokeWidth="1" strokeLinecap="round" />
      {/* blade tip */}
      <path d="M78 11 L86 14 L78 17" fill="#a0a0b8" />
      {/* collar */}
      <rect x="47" y="9" width="5" height="10" rx="1" fill="#585870" stroke="#7070a0" strokeWidth="0.8" />
    </svg>
  );
}

// ── GHOST ────────────────────────────────────────────────────────────────────

export function PixelGhost({ ps = 4, className = "", style = {} }) {
  const s = ps * 8;
  return (
    <svg width={s} height={s * 1.1} viewBox="0 0 40 44" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      {/* body glow */}
      <path d="M8 22 C8 10 32 10 32 22 L32 36 Q28 32 24 36 Q20 40 16 36 Q12 32 8 36 Z"
        fill="#98b8d0" opacity="0.25" />
      {/* main body */}
      <path d="M10 22 C10 12 30 12 30 22 L30 35 Q27 31 24 35 Q21 39 18 35 Q15 31 12 35 Q10 33 10 30 Z"
        fill="#bcd8e8" stroke="#7090b0" strokeWidth="1" />
      {/* body highlight */}
      <path d="M14 20 C14 14 26 14 26 20" fill="none" stroke="#d8eef8" strokeWidth="1.5" strokeLinecap="round" />
      {/* left eye */}
      <ellipse cx="16" cy="22" rx="3" ry="3.5" fill="#141020" />
      <ellipse cx="15.2" cy="21" rx="1" ry="0.9" fill="#2a3060" />
      {/* right eye */}
      <ellipse cx="24" cy="22" rx="3" ry="3.5" fill="#141020" />
      <ellipse cx="23.2" cy="21" rx="1" ry="0.9" fill="#2a3060" />
      {/* mouth — slight smile */}
      <path d="M17 27 Q20 30 23 27" fill="none" stroke="#141020" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ── COFFIN ───────────────────────────────────────────────────────────────────

export function PixelCoffin({ ps = 4, className = "", style = {} }) {
  const s = ps * 8;
  return (
    <svg width={s * 0.8} height={s * 1.4} viewBox="0 0 32 56" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      {/* coffin hexagonal shape */}
      <path d="M10 2 L22 2 L30 12 L30 44 Q30 46 28 46 L4 46 Q2 46 2 44 L2 12 Z"
        fill="#2e2438" stroke="#524868" strokeWidth="1.2" />
      {/* inner panel */}
      <path d="M12 5 L20 5 L27 13 L27 42 L5 42 L5 13 Z"
        fill="#221c30" />
      {/* gold cross */}
      <line x1="16" y1="14" x2="16" y2="36" stroke="#c4882a" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="9" y1="22" x2="23" y2="22" stroke="#c4882a" strokeWidth="2.5" strokeLinecap="round" />
      {/* hinges */}
      <rect x="2" y="16" width="4" height="3" rx="1" fill="#e8a830" opacity="0.7" />
      <rect x="2" y="30" width="4" height="3" rx="1" fill="#e8a830" opacity="0.7" />
      <rect x="26" y="16" width="4" height="3" rx="1" fill="#e8a830" opacity="0.7" />
      <rect x="26" y="30" width="4" height="3" rx="1" fill="#e8a830" opacity="0.7" />
    </svg>
  );
}

// ── MAGNIFYING GLASS ─────────────────────────────────────────────────────────

export function PixelMagnify({ ps = 4, className = "", style = {} }) {
  const s = ps * 8;
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      {/* lens outer ring */}
      <circle cx="17" cy="17" r="12" fill="#1e3048" stroke="#4878a0" strokeWidth="2" />
      {/* lens glass */}
      <circle cx="17" cy="17" r="9" fill="#243c58" opacity="0.8" />
      {/* lens highlight */}
      <path d="M12 12 Q17 10 21 13" fill="none" stroke="#70a8c8" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <circle cx="13" cy="13" r="2" fill="#a8d0e0" opacity="0.2" />
      {/* handle */}
      <line x1="26" y1="26" x2="36" y2="36" stroke="#7a5840" strokeWidth="4" strokeLinecap="round" />
      <line x1="26" y1="26" x2="36" y2="36" stroke="#a07860" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── ZOMBIE ───────────────────────────────────────────────────────────────────

export function PixelZombie({ ps = 4, className = "", style = {} }) {
  const s = ps * 8;
  return (
    <svg width={s * 0.9} height={s * 1.6} viewBox="0 0 36 64" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      {/* head */}
      <rect x="10" y="2" width="16" height="16" rx="5"
        fill="#c4b080" stroke="#a09060" strokeWidth="1" />
      {/* face shading */}
      <path d="M12 6 Q18 4 24 6" fill="none" stroke="#d8c898" strokeWidth="1" strokeLinecap="round" />
      {/* eyes — hollow x style */}
      <line x1="13" y1="10" x2="16" y2="13" stroke="#2a2a1a" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="10" x2="13" y2="13" stroke="#2a2a1a" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20" y1="10" x2="23" y2="13" stroke="#2a2a1a" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="23" y1="10" x2="20" y2="13" stroke="#2a2a1a" strokeWidth="1.5" strokeLinecap="round" />
      {/* mouth */}
      <path d="M14 15 L17 14 L19 15 L21 14 L23 15" fill="none" stroke="#2a2a1a" strokeWidth="1" strokeLinecap="round" />
      {/* blood drip */}
      <path d="M19 16 Q19.5 19 19 21" fill="none" stroke="#c03030" strokeWidth="1.2" strokeLinecap="round" />
      {/* neck */}
      <rect x="15" y="17" width="6" height="4" fill="#b8a070" />
      {/* body / torn shirt */}
      <path d="M8 21 L28 21 L26 44 L10 44 Z" fill="#3a5830" stroke="#4e7840" strokeWidth="1" />
      {/* shirt tear lines */}
      <path d="M15 26 L17 32 M19 24 L21 31" fill="none" stroke="#2e4826" strokeWidth="1" strokeLinecap="round" />
      {/* outstretched arm */}
      <path d="M28 24 Q34 22 38 20" fill="none" stroke="#b8a070" strokeWidth="5" strokeLinecap="round" />
      <path d="M28 24 Q34 22 38 20" fill="none" stroke="#c4b080" strokeWidth="3" strokeLinecap="round" />
      {/* fingers */}
      <path d="M37 19 L40 17 M38 20 L41 19 M37 21 L40 22" fill="none" stroke="#c4b080" strokeWidth="1.5" strokeLinecap="round" />
      {/* left arm down */}
      <path d="M8 24 Q4 30 5 36" fill="none" stroke="#b8a070" strokeWidth="5" strokeLinecap="round" />
      {/* legs */}
      <rect x="11" y="43" width="6" height="14" rx="2" fill="#2a3818" stroke="#3a4825" strokeWidth="1" />
      <rect x="19" y="43" width="6" height="14" rx="2" fill="#2a3818" stroke="#3a4825" strokeWidth="1" />
      {/* shoes */}
      <rect x="10" y="54" width="8" height="4" rx="2" fill="#1a1210" />
      <rect x="18" y="54" width="8" height="4" rx="2" fill="#1a1210" />
    </svg>
  );
}

// ── CORONER ──────────────────────────────────────────────────────────────────

export function PixelCoroner({ ps = 4, className = "", style = {} }) {
  const s = ps * 8;
  return (
    <svg width={s * 0.9} height={s * 1.6} viewBox="0 0 36 64" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      {/* head */}
      <rect x="11" y="2" width="14" height="15" rx="5"
        fill="#d4a880" stroke="#b88c60" strokeWidth="1" />
      {/* hair */}
      <path d="M11 7 Q18 2 25 7" fill="#2a1a0a" />
      {/* eyes */}
      <circle cx="15" cy="11" r="1.5" fill="#1a1010" />
      <circle cx="21" cy="11" r="1.5" fill="#1a1010" />
      <circle cx="15.5" cy="10.5" r="0.5" fill="#fff" opacity="0.6" />
      <circle cx="21.5" cy="10.5" r="0.5" fill="#fff" opacity="0.6" />
      {/* mouth */}
      <path d="M15 14 Q18 16 21 14" fill="none" stroke="#8a5030" strokeWidth="1" strokeLinecap="round" />
      {/* neck */}
      <rect x="15" y="16" width="6" height="4" fill="#c49870" />
      {/* white coat */}
      <path d="M6 20 L30 20 L28 48 L8 48 Z" fill="#e8e0d0" stroke="#c8c0b0" strokeWidth="1" />
      {/* coat lapels */}
      <path d="M18 20 L14 28 L18 26 Z" fill="#d0c8b8" />
      <path d="M18 20 L22 28 L18 26 Z" fill="#d0c8b8" />
      {/* shirt under */}
      <rect x="15" y="20" width="6" height="8" fill="#f0f0f8" />
      {/* pocket */}
      <rect x="9" y="28" width="6" height="7" rx="1" fill="none" stroke="#c8c0b0" strokeWidth="0.8" />
      {/* pen in pocket */}
      <line x1="11" y1="27" x2="11" y2="32" stroke="#3060a0" strokeWidth="1.2" strokeLinecap="round" />
      {/* left arm holding magnifier */}
      <path d="M6 22 Q2 30 4 38" fill="none" stroke="#d4a880" strokeWidth="5" strokeLinecap="round" />
      {/* magnifying glass in hand */}
      <circle cx="5" cy="40" r="4" fill="none" stroke="#4878a0" strokeWidth="1.5" />
      <circle cx="5" cy="40" r="2.5" fill="#243c58" opacity="0.6" />
      <line x1="8" y1="43" x2="10" y2="46" stroke="#7a5840" strokeWidth="2" strokeLinecap="round" />
      {/* right arm */}
      <path d="M30 22 Q34 28 33 36" fill="none" stroke="#d4a880" strokeWidth="5" strokeLinecap="round" />
      {/* clipboard */}
      <rect x="29" y="33" width="8" height="10" rx="1" fill="#c8b890" stroke="#a09060" strokeWidth="0.8" />
      <line x1="31" y1="36" x2="35" y2="36" stroke="#6a5030" strokeWidth="0.8" />
      <line x1="31" y1="38" x2="35" y2="38" stroke="#6a5030" strokeWidth="0.8" />
      <line x1="31" y1="40" x2="33" y2="40" stroke="#6a5030" strokeWidth="0.8" />
      {/* legs */}
      <rect x="11" y="47" width="6" height="13" rx="2" fill="#585070" stroke="#443858" strokeWidth="1" />
      <rect x="19" y="47" width="6" height="13" rx="2" fill="#585070" stroke="#443858" strokeWidth="1" />
      {/* shoes */}
      <rect x="10" y="57" width="8" height="4" rx="2" fill="#181018" />
      <rect x="18" y="57" width="8" height="4" rx="2" fill="#181018" />
    </svg>
  );
}

// ── WARNING ───────────────────────────────────────────────────────────────────

export function PixelWarning({ ps = 4, className = "", style = {} }) {
  const s = ps * 8;
  return (
    <svg width={s} height={s} viewBox="0 0 40 40" fill="none"
      xmlns="http://www.w3.org/2000/svg" className={className} style={style}>
      {/* triangle outer glow */}
      <path d="M20 4 L37 34 Q37 37 34 37 L6 37 Q3 37 3 34 Z"
        fill="#f0b020" opacity="0.15" />
      {/* triangle body */}
      <path d="M20 7 L35 33 Q35 35.5 32.5 35.5 L7.5 35.5 Q5 35.5 5 33 Z"
        fill="#1a1408" stroke="#f0b020" strokeWidth="1.5" />
      {/* inner fill */}
      <path d="M20 11 L32 31 L8 31 Z" fill="#f8d040" opacity="0.08" />
      {/* exclamation stem */}
      <rect x="18.5" y="17" width="3" height="9" rx="1.5"
        fill="#f8d040" />
      {/* exclamation dot */}
      <circle cx="20" cy="30" r="1.8" fill="#f8d040" />
    </svg>
  );
}
