import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import runsIndex from "../data/runs_index.json";
import { PixelCoroner, PixelMagnify } from "./PixelIcons";

function fmtTs(ts) {
  const m = ts?.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : ts ?? "";
}

function ConfBar({ value }) {
  const pct = Math.round(Math.max(0, Math.min(value ?? 0, 1)) * 100);
  const color = pct >= 80 ? "#34d399" : pct >= 60 ? "#38bdf8" : pct >= 40 ? "#f59e0b" : "#f87171";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-20 h-1 rounded-full bg-zinc-800 overflow-hidden inline-block">
        <motion.span
          className="h-full rounded-full block"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </span>
      <span className="font-mono-plex text-[15px] text-zinc-400">{pct}%</span>
    </span>
  );
}

const TOOL_META = {
  get_contract_source: { label: "读取合约源码", color: "text-violet-400" },
  get_transactions:    { label: "获取链上交易", color: "text-sky-400" },
  get_internal_txs:    { label: "获取内部交易", color: "text-sky-400" },
  get_abi:             { label: "解析 ABI",      color: "text-emerald-400" },
  analyze_code:        { label: "分析代码漏洞",  color: "text-red-400" },
};

function ToolCallEvent({ event, totalRounds }) {
  const [open, setOpen] = useState(false);
  const m = TOOL_META[event.tool] ?? { label: event.tool, color: "text-zinc-400" };
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="font-mono-plex text-[13px] text-zinc-400 mt-0.5 shrink-0 w-[88px] leading-tight">
          ROUND {event.round ?? "—"}
          {totalRounds ? <span className="block text-[11px] text-zinc-500">第 {event.round} / {totalRounds} 轮</span> : null}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-mono-plex text-[15px] ${m.color}`}>{event.tool}</span>
            <span className="text-[15px] text-zinc-400">{m.label}</span>
          </div>
          {event.reasoning && (
            <p className="mt-1 text-[14px] text-zinc-400 line-clamp-1 leading-5">{event.reasoning}</p>
          )}
        </div>
        <span className="text-zinc-400 text-[14px] shrink-0 mt-1">{open ? "▲" : "▼"}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.04] px-4 py-4 space-y-3">
              {event.reasoning && (
                <div>
                  <p className="text-[14px] text-zinc-400 uppercase tracking-widest mb-1.5 font-mono-plex">Reasoning</p>
                  <p className="text-[14px] text-zinc-400 leading-6">{event.reasoning}</p>
                </div>
              )}
              {event.args && (
                <div>
                  <p className="text-[14px] text-zinc-400 uppercase tracking-widest mb-1.5 font-mono-plex">Args</p>
                  <pre className="text-[15px] text-zinc-400 font-mono-plex bg-black/30 rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(event.args, null, 2)}
                  </pre>
                </div>
              )}
              {event.result_summary && (
                <div>
                  <p className="text-[14px] text-zinc-400 uppercase tracking-widest mb-1.5 font-mono-plex">Result</p>
                  <pre className="text-[15px] text-zinc-400 font-mono-plex bg-black/30 rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(event.result_summary, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const HYPO_META = {
  proposed:  { label: "↗ 提出假设",  color: "text-sky-400",     dot: "bg-sky-400" },
  updated:   { label: "↕ 更新证据强度",  color: "text-amber-400",   dot: "bg-amber-400" },
  revised:   { label: "↻ 修正假设",  color: "text-orange-400",  dot: "bg-orange-400" },
  confirmed: { label: "✓ 假设确认",  color: "text-emerald-400", dot: "bg-emerald-400" },
};

function HypothesisEvent({ event }) {
  const m = HYPO_META[event.event] ?? { label: event.event, color: "text-zinc-400", dot: "bg-zinc-600" };
  return (
    <div className="rounded-xl border border-white/[0.04] bg-white/[0.015] px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${m.dot}`} />
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[15px] font-mono-plex ${m.color}`}>{m.label}</span>
            <span className="text-[14px] text-zinc-300">{event.hypothesis}</span>
          </div>
          {event.confidence != null && (
            <div className="flex items-center gap-2 text-[15px] text-zinc-400">
              证据强度 <ConfBar value={event.confidence} />
            </div>
          )}
          {event.confidence_before != null && event.confidence_after != null && (
            <span className="font-mono-plex text-[15px] text-zinc-400">
              {Math.round(event.confidence_before * 100)}% → {Math.round(event.confidence_after * 100)}%
            </span>
          )}
          {event.reason && (
            <p className="text-[14px] text-zinc-400 leading-5">{event.reason}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SynthesisEvent({ event, caseData }) {
  const cause = caseData?.death_cause ?? event.final_cause ?? event.death_cause ?? event.exhibit?.death_cause ?? "—";
  const conf = caseData?.confidence ?? event.confidence ?? event.final_confidence ?? event.exhibit?.confidence;
  return (
    <div className="relative rounded-2xl border border-amber-600/20 overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(180,100,30,0.08), transparent 70%)" }}
      />
      <div className="relative px-5 py-5">
        <p className="text-[14px] tracking-[0.25em] text-amber-700/60 uppercase font-mono-plex mb-3">
          最终裁决 · Final Verdict
        </p>
        <p className="font-playfair text-[#e8dcc8] text-lg leading-7">{cause}</p>
        {conf != null && (
          <div className="mt-3 flex items-center gap-2 text-[15px] text-zinc-400">
            证据强度 <ConfBar value={conf} />
          </div>
        )}
        {event.summary && (
          <p className="mt-4 text-[14px] text-zinc-400 leading-6 border-t border-white/[0.04] pt-4">
            {event.summary}
          </p>
        )}
      </div>
    </div>
  );
}

function RunStartEvent({ event }) {
  return (
    <div className="rounded-xl border border-white/[0.03] px-4 py-3">
      <p className="font-mono-plex text-[15px] text-zinc-400">
        <span className="text-emerald-500/70 mr-2">▶ INIT</span>
        {event.contract_address}
      </p>
    </div>
  );
}

function EventCard({ event, index, caseData, totalRounds }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex gap-3">
        <div className="flex flex-col items-center pt-1">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${event.type === "synthesis" ? "bg-amber-500" : event.type === "hypothesis_event" ? "bg-sky-500/60" : "bg-zinc-700"}`} />
          <div className="w-px flex-1 bg-zinc-900 mt-1" />
        </div>
        <div className="flex-1 pb-4 min-w-0">
          {event.type === "run_start"       && <RunStartEvent event={event} />}
          {event.type === "tool_call"        && <ToolCallEvent event={event} totalRounds={totalRounds} />}
          {event.type === "hypothesis_event" && <HypothesisEvent event={event} />}
          {event.type === "synthesis"        && <SynthesisEvent event={event} caseData={caseData} />}
        </div>
      </div>
    </motion.div>
  );
}

export default function AgentConsole({ caseData }) {
  const [selectedRunIdx, setSelectedRunIdx] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef(null);

  const addr = (caseData?.contract_address ?? "").toLowerCase();
  const runs = runsIndex[addr] ?? [];

  const run = runs[selectedRunIdx];
  const events = run?.events ?? [];
  const totalRounds = events.reduce((m, e) => (e.type === "tool_call" && (e.round ?? 0) > m ? e.round : m), 0);

  // Reset when run changes
  useEffect(() => {
    setVisibleCount(0);
    setPlaying(false);
    clearInterval(intervalRef.current);
  }, [selectedRunIdx, addr]);

  // Playback
  useEffect(() => {
    if (!playing) return;
    if (visibleCount >= events.length) {
      setPlaying(false);
      return;
    }
    intervalRef.current = setInterval(() => {
      setVisibleCount(c => {
        if (c >= events.length) { setPlaying(false); return c; }
        return c + 1;
      });
    }, 500);
    return () => clearInterval(intervalRef.current);
  }, [playing, visibleCount, events.length]);

  const handlePlay = () => {
    if (visibleCount >= events.length) {
      setVisibleCount(0);
      setTimeout(() => setPlaying(true), 50);
    } else {
      setPlaying(true);
    }
  };

  if (!caseData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-zinc-400 text-sm font-mono-plex tracking-widest uppercase">Select an exhibit</p>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-zinc-400 text-sm font-mono-plex">No investigation logs found.</p>
      </div>
    );
  }

  const shownEvents = events.slice(0, visibleCount);
  const visibleRounds = shownEvents.filter(e => e.type === "tool_call").length;
  const progress = totalRounds > 0 ? visibleRounds / totalRounds : 0;

  return (
    <article className="max-w-3xl pb-24 space-y-8">

      {/* Header */}
      <header className="space-y-3">
        <div className="flex items-center gap-3">
          <PixelCoroner ps={3} style={{ opacity: 0.7, filter: "drop-shadow(0 0 8px rgba(200,180,140,0.2))" }} />
          <div>
            <p className="text-[14px] tracking-[0.3em] text-zinc-400 uppercase font-mono-plex">
              Agent Investigation Console
            </p>
            <h2 className="font-playfair text-2xl text-[#e8dcc8]">{caseData.name ?? caseData.id}</h2>
          </div>
        </div>
        <p className="font-mono-plex text-[15px] text-zinc-400 break-all">{caseData.contract_address}</p>
        <div className="h-px bg-white/[0.04]" />
      </header>

      {/* AI coroner title */}
      <div className="rounded-xl px-5 py-4 flex items-center gap-4"
        style={{
          background: "linear-gradient(135deg, rgba(16,32,20,0.6), rgba(8,14,10,0.4))",
          border: "1px solid rgba(52,211,153,0.1)",
        }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ background: "#34d399", boxShadow: "0 0 8px #34d399" }}
            animate={{ opacity: playing ? [1, 0.2, 1] : 1 }}
            transition={{ duration: 1.2, repeat: playing ? Infinity : 0 }}
          />
          <p className="font-mono-plex text-[15px] tracking-[0.28em] uppercase" style={{ color: "rgba(52,211,153,0.75)" }}>
            {playing ? "AI 验尸中……" : "AI 验尸官 · 调查档案"}
          </p>
        </div>
        <div className="h-px flex-1" style={{ background: "rgba(52,211,153,0.08)" }} />
        <span className="font-mono-plex text-[14px] shrink-0" style={{ color: "rgba(52,211,153,0.3)" }}>
          {events.length} events
        </span>
      </div>

      {/* Run selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[14px] text-zinc-400 uppercase tracking-widest font-mono-plex">
          Runs ({runs.length})
        </span>
        <div className="flex gap-1.5 flex-wrap">
          {runs.map((r, i) => (
            <button
              key={r.file}
              onClick={() => setSelectedRunIdx(i)}
              className={`rounded-lg px-3 py-1.5 text-[15px] font-mono-plex transition-all ${
                i === selectedRunIdx
                  ? "bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20"
                  : "bg-white/[0.02] text-zinc-400 hover:text-zinc-400 border border-white/[0.04]"
              }`}
            >
              {fmtTs(r.timestamp)}
            </button>
          ))}
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={handlePlay}
          disabled={playing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/[0.06] bg-white/[0.03] text-sm text-zinc-300 hover:text-zinc-100 hover:border-white/[0.1] transition-all disabled:opacity-40"
        >
          <span className="text-emerald-400 text-[14px]">{playing ? "▶ ..." : visibleCount >= events.length && visibleCount > 0 ? "↺ 重播" : "▶ 播放"}</span>
          <span className="text-[14px]">{playing ? "调查中..." : visibleCount >= events.length && visibleCount > 0 ? "Replay" : "Play Investigation"}</span>
        </button>
        <button
          onClick={() => { setVisibleCount(events.length); setPlaying(false); }}
          className="text-[15px] text-zinc-400 hover:text-zinc-400 transition-colors font-mono-plex"
        >
          全部展开
        </button>
        {visibleCount > 0 && (
          <button
            onClick={() => { setVisibleCount(0); setPlaying(false); }}
            className="text-[15px] text-zinc-400 hover:text-zinc-400 transition-colors font-mono-plex"
          >
            重置
          </button>
        )}

        {/* Progress bar */}
        <div className="flex-1 h-px bg-zinc-900 rounded-full overflow-hidden max-w-[160px]">
          <motion.div
            className="h-full bg-emerald-500/40 rounded-full"
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <span className="font-mono-plex text-[14px] text-zinc-400">{visibleRounds}/{totalRounds}</span>
      </div>

      {/* Death report title after playback */}
      <AnimatePresence>
        {visibleCount >= events.length && visibleCount > 0 && !playing && (
          <motion.div
            key="death-report"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.9, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-center py-6"
          >
            <p className="font-mono-plex" style={{
              fontSize: "clamp(0.85rem, 2vw, 1.05rem)",
              color: "rgba(52,211,153,0.6)",
              textShadow: "0 0 30px rgba(52,211,153,0.15)",
              letterSpacing: "0.28em",
            }}>
              《死亡尸检报告》
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Event timeline */}
      {visibleCount === 0 ? (
        <div className="rounded-2xl border border-white/[0.03] py-16 text-center">
          <p className="font-mono-plex text-[15px] text-zinc-400 tracking-widest uppercase">
            Press Play to replay the investigation
          </p>
        </div>
      ) : (
        <div className="space-y-0">
          <AnimatePresence initial={false}>
            {shownEvents.map((event, i) => (
              <EventCard key={`${selectedRunIdx}-${i}`} event={event} index={i} caseData={caseData} totalRounds={totalRounds} />
            ))}
          </AnimatePresence>
          {visibleCount >= events.length && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex gap-3"
            >
              <div className="flex flex-col items-center pt-1">
                <div className="w-2.5 h-2.5 rounded-full border border-zinc-700 bg-[#060608]" />
              </div>
              <p className="pb-4 text-[15px] font-mono-plex text-zinc-400">Investigation complete.</p>
            </motion.div>
          )}
        </div>
      )}

    </article>
  );
}
