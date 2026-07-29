"use client";

import { useEffect, useState } from "react";

import { PlaidAuthFlow, type PlaidFlowReadyContext } from "./plaid-auth-flow";
import type { DemoEntity } from "./demo-cash-out-shell";

interface Participant {
  demoEntityId: string;
  checkbookUserId: string;
  checkbookUserRef: string;
  status: string;
  wallet: null | { id: string; name: string | null; providerBalanceMinor: number | null; lastSyncedAt: string | null };
  attachedPaymentMethod: null | { id: string; checkbookBankId: string; label: string; mask: string | null; status: string };
}
interface LedgerEntry {
  id: string; bucket: "available" | "reserved" | "paid" | "fees" | "manifestation"; entryType: string; amountMinor: number; reason: string;
  paymentMethodId: string | null; paymentMethodLabel: string | null; paymentMethodMask: string | null;
  paymentMethodProvider: string | null; providerPath: string | null; providerOperationId: string | null; createdAt: string;
}
interface State { entity: DemoEntity; participant: Participant | null; ledgerBalanceMinor: number; expectedWalletBalanceMinor: number; walletVarianceMinor: number | null; ledger: LedgerEntry[]; treasury: null | { id: string; name: string | null; providerBalanceMinor: number | null; lastSyncedAt: string | null }; treasuryUser: null | { checkbookUserId: string; checkbookUserRef: string; status: string }; }

export function CheckbookMarketplaceFlow() {
  const [entities, setEntities] = useState<readonly DemoEntity[]>([]);
  const [selectedId, setSelectedId] = useState("owner1");
  const [state, setState] = useState<State | null>(null);
  const [ready, setReady] = useState<PlaidFlowReadyContext | null>(null);
  const [amount, setAmount] = useState("10000.00");
  const [reason, setReason] = useState("Approved job earnings");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void fetch("/api/demo/entities").then((r) => json<{ entities: DemoEntity[] }>(r)).then((d) => setEntities(d.entities)).catch(showError(setError)); }, []);
  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch(`/api/checkbook/marketplace?demoEntityId=${encodeURIComponent(selectedId)}`);
        const data = await json<State>(response);
        if (active) setState(data);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Request failed");
      }
    }

    void load();
    return () => { active = false; };
  }, [selectedId]);

  const selectEntity = (id: string) => {
    setState(null);
    setReady(null);
    setError(null);
    setSelectedId(id);
  };

  const action = async (name: string, extra: Record<string, unknown> = {}) => {
    setBusy(name); setError(null);
    try {
      const response = await fetch("/api/checkbook/marketplace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: name, demoEntityId: selectedId, ...extra }) });
      setState(await json<State>(response));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Marketplace operation failed"); }
    finally { setBusy(null); }
  };

  return (
    <>
      <section className="mt-8 rounded-2xl border border-violet-300/20 bg-violet-300/[0.045] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="font-mono text-xs font-semibold tracking-wider text-violet-300 uppercase">ISD support console · Sandbox only</p><h2 className="mt-2 text-xl font-semibold text-white">Marketplace participants</h2></div>
          <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 font-mono text-xs text-amber-200">NO PRODUCTION CALLS</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {entities.map((entity) => <button className={`rounded-xl border p-4 text-left ${selectedId === entity.id ? "border-violet-300/60 bg-violet-300/10" : "border-white/10 bg-slate-950/30"}`} key={entity.id} onClick={() => selectEntity(entity.id)} type="button"><span className="block font-semibold text-white">{entity.displayName}</span><span className="mt-1 block font-mono text-xs text-slate-500">{entity.id} · {entity.entityType === "broker" ? "Broker" : "Owner-operator"}</span><span className="mt-2 block break-all font-mono text-[0.7rem] text-violet-200/75">{marketplaceEmail(entity.id)}</span></button>)}
        </div>
      </section>

      {state ? <>
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="ISD available balance" value={usd(state.ledgerBalanceMinor)} note="Canonical immutable ledger" />
          <Metric label="ISD treasury wallet" value={state.treasury?.providerBalanceMinor == null ? "Not available" : usd(state.treasury.providerBalanceMinor)} note={state.treasuryUser?.checkbookUserRef ?? state.treasury?.id ?? "Create the funding wallet"} />
          <Metric label="Checkbook wallet" value={state.participant?.wallet?.providerBalanceMinor == null ? "Not available" : usd(state.participant.wallet.providerBalanceMinor)} note={state.participant?.wallet?.id ?? "Provision user first"} />
          <Metric label="Marketplace identity" value={state.participant ? "Provisioned" : "Not provisioned"} note={state.participant?.checkbookUserRef ?? "No Checkbook user or wallet"} />
        </section>

        <section className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/[0.05] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-xs text-amber-300 uppercase">Marketplace funding source</p><h2 className="mt-2 text-xl font-semibold text-white">ISD treasury wallet</h2></div><button className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-50" disabled={busy !== null} onClick={() => void action("provision_treasury")} type="button">{state.treasury ? "Refresh treasury" : "Create treasury wallet"}</button></div>
          <p className="mt-3 text-sm text-slate-400">This is the Checkbook wallet used to fund Marketplace payouts. Source user: <span className="font-mono text-slate-200">{state.treasuryUser?.checkbookUserRef ?? "Marketplace owner"}</span> · Wallet ID: <span className="font-mono text-slate-200">{state.treasury?.id ?? "not created"}</span></p>
        </section>

        <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-xs text-violet-300 uppercase">Provisioning</p><h2 className="mt-2 text-xl font-semibold text-white">Checkbook user and wallet</h2></div><button className="rounded-xl bg-violet-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50" disabled={busy !== null} onClick={() => void action(state.participant ? "refresh" : "provision")} type="button">{busy ? "Working…" : state.participant ? "Refresh wallet" : "Provision in Sandbox"}</button></div>
          <p className="mt-3 text-sm text-slate-400">The ISD ledger is the user entitlement. The Checkbook wallet is provider-held settlement money; the values are intentionally not conflated.</p>
        </section>

        <section className={`mt-4 rounded-2xl border p-5 sm:p-6 ${state.walletVarianceMinor === 0 ? "border-emerald-300/20 bg-emerald-300/[0.04]" : "border-amber-300/20 bg-amber-300/[0.05]"}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="font-mono text-xs text-amber-300 uppercase">Wallet reconciliation</p><h2 className="mt-2 text-xl font-semibold text-white">ISD ledger ↔ Checkbook wallet</h2></div>
            <button className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40" disabled={!state.participant?.wallet || state.walletVarianceMinor === null || state.walletVarianceMinor >= 0 || busy !== null} onClick={() => void action("sync_wallet")} type="button">Fund wallet {state.walletVarianceMinor !== null && state.walletVarianceMinor < 0 ? usd(-state.walletVarianceMinor) : ""}</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3"><MiniMetric label="Expected backing" value={usd(state.expectedWalletBalanceMinor)} /><MiniMetric label="Actual wallet" value={state.participant?.wallet?.providerBalanceMinor == null ? "Unavailable" : usd(state.participant.wallet.providerBalanceMinor)} /><MiniMetric label="Variance (actual − expected)" value={state.walletVarianceMinor === null ? "Unavailable" : usd(state.walletVarianceMinor)} /></div>
          <p className="mt-3 text-xs leading-5 text-slate-400">Expected backing is available plus reserved funds. A successful payout in Plaid Transfer or Checkbook Standard lowers the target and exposes excess wallet funds here for return-to-treasury reconciliation.</p>
        </section>

        <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <p className="font-mono text-xs text-violet-300 uppercase">Admin balance adjustment</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_auto]"><input className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white" onChange={(event) => setAmount(inputValue(event.currentTarget))} type="number" step="0.01" value={amount} /><input className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white" onChange={(event) => setReason(inputValue(event.currentTarget))} value={reason} /><button className="rounded-xl border border-violet-300/30 bg-violet-300/10 px-4 py-3 text-sm font-semibold text-violet-100 disabled:opacity-50" disabled={busy !== null} onClick={() => void action("adjust", { amount, reason })} type="button">Post adjustment</button></div>
          <p className="mt-2 text-xs text-slate-500">Use a negative amount for a debit. Every adjustment requires a reason and appends a new entry.</p>
        </section>

        <PlaidAuthFlow demoEntityId={selectedId} fixedDirection="receive" onReady={setReady} />
        <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-xs text-violet-300 uppercase">Marketplace payout method</p><h2 className="mt-2 text-xl font-semibold text-white">Attach bank to this Checkbook user</h2></div><button className="rounded-xl bg-violet-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40" disabled={!state.participant || !ready || busy !== null} onClick={() => ready && void action("attach_payment_method", { paymentMethodId: ready.paymentMethodId })} type="button">Attach to Checkbook</button></div>
          {state.participant?.attachedPaymentMethod ? <p className="mt-3 text-sm text-emerald-200">{state.participant.attachedPaymentMethod.label} {state.participant.attachedPaymentMethod.mask ? `•••• ${state.participant.attachedPaymentMethod.mask}` : ""} · {state.participant.attachedPaymentMethod.status}</p> : <p className="mt-3 text-sm text-slate-500">Connect a Plaid account, provision the user, then attach it with that Marketplace user&apos;s credentials.</p>}
        </section>

        <Ledger entries={state.ledger} />
      </> : <p className="mt-8 text-sm text-slate-500">Loading Marketplace state…</p>}
      {error ? <p className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-200">{error}</p> : null}
    </>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><p className="font-mono text-xs text-slate-500 uppercase">{label}</p><p className="mt-2 text-xl font-semibold text-white">{value}</p><p className="mt-2 truncate font-mono text-xs text-slate-500">{note}</p></div>; }
function MiniMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3"><p className="font-mono text-[0.65rem] text-slate-500 uppercase">{label}</p><p className="mt-1 font-semibold text-white">{value}</p></div>; }
function Ledger({ entries }: { entries: LedgerEntry[] }) { return <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6"><p className="font-mono text-xs text-violet-300 uppercase">Canonical immutable ISD ledger</p><h2 className="mt-2 text-xl font-semibold text-white">All payment experiments</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[64rem] text-left text-sm"><thead className="font-mono text-xs text-slate-500 uppercase"><tr><th className="py-3">Date</th><th>Bucket</th><th>Type</th><th>Amount</th><th>Reason</th><th>Payment method</th><th>Provider</th><th>Operation</th></tr></thead><tbody className="divide-y divide-white/10">{entries.map((entry) => <tr key={entry.id}><td className="py-3 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</td><td className="text-slate-400">{entry.bucket}</td><td className="text-slate-300">{entry.entryType.replaceAll("_", " ")}</td><td className={entry.amountMinor > 0 ? "text-emerald-200" : "text-rose-200"}>{entry.amountMinor > 0 ? "+" : ""}{usd(entry.amountMinor)}</td><td className="text-slate-300">{entry.reason}</td><td className="text-slate-400">{entry.paymentMethodLabel ? `${entry.paymentMethodLabel}${entry.paymentMethodMask ? ` •••• ${entry.paymentMethodMask}` : ""}` : "—"}</td><td className="text-slate-400">{entry.providerPath ?? entry.paymentMethodProvider ?? "—"}</td><td className="font-mono text-xs text-slate-500">{entry.providerOperationId ?? "—"}</td></tr>)}</tbody></table>{entries.length === 0 ? <p className="py-5 text-sm text-slate-500">No entries yet.</p> : null}</div></section>; }
async function json<T>(response: Response): Promise<T> { const data = await response.json() as T & { error?: { message?: string } }; if (!response.ok) throw new Error(data.error?.message ?? "Request failed"); return data; }
function showError(setter: (value: string) => void) { return (cause: unknown) => setter(cause instanceof Error ? cause.message : "Request failed"); }
function usd(minor: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(minor / 100); }
function inputValue(target: EventTarget): string { return (target as EventTarget & { readonly value: string }).value; }
function marketplaceEmail(entityId: string): string { return `tfulton+${entityId}@isheepdog.com`; }
