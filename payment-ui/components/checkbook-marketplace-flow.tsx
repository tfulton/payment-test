"use client";

import { useEffect, useState } from "react";

import { PlaidAuthFlow, type PlaidFlowReadyContext } from "./plaid-auth-flow";
import { isCashOutAmountValid, type DemoEntity } from "./demo-cash-out-shell";

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
interface CashOutHistoryEntry { id: string; providerPath: string; amountMinor: number; currency: string; status: string; providerStatus: string | null; providerExternalId: string | null; paymentMethodLabel: string | null; paymentMethodMask: string | null; requestedNetwork: string | null; effectiveNetwork: string | null; createdAt: string; updatedAt: string; }
interface State { entity: DemoEntity; participant: Participant | null; ledgerBalanceMinor: number; expectedWalletBalanceMinor: number; walletVarianceMinor: number | null; ledger: LedgerEntry[]; cashOuts: CashOutHistoryEntry[]; treasury: null | { id: string; name: string | null; providerBalanceMinor: number | null; lastSyncedAt: string | null }; treasuryUser: null | { checkbookUserId: string; checkbookUserRef: string; status: string }; }
interface CashOutResult { cashOut: { id: string; status: string }; payment: { walletFunding: { id: string; status: string } | null; walletReversal: { id: string; status: string } | null; bankPayout: { id: string; status: string } }; state: State; }

export function CheckbookMarketplaceFlow() {
  const [entities, setEntities] = useState<readonly DemoEntity[]>([]);
  const [selectedId, setSelectedId] = useState("owner1");
  const [state, setState] = useState<State | null>(null);
  const [ready, setReady] = useState<PlaidFlowReadyContext | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cashOutKey, setCashOutKey] = useState<string | null>(null);
  const [cashOutResult, setCashOutResult] = useState<CashOutResult | null>(null);

  useEffect(() => { void fetch("/api/demo/entities").then((r) => json<{ entities: DemoEntity[] }>(r)).then((d) => setEntities(d.entities)).catch(showError(setError)); }, []);
  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch(`/api/checkbook/marketplace?demoEntityId=${encodeURIComponent(selectedId)}`);
        let data = await json<State>(response);
        if (data.treasury && data.participant?.wallet) {
          const refreshResponse = await fetch("/api/checkbook/marketplace", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "refresh_provider_state", demoEntityId: selectedId }),
          });
          data = await json<State>(refreshResponse);
        }
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
    setNotice(null);
    setCashOutKey(null);
    setCashOutResult(null);
    setSelectedId(id);
  };

  const submitCashOut = async () => {
    const paymentMethodId = state?.participant?.attachedPaymentMethod?.id;
    if (!state || !paymentMethodId) return;
    const idempotencyKey = cashOutKey ?? crypto.randomUUID();
    setCashOutKey(idempotencyKey);
    setBusy("cash_out");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/checkbook/marketplace/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demoEntityId: selectedId, paymentMethodId, amount, idempotencyKey }),
      });
      const result = await json<CashOutResult>(response);
      setCashOutResult(result);
      setState(result.state);
      setCashOutKey(null);
      setAmount("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Marketplace cash-out failed");
    } finally {
      setBusy(null);
    }
  };

  const refreshCashOutStatus = async (cashOutId: string) => {
    setBusy(`status:${cashOutId}`);
    setError(null);
    try {
      const response = await fetch(`/api/checkbook/marketplace/payments/${encodeURIComponent(cashOutId)}/status`, { method: "POST" });
      const data = await json<{ state: State }>(response);
      setState(data.state);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh payment status");
    } finally {
      setBusy(null);
    }
  };

  const completeCashOutSandbox = async (cashOutId: string) => {
    setBusy(`complete:${cashOutId}`);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/checkbook/marketplace/payments/${encodeURIComponent(cashOutId)}/complete`, { method: "POST" });
      const data = await json<{ result: { providerStatus: string; normalizedStatus: string }; state: State }>(response);
      setState(data.state);
      setNotice(`Sandbox settlement confirmed: Checkbook reports ${data.result.providerStatus} and the ISD ledger posted the cash-out.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete Sandbox payment");
    } finally {
      setBusy(null);
    }
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
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6">
          <p className="font-mono text-xs font-semibold tracking-wider text-slate-500 uppercase">Selected participant overview</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.08] p-5 shadow-[inset_0_1px_0_rgba(253,224,71,0.08)]">
              <p className="font-mono text-xs text-amber-300 uppercase">ISD treasury wallet</p>
              <p className="mt-2 text-xl font-semibold text-white">{state.treasury?.providerBalanceMinor == null ? "Not available" : usd(state.treasury.providerBalanceMinor)}</p>
              <p className="mt-2 truncate font-mono text-xs text-amber-100/65">{state.treasuryUser?.checkbookUserRef ?? "Marketplace owner"}</p>
              <p className="mt-1 truncate font-mono text-[0.65rem] text-slate-500">{state.treasury?.id ?? "No treasury wallet"}</p>
              <button className="mt-4 w-full rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50" disabled={busy !== null} onClick={() => void action(state.treasury ? "refresh_provider_state" : "provision_treasury")} type="button">{state.treasury ? "Refresh CBIO balance" : "Create treasury wallet"}</button>
              <p className="mt-2 font-mono text-[0.65rem] leading-4 text-amber-200/60">Provider balance {providerFreshness(state.treasury?.lastSyncedAt)}</p>
            </div>
            <Metric label="ISD user 'available to withdraw'" value={usd(state.ledgerBalanceMinor)} note="Canonical immutable ledger" />
            <Metric label="Participant wallet" value={state.participant?.wallet?.providerBalanceMinor == null ? "Not available" : usd(state.participant.wallet.providerBalanceMinor)} note={state.participant?.wallet ? "Not used for direct cash-out" : "Provision user first"} />
            <Metric label="Marketplace identity" value={state.participant ? "Provisioned" : "Not provisioned"} note={state.participant?.checkbookUserRef ?? "No Checkbook user or wallet"} />
          </div>
        </section>

        <PlaidAuthFlow demoEntityId={selectedId} fixedDirection="receive" onReady={setReady} />
        <MarketplaceCashOutCard amount={amount} busy={busy} cashOutResult={cashOutResult} isRetry={cashOutKey !== null} onAction={action} onAmountChange={setAmount} onSubmit={submitCashOut} plaidContext={ready} state={state} />
        <MarketplaceCashOutHistory busy={busy} notice={notice} onComplete={completeCashOutSandbox} onRefresh={refreshCashOutStatus} state={state} />

        <Ledger entries={state.ledger} />
      </> : <p className="mt-8 text-sm text-slate-500">Loading Marketplace state…</p>}
      {error ? <p className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-200">{error}</p> : null}
    </>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"><p className="font-mono text-xs text-slate-500 uppercase">{label}</p><p className="mt-2 text-xl font-semibold text-white">{value}</p><p className="mt-2 truncate font-mono text-xs text-slate-500">{note}</p></div>; }
function MiniMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3"><p className="font-mono text-[0.65rem] text-slate-500 uppercase">{label}</p><p className="mt-1 font-semibold text-white">{value}</p></div>; }
function MarketplaceCashOutCard({ amount, busy, cashOutResult, isRetry, onAction, onAmountChange, onSubmit, plaidContext, state }: { amount: string; busy: string | null; cashOutResult: CashOutResult | null; isRetry: boolean; onAction: (name: string, extra?: Record<string, unknown>) => Promise<void>; onAmountChange: (value: string) => void; onSubmit: () => Promise<void>; plaidContext: PlaidFlowReadyContext | null; state: State }) {
  const amountReady = isCashOutAmountValid(amount, state.ledgerBalanceMinor);
  const amountEntered = amount.trim().length > 0;
  const attached = state.participant?.attachedPaymentMethod;
  const walletBalance = state.participant?.wallet?.providerBalanceMinor;
  const treasuryBalance = state.treasury?.providerBalanceMinor;
  const treasuryReady = treasuryBalance != null && treasuryBalance > 0;
  const setupBlockers = marketplacePayoutBlockers(state, isRetry);
  const amountMinor = usdInputMinor(amount);
  const treasuryCoversAmount = amountMinor !== null && treasuryBalance != null && treasuryBalance >= amountMinor;
  const canSubmit = amountReady && setupBlockers.length === 0 && treasuryCoversAmount && busy === null;
  return <section className="mt-8 rounded-2xl border border-violet-300/20 bg-violet-300/[0.045] p-5 sm:p-6">
    <p className="font-mono text-xs font-semibold tracking-wider text-violet-300 uppercase">Checkbook Marketplace cash-out</p>
    <h2 className="mt-2 text-xl font-semibold text-white">Cash out to the linked bank</h2>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Pays {state.entity.displayName} directly from the ISD Checkbook treasury to the bank connected once through Plaid Auth—without Checkbook&apos;s email deposit flow.</p>
    <div className="mt-6 grid gap-4">
      <label className="grid max-w-sm gap-2 text-sm text-slate-300">Custom cash-out amount (USD)
        <input aria-invalid={amount ? !amountReady : undefined} className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-lg font-semibold text-white outline-none transition focus:border-violet-300/50" inputMode="decimal" max={(state.ledgerBalanceMinor / 100).toFixed(2)} min="0.01" onChange={(event) => onAmountChange(inputValue(event.currentTarget))} placeholder="1000.00" step="0.01" type="number" value={amount} />
        <span className="text-xs text-slate-500">Maximum {usd(state.ledgerBalanceMinor)} available to withdraw</span>
        {amount && !amountReady ? <span className="text-xs text-rose-200">Enter an amount from $0.01 through {usd(state.ledgerBalanceMinor)}.</span> : null}
      </label>
      <div className="grid gap-3 rounded-xl border border-white/10 bg-slate-950/30 p-4 sm:grid-cols-3">
        <MiniMetric label="Rail" value="ACH" />
        <MiniMetric label="Funding" value="Treasury → linked bank" />
        <MiniMetric label="Destination" value={attached ? `${attached.label}${attached.mask ? ` •••• ${attached.mask}` : ""}` : "Bank not attached"} />
      </div>
      <div className="rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm">
        <p className={plaidContext ? "text-emerald-200" : "text-slate-400"}>{plaidContext ? "✓ Payout account connected through Plaid" : "○ Connect a payout account above"}</p>
        <p className={attached?.status === "VERIFIED" ? "mt-1 text-emerald-200" : "mt-1 text-amber-200"}>{attached?.status === "VERIFIED" ? "✓ Bank attached to this Marketplace user" : "○ Attach the payout account to Checkbook"}</p>
        <p className={treasuryReady ? "mt-1 text-emerald-200" : "mt-1 text-amber-200"}>{treasuryReady ? `✓ ${usd(treasuryBalance)} treasury capacity; direct payout on demand` : "○ Refresh or fund the ISD treasury"}</p>
        <p className="mt-1 text-slate-400">Current participant wallet: {walletBalance == null ? "unavailable" : usd(walletBalance)}; not used for new cash-outs</p>
        <p className={amountReady || (!amountEntered && cashOutResult) ? "mt-1 text-emerald-200" : amountEntered ? "mt-1 text-rose-200" : "mt-1 text-slate-400"}>
          {amountReady
            ? `✓ Custom cash-out amount: $${amount}`
            : !amountEntered && cashOutResult
              ? "✓ Cash-out submitted. Enter another amount when ready."
              : amountEntered
                ? "○ Enter an amount within the available balance, using at most two decimal places."
                : "○ Enter a custom cash-out amount."}
        </p>
      </div>
      {!attached && plaidContext ? <button className="w-fit rounded-xl border border-violet-300/30 bg-violet-300/10 px-4 py-3 text-sm font-semibold text-violet-100 disabled:opacity-50" disabled={busy !== null} onClick={() => void onAction("attach_payment_method", { paymentMethodId: plaidContext.paymentMethodId })} type="button">{busy === "attach_payment_method" ? "Attaching payout account…" : "Attach payout account to Checkbook"}</button> : null}
      <button className="w-fit rounded-xl bg-violet-300 px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50" disabled={!canSubmit} onClick={() => void onSubmit()} type="button">{busy === "cash_out" ? "Submitting Sandbox cash-out…" : !amountReady ? "Enter a cash-out amount" : setupBlockers.length > 0 ? "Complete cash-out setup" : !treasuryCoversAmount ? "Insufficient treasury balance" : isRetry ? "Resume held Marketplace cash-out" : "Cash out with Checkbook Marketplace"}</button>
      <p className="text-xs leading-5 text-slate-500">Sandbox command: reserve the exact custom amount in the ISD ledger, then pay it directly from the treasury wallet to the persisted bank account.</p>
      {cashOutResult ? <div aria-live="polite" className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-emerald-100" role="status"><p className="font-semibold">Cash-out submitted</p>{cashOutResult.payment.walletReversal ? <p className="mt-1">Staging reversal: {cashOutResult.payment.walletReversal.status} · <span className="font-mono text-xs">{cashOutResult.payment.walletReversal.id}</span></p> : null}<p className="mt-1">Bank payout: {cashOutResult.payment.bankPayout.status} · <span className="font-mono text-xs">{cashOutResult.payment.bankPayout.id}</span></p></div> : null}
    </div>
  </section>;
}
function MarketplaceCashOutHistory({ busy, notice, onComplete, onRefresh, state }: { busy: string | null; notice: string | null; onComplete: (cashOutId: string) => Promise<void>; onRefresh: (cashOutId: string) => Promise<void>; state: State }) {
  const cashOuts = (state.cashOuts ?? []).filter((cashOut) => cashOut.providerPath === "checkbook_marketplace");
  return <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
    <p className="font-mono text-xs text-violet-300 uppercase">Checkbook Marketplace history</p>
    <h2 className="mt-2 text-xl font-semibold text-white">Cash-out status</h2>
    <p className="mt-2 text-sm text-slate-400">Provider status is refreshed under the treasury sender&apos;s Marketplace credentials. ISD funds remain reserved until Checkbook reports PAID.</p>
    <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.07] px-4 py-3 text-xs leading-5 text-amber-100/80"><span className="font-semibold text-amber-100">Sandbox settlement step:</span> Checkbook leaves autodeposit payments IN_PROCESS indefinitely. Use the simulation action after submission to ask Checkbook Sandbox to report PAID; the POC then reads that status before posting the ISD ledger.</p>
    {notice ? <p className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">{notice}</p> : null}
    <div className="mt-5 grid gap-3">
      {cashOuts.map((cashOut) => {
        const refreshable = cashOut.status === "submitted" || cashOut.status === "action_required";
        const destination = cashOut.paymentMethodLabel
          ? `${cashOut.paymentMethodLabel}${cashOut.paymentMethodMask ? ` •••• ${cashOut.paymentMethodMask}` : ""}`
          : "Persisted bank";
        return <article className="rounded-xl border border-white/10 bg-slate-950/30 p-4" key={cashOut.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-semibold text-white">{usd(cashOut.amountMinor)} ACH to {state.entity.displayName}</p><p className="mt-1 text-xs text-slate-500">{new Date(cashOut.createdAt).toLocaleString()}</p></div>
            <StatusBadge status={cashOut.status} />
          </div>
          <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
            <HistoryValue label="Source" value={state.treasury?.name ?? "ISD treasury wallet"} />
            <HistoryValue label="Destination" value={destination} />
            <HistoryValue label="Checkbook status" value={cashOut.providerStatus ?? "Not submitted"} />
          </div>
          <p className="mt-3 break-all font-mono text-[0.7rem] text-slate-500">{cashOut.providerExternalId ?? cashOut.id}</p>
          {refreshable ? <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-xl border border-violet-300/30 bg-violet-300/10 px-4 py-2 text-xs font-semibold text-violet-100 disabled:opacity-50" disabled={busy !== null} onClick={() => void onRefresh(cashOut.id)} type="button">{busy === `status:${cashOut.id}` ? "Refreshing Checkbook…" : "Refresh Checkbook status"}</button>
            <button className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50" disabled={busy !== null || cashOut.providerStatus !== "IN_PROCESS"} onClick={() => void onComplete(cashOut.id)} type="button">{busy === `complete:${cashOut.id}` ? "Simulating Checkbook settlement…" : "Sandbox: simulate settlement → PAID"}</button>
          </div> : null}
        </article>;
      })}
      {cashOuts.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 p-5 text-sm text-slate-500">No Marketplace cash-outs yet.</p> : null}
    </div>
  </section>;
}
function HistoryValue({ label, value }: { label: string; value: string }) { return <div><p className="font-mono text-[0.65rem] text-slate-500 uppercase">{label}</p><p className="mt-1 text-slate-300">{value}</p></div>; }
function StatusBadge({ status }: { status: string }) { const tone = status === "succeeded" ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : status === "action_required" ? "border-rose-300/20 bg-rose-300/10 text-rose-200" : "border-amber-300/20 bg-amber-300/10 text-amber-200"; return <span className={`rounded-full border px-3 py-1 font-mono text-[0.65rem] uppercase ${tone}`}>{status.replaceAll("_", " ")}</span>; }
function Ledger({ entries }: { entries: LedgerEntry[] }) { return <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6"><p className="font-mono text-xs text-violet-300 uppercase">Canonical immutable ISD ledger</p><h2 className="mt-2 text-xl font-semibold text-white">All payment experiments</h2><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[64rem] text-left text-sm"><thead className="font-mono text-xs text-slate-500 uppercase"><tr><th className="py-3">Date</th><th>Bucket</th><th>Type</th><th>Amount</th><th>Reason</th><th>Payment method</th><th>Provider</th><th>Operation</th></tr></thead><tbody className="divide-y divide-white/10">{entries.map((entry) => <tr key={entry.id}><td className="py-3 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</td><td className="text-slate-400">{entry.bucket}</td><td className="text-slate-300">{entry.entryType.replaceAll("_", " ")}</td><td className={entry.amountMinor > 0 ? "text-emerald-200" : "text-rose-200"}>{entry.amountMinor > 0 ? "+" : ""}{usd(entry.amountMinor)}</td><td className="text-slate-300">{entry.reason}</td><td className="text-slate-400">{entry.paymentMethodLabel ? `${entry.paymentMethodLabel}${entry.paymentMethodMask ? ` •••• ${entry.paymentMethodMask}` : ""}` : "—"}</td><td className="text-slate-400">{entry.providerPath ?? entry.paymentMethodProvider ?? "—"}</td><td className="font-mono text-xs text-slate-500">{entry.providerOperationId ?? "—"}</td></tr>)}</tbody></table>{entries.length === 0 ? <p className="py-5 text-sm text-slate-500">No entries yet.</p> : null}</div></section>; }
async function json<T>(response: Response): Promise<T> { const data = await response.json() as T & { error?: { message?: string } }; if (!response.ok) throw new Error(data.error?.message ?? "Request failed"); return data; }
function showError(setter: (value: string) => void) { return (cause: unknown) => setter(cause instanceof Error ? cause.message : "Request failed"); }
function usd(minor: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(minor / 100); }
function inputValue(target: EventTarget): string { return (target as EventTarget & { readonly value: string }).value; }
function marketplaceEmail(entityId: string): string { return `tfulton+${entityId}@isheepdog.com`; }
function providerFreshness(value: string | null | undefined): string { return value ? `last refreshed ${new Date(value).toLocaleString()}` : "has not been refreshed"; }
function marketplacePayoutBlockers(state: State, isRetry = false): string[] {
  const blockers: string[] = [];
  if (state.participant?.status !== "VERIFIED") blockers.push("Marketplace participant must be verified.");
  if (!state.participant?.wallet) blockers.push("Marketplace participant wallet is required.");
  if (state.treasury?.providerBalanceMinor == null || state.treasury.providerBalanceMinor <= 0) blockers.push("ISD treasury capacity is required for on-demand funding.");
  if (!isRetry && state.participant?.wallet?.providerBalanceMinor !== 0) blockers.push("Reconcile the participant wallet residual before another cash-out.");
  if (!state.participant?.attachedPaymentMethod) blockers.push("Attach the persisted Plaid account to this Checkbook user.");
  else if (state.participant.attachedPaymentMethod.status !== "VERIFIED") blockers.push("The attached Checkbook bank must be verified.");
  return blockers;
}
function usdInputMinor(value: string): number | null {
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [dollars = "0", cents = ""] = value.trim().split(".");
  const minor = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  return minor > 0 ? minor : null;
}
