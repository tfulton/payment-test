"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  usePlaidLink,
  type PlaidAccount,
  type PlaidLinkError,
  type PlaidLinkOnSuccessMetadata,
} from "react-plaid-link";

export type MoneyDirection = "send" | "receive";

export interface PlaidFlowReadyContext {
  readonly direction: MoneyDirection;
  readonly paymentMethodId: string;
}

interface PlaidAuthFlowProps {
  readonly onReady?: (context: PlaidFlowReadyContext | null) => void;
  readonly demoEntityId?: string;
  readonly fixedDirection?: MoneyDirection;
}

interface LinkTokenResponse {
  readonly linkToken: string;
}

interface PendingConnection {
  readonly publicToken: string;
  readonly accounts: readonly PlaidAccount[];
  readonly institutionName: string | null;
}

interface PaymentMethod {
  readonly id: string;
  readonly institutionName: string | null;
  readonly account: {
    readonly name: string;
    readonly mask: string | null;
    readonly subtype: string | null;
    readonly verificationStatus: string | null;
    readonly canTransferIn: boolean | null;
    readonly canTransferOut: boolean | null;
  };
}

interface ApiErrorResponse {
  readonly error?: {
    readonly message?: string;
    readonly requestId?: string | null;
  };
}

interface LinkLauncherProps {
  readonly token: string;
  readonly onSuccess: (
    publicToken: string,
    metadata: PlaidLinkOnSuccessMetadata,
  ) => void;
  readonly onExit: (error: PlaidLinkError | null) => void;
}

function LinkLauncher({ token, onSuccess, onExit }: LinkLauncherProps) {
  const opened = useRef(false);
  const { open, ready, error } = usePlaidLink({
    token,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (ready && !opened.current) {
      opened.current = true;
      open();
    }
  }, [open, ready]);

  useEffect(() => {
    if (error) {
      onExit(error);
    }
  }, [error, onExit]);

  return (
    <p className="mt-4 font-mono text-xs text-cyan-300">
      Loading secure Plaid Link…
    </p>
  );
}

export function PlaidAuthFlow({
  onReady,
  demoEntityId,
  fixedDirection,
}: PlaidAuthFlowProps = {}) {
  const [direction, setDirection] = useState<MoneyDirection | null>(
    fixedDirection ?? null,
  );
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConnection | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [busy, setBusy] = useState(false);
  const [hydrating, setHydrating] = useState(Boolean(demoEntityId));
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!demoEntityId) {
      return;
    }

    let cancelled = false;
    void loadPersistedPaymentMethod(demoEntityId)
      .then((savedPaymentMethod) => {
        if (cancelled) {
          return;
        }

        setPaymentMethod(savedPaymentMethod);
        if (savedPaymentMethod && fixedDirection) {
          onReady?.({
            direction: fixedDirection,
            paymentMethodId: savedPaymentMethod.id,
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load the saved payout account",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHydrating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [demoEntityId, fixedDirection, onReady]);

  const resetConnection = useCallback(() => {
    setLinkToken(null);
    setPending(null);
    setSelectedAccountId(null);
    setPaymentMethod(null);
    setConfirmingRemoval(false);
    setErrorMessage(null);
    onReady?.(null);
  }, [onReady]);

  const chooseDirection = (nextDirection: MoneyDirection) => {
    setDirection(nextDirection);
    resetConnection();
  };

  const startLink = async () => {
    setBusy(true);
    setErrorMessage(null);
    setPending(null);
    setPaymentMethod(null);

    try {
      const response = await fetch("/api/plaid/link-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demoEntityId }),
      });
      const data = (await response.json()) as LinkTokenResponse & ApiErrorResponse;

      if (!response.ok || !data.linkToken) {
        throw new Error(apiErrorMessage(data, "Unable to start Plaid Link"));
      }

      setLinkToken(data.linkToken);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to start Plaid Link");
    } finally {
      setBusy(false);
    }
  };

  const linkSucceeded = useCallback(
    (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      setLinkToken(null);
      setErrorMessage(null);

      if (metadata.accounts.length === 0) {
        setErrorMessage("Plaid did not return an eligible account.");
        return;
      }

      setPending({
        publicToken,
        accounts: metadata.accounts,
        institutionName: metadata.institution?.name ?? null,
      });
      setSelectedAccountId(
        metadata.accounts.length === 1 ? metadata.accounts[0]?.id ?? null : null,
      );
    },
    [],
  );

  const linkExited = useCallback((error: PlaidLinkError | null) => {
    setLinkToken(null);

    if (error) {
      setErrorMessage(error.display_message || error.error_message || "Plaid Link closed with an error");
    }
  }, []);

  const savePaymentMethod = async () => {
    if (!pending || !selectedAccountId || !direction) {
      return;
    }

    setBusy(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/plaid/payment-methods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          publicToken: pending.publicToken,
          accountId: selectedAccountId,
          institutionName: pending.institutionName,
          demoEntityId,
        }),
      });
      const data = (await response.json()) as {
        paymentMethod?: PaymentMethod;
      } & ApiErrorResponse;

      if (!response.ok || !data.paymentMethod) {
        throw new Error(apiErrorMessage(data, "Unable to add payment method"));
      }

      setPaymentMethod(data.paymentMethod);
      setConfirmingRemoval(false);
      onReady?.({ direction, paymentMethodId: data.paymentMethod.id });
      setPending(null);
      setSelectedAccountId(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to add payment method");
    } finally {
      setBusy(false);
    }
  };

  const removePaymentMethod = async () => {
    if (!paymentMethod) {
      return;
    }

    setBusy(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/plaid/payment-methods", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          paymentMethodId: paymentMethod.id,
          demoEntityId,
        }),
      });
      const data = (await response.json()) as {
        readonly removed?: boolean;
      } & ApiErrorResponse;

      if (!response.ok || !data.removed) {
        throw new Error(apiErrorMessage(data, "Unable to remove payout account"));
      }

      resetConnection();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to remove payout account",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.045] p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <p className="font-mono text-xs font-semibold tracking-wider text-cyan-300 uppercase">
            Shared Plaid Auth
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {fixedDirection ? "Connect a payout account" : "How should money move?"}
          </h2>
        </div>
        <span className="w-fit rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 font-mono text-[0.65rem] text-cyan-200 uppercase">
          Sandbox
        </span>
      </div>

      {fixedDirection ? (
        <p className="mt-4 text-sm leading-6 text-slate-400">
          Link the bank account that should receive this demo user&apos;s cash-out.
        </p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <DirectionButton
            active={direction === "send"}
            description="Debit the linked bank account"
            label="Send money"
            onClick={() => chooseDirection("send")}
          />
          <DirectionButton
            active={direction === "receive"}
            description="Credit the linked bank account"
            label="Receive money"
            onClick={() => chooseDirection("receive")}
          />
        </div>
      )}

      {hydrating ? (
        <p className="mt-5 font-mono text-xs text-cyan-300">
          Loading saved payout account…
        </p>
      ) : null}

      {direction && !hydrating && !pending && !paymentMethod ? (
        <button
          className="mt-5 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy || Boolean(linkToken)}
          onClick={startLink}
          type="button"
        >
          {busy || linkToken ? "Starting Plaid…" : "Connect payout account"}
        </button>
      ) : null}

      {linkToken ? (
        <LinkLauncher
          key={linkToken}
          onExit={linkExited}
          onSuccess={linkSucceeded}
          token={linkToken}
        />
      ) : null}

      {pending ? (
        <div className="mt-6 border-t border-white/10 pt-5">
          <h3 className="text-sm font-semibold text-white">
            Choose the account to use
          </h3>
          <div className="mt-3 grid gap-2">
            {pending.accounts.map((account) => (
              <button
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                  selectedAccountId === account.id
                    ? "border-cyan-300/60 bg-cyan-300/10"
                    : "border-white/10 bg-slate-950/30 hover:border-white/20"
                }`}
                key={account.id}
                onClick={() => setSelectedAccountId(account.id)}
                type="button"
              >
                <span>
                  <span className="block text-sm font-medium text-white">
                    {account.name}
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {account.subtype} ····{account.mask}
                  </span>
                </span>
                <span className="font-mono text-xs text-cyan-300">
                  {selectedAccountId === account.id ? "Selected" : "Select"}
                </span>
              </button>
            ))}
          </div>
          <button
            className="mt-4 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || !selectedAccountId}
            onClick={savePaymentMethod}
            type="button"
          >
            {busy ? "Verifying account…" : "Use selected account"}
          </button>
        </div>
      ) : null}

      {paymentMethod ? (
        <div className="mt-6 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4">
          <p className="font-mono text-xs font-semibold text-emerald-300 uppercase">
            Saved payout account
          </p>
          <p className="mt-2 text-sm font-medium text-white">
            {paymentMethod.institutionName || "Linked institution"} · {paymentMethod.account.name} ····{paymentMethod.account.mask}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            This persisted Sandbox payment method is ready after reloads and app restarts.
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            <button
              className="text-xs font-medium text-cyan-300 hover:text-cyan-200"
              onClick={resetConnection}
              type="button"
            >
              Replace payout account
            </button>
            <button
              className="text-xs font-medium text-rose-300 hover:text-rose-200"
              onClick={() => setConfirmingRemoval(true)}
              type="button"
            >
              Remove payout account
            </button>
          </div>
          {confirmingRemoval ? (
            <div className="mt-4 rounded-lg border border-rose-300/20 bg-rose-300/[0.06] p-3">
              <p className="text-xs leading-5 text-rose-100">
                Remove this saved payout account from the lab? Historical cash-outs remain intact.
              </p>
              <div className="mt-2 flex gap-3">
                <button
                  className="text-xs font-semibold text-rose-300 hover:text-rose-200 disabled:opacity-50"
                  disabled={busy}
                  onClick={removePaymentMethod}
                  type="button"
                >
                  {busy ? "Removing…" : "Confirm removal"}
                </button>
                <button
                  className="text-xs text-slate-400 hover:text-slate-300"
                  disabled={busy}
                  onClick={() => setConfirmingRemoval(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {errorMessage ? (
        <p className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/[0.07] px-4 py-3 text-sm text-rose-100">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}

interface DirectionButtonProps {
  readonly active: boolean;
  readonly description: string;
  readonly label: string;
  readonly onClick: () => void;
}

function DirectionButton({
  active,
  description,
  label,
  onClick,
}: DirectionButtonProps) {
  return (
    <button
      className={`rounded-xl border p-4 text-left transition ${
        active
          ? "border-cyan-300/60 bg-cyan-300/10"
          : "border-white/10 bg-slate-950/30 hover:border-white/20"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="block text-sm font-semibold text-white">{label}</span>
      <span className="mt-1 block text-xs text-slate-400">{description}</span>
    </button>
  );
}

function apiErrorMessage(data: ApiErrorResponse, fallback: string): string {
  const message = data.error?.message || fallback;
  const requestId = data.error?.requestId;

  return requestId ? `${message} (Plaid request ${requestId})` : message;
}

async function loadPersistedPaymentMethod(
  demoEntityId: string,
): Promise<PaymentMethod | null> {
  const response = await fetch(
    `/api/plaid/payment-methods?demoEntityId=${encodeURIComponent(demoEntityId)}`,
  );
  const data = (await response.json()) as {
    readonly paymentMethod?: PaymentMethod | null;
  } & ApiErrorResponse;

  if (!response.ok) {
    throw new Error(apiErrorMessage(data, "Unable to load saved payout account"));
  }

  return data.paymentMethod ?? null;
}
