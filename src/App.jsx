import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cases } from "./data/cases";
import Landing from "./components/Landing";
import CaseCard from "./components/CaseCard";
import CaseDetail from "./components/CaseDetail";
import AgentConsole from "./components/AgentConsole";
import HealthCheck from "./components/HealthCheck";
import "./App.css";

const TABS = [
  { id: "exhibit",  label: "展品详情" },
  { id: "console",  label: "调查日志",  badge: "AI" },
];

export default function App() {
  const [entered,   setEntered]   = useState(false);
  const [checking,  setChecking]  = useState(false);
  const [activeId,  setActiveId]  = useState(cases[0]?.id ?? null);

  const handleEnter = (id) => {
    if (id) setActiveId(id);
    setEntered(true);
  };

  const handleOpenCase = (id) => {
    if (id) setActiveId(id);
    setChecking(false);
    setEntered(true);
  };
  const [activeTab, setActiveTab] = useState("exhibit");
  const [query, setQuery] = useState("");
  const activeCase = cases.find((c) => c.id === activeId) ?? null;
  const filteredCases = query.trim()
    ? cases.filter((c) =>
        c.name?.toLowerCase().includes(query.toLowerCase()) ||
        c.death_cause?.toLowerCase().includes(query.toLowerCase())
      )
    : cases;
  const mainRef = useRef(null);

  useEffect(() => {
    if (!entered) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [activeId, activeTab, entered]);

  return (
    <div className="min-h-screen bg-[#060608] text-[#e8e4dc]">
      <AnimatePresence mode="wait">
        {checking ? (
          <motion.div
            key="healthcheck"
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <HealthCheck
              onBack={() => setChecking(false)}
              onOpenCase={handleOpenCase}
            />
          </motion.div>
        ) : !entered ? (
          <motion.div
            key="landing"
            exit={{ opacity: 0, scale: 1.02, filter: "blur(12px)" }}
            transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
          >
            <Landing onEnter={handleEnter} onCheck={() => setChecking(true)} />
          </motion.div>
        ) : (
          <motion.div
            key="museum"
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="min-h-screen"
          >
            {/* Top bar */}
            <header className="sticky top-0 z-50 border-b border-white/[0.04] bg-[#060608]/90 backdrop-blur-xl px-6 md:px-10 py-4">
              <div className="mx-auto flex max-w-[1400px] items-center justify-between">
                <button
                  onClick={() => setEntered(false)}
                  className="group flex items-center gap-3"
                >
                  <span
                    className="font-playfair text-lg text-[#e8dcc8] group-hover:text-amber-200 transition-colors"
                    style={{ textShadow: "0 0 40px rgba(200,130,40,0.2)" }}
                  >
                    Digital Pompeii
                  </span>
                  <span className="font-playfair italic text-sm text-amber-700/50 group-hover:text-amber-600/60 transition-colors">
                    数字庞贝
                  </span>
                </button>
                <div className="flex items-center gap-6">
                  <span className="hidden sm:block text-[10px] tracking-[0.25em] text-zinc-400 uppercase font-mono-plex">
                    {cases.length} Exhibits
                  </span>
                  <div className="w-px h-4 bg-zinc-800 hidden sm:block" />
                  <span className="text-[10px] tracking-[0.25em] text-zinc-400 uppercase font-mono-plex">
                    Archive
                  </span>
                </div>
              </div>
            </header>

            <div className="mx-auto flex max-w-[1400px] gap-0 lg:gap-8 px-4 lg:px-10 py-8">

              {/* Sidebar */}
              <aside className="w-full lg:w-[280px] xl:w-[300px] shrink-0 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
                <p className="px-1 text-[10px] tracking-[0.28em] text-zinc-400 uppercase font-mono-plex mb-3">
                  Exhibits · {filteredCases.length}
                </p>
                {/* 搜索框 */}
                <div className="relative mb-4">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-[13px]">⌕</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索展品 / 死因…"
                    className="w-full bg-transparent font-mono-plex text-[12px] text-zinc-300 placeholder-zinc-700 outline-none rounded-lg pl-7 pr-3 py-2 transition-colors"
                    style={{ border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.03)" }}
                    onFocus={(e) => e.target.style.borderColor = "rgba(196,136,42,0.3)"}
                    onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.07)"}
                  />
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-400 text-[11px]"
                    >✕</button>
                  )}
                </div>
                <div className="space-y-2">
                  {filteredCases.length > 0 ? filteredCases.map((c) => (
                    <CaseCard
                      key={c.id}
                      caseData={c}
                      isActive={c.id === activeId}
                      onClick={() => setActiveId(c.id)}
                    />
                  )) : (
                    <p className="px-1 py-4 text-center font-mono-plex text-[11px] text-zinc-400">无匹配展品</p>
                  )}
                </div>
              </aside>

              {/* Main panel */}
              <main ref={mainRef} className="hidden lg:flex flex-col flex-1 min-w-0">
                {/* Tab bar */}
                <div className="flex gap-0 mb-6 border-b border-white/[0.05]">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative px-5 py-3 text-sm transition-colors duration-200 ${
                        activeTab === tab.id
                          ? "text-[#e8dcc8]"
                          : "text-zinc-400 hover:text-zinc-400"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {tab.label}
                        {tab.badge && (
                          <span className="rounded-sm bg-sky-500/15 text-sky-400 text-[10px] px-1.5 py-0.5 font-mono-plex tracking-wider">
                            {tab.badge}
                          </span>
                        )}
                      </span>
                      {activeTab === tab.id && (
                        <motion.div
                          layoutId="tab-indicator"
                          className="absolute bottom-0 left-0 right-0 h-px bg-amber-600/60"
                        />
                      )}
                    </button>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${activeId}-${activeTab}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {activeTab === "exhibit" && <CaseDetail caseData={activeCase} />}
                    {activeTab === "console" && <AgentConsole caseData={activeCase} />}
                  </motion.div>
                </AnimatePresence>
              </main>
            </div>

            {/* Mobile view */}
            <div className="lg:hidden px-4">
              <div className="flex gap-0 mb-4 border-b border-white/[0.05]">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative px-4 py-2.5 text-sm transition-colors ${
                      activeTab === tab.id ? "text-[#e8dcc8]" : "text-zinc-400"
                    }`}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="tab-indicator-mobile"
                        className="absolute bottom-0 left-0 right-0 h-px bg-amber-600/60"
                      />
                    )}
                  </button>
                ))}
              </div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${activeId}-${activeTab}-mobile`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  {activeTab === "exhibit" && <CaseDetail caseData={activeCase} />}
                  {activeTab === "console" && <AgentConsole caseData={activeCase} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
