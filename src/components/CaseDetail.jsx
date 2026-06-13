import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { PixelTombstone, PixelSkull, PixelScalpel, PixelWarning, PixelMagnify, PixelGhost } from "./PixelIcons";

function cfmt(c) {
  if (typeof c !== "number" || isNaN(c)) return { text: "—", pct: 0 };
  const pct = Math.round(Math.max(0, Math.min(c, 1)) * 100);
  return { text: `${pct}%`, pct };
}

const EV_META = {
  code_vulnerability:   { label: "代码漏洞", color: "rgba(248,113,113,0.8)",  bg: "rgba(239,68,68,0.07)",  border: "rgba(239,68,68,0.15)" },
  on_chain_transaction: { label: "链上交易", color: "rgba(56,189,248,0.8)",   bg: "rgba(14,165,233,0.07)", border: "rgba(14,165,233,0.15)" },
  fund_flow:            { label: "资金流向", color: "rgba(167,139,250,0.8)",  bg: "rgba(139,92,246,0.07)", border: "rgba(139,92,246,0.15)" },
  historical_record:    { label: "历史记录", color: "rgba(251,191,36,0.8)",   bg: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.15)" },
};

const STATUS_META = {
  confirmed: { label: "已确认", color: "rgba(52,211,153,0.8)",  bg: "rgba(16,185,129,0.07)", border: "rgba(16,185,129,0.2)" },
  proposed:  { label: "初始假设", color: "rgba(56,189,248,0.8)", bg: "rgba(14,165,233,0.07)", border: "rgba(14,165,233,0.15)" },
  revised:   { label: "已修正", color: "rgba(251,191,36,0.8)",  bg: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.15)" },
  refuted:   { label: "已否定", color: "rgba(113,113,122,0.6)", bg: "rgba(63,63,70,0.07)",   border: "rgba(63,63,70,0.2)" },
};

function Tag({ type }) {
  const m = EV_META[type] ?? { label: type ?? "—", color: "rgba(161,161,170,0.7)", bg: "rgba(63,63,70,0.07)", border: "rgba(63,63,70,0.2)" };
  return (
    <span
      className="font-mono-plex text-[16px] tracking-wider uppercase px-2.5 py-1 rounded-full"
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}
    >
      {m.label}
    </span>
  );
}

function StatusTag({ status }) {
  const m = STATUS_META[status] ?? STATUS_META.proposed;
  return (
    <span
      className="font-mono-plex text-[16px] tracking-wider px-2.5 py-1 rounded-full"
      style={{ color: m.color, background: m.bg, border: `1px solid ${m.border}` }}
    >
      {m.label}
    </span>
  );
}

// stripe inOutExpo: cubic-bezier(0.87, 0, 0.13, 1)
const INOUT_EXPO = [0.87, 0, 0.13, 1];

function Reveal({ children, delay = 0, className = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 28, filter: "blur(6px)" }}
      animate={inView ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
      transition={{ duration: 0.85, delay, ease: INOUT_EXPO }}
    >
      {children}
    </motion.div>
  );
}

/* ── MEDAL MODAL ── */
function MedalModal({ caseData, onClose }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onClick={onClose}
    >
      {/* backdrop */}
      <div className="absolute inset-0" style={{ background: "rgba(4,3,8,0.88)", backdropFilter: "blur(24px)" }} />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-8 max-w-sm w-full"
        initial={{ scale: 0.7, opacity: 0, y: 40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 20 }}
        transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
        onClick={e => e.stopPropagation()}
      >
        {/* medal SVG */}
        <div className="relative">
          {/* outer glow */}
          <motion.div
            className="absolute inset-[-28px] rounded-full"
            animate={{ opacity: [0.35, 0.65, 0.35] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            style={{ background: "radial-gradient(circle, rgba(196,136,42,0.52) 0%, transparent 70%)" }}
          />

          <svg width="220" height="220" viewBox="0 0 220 220" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* outer decorative ring */}
            <motion.circle
              cx="110" cy="110" r="104"
              stroke="url(#ringGrad)" strokeWidth="1.5" fill="none"
              strokeDasharray="8 5"
              initial={{ rotate: 0, transformOrigin: "110px 110px" }}
              animate={{ rotate: 360 }}
              transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
              style={{ transformOrigin: "110px 110px" }}
            />
            {/* second ring */}
            <circle cx="110" cy="110" r="96" stroke="url(#ringGrad2)" strokeWidth="0.8" fill="none" />
            {/* main medal body */}
            <circle cx="110" cy="110" r="88" fill="url(#medalFill)" />
            {/* inner rim */}
            <circle cx="110" cy="110" r="88" stroke="url(#rimGrad)" strokeWidth="1.5" fill="none" />
            {/* inner decorative ring */}
            <circle cx="110" cy="110" r="78" stroke="rgba(196,136,42,0.52)" strokeWidth="0.8" fill="none" />
            {/* shimmer overlay */}
            <ellipse cx="90" cy="80" rx="40" ry="20" fill="rgba(255,255,255,0.04)" />

            {/* center skull / tombstone emblem */}
            <text x="110" y="100" textAnchor="middle" fontSize="32" fill="rgba(255,240,200,0.9)">⚰</text>

            {/* event name */}
            <text x="110" y="130" textAnchor="middle"
              fontFamily="Georgia, serif" fontSize="13" letterSpacing="1"
              fill="rgba(255,235,180,0.95)">
              {(caseData.name || caseData.id || "").toUpperCase()}
            </text>

            {/* year */}
            <text x="110" y="148" textAnchor="middle"
              fontFamily="monospace" fontSize="9" letterSpacing="3"
              fill="rgba(196,136,42,0.6)">
              {caseData.year ?? ""}
            </text>

            {/* bottom text arc simulation — straight line */}
            <text x="110" y="174" textAnchor="middle"
              fontFamily="monospace" fontSize="8" letterSpacing="2"
              fill="rgba(196,136,42,0.70)">
              DIGITAL POMPEII · WITNESS
            </text>

            {/* top badge text */}
            <text x="110" y="54" textAnchor="middle"
              fontFamily="monospace" fontSize="7.5" letterSpacing="3"
              fill="rgba(196,136,42,0.5)">
              遗迹见证勋章
            </text>

            {/* decorative dots */}
            {[0, 60, 120, 180, 240, 300].map((deg, i) => {
              const rad = (deg * Math.PI) / 180;
              const x = 110 + 92 * Math.cos(rad);
              const y = 110 + 92 * Math.sin(rad);
              return <circle key={i} cx={x} cy={y} r="2.5" fill="rgba(196,136,42,0.5)" />;
            })}

            <defs>
              <radialGradient id="medalFill" cx="40%" cy="35%" r="70%">
                <stop offset="0%" stopColor="#2a1f0a" />
                <stop offset="40%" stopColor="#1a1208" />
                <stop offset="100%" stopColor="#0d0a04" />
              </radialGradient>
              <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(196,136,42,0.7)" />
                <stop offset="50%" stopColor="rgba(255,200,80,0.9)" />
                <stop offset="100%" stopColor="rgba(196,136,42,0.7)" />
              </linearGradient>
              <linearGradient id="ringGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(196,136,42,0.3)" />
                <stop offset="100%" stopColor="rgba(255,200,80,0.5)" />
              </linearGradient>
              <linearGradient id="rimGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="rgba(255,210,100,0.8)" />
                <stop offset="50%" stopColor="rgba(196,136,42,0.4)" />
                <stop offset="100%" stopColor="rgba(255,210,100,0.8)" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* caption */}
        <div className="text-center space-y-2">
          <p className="font-playfair text-[17px]" style={{ color: "rgba(255,235,180,0.9)" }}>
            我曾见证数字庞贝
          </p>
          <p className="font-mono-plex text-[16px] tracking-[0.22em]" style={{ color: "rgba(196,136,42,0.5)" }}>
            I WITNESSED THE RUINS · {new Date().getFullYear()}
          </p>
        </div>

        {/* NFT button */}
        <div className="flex flex-col items-center gap-2 w-full">
          <button
            disabled
            className="w-full py-3 rounded-xl font-mono-plex text-[17px] tracking-[0.2em] uppercase cursor-not-allowed"
            style={{
              background: "rgba(196,136,42,0.06)",
              border: "1px solid rgba(196,136,42,0.2)",
              color: "rgba(196,136,42,0.4)",
            }}
          >
            铸造为 NFT · Mint（即将上线）
          </button>
          <button
            onClick={onClose}
            className="font-mono-plex text-[16px] tracking-widest"
            style={{ color: "rgba(255,255,255,0.2)" }}
          >
            关闭 ✕
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* Glass panel — the core UI unit */
function Panel({ children, className = "", glow = false, amber = false }) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={{
        background: amber
          ? "linear-gradient(145deg, rgba(196,136,42,0.04), rgba(196,136,42,0.02))"
          : "rgba(255,255,255,0.025)",
        border: amber
          ? "1px solid rgba(196,136,42,0.15)"
          : "1px solid rgba(255,255,255,0.05)",
        backdropFilter: "blur(8px)",
        boxShadow: glow
          ? "0 0 80px rgba(196,136,42,0.06), 0 8px 32px rgba(0,0,0,0.4)"
          : "0 4px 20px rgba(0,0,0,0.35)",
      }}
    >
      {children}
    </div>
  );
}

export default function CaseDetail({ caseData }) {
  const [showMedal, setShowMedal] = useState(false);

  if (!caseData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="font-mono-plex text-[17px] tracking-[0.28em] uppercase" style={{ color: "rgba(255,255,255,0.72)" }}>
          Select an exhibit
        </p>
      </div>
    );
  }

  const conf = cfmt(caseData.confidence);
  const findings = Array.isArray(caseData.technical_findings) ? caseData.technical_findings : [];
  const alternatives = Array.isArray(caseData.alternative_hypotheses) ? caseData.alternative_hypotheses : [];
  const aftermath = Array.isArray(caseData.aftermath) ? caseData.aftermath : [];
  const prevention = Array.isArray(caseData.prevention_advice) ? caseData.prevention_advice : [];
  const loss = caseData.money_lost_usd != null
    ? "$" + (caseData.money_lost_usd / 1e6).toFixed(0) + "M"
    : "—";
  const year = caseData.death_date?.slice(0, 4) ?? "—";
  const confColor = conf.pct >= 80 ? "#34d399" : conf.pct >= 60 ? "#38bdf8" : "#f59e0b";

  return (
    <article className="max-w-3xl pb-32 space-y-10">

      {/* ── HERO ── */}
      <Reveal>
        <header className="space-y-6 pb-8" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <p className="font-mono-plex text-[16px] tracking-[0.35em] uppercase" style={{ color: "rgba(196,136,42,0.5)" }}>
            Digital Pompeii · Exhibit
          </p>

          <div className="flex items-start gap-6">
            <h1
              className="font-playfair leading-none flex-1"
              style={{
                fontSize: "clamp(2.4rem,6vw,4.2rem)",
                color: "#ede5d4",
                textShadow: "0 0 80px rgba(196,120,30,0.12)",
                letterSpacing: "-0.02em",
              }}
            >
              {caseData.name ?? caseData.id}
            </h1>
            {/* Pixel tombstone beside title */}
            <div className="shrink-0 mt-1 hidden sm:block" style={{ filter: "drop-shadow(0 0 14px rgba(196,136,42,0.52))" }}>
              <PixelTombstone ps={6} style={{ opacity: 0.75 }} />
            </div>
          </div>

          <div className="flex items-center gap-5 flex-wrap">
            {[
              { v: year,      label: "Year" },
              { v: loss,      label: "Lost" },
              { v: conf.text, label: "Evidence" },
            ].map(({ v, label }, i) => (
              <div key={i} className="flex items-baseline gap-2">
                <span className="font-mono-plex text-[17px]" style={{ color: "#ede5d4" }}>{v}</span>
                <span className="font-mono-plex text-[16px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>{label}</span>
              </div>
            ))}
          </div>

          {caseData.contract_address && (
            <p className="font-mono-plex text-[16px] break-all" style={{ color: "rgba(255,255,255,0.44)" }}>
              {caseData.contract_address}
            </p>
          )}
        </header>
      </Reveal>

      {/* ── DEATH CAUSE + EVIDENCE STRENGTH ── */}
      <Reveal delay={0.04}>
        <div className="grid md:grid-cols-5 gap-4">
          <Panel className="md:col-span-3 px-6 py-5">
            <p className="font-mono-plex text-[16px] tracking-[0.28em] uppercase mb-3" style={{ color: "rgba(239,68,68,0.5)" }}>
              死因 · Cause of Death
            </p>
            <p className="font-mono-plex text-[17px] tracking-wide" style={{ color: "rgba(239,100,100,0.75)", letterSpacing: "0.04em" }}>
              {caseData.death_cause ?? "暂无死因信息"}
            </p>
          </Panel>

          <Panel className="md:col-span-2 px-6 py-5">
            <p className="font-mono-plex text-[16px] tracking-[0.28em] uppercase mb-3" style={{ color: "rgba(56,189,248,0.5)" }}>
              证据强度
            </p>
            <p
              className="font-mono-plex font-light mb-4"
              style={{ fontSize: "3.2rem", lineHeight: 1, color: confColor }}
            >
              {conf.text}
            </p>
            <div className="h-px rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${confColor}88, ${confColor})` }}
                initial={{ width: 0 }}
                animate={{ width: `${conf.pct}%` }}
                transition={{ duration: 1.6, delay: 0.35, ease: INOUT_EXPO }}
              />
            </div>
          </Panel>
        </div>
      </Reveal>

      {/* ── LAYMAN INTRO ── */}
      {caseData.layman_intro && (
        <Reveal delay={0.03}>
          <Panel className="px-6 py-5">
            <p className="font-mono-plex text-[16px] tracking-[0.28em] uppercase mb-3" style={{ color: "rgba(255,255,255,0.75)" }}>
              白话版 · In Plain Words
            </p>
            <p className="text-[16px] leading-[1.9]" style={{ color: "rgba(215,205,190,0.82)" }}>
              {caseData.layman_intro}
            </p>
          </Panel>
        </Reveal>
      )}

      {/* ── AI CORONER REPORT ── */}
      {Array.isArray(caseData.evidence) && caseData.evidence.length > 0 && (
        <Reveal delay={0.04}>
          <div
            className="rounded-2xl px-6 py-6 space-y-4"
            style={{
              background: "linear-gradient(145deg, rgba(16,32,20,0.7), rgba(8,18,12,0.5))",
              border: "1px solid rgba(52,211,153,0.12)",
              boxShadow: "0 0 40px rgba(52,211,153,0.04), inset 0 1px 0 rgba(52,211,153,0.06)",
            }}
          >
            {/* header */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#34d399", boxShadow: "0 0 6px #34d399" }} />
                <p className="font-mono-plex text-[16px] tracking-[0.32em] uppercase" style={{ color: "rgba(52,211,153,0.7)" }}>
                  AI 验尸官 · 尸检报告
                </p>
              </div>
              <span className="font-mono-plex text-[16px]" style={{ color: "rgba(52,211,153,0.62)" }}>
                confidence {Math.round((caseData.confidence ?? 0) * 100)}%
              </span>
            </div>

            {/* verdict */}
            <div className="pl-4" style={{ borderLeft: "2px solid rgba(52,211,153,0.2)" }}>
              <p className="font-mono-plex text-[16px] tracking-widest uppercase mb-1.5" style={{ color: "rgba(52,211,153,0.65)" }}>verdict</p>
              <p className="text-[17px] font-playfair leading-snug" style={{ color: "rgba(180,240,210,0.9)" }}>
                {caseData.death_cause}
              </p>
            </div>

            {/* evidence list */}
            <div className="space-y-2.5">
              {caseData.evidence.map((ev, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="font-mono-plex text-[16px] mt-[3px] shrink-0" style={{ color: "rgba(52,211,153,0.65)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-[17px] leading-[1.75]" style={{ color: "rgba(180,210,190,0.7)" }}>{ev}</p>
                </div>
              ))}
            </div>

            {/* footer hint */}
            <p className="font-mono-plex text-[16px] text-right pt-1" style={{ color: "rgba(52,211,153,0.52)" }}>
              完整调查过程 → 调查日志 tab
            </p>
          </div>
        </Reveal>
      )}

      {/* ── FORENSIC FINDINGS ── */}
      {findings.length > 0 && (
        <Reveal delay={0.06}>
          <div>
            <div className="flex items-center gap-3 mb-5">
              <PixelScalpel ps={3} style={{ opacity: 0.65, filter: "drop-shadow(0 0 6px rgba(140,140,180,0.3))" }} />
              <p className="font-mono-plex text-[16px] tracking-[0.28em] uppercase" style={{ color: "rgba(255,255,255,0.2)" }}>
                取证发现 · Forensic Findings
              </p>
            </div>
            <div className="space-y-2.5">
              {findings.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -16, filter: "blur(4px)" }}
                  whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ duration: 0.65, delay: i * 0.07, ease: INOUT_EXPO }}
                >
                  <Panel className="px-5 py-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <Tag type={item.evidence_type} />
                      {typeof item.confidence === "number" && (
                        <span className="font-mono-plex text-[16px]" style={{ color: "rgba(255,255,255,0.2)" }}>
                          conf {Math.round(item.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <p className="text-[17px] leading-7" style={{ color: "rgba(210,200,185,0.8)" }}>
                      {item.reasoning}
                    </p>
                    {item.tx_hash && (
                      <p className="font-mono-plex text-[16px] break-all" style={{ color: "rgba(255,255,255,0.72)" }}>
                        <span className="mr-2" style={{ color: "rgba(255,255,255,0.2)" }}>tx</span>
                        <a href={`https://etherscan.io/tx/${item.tx_hash}`} target="_blank" rel="noopener noreferrer"
                          className="transition-colors duration-200" style={{ color: "rgba(56,189,248,0.6)" }}
                          onMouseEnter={e => e.target.style.color = "rgba(56,189,248,0.9)"}
                          onMouseLeave={e => e.target.style.color = "rgba(56,189,248,0.6)"}
                        >
                          {item.tx_hash}
                        </a>
                      </p>
                    )}
                    {Array.isArray(item.involved_addresses) && item.involved_addresses.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {item.involved_addresses.map(addr => (
                          <a key={addr} href={`https://etherscan.io/address/${addr}`} target="_blank" rel="noopener noreferrer"
                            className="font-mono-plex text-[16px] px-2 py-0.5 rounded transition-colors duration-150"
                            style={{ color: "rgba(255,255,255,0.52)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                          >
                            {addr.slice(0, 8)}…{addr.slice(-6)}
                          </a>
                        ))}
                      </div>
                    )}
                  </Panel>
                </motion.div>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      {/* ── HYPOTHESIS HISTORY ── */}
      {alternatives.length > 0 && (
        <Reveal delay={0.06}>
          <div>
            <p className="font-mono-plex text-[16px] tracking-[0.28em] uppercase mb-5" style={{ color: "rgba(255,255,255,0.2)" }}>
              假设修正记录 · Hypothesis History
            </p>
            <div className="space-y-2">
              {alternatives.map((item, i) => (
                <Panel key={i} className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1.5 flex-1">
                    <p className="text-[17px] leading-6" style={{ color: "rgba(210,200,185,0.90)" }}>{item.cause}</p>
                    {item.refutation_evidence?.[0] && (
                      <p className="font-mono-plex text-[17px]" style={{ color: "rgba(255,255,255,0.2)" }}>反证：{item.refutation_evidence[0]}</p>
                    )}
                    {item.replaced_by && (
                      <p className="font-mono-plex text-[17px]" style={{ color: "rgba(196,136,42,0.5)" }}>→ {item.replaced_by}</p>
                    )}
                  </div>
                  <StatusTag status={item.status} />
                </Panel>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      {/* ── EPITAPH ── */}
      {caseData.epitaph && (
        <Reveal delay={0.05}>
          <div className="relative">
            {/* Large ambient glow behind the stone */}
            <div className="absolute inset-0 -m-8 pointer-events-none" style={{
              background: "radial-gradient(ellipse at 50% 40%, rgba(180,100,25,0.08), transparent 65%)",
              filter: "blur(20px)",
            }} />

            <Panel amber glow className="px-8 py-12 text-center relative">
              {/* Stone texture via noise gradient */}
              <div className="absolute inset-0 rounded-2xl pointer-events-none opacity-30" style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
              }} />

              {/* Top ornament */}
              <div className="flex items-center justify-center gap-4 mb-8">
                <div style={{ filter: "drop-shadow(0 0 8px rgba(196,136,42,0.3))" }}>
                  <PixelSkull ps={3} style={{ opacity: 0.55 }} />
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-px w-8" style={{ background: "linear-gradient(90deg, transparent, rgba(196,136,42,0.4))" }} />
                  <span className="font-mono-plex text-[16px] tracking-[0.4em] uppercase" style={{ color: "rgba(196,136,42,0.70)" }}>
                    Epitaph · 墓志铭
                  </span>
                  <div className="h-px w-8" style={{ background: "linear-gradient(90deg, rgba(196,136,42,0.4), transparent)" }} />
                </div>
                <div style={{ filter: "drop-shadow(0 0 8px rgba(196,136,42,0.3))" }}>
                  <PixelSkull ps={3} style={{ opacity: 0.55 }} />
                </div>
              </div>

              {/* Epitaph text — the centrepiece */}
              <p
                className="font-playfair whitespace-pre-line relative"
                style={{
                  fontSize: "clamp(0.95rem, 1.8vw, 1.1rem)",
                  lineHeight: "2.3",
                  letterSpacing: "0.025em",
                  color: "#c8b990",
                  textShadow: "0 1px 12px rgba(0,0,0,0.8), 0 0 40px rgba(196,136,42,0.06)",
                }}
              >
                {caseData.epitaph}
              </p>

              {/* Bottom ornament */}
              <div className="flex items-center justify-center gap-3 mt-8">
                <div className="h-px w-8" style={{ background: "linear-gradient(90deg, transparent, rgba(196,136,42,0.52))" }} />
                <div className="w-1 h-1 rounded-full" style={{ background: "rgba(196,136,42,0.3)" }} />
                <div className="h-px w-8" style={{ background: "linear-gradient(90deg, rgba(196,136,42,0.52), transparent)" }} />
              </div>
            </Panel>
          </div>
        </Reveal>
      )}

      {/* ── AFTERMATH 余波 ── */}
      {aftermath.length > 0 && (
        <Reveal delay={0.05}>
          <div>
            <div className="flex items-center gap-3 mb-5">
              <PixelGhost ps={3} style={{ opacity: 0.5, filter: "drop-shadow(0 0 6px rgba(140,100,200,0.3))" }} />
              <p className="font-mono-plex text-[16px] tracking-[0.28em] uppercase" style={{ color: "rgba(255,255,255,0.75)" }}>
                余波 · Aftermath
              </p>
            </div>
            <div className="relative pl-6">
              {/* vertical timeline line */}
              <div className="absolute left-0 top-2 bottom-2 w-px" style={{ background: "linear-gradient(to bottom, rgba(196,136,42,0.52), rgba(196,136,42,0.05))" }} />
              <div className="space-y-4">
                {aftermath.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -12, filter: "blur(4px)" }}
                    whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                    viewport={{ once: true, margin: "-20px" }}
                    transition={{ duration: 0.6, delay: i * 0.08, ease: INOUT_EXPO }}
                    className="relative"
                  >
                    {/* dot on timeline */}
                    <div className="absolute -left-[25px] top-[7px] w-1.5 h-1.5 rounded-full" style={{ background: "rgba(196,136,42,0.5)", boxShadow: "0 0 6px rgba(196,136,42,0.3)" }} />
                    <Panel className="px-5 py-4 space-y-2">
                      <div className="flex items-baseline gap-3 flex-wrap">
                        <p className="font-mono-plex text-[16px] tracking-wider" style={{ color: "rgba(196,136,42,0.55)" }}>{item.date}</p>
                        <p className="font-playfair text-[16px]" style={{ color: "#ded5c0" }}>{item.title}</p>
                      </div>
                      <p className="text-[17px] leading-7" style={{ color: "rgba(200,190,175,0.88)" }}>{item.body}</p>
                    </Panel>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      )}

      {/* ── PREVENTION ADVICE ── */}
      {prevention.length > 0 && (
        <Reveal delay={0.04}>
          <div>
            <div className="flex items-center gap-3 mb-5">
              <PixelMagnify ps={3} style={{ opacity: 0.6, filter: "drop-shadow(0 0 6px rgba(56,189,248,0.2))" }} />
              <p className="font-mono-plex text-[16px] tracking-[0.28em] uppercase" style={{ color: "rgba(255,255,255,0.75)" }}>
                如何防范 · Prevention
              </p>
            </div>
            <div className="space-y-2.5">
              {prevention.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-20px" }}
                  transition={{ duration: 0.5, delay: i * 0.07, ease: INOUT_EXPO }}
                >
                  <Panel className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.15)" }}>
                        <span className="font-mono-plex text-[17px]" style={{ color: "rgba(56,189,248,0.7)" }}>{i + 1}</span>
                      </div>
                      <div className="space-y-1.5">
                        <p className="font-mono-plex text-[16px] tracking-wide" style={{ color: "rgba(56,189,248,0.75)" }}>{item.title}</p>
                        <p className="text-[17px] leading-7" style={{ color: "rgba(185,175,160,0.7)" }}>{item.detail}</p>
                      </div>
                    </div>
                  </Panel>
                </motion.div>
              ))}
            </div>
          </div>
        </Reveal>
      )}

      {/* ── WARNING ── */}
      {caseData.warning_to_builders && (
        <Reveal delay={0.04}>
          <Panel className="px-7 py-7">
            <div className="flex items-center gap-3 mb-5">
              <PixelWarning ps={3} style={{ opacity: 0.7, filter: "drop-shadow(0 0 6px rgba(240,176,32,0.35))" }} />
              <p className="font-mono-plex text-[16px] tracking-[0.28em] uppercase" style={{ color: "rgba(255,255,255,0.75)" }}>
                给后来者的警示 · Warning to Builders
              </p>
            </div>
            <p className="text-[17px] leading-8 whitespace-pre-line" style={{ color: "rgba(185,175,160,0.85)" }}>
              {caseData.warning_to_builders}
            </p>
          </Panel>
        </Reveal>
      )}

      {/* ── MEMORIAL BADGE ── */}
      <Reveal delay={0.06}>
        <div className="flex flex-col items-center py-10 gap-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-px w-12" style={{ background: "linear-gradient(90deg, transparent, rgba(196,136,42,0.2))" }} />
            <p className="font-mono-plex text-[17px] tracking-[0.32em] uppercase" style={{ color: "rgba(196,136,42,0.3)" }}>
              遗迹见证 · Memorial
            </p>
            <div className="h-px w-12" style={{ background: "linear-gradient(90deg, rgba(196,136,42,0.2), transparent)" }} />
          </div>
          <motion.button
            onClick={() => setShowMedal(true)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="relative px-8 py-4 rounded-2xl font-mono-plex text-[17px] tracking-[0.22em] uppercase"
            style={{
              background: "linear-gradient(135deg, rgba(196,136,42,0.08), rgba(196,100,20,0.04))",
              border: "1px solid rgba(196,136,42,0.22)",
              color: "rgba(255,220,140,0.8)",
            }}
          >
            <motion.span
              className="absolute inset-0 rounded-2xl pointer-events-none"
              animate={{ opacity: [0, 0.5, 0] }}
              transition={{ duration: 2.8, repeat: Infinity }}
              style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(196,136,42,0.15), transparent 70%)" }}
            />
            <span className="relative z-10 flex items-center gap-2.5">
              <span style={{ fontSize: "15px" }}>⚰</span>
              吊唁 · 领取遗迹勋章
            </span>
          </motion.button>
          <p className="font-mono-plex text-[17px] tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.1)" }}>
            可铸造为 NFT 永久存证 · NFT minting coming soon
          </p>
        </div>
      </Reveal>

      {/* modal — 用 Portal 渲染到 body，避开带 transform/filter 的祖先导致 fixed 定位错乱 */}
      {createPortal(
        <AnimatePresence>
          {showMedal && <MedalModal caseData={caseData} onClose={() => setShowMedal(false)} />}
        </AnimatePresence>,
        document.body
      )}

    </article>
  );
}
