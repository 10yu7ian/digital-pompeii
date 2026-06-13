import { useEffect, useState } from "react";
import {
  motion,
  useSpring, useTransform, useVelocity, useScroll, useMotionTemplate,
} from "framer-motion";
import ParticleField from "./ParticleField";
import { useTilt } from "../hooks/useTilt";
import { cases } from "../data/cases";
import { PixelGhost, PixelZombie } from "./PixelIcons";

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
        : 0.5 * (-Math.pow(2, -10 * ((p - 0.5) * 2)) + 2);
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
            <p className="font-mono-plex text-[17px] mt-auto" style={{ color: "rgba(255,255,255,0.78)" }}>
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

export default function Landing({ onEnter, onCheck }) {
  const [statsOn, setStatsOn] = useState(false);
  const totalLost = cases.reduce((s, c) => s + (c.money_lost_usd || 0), 0);
  const loss = useCountUp(totalLost, 2600, statsOn);

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

      {/* 漂浮的小鬼群 — 满页各处、大小错落、各自独立的漂移与忽明忽暗 */}
      {[
        { cls: "left-[8%]  top-[17%]", ps: 9, op: 0.50, dx: 8,  dy: -16, delay: 2.2, dur: 6.5 },
        { cls: "right-[19%] top-[32%]", ps: 9, op: 0.48, dx: -10, dy: -14, delay: 2.6, dur: 7.4 },  // 僵尸身后
        { cls: "right-[7%]  top-[45%]", ps: 7, op: 0.42, dx: 7,  dy: -12, delay: 3.1, dur: 6.0 },  // 僵尸身旁
        { cls: "left-[15%] top-[41%]", ps: 7, op: 0.40, dx: -6, dy: -13, delay: 2.9, dur: 6.8 },
        { cls: "right-[32%] top-[13%]", ps: 6, op: 0.38, dx: 6,  dy: -10, delay: 3.4, dur: 5.6 },
        { cls: "left-[27%] top-[61%]", ps: 8, op: 0.42, dx: -8, dy: -15, delay: 3.0, dur: 7.8 },
        { cls: "right-[14%] top-[71%]", ps: 7, op: 0.38, dx: 9,  dy: -12, delay: 3.6, dur: 6.4 },
        { cls: "left-[45%] top-[82%]", ps: 6, op: 0.34, dx: -5, dy: -11, delay: 4.0, dur: 5.9 },
      ].map(({ cls, ps, op, dx, dy, delay, dur }, i) => (
        <motion.div key={i} className={`absolute ${cls} hidden lg:block pointer-events-none`}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, op, op * 0.7, op], y: [0, dy, 4, dy * 0.6, 0], x: [0, dx, dx * -0.6, dx * 0.4, 0] }}
          transition={{ delay, duration: dur, repeat: Infinity, repeatType: "loop", ease: "easeInOut" }}
          style={{ filter: "drop-shadow(0 0 13px rgba(180,210,255,0.26))" }}
        ><PixelGhost ps={ps} /></motion.div>
      ))}

      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ delay: 2.2, duration: 1.2 }}
        className="absolute top-8 right-8 font-mono-plex text-[12px] tracking-[0.26em] text-zinc-400 uppercase hidden sm:block"
      >Est. 2016 — 2022</motion.p>

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
              一座链上灾难博物馆
            </p>
            <p className="font-mono-plex text-[15px] tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.68)" }}>
              AI 验尸官 · 策展人
            </p>
            <p className="font-mono-plex text-[12px] tracking-[0.18em] mt-1" style={{ color: "rgba(255,255,255,0.58)" }}>
              A Dark Museum of On-Chain Disasters
            </p>
            <p className="font-mono-plex text-[11px] tracking-[0.16em]" style={{ color: "rgba(255,255,255,0.54)" }}>
              AI Coroner · Curator
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
              <p className="font-mono-plex text-[12px] tracking-[0.22em] uppercase mt-1" style={{ color: "rgba(255,255,255,0.75)" }}>{label}</p>
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
          style={{ color: "rgba(255,255,255,0.62)" }}
        >
          {cases.length} cases · 2016 – 2022 · ${(totalLost / 1e9).toFixed(2)}B lost
        </motion.p>
      </div>

      {/* ── FUTURE SERVICES ── */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 3.4, duration: 1.2, ease: OUT_EXPO }}
        className="relative z-10 w-full max-w-3xl mx-auto px-6 pb-24 flex flex-col gap-4 mt-6"
      >
        {/* 入坑体检 — 可点击 */}
        <motion.button
          onClick={onCheck}
          whileHover={{ scale: 1.01, y: -2 }}
          whileTap={{ scale: 0.99 }}
          className="relative rounded-2xl p-5 flex items-center justify-between gap-4 w-full text-left group"
          style={{
            background: "linear-gradient(135deg, rgba(52,211,153,0.07), rgba(16,185,129,0.03))",
            border: "1px solid rgba(52,211,153,0.18)",
            boxShadow: "0 0 40px rgba(52,211,153,0.04)",
          }}
        >
          {/* 僵尸踩在卡片上边框线、绿箭头左上方 */}
          <motion.div
            className="hidden lg:block absolute top-0 right-[64px] -translate-y-full pointer-events-none z-10"
            style={{ transformOrigin: "bottom center" }}
            initial={{ y: 18, opacity: 0, rotate: -3 }}
            animate={{ y: 0, opacity: 0.85, rotate: [0, 2, -1.5, 2, 0] }}
            transition={{
              y: { delay: 3.8, duration: 1.1, ease: OUT_BACK },
              opacity: { delay: 3.8, duration: 1.1 },
              rotate: { delay: 4.9, duration: 7, repeat: Infinity, ease: "easeInOut" },
            }}
          >
            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-[54px] h-2.5 rounded-[50%]"
              style={{ background: "radial-gradient(ellipse, rgba(0,0,0,0.45), transparent 70%)", filter: "blur(3px)" }} />
            <div style={{ filter: "drop-shadow(0 0 16px rgba(74,180,70,0.5)) drop-shadow(0 4px 6px rgba(0,0,0,0.6))" }}>
              <PixelZombie ps={8} />
            </div>
          </motion.div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <span className="font-mono-plex text-[11px] tracking-[0.28em] uppercase" style={{ color: "rgba(52,211,153,0.6)" }}>
                现已上线 · Live
              </span>
              <span className="font-mono-plex text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(52,211,153,0.1)", color: "rgba(52,211,153,0.7)", border: "1px solid rgba(52,211,153,0.2)" }}>
                Web3 新手入坑
              </span>
            </div>
            <p className="font-playfair text-[19px]" style={{ color: "rgba(180,255,220,0.8)" }}>
              入坑前，先体检
            </p>
            <p className="font-mono-plex text-[11px] tracking-wider" style={{ color: "rgba(52,211,153,0.55)" }}>
              Project Health Check · AI Risk Screening
            </p>
            <p className="text-[13px] leading-relaxed mt-1" style={{ color: "rgba(180,220,200,0.62)" }}>
              粘贴任意合约地址，AI 验尸官替你排查风险，用最简单的话告诉你该不该入。
            </p>
          </div>
          <div
            className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-transform group-hover:translate-x-1"
            style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: "rgba(52,211,153,0.8)", fontSize: "18px" }}
          >
            →
          </div>
        </motion.button>

        <div className="grid md:grid-cols-2 gap-4">
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
            <span className="font-mono-plex text-[17px] px-3 py-1.5 rounded-full inline-flex flex-col items-center justify-center text-center" style={{ background: "rgba(56,189,248,0.08)", color: "rgba(56,189,248,0.65)", border: "1px solid rgba(56,189,248,0.12)", lineHeight: "1.3" }}>
              🔒<br/>Beta
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
            <span className="font-mono-plex text-[17px] px-3 py-1.5 rounded-full inline-flex flex-col items-center justify-center text-center" style={{ background: "rgba(196,136,42,0.08)", color: "rgba(196,136,42,0.45)", border: "1px solid rgba(196,136,42,0.12)", lineHeight: "1.3" }}>
              5<br/>cases
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
        </div>
      </motion.div>

      <div className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
        style={{ background: "linear-gradient(to top, #070609, transparent)" }} />
    </div>
  );
}
