import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  findPaymentFlow,
  paymentFlows,
} from "../../../lib/payment-flows";

interface FlowPageProps {
  readonly params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return paymentFlows.map((flow) => ({ slug: flow.slug }));
}

export async function generateMetadata({
  params,
}: FlowPageProps): Promise<Metadata> {
  const { slug } = await params;
  const flow = findPaymentFlow(slug);

  return flow ? { title: flow.title } : {};
}

export default async function FlowPage({ params }: FlowPageProps) {
  const { slug } = await params;
  const flow = findPaymentFlow(slug);

  if (!flow) {
    notFound();
  }

  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-400"
          href="/"
        >
          <span aria-hidden="true">←</span>
          All payment flows
        </Link>

        <header className="mt-14 border-b border-white/10 pb-10">
          <div className="flex flex-wrap items-center gap-2">
            {flow.providers.map((provider) => (
              <span
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-mono text-xs text-slate-300"
                key={provider}
              >
                {provider}
              </span>
            ))}
          </div>
          <h1 className="mt-7 text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            {flow.title}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-400">
            {flow.summary}
          </p>
        </header>

        <div className="mt-8 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5 text-sm leading-6 text-amber-100/80">
          <strong className="text-amber-200">Implementation boundary:</strong>{" "}
          this route is UI scaffolding only. Vendor SDKs, credentials, API calls,
          and final field mappings are intentionally not wired yet.
        </div>

        <ol className="mt-8 grid gap-4 sm:grid-cols-2">
          {flow.stages.map((stage, index) => (
            <li
              className="rounded-2xl border border-white/10 bg-white/[0.035] p-6"
              key={stage.title}
            >
              <span className="font-mono text-xs text-cyan-400">
                STEP {String(index + 1).padStart(2, "0")}
              </span>
              <h2 className="mt-4 text-lg font-semibold text-white">
                {stage.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {stage.description}
              </p>
              <div className="mt-8 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center font-mono text-xs text-slate-600">
                Integration surface reserved
              </div>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
