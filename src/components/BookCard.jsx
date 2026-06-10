import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── dimensions ────────────────────────────────────────────────────────────────
const SW  = 28;   // spine width (this is what you see on the shelf)
const CW  = 130;  // cover width
const BH  = 210;  // book height
const DEP = 16;   // depth (pages thickness, right edge)

const SEV = {
  critical: { spine: "#3a0808", spineH: "#6a1010", accent: "#ef4444", glow: "rgba(239,68,68,0.25)" },
  high:     { spine: "#2a1206", spineH: "#5a2c0e", accent: "#f97316", glow: "rgba(249,115,22,0.2)"  },
  medium:   { spine: "#1e1604", spineH: "#4a3a0c", accent: "#f59e0b", glow: "rgba(245,158,11,0.18)" },
  low:      { spine: "#0e0e16", spineH: "#222230", accent: "#818cf8", glow: "rgba(129,140,248,0.15)" },
};

const COVER_BG = {
  critical: "linear-gradient(150deg,#1e0808 0%,#120404 50%,#1a0808 100%)",
  high:     "linear-gradient(150deg,#1a0e06 0%,#0e0802 50%,#160c06 100%)",
  medium:   "linear-gradient(150deg,#171208 0%,#0e0c04 50%,#141008 100%)",
  low:      "linear-gradient(150deg,#10101c 0%,#08080e 50%,#0e0e18 100%)",
};

export default function BookCard({ caseData, index, onOpen }) {
  const [state, setState] = useState("shelf"); // shelf | hover | opening
  const s  = SEV[caseData.severity] ?? SEV.low;
  const yr = caseData.death_date?.slice(0, 4) ?? "—";
  const loss = caseData.money_lost_usd != null
    ? "$" + (caseData.money_lost_usd / 1e6).toFixed(0) + "M" : "—";

  const open = () => {
    if (state === "opening") return;
    setState("opening");
    setTimeout(() => onOpen(caseData.id), 820);
  };

  // whole-book Y rotation: spine faces viewer on shelf, cover faces viewer when active
  const rotY = state === "shelf" ? -72 : state === "hover" ? -22 : 0;
  // pull book forward when hovered/opening
  const tz   = state === "shelf" ? 0 : 30;

  return (
    // entrance: books drop into place from above with stagger
    <motion.div
      initial={{ opacity: 0, y: -60, rotateX: -20 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 1.0, delay: 0.2 + index * 0.1, ease: [0.34, 1.56, 0.64, 1] }}
      // perspective origin shifted right so the 3D tilt reads well from front-right view
      style={{ perspective: 600, perspectiveOrigin: "200% 50%", cursor: "pointer" }}
      onMouseEnter={() => state === "shelf" && setState("hover")}
      onMouseLeave={() => state === "hover" && setState("shelf")}
      onClick={open}
    >
      <motion.div
        animate={{ rotateY: rotY, z: tz }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: "relative", transformStyle: "preserve-3d", height: BH }}
      >

        {/* ── SPINE (the face you see on the shelf) ────────────────────── */}
        {/* Spine sits to the LEFT, rotated 90° so it faces the viewer in shelf mode */}
        <div style={{
          position: "absolute",
          top: 0, left: 0,
          width: SW, height: BH,
          transformOrigin: "right center",
          transform: "rotateY(90deg)",           // face perpendicular → visible in shelf view
          background: `linear-gradient(180deg, ${s.spineH} 0%, ${s.spine} 40%, ${s.spineH} 100%)`,
          borderRadius: "3px 0 0 3px",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "space-between",
          padding: "12px 0",
          overflow: "hidden",
          boxShadow: `inset -5px 0 10px rgba(0,0,0,0.5)`,
        }}>
          {/* severity dot at top */}
          <div style={{
            width: 5, height: 5, borderRadius: "50%",
            background: s.accent,
            boxShadow: `0 0 8px ${s.accent}`,
            opacity: 0.8, flexShrink: 0,
          }} />

          {/* vertical title */}
          <span style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: 9,
            letterSpacing: "0.22em",
            color: s.accent,
            fontFamily: "'IBM Plex Mono', monospace",
            textTransform: "uppercase",
            opacity: 0.85,
            maxHeight: "70%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}>
            {caseData.name}
          </span>

          {/* year at bottom */}
          <span style={{
            fontSize: 8, letterSpacing: "0.15em",
            color: `${s.accent}70`,
            fontFamily: "'IBM Plex Mono', monospace",
            flexShrink: 0,
          }}>
            {yr}
          </span>
        </div>

        {/* ── COVER (the face revealed when you open / hover) ───────────── */}
        <div style={{
          position: "absolute",
          top: 0, left: SW,
          width: CW, height: BH,
          background: COVER_BG[caseData.severity] ?? COVER_BG.low,
          border: "1px solid rgba(196,136,42,0.12)",
          borderLeft: "none",
          borderRadius: "0 4px 4px 0",
          overflow: "hidden",
          boxShadow: "4px 0 20px rgba(0,0,0,0.5)",
        }}>
          {/* grain texture */}
          <div style={{
            position: "absolute", inset: 0, opacity: 0.05,
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }} />

          {/* top accent */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, transparent, ${s.accent}60, transparent)`,
          }} />

          {/* cover content */}
          <div style={{
            position: "absolute", inset: 0,
            padding: "18px 16px",
            display: "flex", flexDirection: "column",
          }}>
            <p style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 9, letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: `${s.accent}88`,
              marginBottom: 12,
            }}>{yr}</p>

            <h3 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 16, lineHeight: 1.35,
              color: "#e8dcc8",
              textShadow: "0 1px 6px rgba(0,0,0,0.9)",
              flexGrow: 1,
            }}>{caseData.name}</h3>

            <div style={{
              height: 1, margin: "10px 0",
              background: `linear-gradient(90deg, transparent, ${s.accent}35, transparent)`,
            }} />

            <p style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10, color: "rgba(255,255,255,0.22)",
              letterSpacing: "0.08em",
            }}>{loss} lost</p>
          </div>

          {/* hover glow overlay */}
          <AnimatePresence>
            {state === "hover" && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                style={{
                  position: "absolute", inset: 0, pointerEvents: "none",
                  background: `radial-gradient(ellipse at 50% 0%, ${s.glow}, transparent 65%)`,
                }}
              />
            )}
          </AnimatePresence>
        </div>

        {/* ── PAGES EDGE (right side, book thickness) ───────────────────── */}
        <div style={{
          position: "absolute",
          top: 3, left: SW + CW,
          width: DEP, height: BH - 6,
          transformOrigin: "left center",
          transform: "rotateY(-90deg)",
          background: "linear-gradient(90deg, #c4b87a, #d4c888, #c4b87a, #bfb070)",
          borderRadius: "0 2px 2px 0",
        }} />

        {/* ── HOVER LABEL ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {state === "hover" && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                position: "absolute",
                bottom: -26, left: 0, right: 0,
                textAlign: "center",
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 9, letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: `${s.accent}80`,
                whiteSpace: "nowrap",
              }}
            >
              点击打开档案
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>
    </motion.div>
  );
}
