import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cases } from "../data/cases";

const ETHERSCAN_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY || "";
const ETHERSCAN_URL = "https://api.etherscan.io/v2/api";

const INOUT_EXPO = [0.87, 0, 0.13, 1];
const OUT_EXPO   = [0.19, 1, 0.22, 1];

// 已知死亡案例快速匹配
const KNOWN_DEAD = cases.map((c) => ({
  id:      c.id,
  name:    c.name,
  address: c.contract_address?.toLowerCase(),
  cause:   c.death_cause,
  loss:    c.money_lost_usd,
}));

async function etherscan(params) {
  const url = new URL(ETHERSCAN_URL);
  Object.entries({ chainid: 1, apikey: ETHERSCAN_KEY, ...params })
    .forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  const json = await res.json();
  return json;
}

async function analyzeContract(address) {
  const addr = address.trim().toLowerCase();

  // 直接命中博物馆案例
  const known = KNOWN_DEAD.find((c) => c.address === addr);

  const steps = [];
  let contractName = null;
  let isVerified   = false;
  let sourceCode   = "";
  let largeOutflows = 0;
  let totalOutflowEth = 0;

  // Step 1: 合约信息
  steps.push({ label: "读取合约信息", status: "loading" });
  try {
    const src = await etherscan({ module: "contract", action: "getsourcecode", address });
    const result = src?.result?.[0];
    if (result && result.ContractName) {
      contractName = result.ContractName;
      isVerified   = result.SourceCode && result.SourceCode.length > 10;
      sourceCode   = result.SourceCode || "";
    }
    steps[0].status = "done";
  } catch {
    steps[0].status = "warn";
  }

  // Step 2: 内部交易大额流出
  steps.push({ label: "扫描链上资金流动", status: "loading" });
  try {
    const [descRes, ascRes] = await Promise.all([
      etherscan({ module: "account", action: "txlistinternal", address, sort: "desc", offset: 50, page: 1 }),
      etherscan({ module: "account", action: "txlistinternal", address, sort: "asc",  offset: 50, page: 1 }),
    ]);
    const allTxs = [
      ...(Array.isArray(descRes?.result) ? descRes.result : []),
      ...(Array.isArray(ascRes?.result)  ? ascRes.result  : []),
    ];
    const seen = new Set();
    const deduped = allTxs.filter((tx) => {
      if (seen.has(tx.hash)) return false;
      seen.add(tx.hash);
      return true;
    });
    const ETH = 1e18;
    const outflows = deduped.filter(
      (tx) => tx.from?.toLowerCase() === addr && Number(tx.value) >= 10 * ETH
    );
    largeOutflows    = outflows.length;
    totalOutflowEth  = outflows.reduce((s, tx) => s + Number(tx.value) / ETH, 0);
    steps[1].status = "done";
  } catch {
    steps[1].status = "warn";
  }

  // Step 3: 代码模式扫描
  steps.push({ label: "扫描已知风险模式", status: "loading" });
  const codeFlags = [];
  if (sourceCode) {
    if (/\.call\.value|\.call{value/.test(sourceCode)) codeFlags.push("reentrancy");
    if (/delegatecall/i.test(sourceCode))             codeFlags.push("delegatecall");
    if (/selfdestruct/i.test(sourceCode))             codeFlags.push("selfdestruct");
    if (/flashloan|flash_loan|FlashLoan/i.test(sourceCode)) codeFlags.push("flashloan");
    if (/onlyOwner|Ownable/i.test(sourceCode))        codeFlags.push("centralized");
  }
  steps[2].status = "done";

  // 风险评分
  let score = 0;
  if (!isVerified)       score += 35;
  if (largeOutflows > 0) score += Math.min(40, largeOutflows * 8);
  if (codeFlags.includes("reentrancy"))  score += 10;
  if (codeFlags.includes("delegatecall") && codeFlags.includes("selfdestruct")) score += 15;
  if (codeFlags.includes("centralized")) score += 5;
  score = Math.min(100, score);

  const riskLevel =
    score >= 60 ? "high" :
    score >= 30 ? "medium" : "low";

  // 相似历史案例
  let similarCase = null;
  if (known) {
    similarCase = known;
  } else if (largeOutflows > 5 && codeFlags.includes("reentrancy")) {
    similarCase = KNOWN_DEAD.find((c) => c.id === "the-dao");
  } else if (codeFlags.includes("delegatecall") && codeFlags.includes("selfdestruct")) {
    similarCase = KNOWN_DEAD.find((c) => c.id === "parity");
  } else if (codeFlags.includes("flashloan")) {
    similarCase = KNOWN_DEAD.find((c) => c.id === "beanstalk");
  }

  // 小白语言 findings
  const findings = [
    {
      ok:    isVerified,
      label: "合约代码是否公开透明",
      pass:  "合约已在区块链上验证，代码完全公开，任何人可以审查",
      fail:  "合约代码未公开，无法验证内部逻辑，这是最常见的跑路前兆",
    },
    {
      ok:    largeOutflows === 0,
      label: "是否存在异常大额资金流出",
      pass:  "未发现异常大额资金流出记录",
      fail:  `发现 ${largeOutflows} 笔大额资金流出，合计约 ${totalOutflowEth.toFixed(0)} ETH，存在资金被抽走迹象`,
    },
    {
      ok:    !codeFlags.includes("reentrancy"),
      label: "代码是否存在重入攻击隐患",
      pass:  "未检测到明显的重入攻击模式",
      fail:  "代码中存在旧版转账写法，历史上曾被黑客反复利用（The DAO 就是这样被盗走 60M 美元）",
    },
    {
      ok:    !(codeFlags.includes("delegatecall") && codeFlags.includes("selfdestruct")),
      label: "是否存在合约自毁风险",
      pass:  "未发现合约自毁相关高危组合",
      fail:  "代码同时包含委托调用和自毁函数，Parity 钱包 2017 年因此冻结 1.5 亿美元永远无法取回",
    },
  ];

  return { contractName, isVerified, largeOutflows, totalOutflowEth, codeFlags, score, riskLevel, findings, similarCase, known, steps };
}

const RISK_CONFIG = {
  high:   { label: "高风险",   color: "#ef4444", bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.3)",   emoji: "☠️" },
  medium: { label: "中风险",   color: "#f97316", bg: "rgba(249,115,22,0.1)",  border: "rgba(249,115,22,0.3)",  emoji: "⚠️" },
  low:    { label: "暂未发现明显风险", color: "#34d399", bg: "rgba(52,211,153,0.08)", border: "rgba(52,211,153,0.25)", emoji: "✓" },
};

const STEPS_LABEL = ["读取合约信息", "扫描链上资金流动", "扫描已知风险模式"];

export default function HealthCheck({ onBack, onOpenCase }) {
  const [input,    setInput]    = useState("");
  const [phase,    setPhase]    = useState("idle"); // idle | loading | result | error
  const [stepIdx,  setStepIdx]  = useState(0);
  const [result,   setResult]   = useState(null);
  const [errMsg,   setErrMsg]   = useState("");

  const run = async () => {
    const addr = input.trim();
    if (!addr) return;
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      setErrMsg("请输入有效的以太坊合约地址（0x 开头，共 42 位）");
      setPhase("error");
      return;
    }
    setPhase("loading");
    setStepIdx(0);
    setErrMsg("");

    // 模拟逐步推进动画
    const tick = (i) => setTimeout(() => setStepIdx(i), i * 1200);
    tick(1); tick(2);

    try {
      const r = await analyzeContract(addr);
      setTimeout(() => {
        setResult(r);
        setPhase("result");
      }, 3800);
    } catch (e) {
      setErrMsg("分析失败：" + e.message);
      setPhase("error");
    }
  };

  const reset = () => {
    setPhase("idle");
    setInput("");
    setResult(null);
    setErrMsg("");
    setStepIdx(0);
  };

  const rc = result ? RISK_CONFIG[result.riskLevel] : null;

  return (
    <div className="min-h-screen bg-[#07060a] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.04] bg-[#07060a]/90 backdrop-blur-xl px-6 py-4">
        <div className="mx-auto flex max-w-[900px] items-center justify-between">
          <button onClick={onBack} className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors text-sm">
            <span>←</span>
            <span className="font-mono-plex tracking-wider">返回博物馆</span>
          </button>
          <div className="font-mono-plex text-[11px] tracking-[0.3em] text-zinc-600 uppercase">
            项目健康检测 · Beta
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center px-4 py-16">
        <div className="w-full max-w-[720px]">

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: INOUT_EXPO }}
            className="text-center mb-14"
          >
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full border border-sky-500/20 bg-sky-500/5">
              <span className="text-sky-400 font-mono-plex text-[11px] tracking-[0.25em] uppercase">Web3 入坑前</span>
            </div>
            <h1 className="font-playfair text-4xl md:text-5xl mb-4" style={{ color: "#e8dcc8", textShadow: "0 0 60px rgba(56,189,248,0.15)" }}>
              先给项目做个体检
            </h1>
            <p className="text-zinc-400 text-lg leading-relaxed max-w-[500px] mx-auto">
              粘贴任意以太坊合约地址<br />
              <span style={{ color: "rgba(255,255,255,0.38)" }}>AI 验尸官替你排查风险，用人话告诉你该不该入</span>
            </p>
          </motion.div>

          {/* Input area */}
          <AnimatePresence mode="wait">
            {phase === "idle" && (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10, scale: 0.97 }}
                transition={{ duration: 0.5, ease: INOUT_EXPO }}
              >
                <div
                  className="rounded-2xl p-6"
                  style={{
                    background: "linear-gradient(145deg, #111018 0%, #0c0b10 100%)",
                    border: "1px solid rgba(56,189,248,0.12)",
                    boxShadow: "0 0 60px rgba(56,189,248,0.04), 0 24px 48px rgba(0,0,0,0.5)",
                  }}
                >
                  <label className="block font-mono-plex text-[11px] tracking-[0.28em] text-zinc-500 uppercase mb-3">
                    合约地址
                  </label>
                  <div className="flex gap-3">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && run()}
                      placeholder="0x..."
                      className="flex-1 bg-transparent font-mono-plex text-sm text-zinc-200 placeholder-zinc-700 outline-none border border-white/[0.07] rounded-xl px-4 py-3 focus:border-sky-500/30 transition-colors"
                    />
                    <button
                      onClick={run}
                      disabled={!input.trim()}
                      className="px-6 py-3 rounded-xl font-mono-plex text-sm tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        background: "linear-gradient(135deg, rgba(56,189,248,0.2), rgba(56,189,248,0.08))",
                        border: "1px solid rgba(56,189,248,0.3)",
                        color: "rgba(56,189,248,0.9)",
                      }}
                    >
                      开始体检 →
                    </button>
                  </div>

                  {/* Example addresses */}
                  <div className="mt-5 pt-5 border-t border-white/[0.05]">
                    <p className="font-mono-plex text-[10px] tracking-[0.25em] text-zinc-600 uppercase mb-3">试试这些历史死亡案例</p>
                    <div className="flex flex-wrap gap-2">
                      {cases.slice(0, 4).map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setInput(c.contract_address)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-mono-plex transition-colors"
                          style={{
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            color: "rgba(255,255,255,0.45)",
                          }}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Loading state */}
            {phase === "loading" && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: OUT_EXPO }}
                className="rounded-2xl p-8"
                style={{
                  background: "linear-gradient(145deg, #111018 0%, #0c0b10 100%)",
                  border: "1px solid rgba(56,189,248,0.12)",
                }}
              >
                <p className="font-mono-plex text-[11px] tracking-[0.3em] text-sky-500/60 uppercase mb-8 text-center">
                  验尸官正在分析中…
                </p>
                <div className="space-y-5">
                  {STEPS_LABEL.map((label, i) => (
                    <motion.div
                      key={i}
                      className="flex items-center gap-4"
                      initial={{ opacity: 0.3 }}
                      animate={{ opacity: stepIdx >= i ? 1 : 0.3 }}
                      transition={{ duration: 0.4 }}
                    >
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-mono-plex"
                        style={{
                          background: stepIdx > i
                            ? "rgba(52,211,153,0.15)"
                            : stepIdx === i
                            ? "rgba(56,189,248,0.12)"
                            : "rgba(255,255,255,0.04)",
                          border: `1px solid ${stepIdx > i ? "rgba(52,211,153,0.4)" : stepIdx === i ? "rgba(56,189,248,0.3)" : "rgba(255,255,255,0.08)"}`,
                          color: stepIdx > i ? "#34d399" : stepIdx === i ? "#38bdf8" : "rgba(255,255,255,0.3)",
                        }}
                      >
                        {stepIdx > i ? "✓" : i + 1}
                      </div>
                      <span className="text-sm" style={{ color: stepIdx >= i ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.3)" }}>
                        {label}
                      </span>
                      {stepIdx === i && (
                        <motion.div
                          className="ml-auto flex gap-1"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          {[0, 1, 2].map((d) => (
                            <motion.div
                              key={d}
                              className="w-1 h-1 rounded-full bg-sky-400"
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 1, repeat: Infinity, delay: d * 0.2 }}
                            />
                          ))}
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Error state */}
            {phase === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-2xl p-6 text-center"
                style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                <p className="text-red-400 mb-4">{errMsg}</p>
                <button onClick={reset} className="text-zinc-400 hover:text-zinc-200 text-sm font-mono-plex transition-colors">
                  ← 重新输入
                </button>
              </motion.div>
            )}

            {/* Results */}
            {phase === "result" && result && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: OUT_EXPO }}
                className="space-y-4"
              >
                {/* Risk level header */}
                <div
                  className="rounded-2xl p-6"
                  style={{
                    background: rc.bg,
                    border: `1px solid ${rc.border}`,
                  }}
                >
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <p className="font-mono-plex text-[11px] tracking-[0.28em] text-zinc-500 uppercase mb-2">
                        {result.contractName || "未知合约"} · 综合风险评级
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{rc.emoji}</span>
                        <span className="font-playfair text-3xl" style={{ color: rc.color }}>
                          {rc.label}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono-plex text-5xl font-bold" style={{ color: rc.color }}>
                        {result.score}
                      </div>
                      <div className="font-mono-plex text-[10px] tracking-[0.2em] text-zinc-600 uppercase">风险分（100分满）</div>
                    </div>
                  </div>
                </div>

                {/* Already in museum? */}
                {result.known && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="rounded-xl px-5 py-4 flex items-center justify-between gap-4"
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
                  >
                    <div>
                      <p className="font-mono-plex text-[11px] tracking-[0.25em] text-red-400/70 uppercase mb-1">⚠ 这是已知的死亡案例</p>
                      <p className="text-sm text-zinc-300">
                        <strong>{result.known.name}</strong> 已在博物馆存档。
                        死因：{result.known.cause}，
                        损失 ${result.known.loss ? (result.known.loss / 1e6).toFixed(0) + "M" : "未知"}
                      </p>
                    </div>
                    <button
                      onClick={() => onOpenCase && onOpenCase(result.known.id)}
                      className="shrink-0 px-4 py-2 rounded-lg font-mono-plex text-[11px] tracking-wider transition-colors"
                      style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
                    >
                      查看档案 →
                    </button>
                  </motion.div>
                )}

                {/* Findings checklist */}
                <div
                  className="rounded-2xl p-6 space-y-4"
                  style={{
                    background: "linear-gradient(145deg, #111018 0%, #0c0b10 100%)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <p className="font-mono-plex text-[11px] tracking-[0.28em] text-zinc-500 uppercase mb-5">体检报告</p>
                  {result.findings.map((f, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + i * 0.08, duration: 0.4, ease: OUT_EXPO }}
                      className="flex gap-4"
                    >
                      <div
                        className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[11px]"
                        style={{
                          background: f.ok ? "rgba(52,211,153,0.12)" : "rgba(239,68,68,0.12)",
                          border: `1px solid ${f.ok ? "rgba(52,211,153,0.35)" : "rgba(239,68,68,0.35)"}`,
                          color: f.ok ? "#34d399" : "#f87171",
                        }}
                      >
                        {f.ok ? "✓" : "✗"}
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-0.5" style={{ color: f.ok ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.85)" }}>
                          {f.label}
                        </p>
                        <p className="text-[13px] leading-relaxed" style={{ color: f.ok ? "rgba(255,255,255,0.42)" : "rgba(239,68,68,0.75)" }}>
                          {f.ok ? f.pass : f.fail}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Similar case */}
                {result.similarCase && !result.known && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="rounded-xl px-5 py-4"
                    style={{ background: "rgba(196,136,42,0.07)", border: "1px solid rgba(196,136,42,0.2)" }}
                  >
                    <p className="font-mono-plex text-[11px] tracking-[0.25em] text-amber-500/60 uppercase mb-2">🔍 相似历史案例</p>
                    <p className="text-sm text-zinc-300">
                      该合约的风险特征与 <strong className="text-amber-400">{result.similarCase.name}</strong> 相似，
                      后者于 {result.similarCase.cause?.match(/\d{4}/)?.[0] || "历史上"} 因{result.similarCase.cause}
                      损失 ${result.similarCase.loss ? (result.similarCase.loss / 1e6).toFixed(0) + "M" : "巨额资金"}。
                    </p>
                    <button
                      onClick={() => onOpenCase && onOpenCase(result.similarCase.id)}
                      className="mt-3 text-[11px] font-mono-plex tracking-wider text-amber-500/70 hover:text-amber-400 transition-colors"
                    >
                      了解它是怎么死的 →
                    </button>
                  </motion.div>
                )}

                {/* Low risk message */}
                {result.riskLevel === "low" && !result.known && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="rounded-xl px-5 py-4 text-center"
                    style={{ background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.15)" }}
                  >
                    <p className="text-sm" style={{ color: "rgba(52,211,153,0.7)" }}>
                      暂未发现高危信号，但区块链世界风险永远存在。<br />
                      <span style={{ color: "rgba(255,255,255,0.35)" }}>不构成投资建议，请自行做更多研究（DYOR）。</span>
                    </p>
                  </motion.div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={reset}
                    className="flex-1 py-3 rounded-xl font-mono-plex text-sm tracking-wider text-zinc-400 hover:text-zinc-200 transition-colors"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    ← 检测另一个项目
                  </button>
                  <button
                    onClick={onBack}
                    className="flex-1 py-3 rounded-xl font-mono-plex text-sm tracking-wider transition-colors"
                    style={{ background: "rgba(196,136,42,0.1)", border: "1px solid rgba(196,136,42,0.25)", color: "rgba(196,136,42,0.85)" }}
                  >
                    进入死亡博物馆 →
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Disclaimer */}
          {phase === "idle" && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-center font-mono-plex text-[11px] tracking-wider mt-8"
              style={{ color: "rgba(255,255,255,0.2)" }}
            >
              仅供参考，不构成投资建议 · 数据来源：Etherscan · Digital Pompeii
            </motion.p>
          )}
        </div>
      </div>
    </div>
  );
}
