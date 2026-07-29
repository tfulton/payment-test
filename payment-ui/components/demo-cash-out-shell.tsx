"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

export interface DemoEntity {
  readonly id: string;
  readonly displayName: string;
  readonly entityType: "owner_operator" | "broker";
  readonly email: string;
  readonly accountHolderType: "personal" | "business";
  readonly balance: {
    readonly availableMinor: number;
    readonly reservedMinor: number;
    readonly paidMinor: number;
  };
}

interface CashOutHistoryEntry {
  readonly id: string;
  readonly providerPath:
    | "plaid_transfer"
    | "checkbook_standard"
    | "checkbook_marketplace";
  readonly amountMinor: number;
  readonly currency: "USD";
  readonly status:
    | "reserved"
    | "submitted"
    | "succeeded"
    | "failed"
    | "returned"
    | "canceled"
    | "action_required";
  readonly providerStatus: string | null;
  readonly providerExternalId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function DemoCashOutShell({
  children,
}: {
  readonly children: (
    entity: DemoEntity,
    amount: string,
    amountField: ReactNode,
    refresh: () => Promise<void>,
  ) => ReactNode;
}) {
  const [entities, setEntities] = useState<readonly DemoEntity[]>([]);
  const [selectedId, setSelectedId] = useState("owner1");
  const [amount, setAmount] = useState("");
  const [cashOuts, setCashOuts] = useState<readonly CashOutHistoryEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completingCashOutId, setCompletingCashOutId] = useState<string | null>(
    null,
  );

  const refresh = useCallback(async () => {
    const [nextEntities, nextCashOuts] = await Promise.all([
      loadDemoEntities(),
      loadDemoCashOuts(selectedId),
    ]);
    setEntities(nextEntities);
    setCashOuts(nextCashOuts);
  }, [selectedId]);

  useEffect(() => {
    void loadDemoEntities().then(setEntities).catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load demo entities",
        );
      });
  }, []);

  useEffect(() => {
    void loadDemoCashOuts(selectedId)
      .then(setCashOuts)
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load cash-out history",
        );
      });
  }, [selectedId]);

  const selected = entities.find((entity) => entity.id === selectedId);

  const completeCashOut = useCallback(
    async (cashOut: CashOutHistoryEntry) => {
      setCompletingCashOutId(cashOut.id);
      setErrorMessage(null);

      try {
        const response = await fetch(
          `/api/demo/cash-outs/${encodeURIComponent(cashOut.id)}/complete`,
          { method: "POST" },
        );
        const data = (await response.json()) as {
          readonly error?: { readonly message?: string };
        };

        if (!response.ok) {
          throw new Error(
            data.error?.message || "Unable to complete the Sandbox cash-out",
          );
        }

        await refresh();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to complete the Sandbox cash-out",
        );
      } finally {
        setCompletingCashOutId(null);
      }
    },
    [refresh],
  );

  return (
    <>
      <section className="mt-8 rounded-2xl border border-amber-300/20 bg-amber-300/[0.045] p-5 sm:p-6">
        <p className="font-mono text-xs font-semibold tracking-wider text-amber-300 uppercase">
          ISD demo earnings ledger
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">
          Choose who is cashing out
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
          Approved job earnings live in the lab&apos;s SQLite ledger. Provider
          balances fund settlement; they do not define each user&apos;s earnings.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {entities.map((entity) => (
            <button
              className={`rounded-xl border p-4 text-left transition ${
                selectedId === entity.id
                  ? "border-amber-300/60 bg-amber-300/10"
                  : "border-white/10 bg-slate-950/30 hover:border-white/20"
              }`}
              key={entity.id}
              onClick={() => {
                setSelectedId(entity.id);
                setAmount("");
                setCashOuts([]);
              }}
              type="button"
            >
              <span className="block text-sm font-semibold text-white">
                {entity.displayName}
              </span>
              <span className="mt-1 block font-mono text-xs text-slate-400">
                {entity.id} · {entity.entityType === "broker" ? "Broker" : "Owner-operator"}
              </span>
              <span className="mt-3 block text-lg font-semibold text-amber-200">
                {usd(entity.balance.availableMinor)}
              </span>
              <span className="block text-xs text-slate-500">available</span>
            </button>
          ))}
        </div>

        {selected ? (
          <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-white/10 bg-slate-950/30 p-4 text-center">
            <Balance label="Available" value={selected.balance.availableMinor} />
            <Balance label="Reserved" value={selected.balance.reservedMinor} />
            <Balance label="Paid" value={selected.balance.paidMinor} />
          </div>
        ) : null}
      </section>

      {selected
        ? children(
            selected,
            amount,
            <CashOutAmountField
              amount={amount}
              availableMinor={selected.balance.availableMinor}
              onChange={setAmount}
            />,
            refresh,
          )
        : null}

      {selected ? (
        <CashOutHistoryCard
          cashOuts={cashOuts}
          completingCashOutId={completingCashOutId}
          entity={selected}
          errorMessage={errorMessage}
          onComplete={completeCashOut}
        />
      ) : errorMessage ? (
        <p className="mt-4 text-sm text-rose-200">{errorMessage}</p>
      ) : null}
    </>
  );
}

function CashOutAmountField({
  amount,
  availableMinor,
  onChange,
}: {
  readonly amount: string;
  readonly availableMinor: number;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="grid max-w-sm gap-2 text-sm text-slate-300">
      Custom cash-out amount (USD)
      <input
        aria-invalid={
          amount ? !isCashOutAmountValid(amount, availableMinor) : undefined
        }
        className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 text-lg font-semibold text-white outline-none transition focus:border-white/30"
        inputMode="decimal"
        max={(availableMinor / 100).toFixed(2)}
        min="0.01"
        onChange={(event) => onChange(inputValue(event.currentTarget))}
        placeholder="1000.00"
        step="0.01"
        type="number"
        value={amount}
      />
      <span className="text-xs text-slate-500">
        Maximum {usd(availableMinor)} available
      </span>
      {amount && !isCashOutAmountValid(amount, availableMinor) ? (
        <span className="text-xs text-rose-200">
          Enter an amount from $0.01 through {usd(availableMinor)}.
        </span>
      ) : null}
    </label>
  );
}

function CashOutHistoryCard({
  cashOuts,
  completingCashOutId,
  entity,
  errorMessage,
  onComplete,
}: {
  readonly cashOuts: readonly CashOutHistoryEntry[];
  readonly completingCashOutId: string | null;
  readonly entity: DemoEntity;
  readonly errorMessage: string | null;
  readonly onComplete: (cashOut: CashOutHistoryEntry) => Promise<void>;
}) {
  return (
    <section className="mt-8 rounded-2xl border border-amber-300/20 bg-amber-300/[0.045] p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-xs font-semibold tracking-wider text-amber-300 uppercase">
            Cash-out history
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">
            {entity.displayName}&apos;s transactions
          </h2>
        </div>
        <span className="font-mono text-xs text-slate-500">
          {cashOuts.length} {cashOuts.length === 1 ? "transaction" : "transactions"}
        </span>
      </div>
      <p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-xs leading-5 text-amber-100/80">
        Sandbox controls only: completing a transaction advances the provider&apos;s
        simulated status and moves its reserved earnings to paid.
      </p>

      {cashOuts.length ? (
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[58rem] text-left text-sm">
            <thead className="bg-slate-950/50 font-mono text-[0.65rem] tracking-wider text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Provider</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Lab status</th>
                <th className="px-4 py-3 font-medium">Provider status</th>
                <th className="px-4 py-3 font-medium">Provider ID</th>
                <th className="px-4 py-3 font-medium">Sandbox action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {cashOuts.map((cashOut) => (
                <tr className="bg-slate-950/20" key={cashOut.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                    {dateTime(cashOut.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                    {providerLabel(cashOut.providerPath)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-white">
                    {usd(cashOut.amountMinor)}
                  </td>
                  <td className="px-4 py-3">
                    <Status value={cashOut.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">
                    {cashOut.providerStatus ?? "—"}
                  </td>
                  <td className="max-w-64 px-4 py-3 font-mono text-xs break-all text-slate-500">
                    {cashOut.providerExternalId ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {canCompleteInSandbox(cashOut) ? (
                      <button
                        className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-300/60 hover:bg-amber-300/15 disabled:cursor-wait disabled:opacity-50"
                        disabled={completingCashOutId !== null}
                        onClick={() => void onComplete(cashOut)}
                        type="button"
                      >
                        {completingCashOutId === cashOut.id
                          ? "Completing…"
                          : "Complete in Sandbox"}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-white/10 bg-slate-950/30 px-4 py-4 text-sm text-slate-500">
          No cash-outs recorded for this entity.
        </p>
      )}

      {errorMessage ? (
        <p className="mt-4 text-sm text-rose-200">{errorMessage}</p>
      ) : null}
    </section>
  );
}

function Balance({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div>
      <p className="text-sm font-semibold text-white">{usd(value)}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}

function Status({ value }: { readonly value: CashOutHistoryEntry["status"] }) {
  const color =
    value === "succeeded"
      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200"
      : value === "failed" || value === "returned" || value === "canceled"
        ? "border-rose-300/20 bg-rose-300/10 text-rose-200"
        : "border-amber-300/20 bg-amber-300/10 text-amber-200";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-[0.65rem] uppercase ${color}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

function usd(amountMinor: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountMinor / 100);
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function providerLabel(value: CashOutHistoryEntry["providerPath"]): string {
  if (value === "plaid_transfer") {
    return "Plaid Transfer";
  }

  if (value === "checkbook_standard") {
    return "Checkbook Standard";
  }

  return "Checkbook Marketplace";
}

function canCompleteInSandbox(cashOut: CashOutHistoryEntry): boolean {
  return (
    cashOut.status === "submitted" &&
    (cashOut.providerPath === "plaid_transfer" ||
      cashOut.providerPath === "checkbook_standard") &&
    Boolean(cashOut.providerExternalId)
  );
}

function inputValue(target: EventTarget): string {
  return (target as EventTarget & { readonly value: string }).value;
}

export function isCashOutAmountValid(
  amount: string,
  availableMinor: number,
): boolean {
  if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(amount.trim())) {
    return false;
  }

  const [dollars = "0", cents = ""] = amount.trim().split(".");
  const amountMinor = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));

  return amountMinor > 0 && amountMinor <= availableMinor;
}

async function loadDemoEntities(): Promise<readonly DemoEntity[]> {
  const response = await fetch("/api/demo/entities");
  const data = (await response.json()) as {
    readonly entities?: readonly DemoEntity[];
  };

  if (!response.ok || !data.entities) {
    throw new Error("Unable to load demo earnings balances");
  }

  return data.entities;
}

async function loadDemoCashOuts(
  demoEntityId: string,
): Promise<readonly CashOutHistoryEntry[]> {
  const response = await fetch(
    `/api/demo/cash-outs?demoEntityId=${encodeURIComponent(demoEntityId)}`,
  );
  const data = (await response.json()) as {
    readonly cashOuts?: readonly CashOutHistoryEntry[];
  };

  if (!response.ok || !data.cashOuts) {
    throw new Error("Unable to load cash-out history");
  }

  return data.cashOuts;
}
