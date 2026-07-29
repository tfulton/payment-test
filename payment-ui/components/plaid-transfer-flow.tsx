"use client";

import { useState, type ReactNode } from "react";

import {
  DemoCashOutShell,
  isCashOutAmountValid,
  type DemoEntity,
} from "./demo-cash-out-shell";
import {
  PlaidAuthFlow,
  type PlaidFlowReadyContext,
} from "./plaid-auth-flow";

interface ApiErrorResponse {
  readonly error?: { readonly message?: string; readonly requestId?: string | null };
}

interface PlaidTransferPayment {
  readonly id: string;
  readonly amountMinor: number;
  readonly authorizationId: string;
  readonly authorizationDecision: string;
  readonly transferId: string;
  readonly transferStatus: string;
}

export function PlaidTransferFlow() {
  return (
    <DemoCashOutShell>
      {(entity, amount, amountField, refresh) => (
        <EntityPlaidCashOut
          amount={amount}
          amountField={amountField}
          entity={entity}
          key={entity.id}
          refresh={refresh}
        />
      )}
    </DemoCashOutShell>
  );
}

function EntityPlaidCashOut({
  entity,
  amount,
  amountField,
  refresh,
}: {
  readonly entity: DemoEntity;
  readonly amount: string;
  readonly amountField: ReactNode;
  readonly refresh: () => Promise<void>;
}) {
  const [plaidContext, setPlaidContext] =
    useState<PlaidFlowReadyContext | null>(null);

  return (
    <>
      <PlaidAuthFlow
        demoEntityId={entity.id}
        fixedDirection="receive"
        onReady={setPlaidContext}
      />
      <PlaidCashOutForm
        entity={entity}
        amount={amount}
        amountField={amountField}
        plaidContext={plaidContext}
        refresh={refresh}
      />
    </>
  );
}

function PlaidCashOutForm({
  entity,
  amount,
  amountField,
  plaidContext,
  refresh,
}: {
  readonly entity: DemoEntity;
  readonly amount: string;
  readonly amountField: ReactNode;
  readonly plaidContext: PlaidFlowReadyContext | null;
  readonly refresh: () => Promise<void>;
}) {
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [transfer, setTransfer] = useState<PlaidTransferPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const amountReady = isCashOutAmountValid(
    amount,
    entity.balance.availableMinor,
  );

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!plaidContext) {
      setErrorMessage("Connect a payout account above before cashing out.");
      return;
    }

    setBusy(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/plaid/transfers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          demoEntityId: entity.id,
          paymentMethodId: plaidContext.paymentMethodId,
          amount,
          network: "ach",
          idempotencyKey,
        }),
      });
      const data = (await response.json()) as {
        readonly transfer?: PlaidTransferPayment;
      } & ApiErrorResponse;

      if (!response.ok || !data.transfer) {
        const message = data.error?.message || "Unable to create the Plaid cash-out";
        throw new Error(
          data.error?.requestId
            ? `${message} (Plaid request ${data.error.requestId})`
            : message,
        );
      }

      setTransfer(data.transfer);
      setIdempotencyKey(crypto.randomUUID());
      await refresh();
    } catch (error) {
      setIdempotencyKey(crypto.randomUUID());
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create the Plaid cash-out",
      );
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.045] p-5 sm:p-6">
      <p className="font-mono text-xs font-semibold tracking-wider text-cyan-300 uppercase">
        Plaid Transfer cash-out
      </p>
      <h2 className="mt-2 text-xl font-semibold text-white">
        Cash out to the linked bank
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
        Reserves {entity.displayName}&apos;s available earnings, then submits an
        ACH credit funded by the explicit ISD demo Plaid Ledger.
      </p>

      {!plaidContext ? (
        <p className="mt-5 rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-slate-400">
          Connect this user&apos;s payout account above to continue.
        </p>
      ) : null}

      <form className="mt-6 grid gap-4" onSubmit={submit}>
        {amountField}
        <div className="rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm">
          <p className={plaidContext ? "text-emerald-200" : "text-slate-400"}>
            {plaidContext ? "✓ Payout account connected" : "○ Connect a payout account above"}
          </p>
          <p className={amountReady ? "mt-1 text-emerald-200" : "mt-1 text-amber-200"}>
            {amountReady
              ? `✓ Custom cash-out amount: $${amount}`
              : "○ Enter a valid custom cash-out amount"}
          </p>
        </div>
        <button
          className="w-fit rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={
            busy ||
            !plaidContext ||
            !amountReady
          }
          type="submit"
        >
          {busy
            ? "Submitting cash-out…"
            : !amountReady
              ? "Enter a cash-out amount"
              : !plaidContext
                ? "Connect a payout account above"
                : "Cash out with Plaid Transfer"}
        </button>
      </form>

      {transfer ? (
        <div className="mt-6 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4">
          <p className="font-mono text-xs font-semibold text-emerald-300 uppercase">
            Cash-out submitted
          </p>
          <p className="mt-2 text-sm text-white">
            ${(transfer.amountMinor / 100).toFixed(2)} ACH credit to {entity.displayName}
          </p>
          <p className="mt-1 font-mono text-xs text-slate-400">
            {transfer.transferStatus} · {transfer.transferId}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            The amount remains reserved until a terminal provider event settles or releases it.
          </p>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="mt-5 rounded-xl border border-rose-300/20 bg-rose-300/[0.07] px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
