import { motion, useMotionTemplate } from "framer-motion";
import { useTilt } from "../hooks/useTilt";

const SEV = {
  critical: { dot: "#ef4444", text: "rgba(239,68,68,0.6)" },
  high:     { dot: "#f97316", text: "rgba(249,115,22,0.6)" },
  medium:   { dot: "#f59e0b", text: "rgba(245,158,11,0.6)" },
  low:      { dot: "#52525b", text: "rgba(82,82,91,0.6)" },
};

export default function CaseCard({ caseData, onClick, isActive }) {
  const { ref, rotateX, rotateY, scale, glowX, glowY, onMouseMove, onMouseLeave } = useTilt(7);
  const year = caseData.death_date?.slice(0, 4) ?? "—";
  const loss = caseData.money_lost_usd != null
    ? "$" + (caseData.money_lost_usd / 1e6).toFixed(0) + "M"
    : "—";
  const sev = SEV[caseData.severity] ?? SEV.low;
  const glowBg = useMotionTemplate`radial-gradient(circle at ${glowX}% ${glowY}%, rgba(196,136,42,0.09) 0%, transparent 70%)`;

  return (
    <div style={{ perspective: "600px" }}>
      <motion.button
        ref={ref}
        onClick={onClick}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ rotateX, rotateY, scale, transformStyle: "preserve-3d" }}
        className="group w-full text-left focus:outline-none"
      >
        <motion.div style={{ background: glowBg }} className="rounded-xl overflow-hidden">
          <div
            className="relative rounded-xl px-4 py-4 transition-all duration-300"
            style={{
              background: isActive
                ? "linear-gradient(145deg, #201c24 0%, #160f1a 50%, #1e1a22 100%)"
                : "linear-gradient(145deg, #161418 0%, #0e0c10 50%, #151218 100%)",
              border: isActive
                ? "1px solid rgba(196,136,42,0.28)"
                : "1px solid rgba(255,255,255,0.04)",
              boxShadow: isActive
                ? "0 0 40px rgba(196,136,42,0.07), inset 0 1px 0 rgba(255,255,255,0.05)"
                : "0 2px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.025)",
            }}
          >
            {/* Active/severity top line */}
            <div
              className="absolute top-0 left-4 right-4 h-px transition-all duration-300"
              style={{
                background: isActive
                  ? `linear-gradient(90deg, transparent, rgba(196,136,42,0.5), transparent)`
                  : `linear-gradient(90deg, transparent, ${sev.dot}40, transparent)`,
              }}
            />

            <div className="flex items-start gap-2.5">
              {/* Active dot */}
              <div className="pt-1.5 shrink-0">
                <motion.div
                  animate={{ opacity: isActive ? 1 : 0.3, scale: isActive ? 1 : 0.7 }}
                  className="w-1 h-1 rounded-full"
                  style={{ background: isActive ? "#c4882a" : sev.dot }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <h3
                    className="font-playfair text-[14px] leading-snug transition-colors duration-200"
                    style={{ color: isActive ? "#ede5d4" : "rgba(220,210,196,0.7)" }}
                  >
                    {caseData.name ?? caseData.id}
                  </h3>
                  <span
                    className="font-mono-plex text-[9px] tracking-widest uppercase shrink-0 mt-0.5"
                    style={{ color: sev.text }}
                  >
                    {caseData.severity}
                  </span>
                </div>

                <p className="font-mono-plex text-[10px] mb-2" style={{ color: "rgba(255,255,255,0.2)" }}>
                  {year} · {loss}
                </p>

                <p
                  className="text-[11px] leading-[1.6] line-clamp-2 transition-colors duration-200"
                  style={{ color: isActive ? "rgba(200,190,175,0.55)" : "rgba(150,140,130,0.4)" }}
                >
                  {caseData.death_cause ?? "死因待查"}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.button>
    </div>
  );
}
