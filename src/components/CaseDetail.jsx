import { cases } from "../data/cases";

const demoCase = cases.find((item) => item.id === "the-dao") ?? cases[0] ?? null;

function formatConfidence(confidence) {
  if (typeof confidence !== "number" || Number.isNaN(confidence)) {
    return { text: "未知", value: 0 };
  }

  const clamped = Math.max(0, Math.min(confidence, 1));
  return {
    text: `${Math.round(clamped * 100)}%`,
    value: clamped * 100,
  };
}

function verdictClass(verdict) {
  if (verdict === "已否定") return "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30";
  if (verdict === "证据不足") return "bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30";
  return "bg-zinc-500/20 text-zinc-300 ring-1 ring-zinc-400/30";
}

export default function CaseDetail({ caseData = demoCase }) {
  if (!caseData) {
    return (
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-8 text-zinc-300">
          暂无可展示的案件数据。
        </div>
      </section>
    );
  }

  const confidence = formatConfidence(caseData.confidence);
  const timeline = Array.isArray(caseData.timeline) ? caseData.timeline : [];
  const evidence = Array.isArray(caseData.evidence) ? caseData.evidence : [];
  const alternatives = Array.isArray(caseData.alternative_hypotheses)
    ? caseData.alternative_hypotheses
    : [];

  return (
    <section className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-zinc-900 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-12">
        <header className="rounded-2xl border border-amber-500/20 bg-zinc-900/80 p-8 shadow-[0_0_80px_rgba(245,158,11,0.08)] backdrop-blur">
          <p className="mb-3 inline-flex rounded-full border border-amber-500/40 bg-amber-400/10 px-3 py-1 text-xs tracking-[0.2em] text-amber-200 uppercase">
            Digital Pompeii Exhibit
          </p>
          <h1 className="text-3xl font-semibold text-amber-100 md:text-4xl">
            {caseData.title ?? "未命名项目"}
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            {caseData.year ?? "未知年份"} · {caseData.chain ?? "未知链"} ·{" "}
            {caseData.category ?? "未分类"}
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <article className="rounded-2xl border border-red-400/20 bg-zinc-900/70 p-6">
            <h2 className="text-sm tracking-[0.18em] text-red-200 uppercase">死因</h2>
            <p className="mt-4 leading-7 text-zinc-200">
              {caseData.death_cause ?? "暂无死因信息"}
            </p>
          </article>

          <article className="rounded-2xl border border-sky-400/20 bg-zinc-900/70 p-6">
            <h2 className="text-sm tracking-[0.18em] text-sky-200 uppercase">置信度</h2>
            <div className="mt-4 flex items-end justify-between">
              <p className="text-4xl font-semibold text-sky-100">{confidence.text}</p>
              <p className="text-xs text-zinc-400">Evidence-backed confidence</p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 to-cyan-300"
                style={{ width: `${confidence.value}%` }}
              />
            </div>
          </article>
        </div>

        <article className="rounded-2xl border border-zinc-700 bg-zinc-900/70 p-6">
          <h2 className="text-xl font-semibold text-zinc-100">时间线</h2>
          <ul className="mt-5 space-y-4">
            {timeline.map((item, index) => (
              <li
                key={`${item.timestamp ?? "time"}-${index}`}
                className="rounded-xl border border-zinc-800 bg-black/30 p-4"
              >
                <p className="text-sm text-amber-200">{item.timestamp ?? "未知时间"}</p>
                <p className="mt-2 text-zinc-200">{item.event ?? "暂无事件描述"}</p>
              </li>
            ))}
            {timeline.length === 0 && <li className="text-zinc-400">暂无时间线数据。</li>}
          </ul>
        </article>

        <article className="rounded-2xl border border-zinc-700 bg-zinc-900/70 p-6">
          <h2 className="text-xl font-semibold text-zinc-100">证据</h2>
          <ul className="mt-5 space-y-4">
            {evidence.map((item, index) => (
              <li
                key={`${item.reference ?? "evidence"}-${index}`}
                className="rounded-xl border border-zinc-800 bg-black/30 p-4"
              >
                <p className="text-zinc-200">{item.description ?? "暂无证据描述"}</p>
                <p className="mt-2 text-sm text-zinc-400">
                  证据来源：{item.reference ?? "未标注"}
                </p>
              </li>
            ))}
            {evidence.length === 0 && <li className="text-zinc-400">暂无证据数据。</li>}
          </ul>
        </article>

        <article className="rounded-2xl border border-zinc-700 bg-zinc-900/70 p-6">
          <h2 className="text-xl font-semibold text-zinc-100">备选假设</h2>
          <ul className="mt-5 space-y-4">
            {alternatives.map((item, index) => (
              <li
                key={`${item.hypothesis ?? "alternative"}-${index}`}
                className="rounded-xl border border-zinc-800 bg-black/30 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="max-w-3xl text-zinc-200">{item.hypothesis ?? "未命名假设"}</p>
                  <span className={`rounded-full px-3 py-1 text-xs ${verdictClass(item.verdict)}`}>
                    {item.verdict ?? "未判定"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-400">
                  原因：{item.reason ?? "暂无说明"}
                </p>
              </li>
            ))}
            {alternatives.length === 0 && <li className="text-zinc-400">暂无备选假设数据。</li>}
          </ul>
        </article>

        <article className="rounded-2xl border border-amber-500/25 bg-zinc-900/80 p-7 text-center">
          <h2 className="text-sm tracking-[0.18em] text-amber-200 uppercase">Epitaph</h2>
          <p className="mt-4 text-lg leading-8 text-amber-100 italic">
            {caseData.epitaph ?? "No epitaph carved yet."}
          </p>
        </article>
      </div>
    </section>
  );
}
