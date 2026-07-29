export interface FlowStage {
  readonly title: string;
  readonly description: string;
}

export interface PaymentFlow {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly accent: "cyan" | "violet" | "amber";
  readonly providers: readonly string[];
  readonly stages: readonly FlowStage[];
}

export const paymentFlows = [
  {
    slug: "plaid-transfer",
    title: "Plaid Auth + Plaid Transfer",
    summary:
      "Cash out demo earnings from the Plaid Ledger to a linked bank account.",
    accent: "cyan",
    providers: ["Plaid Auth", "Plaid Transfer"],
    stages: [
      {
        title: "Connect account",
        description: "Plaid Link and account-selection boundary.",
      },
      {
        title: "Establish authorization",
        description: "Token exchange and transfer authorization boundary.",
      },
      {
        title: "Review transfer",
        description: "Confirm available earnings, destination, amount, and rail.",
      },
      {
        title: "Submit and observe",
        description: "Transfer creation and lifecycle-event boundary.",
      },
    ],
  },
  {
    slug: "plaid-checkbook",
    title: "Plaid Auth + Checkbook.io",
    summary:
      "Cash out demo earnings by digital check from the configured Checkbook Sandbox sender.",
    accent: "violet",
    providers: ["Plaid Auth", "Checkbook.io"],
    stages: [
      {
        title: "Connect account",
        description: "Plaid Link and account-selection boundary.",
      },
      {
        title: "Identify the recipient",
        description: "Use the selected demo entity's fixture name and email.",
      },
      {
        title: "Create payment",
        description: "Recipient and digital-check request boundary.",
      },
      {
        title: "Track delivery",
        description: "Payment status and notification-event boundary.",
      },
    ],
  },
  {
    slug: "plaid-checkbook-marketplace",
    title: "Plaid Auth + Checkbook Marketplace",
    summary:
      "Add marketplace participant and routing concepts to the Checkbook.io path.",
    accent: "amber",
    providers: ["Plaid Auth", "Checkbook Marketplace"],
    stages: [
      {
        title: "Connect account",
        description: "Plaid Link and account-selection boundary.",
      },
      {
        title: "Establish participant",
        description: "Marketplace identity and onboarding boundary.",
      },
      {
        title: "Route payment",
        description: "Sender, recipient, and platform-context boundary.",
      },
      {
        title: "Reconcile activity",
        description: "Marketplace status and ledger-event boundary.",
      },
    ],
  },
] as const satisfies readonly PaymentFlow[];

export function findPaymentFlow(slug: string): PaymentFlow | undefined {
  return paymentFlows.find((flow) => flow.slug === slug);
}
