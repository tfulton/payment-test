import { env } from "../config/env";
import { FlowCard } from "../components/flow-card";
import { paymentFlows } from "../lib/payment-flows";

export default function Home() {
  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1480px]">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-cyan-400 font-mono text-sm font-bold text-slate-950">
              PF
            </span>
            <span className="font-semibold tracking-tight text-white">
              {env.appName}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-400">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            {env.appEnvironment}
          </div>
        </header>

        <section className="pb-10 pt-14 sm:pt-20">
          <p className="font-mono text-xs font-semibold tracking-[0.24em] text-cyan-400 uppercase">
            Integration workbench
          </p>
          <div className="mt-5 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <h1 className="max-w-4xl text-4xl font-semibold tracking-[-0.035em] text-balance text-white sm:text-6xl">
                Three payment paths. One place to compare them.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
                Isolated examples for validating account connection, payment
                orchestration, and provider behavior side by side.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-6 text-sm text-slate-400">
              <span>
                <strong className="mr-1.5 text-2xl font-semibold text-white">
                  {paymentFlows.length}
                </strong>
                flows
              </span>
              <span className="h-8 w-px bg-white/10" />
              <span>
                <strong className="mr-1.5 text-2xl font-semibold text-white">
                  0
                </strong>
                live
              </span>
            </div>
          </div>
        </section>

        <section
          aria-label="Payment flows"
          className="grid gap-5 pb-12 xl:grid-cols-3"
        >
          {paymentFlows.map((flow, index) => (
            <FlowCard flow={flow} index={index} key={flow.slug} />
          ))}
        </section>
      </div>
    </main>
  );
}
