import Link from "next/link";

import type { PaymentFlow } from "../lib/payment-flows";

const accentStyles = {
  cyan: {
    border: "group-hover:border-cyan-400/40",
    dot: "bg-cyan-400",
    label: "text-cyan-300",
  },
  violet: {
    border: "group-hover:border-violet-400/40",
    dot: "bg-violet-400",
    label: "text-violet-300",
  },
  amber: {
    border: "group-hover:border-amber-400/40",
    dot: "bg-amber-400",
    label: "text-amber-300",
  },
} as const;

interface FlowCardProps {
  readonly flow: PaymentFlow;
  readonly index: number;
}

export function FlowCard({ flow, index }: FlowCardProps) {
  const accent = accentStyles[flow.accent];

  return (
    <article
      className={`group flex min-h-[34rem] flex-col rounded-3xl border border-white/10 bg-white/[0.035] p-6 transition duration-300 hover:-translate-y-1 hover:bg-white/[0.055] ${accent.border}`}
    >
      <div className="flex items-start justify-between gap-4">
        <span className={`font-mono text-xs font-semibold ${accent.label}`}>
          FLOW {String(index + 1).padStart(2, "0")}
        </span>
        <span className="rounded-full border border-white/10 bg-slate-950/60 px-2.5 py-1 text-[0.65rem] font-semibold tracking-wider text-slate-400 uppercase">
          Scaffolded
        </span>
      </div>

      <h2 className="mt-8 text-2xl font-semibold tracking-tight text-white">
        {flow.title}
      </h2>
      <p className="mt-3 min-h-12 text-sm leading-6 text-slate-400">
        {flow.summary}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {flow.providers.map((provider) => (
          <span
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-mono text-[0.7rem] text-slate-300"
            key={provider}
          >
            {provider}
          </span>
        ))}
      </div>

      <ol className="mt-8 flex-1 space-y-5 border-l border-white/10 pl-5">
        {flow.stages.map((stage) => (
          <li className="relative" key={stage.title}>
            <span
              className={`absolute -left-[1.44rem] top-1.5 size-2 rounded-full ring-4 ring-slate-950 ${accent.dot}`}
            />
            <p className="text-sm font-medium text-slate-200">{stage.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {stage.description}
            </p>
          </li>
        ))}
      </ol>

      <Link
        className="mt-8 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        href={`/flows/${flow.slug}`}
      >
        Open flow
        <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}
