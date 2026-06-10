import { useEffect, useState } from "react";
import {
  motion,
  useMotionValue, useSpring, useTransform, useVelocity, useScroll, useMotionTemplate,
} from "framer-motion";
import ParticleField from "./ParticleField";
import { useTilt } from "../hooks/useTilt";
import { cases } from "../data/cases";
import { PixelTombstone, PixelSkull, PixelGhost, PixelZombie, PixelCoffin } from "./PixelIcons";

const OUT_BACK    = [0.34, 1.56, 0.64, 1];
const INOUT_EXPO  = [0.87, 0, 0.13, 1];
const OUT_EXPO    = [0.19, 1, 0.22, 1];

const SEV_COLOR = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#6b7280",
};

function useCountUp(target, duration = 2400, active = false) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      const e = p < 0.5
        ? 0.5 * Math.pow(2, 10 * (p * 2 - 1))
        : 0.5 * (-Math.pow(2, -10 * ((p - 0.5) * 2 - 1)) + 2);
      setV(Math.round(target * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);
  return v;
}

function StoneCard({ caseData, index, onSelect }) {
  const { ref, rotateX: tiltX, rotateY: tiltY, scale, glowX, glowY, onMouseMove, onMouseLeave } = useTilt(12);
  const year = caseData.death_date?.slice(0, 4) ?? "—";
  const loss = caseData.money_lost_usd != null
    ? "$" + (caseData.money_lost_usd / 1e6).toFixed(0) + "M" : "—";
  const glowBg = useMotionTemplate`radial-gradient(circle at ${glowX}% ${glowY}%, rgba(196,136,42,0.14) 0%, transparent 65%)`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 180, rotate: -4, scale: 0.75 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      transition={{ duration: 1.4, delay: 0.4 + index * 0.13, ease: OUT_BACK }}
    >
      <motion.button
        ref={ref}
        onClick={() => onSelect(caseData.id)}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ perspective: 800, rotateX: tiltX, rotateY: tiltY, scale, transformStyle: "preserve-3d" }}
        className="relative group w-[172px] text-left focus:outline-none"
      >
        <motion.div style={{ background: glowBg }} className="rounded-2xl overflow-hidden">
          <div
            className="relative rounded-2xl px-5 py-6 flex flex-col gap-3"
            style={{
              background: "linear-gradient(145deg, #1c191e 0%, #100e12 50%, #1a1720 100%)",
              border: "1px solid rgba(196,136,42,0.18)",
              boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 4px 0 -1px rgba(0,0,0,0.6), 0 28px 56px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)`,
            }}
          >
            <div className="absolute top-0 left-6 right-6 h-px" style={{
              background: `linear-gradient(90deg, transparent, ${SEV_COLOR[caseData.severity] ?? "#6b7280"}60, transparent)`,
            }} />
            <p className="font-mono-plex text-[12px] tracking-[0.28em] uppercase" style={{ color: "rgba(196,136,42,0.75)" }}>
              {year}
            </p>
            <h3 className="font-playfair text-[17px] leading-snug" style={{ color: "#ede5d4", textShadow: "0 1px 8px rgba(0,0,0,0.8)" }}>
              {caseData.name}
            </h3>
            <p className="font-mono-plex text-[17px] mt-auto" style={{ color: "rgba(255,255,255,0.50)" }}>
              {loss} lost
            </p>
            <motion.div
              className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(196,136,42,0.07), transparent 70%)" }}
            />
          </div>
        </motion.div>
        <div className="absolute left-2 right-2 -bottom-1.5 h-3 rounded-b-2xl"
          style={{ background: "#0a0810", transform: "translateZ(-4px)", filter: "blur(2px)" }} />
      </motion.button>
    </motion.div>
  );
}

export default function Landing({ onEnter }) {
  const [statsOn, setStatsOn] = useState(false);
  const loss = useCountUp(2_100_000_000, 2600, statsOn);

  const { scrollY } = useScroll();
  const scrollVel = useVelocity(scrollY);
  const rawTilt = useTransform(scrollVel, [-1500, 1500], [4, -4]);
  const scrollTilt = useSpring(rawTilt, { stiffness: 280, damping: 34, mass: 0.3 });

  useEffect(() => {
    const t = setTimeout(() => setStatsOn(true), 1100);
    return () => clearTimeout(t);
  }, []);

  const fadeUp = (delay = 0, dur = 0.95) => ({
    initial: { opacity: 0, y: 32, filter: "blur(8px)" },
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { duration: dur, delay, ease: INOUT_EXPO },
  });

  return (
    <div className="relative min-h-screen bg-[#070609] overflow-hidden flex flex-col">
      <ParticleField count={80} />

      <div className="absolute pointer-events-none" style={{
        width: "1100px", height: "750px", left: "50%", top: "38%",
        transform: "translate(-50%, -50%)",
        background: "radial-gradient(ellipse, rgba(130,65,18,0.1) 0%, transparent 65%)",
        filter: "blur(50px)",
      }} />

      {/* pixel art decorations */}
      <motion.div className="absolute left-6 bottom-[16%] hidden lg:block" style={{ perspective: "600px" }}>
        <motion.div
          initial={{ rotateX: 55, y: 30, opacity: 0 }} animate={{ rotateX: 0, y: 0, opacity: 0.55 }}
          transition={{ delay: 1.6, duration: 1.2, ease: OUT_BACK }}
          style={{ filter: "drop-shadow(0 0 14px rgba(196,136,42,0.22))" }}
        ><PixelTombstone ps={6} /></motion.div>
      </motion.div>

      <motion.div className="absolute left-36 bottom-[12%] hidden lg:block" style={{ perspective: "500px" }}>
        <motion.div
          initial={{ rotateX: 55, y: 20, opacity: 0 }} animate={{ rotateX: 0, y: 0, opacity: 0.3 }}
          transition={{ delay: 1.9, duration: 1.1, ease: OUT_BACK }}
        ><PixelTombstone ps={4} /></motion.div>
      </motion.div>

      <motion.div className="absolute right-10 bottom-[14%] hidden lg:block"
        style={{ perspective: "500px" }}>
        <motion.div
          initial={{ rotateX: 50, y: 25, opacity: 0 }} animate={{ rotateX: 0, y: 0, opacity: 0.45 }}
          transition={{ delay: 1.8, duration: 1.2, ease: OUT_BACK }}
          style={{ filter: "drop-shadow(0 0 10px rgba(90,60,140,0.2))" }}
        ><PixelCoffin ps={6} /></motion.div>
      </motion.div>

      <motion.div className="absolute right-40 bottom-[12%] hidden xl:block"
        initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 0.38 }}
        transition={{ delay: 2.1, duration: 1, ease: OUT_EXPO }}
        style={{ filter: "drop-shadow(0 0 6px rgba(60,160,60,0.14))" }}
      ><PixelZombie ps={5} /></motion.div>

      {[
        { cls: "left-[10%] top-[20%]", delay: 2.4, dur: 4.2, ps: 4 },
        { cls: "right-[12%] top-[28%]", delay: 2.9, dur: 5.1, ps: 3 },
      ].map(({ cls, delay, dur, ps }, i) => (
        <motion.div key={i} className={`absolute ${cls} hidden xl:block`}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.38, 0.22, 0.38], y: [0, -10, 0, -7, 0] }}
          transition={{ delay, duration: dur, repeat: Infinity, repeatType: "loop" }}
        ><PixelGhost ps={ps} /></motion.div>
      ))}

      <motion.div className="absolute left-[7%] top-[44%] hidden 2xl:block"
        initial={{ opacity: 0 }} animate={{ opacity: 0.14 }}
        transition={{ delay: 2.8, duration: 1.5 }}
      ><PixelSkull ps={4} /></motion.div>

      {[
        { pos: "top-8 left-8",  text: "Z.AI · Web3 × Long-Horizon Task" },
        { pos: "top-8 right-8", text: "Est. 2016 — 2022" },
      ].map(({ pos, text }) => (
        <motion.p key={pos}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 2.2, duration: 1.2 }}
          className={`absolute ${pos} font-mono-plex text-[12px] tracking-[0.26em] text-zinc-700 uppercase hidden sm:block`}
        >{text}</motion.p>
      ))}

      {/* hero */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 pt-24 pb-8">

        <motion.p {...fadeUp(0.08)} className="font-mono-plex text-[12px] tracking-[0.4em] uppercase mb-8"
          style={{ color: "rgba(196,136,42,0.75)" }}>
          Dark Museum of On-Chain Disasters
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 60, filter: "blur(20px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1.5, delay: 0.1, ease: INOUT_EXPO }}
          className="text-center mb-5"
        >
          <h1 className="font-playfair leading-none" style={{
            fontSize: "clamp(3.8rem, 11vw, 9.5rem)",
            color: "#ede5d4",
            textShadow: "0 0 200px rgba(196,110,24,0.22), 0 2px 4px rgba(0,0,0,0.9)",
            letterSpacing: "-0.02em",
          }}>
            Digital Pompeii
          </h1>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 1, ease: OUT_EXPO }}
            className="font-playfair italic mt-3"
            style={{ fontSize: "clamp(1rem, 3vw, 1.9rem)", color: "rgba(196,136,42,0.42)", letterSpacing: "0.06em" }}
          >
            数字庞贝
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0, duration: 1, ease: OUT_EXPO }}
            className="mt-5 flex flex-col items-center gap-1.5"
          >
            <p className="font-mono-plex text-[17px] tracking-[0.22em]" style={{ color: "rgba(255,255,255,0.55)" }}>
              一座链上灾难博物馆 &nbsp;&nbsp; AI 验尸官 · 策展人
            </p>
            <p className="font-mono-plex text-[12px] tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.42)" }}>
              A Dark Museum of On-Chain Disasters &nbsp;&nbsp; AI Coroner · Curator
            </p>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 1.1, delay: 0.55, ease: INOUT_EXPO }}
          className="w-40 h-px mb-8"
          style={{ background: "linear-gradient(90deg, transparent, rgba(196,136,42,0.45), transparent)" }}
        />

        <motion.p {...fadeUp(0.62)}
          className="max-w-md text-center text-[17px] leading-[2] mb-10"
          style={{ color: "rgba(200,190,175,0.38)" }}>
          链上的失败不会消失。一个自主 AI 法医 Agent，从不可篡改的链上证据里还原真正的死因，再将每一场悲剧铸成永久的警示碑。
        </motion.p>

        <motion.div {...fadeUp(0.8)} className="flex items-center gap-10 mb-16">
          {[
            { val: cases.length, label: "件展品" },
            { custom: `$${statsOn ? (loss / 1e8).toFixed(1) : "—"}亿`, label: "链上总损失" },
            { val: cases.length, label: "次调查完成" },
          ].map(({ val, label, custom }, i) => (
            <div key={i} className="text-center">
              <p className="font-mono-plex text-2xl font-light" style={{ color: "#ede5d4" }}>{custom ?? val}</p>
              <p className="font-mono-plex text-[12px] tracking-[0.22em] uppercase mt-1" style={{ color: "rgba(255,255,255,0.48)" }}>{label}</p>
            </div>
          )).reduce((acc, el, i) => [
            ...acc, el,
            i < 2 ? <div key={`s${i}`} className="w-px h-8" style={{ background: "rgba(255,255,255,0.05)" }} /> : null,
          ], []).filter(Boolean)}
        </motion.div>

        {/* cards with scroll-velocity tilt */}
        <motion.div
          style={{ rotateX: scrollTilt, transformStyle: "preserve-3d" }}
          className="flex gap-3 flex-wrap justify-center mb-14"
        >
          {cases.map((c, i) => (
            <StoneCard key={c.id} caseData={c} index={i} onSelect={(id) => onEnter(id)} />
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.15, duration: 0.9, ease: OUT_EXPO }}
        >
          <motion.button
            onClick={() => onEnter(null)}
            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
            className="group relative px-11 py-3.5 font-mono-plex text-[17px] tracking-[0.3em] uppercase overflow-hidden"
            style={{ border: "1px solid rgba(196,136,42,0.28)", color: "rgba(220,200,165,0.75)" }}
          >
            <motion.span className="absolute inset-0" initial={{ opacity: 0 }} whileHover={{ opacity: 1 }}
              transition={{ duration: 0.3 }} style={{ background: "rgba(196,136,42,0.05)" }} />
            <motion.span className="absolute bottom-0 left-0 h-px"
              style={{ background: "rgba(196,136,42,0.5)" }}
              initial={{ width: 0 }} whileHover={{ width: "100%" }}
              transition={{ duration: 0.3, ease: OUT_EXPO }} />
            <span className="relative z-10">进入档案馆 &nbsp;→</span>
          </motion.button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ delay: 3.0, duration: 1.5 }}
          className="mt-12 font-mono-plex text-[12px] tracking-[0.22em] uppercase"
          style={{ color: "rgba(255,255,255,0.32)" }}
        >
          5 cases · 2016 – 2022 · $2.1B lost
        </motion.p>
      </div>

      {/* ── FUTURE SERVICES ── */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 3.4, duration: 1.2, ease: OUT_EXPO }}
        className="relative z-10 w-full max-w-3xl mx-auto px-6 pb-24 grid md:grid-cols-2 gap-4 mt-6"
      >
        {/* 防猝死指数 */}
        <div
          className="rounded-2xl p-5 flex flex-col gap-3 cursor-not-allowed select-none"
          style={{
            background: "linear-gradient(145deg, rgba(56,189,248,0.04), rgba(14,165,233,0.02))",
            border: "1px solid rgba(56,189,248,0.1)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono-plex text-[17px] tracking-[0.28em] uppercase" style={{ color: "rgba(56,189,248,0.65)" }}>
              即将上线 · Coming Soon
            </span>
            <span className="font-mono-plex text-[17px] px-2 py-0.5 rounded-full" style={{ background: "rgba(56,189,248,0.08)", color: "rgba(56,189,248,0.65)", border: "1px solid rgba(56,189,248,0.12)" }}>
              🔒 Beta
            </span>
          </div>
          <div>
            <p className="font-playfair text-[17px] mb-1" style={{ color: "rgba(180,220,255,0.7)" }}>
              防猝死指数预测
            </p>
            <p className="font-mono-plex text-[12px] tracking-wider" style={{ color: "rgba(56,189,248,0.62)" }}>
              Anti-Sudden-Death Index
            </p>
          </div>
          <p className="text-[17px] leading-[1.8]" style={{ color: "rgba(160,190,210,0.78)" }}>
            新项目上线前，AI Agent 按死因库历史模式对照排查，输出猝死风险评分。
          </p>
          <div className="mt-auto pt-3 border-t" style={{ borderColor: "rgba(56,189,248,0.07)" }}>
            <div className="flex gap-1.5 flex-wrap">
              {["代码审计", "治理风险", "资金流模式", "攻击面评分"].map(tag => (
                <span key={tag} className="font-mono-plex text-[8px] px-2 py-0.5 rounded-full" style={{ background: "rgba(56,189,248,0.05)", color: "rgba(56,189,248,0.3)", border: "1px solid rgba(56,189,248,0.08)" }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 死因库 */}
        <div
          className="rounded-2xl p-5 flex flex-col gap-3 cursor-not-allowed select-none"
          style={{
            background: "linear-gradient(145deg, rgba(196,136,42,0.05), rgba(196,80,20,0.02))",
            border: "1px solid rgba(196,136,42,0.1)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono-plex text-[17px] tracking-[0.28em] uppercase" style={{ color: "rgba(196,136,42,0.65)" }}>
              持续更新 · Growing
            </span>
            <span className="font-mono-plex text-[17px] px-2 py-0.5 rounded-full" style={{ background: "rgba(196,136,42,0.08)", color: "rgba(196,136,42,0.45)", border: "1px solid rgba(196,136,42,0.12)" }}>
              5 cases
            </span>
          </div>
          <div>
            <p className="font-playfair text-[17px] mb-1" style={{ color: "rgba(255,220,160,0.7)" }}>
              死因库 · Failure Archive
            </p>
            <p className="font-mono-plex text-[12px] tracking-wider" style={{ color: "rgba(196,136,42,0.62)" }}>
              On-Chain Death Pattern Database
            </p>
          </div>
          <p className="text-[17px] leading-[1.8]" style={{ color: "rgba(210,190,160,0.78)" }}>
            每验一具尸，失败模式库就厚一层。护城河随数据复利增长，无法复制。
          </p>
          <div className="mt-auto pt-3 border-t" style={{ borderColor: "rgba(196,136,42,0.07)" }}>
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1">
                {["重入攻击", "闪贷", "私钥泄露", "治理攻击"].map((_, i) => (
                  <div key={i} className="w-5 h-5 rounded-full border" style={{ background: `rgba(196,136,42,${0.15 + i * 0.05})`, borderColor: "rgba(196,136,42,0.2)" }} />
                ))}
              </div>
              <span className="font-mono-plex text-[17px]" style={{ color: "rgba(196,136,42,0.62)" }}>
                +{cases.length} 死亡模式已收录
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
        style={{ background: "linear-gradient(to top, #070609, transparent)" }} />
    </div>
  );
}
