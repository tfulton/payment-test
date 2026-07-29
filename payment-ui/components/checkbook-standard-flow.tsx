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
  readonly error?: { readonly message?: string };
}

interface DigitalPayment {
  readonly id: string;
  readonly providerPaymentId: string;
  readonly providerStatus: string;
  readonly amountMinor: number;
  readonly recipientEmail: string;
}

export function CheckbookStandardFlow() {
  return (
    <DemoCashOutShell>
      {(entity, amount, amountField, refresh) => (
        <EntityCheckbookCashOut
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

function EntityCheckbookCashOut({
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
      <DigitalCheckForm
        entity={entity}
        amount={amount}
        amountField={amountField}
        plaidContext={plaidContext}
        refresh={refresh}
      />
    </>
  );
}

function DigitalCheckForm({
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
  const [payeeEmail, setPayeeEmail] = useState(entity.email);
  const [payment, setPayment] = useState<DigitalPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const amountReady = isCashOutAmountValid(
    amount,
    entity.balance.availableMinor,
  );
  const payeeEmailReady = isEmailValid(payeeEmail);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!plaidContext) {
      setErrorMessage("Complete Plaid Auth above before cashing out.");
      return;
    }

    setBusy(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/checkbook/standard/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          demoEntityId: entity.id,
          paymentMethodId: plaidContext.paymentMethodId,
          recipientEmail: payeeEmail.trim(),
          amount,
          idempotencyKey,
        }),
      });
      const data = (await response.json()) as {
        readonly payment?: DigitalPayment;
      } & ApiErrorResponse;

      if (!response.ok || !data.payment) {
        throw new Error(data.error?.message || "Unable to create the Checkbook cash-out");
      }

      setPayment(data.payment);
      setIdempotencyKey(crypto.randomUUID());
      await refresh();
    } catch (error) {
      setIdempotencyKey(crypto.randomUUID());
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create the Checkbook cash-out",
      );
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 rounded-2xl border border-violet-300/20 bg-violet-300/[0.045] p-5 sm:p-6">
      <p className="font-mono text-xs font-semibold tracking-wider text-violet-300 uppercase">
        Checkbook standard cash-out
      </p>
      <h2 className="mt-2 text-xl font-semibold text-white">
        Cash out by digital check
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
        Reserves {entity.displayName}&apos;s earnings, then sends a digital check
        from the configured Checkbook Sandbox sender to the payee email below.
      </p>
      <p className="mt-3 max-w-2xl text-xs leading-5 text-slate-500">
        Plaid Auth remains common onboarding context in this lab. Checkbook
        Standard does not receive or use the linked bank; the recipient chooses
        a deposit method from Checkbook&apos;s email flow.
      </p>

      {!plaidContext ? (
        <p className="mt-5 rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm text-slate-400">
          Complete the Plaid Auth step above to continue.
        </p>
      ) : null}

      <form className="mt-6 grid gap-4" onSubmit={submit}>
        {amountField}
        <label className="grid gap-2 text-sm text-slate-300">
          Payee email
          <input
            autoComplete="email"
            className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-violet-300/50"
            maxLength={254}
            onChange={(event) => setPayeeEmail(inputValue(event.currentTarget))}
            placeholder="payee@example.com"
            required
            type="email"
            value={payeeEmail}
          />
          <span className="text-xs text-slate-500">
            Checkbook sends the digital-check notification to this address.
          </span>
        </label>
        <div className="rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm">
          <p className={plaidContext ? "text-emerald-200" : "text-slate-400"}>
            {plaidContext ? "✓ Payout account connected" : "○ Connect a payout account above"}
          </p>
          <p className={amountReady ? "mt-1 text-emerald-200" : "mt-1 text-amber-200"}>
            {amountReady
              ? `✓ Custom cash-out amount: $${amount}`
              : "○ Enter a valid custom cash-out amount"}
          </p>
          <p className={payeeEmailReady ? "mt-1 text-emerald-200" : "mt-1 text-amber-200"}>
            {payeeEmailReady
              ? `✓ Payee email: ${payeeEmail.trim()}`
              : "○ Enter a valid payee email"}
          </p>
        </div>
        <button
          className="w-fit rounded-xl bg-violet-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={
            busy ||
            !plaidContext ||
            !amountReady ||
            !payeeEmailReady
          }
          type="submit"
        >
          {busy
            ? "Sending cash-out…"
            : !payeeEmailReady
              ? "Enter a valid payee email"
              : !amountReady
                ? "Enter a cash-out amount"
                : !plaidContext
                  ? "Connect a payout account above"
                  : "Cash out by digital check"}
        </button>
      </form>

      {payment ? (
        <div className="mt-6 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4">
          <p className="font-mono text-xs font-semibold text-emerald-300 uppercase">
            Cash-out submitted
          </p>
          <p className="mt-2 text-sm text-white">
            ${(payment.amountMinor / 100).toFixed(2)} to {payment.recipientEmail}
          </p>
          <p className="mt-1 font-mono text-xs text-slate-400">
            {payment.providerStatus} · {payment.providerPaymentId}
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

function isEmailValid(value: string): boolean {
  const normalized = value.trim();
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function inputValue(target: EventTarget): string {
  return (target as EventTarget & { readonly value: string }).value;
}
