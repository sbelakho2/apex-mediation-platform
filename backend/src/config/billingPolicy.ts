import { getPaymentInstructions, fallbackRails as bankingFallbackRails, type PaymentInstruction } from './banking'

type PaymentRegion = 'global' | 'us' | 'eu' | 'enterprise';

export type BillingPolicyRail = {
  id: string
  label: string
  type: 'card_wallet' | 'sepa' | 'ach' | 'wire'
  provider: string
  autopay: boolean
  currencies: string[]
  settlementWindow: string
  description: string
  requirements: string[]
  statuspage?: string
  webhookEvents?: string[]
  retryScheduleDays?: number[]
}

export type BillingPolicyFallback = PaymentInstruction & {
  requiresFinanceReview: boolean
}

export type BillingPolicyStarterExperience = {
  paymentMethodRequired: boolean
  revenueCapUsd: number
  capBasis: 'per_app_per_month'
  capabilities: string[]
  messaging: string
}

export type BillingPolicyUpgradePath = {
  triggers: string[]
  acceptedPaymentMethods: {
    id: string
    label: string
    regions: PaymentRegion[]
    autopayEligible: boolean
    enterpriseOnly?: boolean
  }[]
  autopay: {
    defaultBehavior: string
    encouragement: string
    enterpriseOverride: string
  }
}

export type BillingPolicyBillingCycle = {
  cadence: 'monthly'
  computeSteps: string[]
  transparency: {
    reconciledRevenueSource: string
    adjustmentsVisible: boolean
    statement: string
  }
  notifications: {
    channel: 'email' | 'console'
    timing: string
    content: string
  }[]
}

export type BillingPolicyTransparency = {
  weDontTouchPayouts: string
  platformFeeOnly: string
}

export type BillingPolicy = {
  version: string
  updatedAt: string
  owner: string
  summary: string
  primaryRail: BillingPolicyRail
  fallbackRails: BillingPolicyFallback[]
  starterExperience: BillingPolicyStarterExperience
  upgradePath: BillingPolicyUpgradePath
  billingCycle: BillingPolicyBillingCycle
  transparencyCommitments: BillingPolicyTransparency
  ancillaryChannels: {
    id: string
    description: string
  }[]
  enforcement: {
    gracePeriodDays: number
    delinquencyStages: {
      day: number
      action: string
    }[]
  }
  communications: {
    billingEmail: string
    escalationEmail: string
    officeHours: string
  }
}

const BILLING_POLICY_VERSION = 'stripe-mandatory-2025-11'
const BILLING_POLICY_UPDATED_AT = '2025-11-24T00:00:00.000Z'

const clonePaymentInstruction = (instruction: PaymentInstruction): BillingPolicyFallback => ({
  heading: instruction.heading,
  description: instruction.description,
  account: { ...instruction.account },
  default: instruction.default,
  requiresFinanceReview: instruction.default === false,
})

export const billingPolicy: BillingPolicy = {
  version: BILLING_POLICY_VERSION,
  updatedAt: BILLING_POLICY_UPDATED_AT,
  owner: 'Billing/Platform',
  summary:
    'Starter tier stays free up to $10k/mo with no payment method. Upgrades require an autopay-ready rail (card, ACH, SEPA) so platform fees are charged automatically at the end of each period.',
  primaryRail: {
    id: 'stripe',
    label: 'Stripe Cards + Wallets',
    type: 'card_wallet',
    provider: 'Stripe',
    autopay: true,
    currencies: ['USD', 'EUR'],
    settlementWindow: 'Instant authorization, captured at invoice finalization',
    description:
      'Usage-based invoices finalize inside Stripe. Cards and wallets are charged automatically with retries handled by Stripe Billing.',
    requirements: [
      'Valid Stripe payment method (card or wallet) on file',
      'Billing contact with owner role in Console',
      'Webhook connectivity for invoice.status events',
    ],
    statuspage: 'https://status.stripe.com',
    webhookEvents: ['invoice.payment_succeeded', 'invoice.payment_failed'],
    retryScheduleDays: [0, 3, 5, 7],
  },
  fallbackRails: getPaymentInstructions().map((instruction) => clonePaymentInstruction(instruction)),
  starterExperience: {
    paymentMethodRequired: false,
    revenueCapUsd: 10_000,
    capBasis: 'per_app_per_month',
    capabilities: [
      'SDK integration and live traffic',
      'Real-time metrics + transparency dashboards',
      'VRA dispute tooling',
      'Debugger + Migration Studio within Starter quotas',
    ],
    messaging: 'Free up to $10k/month. No credit card. No bank. Plug in, see if you like it.',
  },
  upgradePath: {
    triggers: [
      'Trailing 30-day mediated revenue exceeds $10k for any app',
      'Customer clicks “Upgrade” inside Console',
    ],
    acceptedPaymentMethods: [
      {
        id: 'card',
        label: 'Credit/debit card (Stripe)',
        regions: ['global'],
        autopayEligible: true,
      },
      {
        id: 'ach',
        label: 'ACH direct debit (US)',
        regions: ['us'],
        autopayEligible: true,
      },
      {
        id: 'sepa',
        label: 'SEPA direct debit (EU/EEA)',
        regions: ['eu'],
        autopayEligible: true,
      },
      {
        id: 'invoice_wire',
        label: 'Invoice + wire (Enterprise finance approval)',
        regions: ['enterprise'],
        autopayEligible: false,
        enterpriseOnly: true,
      },
    ],
    autopay: {
      defaultBehavior: 'Auto-charge at billing period close using the primary payment method on file.',
      encouragement: 'Auto-pay keeps mediation running with zero manual steps; cards/ACH/SEPA are strongly preferred.',
      enterpriseOverride: 'Enterprise accounts may request manual invoice + NET terms after finance review.',
    },
  },
  billingCycle: {
    cadence: 'monthly',
    computeSteps: [
      'Aggregate mediated revenue per app and tier.',
      'Apply Apex platform fee (2.5%, 2%, or contracted enterprise rate).',
      'Generate invoice line items that mirror fee calculations and adjustments.',
      'Store VRA reconciliation evidence alongside the invoice.',
    ],
    transparency: {
      reconciledRevenueSource: 'Revenue verified via VRA logs and bidder receipts; surfaced on each invoice.',
      adjustmentsVisible: true,
      statement: 'Every invoice shows reconciled revenue, fee math, and any credits/discounts before auto-charge.',
    },
    notifications: [
      {
        channel: 'email',
        timing: '5 days before due date',
        content: '“Your Apex fee for August will be $X. We will auto-charge on DATE unless you update payment details.”',
      },
      {
        channel: 'console',
        timing: 'Real-time once invoice is drafted',
        content: 'Dashboard banner with fee breakdown + link to VRA-backed detail view.',
      },
      {
        channel: 'email',
        timing: 'Charge event',
        content: 'Receipt confirming successful autopay or instructions if the payment failed.',
      },
    ],
  },
  transparencyCommitments: {
    weDontTouchPayouts: 'Publisher ad network payouts continue to flow directly; ApexMediation only observes data.',
    platformFeeOnly: 'Invoices only ever include the platform fee plus any agreed adjustments — nothing else.',
  },
  ancillaryChannels: [
    {
      id: 'wise-multi-currency',
      description: bankingFallbackRails.wiseMultiCurrency.description,
    },
    {
      id: 'stripe-hosted-portal',
      description: bankingFallbackRails.stripe.description,
    },
  ],
  enforcement: {
    gracePeriodDays: 7,
    delinquencyStages: [
      { day: 0, action: 'Invoice finalized, Stripe attempts immediate charge.' },
      { day: 3, action: 'Stripe retry + billing email reminder.' },
      { day: 5, action: 'Finance reviews account; Wise rails available on request.' },
      { day: 7, action: 'Access throttled until payment method restored or wire proof shared.' },
    ],
  },
  communications: {
    billingEmail: 'billing@apexmediation.ee',
    escalationEmail: 'contact@apexmediation.ee',
    officeHours: 'Weekdays 09:00-17:00 CET',
  },
}

export const getBillingPolicySnapshot = (): BillingPolicy => ({
  ...billingPolicy,
  primaryRail: { ...billingPolicy.primaryRail },
  fallbackRails: billingPolicy.fallbackRails.map((rail) => ({
    ...rail,
    account: { ...rail.account },
  })),
  starterExperience: { ...billingPolicy.starterExperience, capabilities: [...billingPolicy.starterExperience.capabilities] },
  upgradePath: {
    triggers: [...billingPolicy.upgradePath.triggers],
    acceptedPaymentMethods: billingPolicy.upgradePath.acceptedPaymentMethods.map((method) => ({ ...method, regions: [...method.regions] })),
    autopay: { ...billingPolicy.upgradePath.autopay },
  },
  billingCycle: {
    cadence: billingPolicy.billingCycle.cadence,
    computeSteps: [...billingPolicy.billingCycle.computeSteps],
    transparency: { ...billingPolicy.billingCycle.transparency },
    notifications: billingPolicy.billingCycle.notifications.map((notification) => ({ ...notification })),
  },
  transparencyCommitments: { ...billingPolicy.transparencyCommitments },
  ancillaryChannels: billingPolicy.ancillaryChannels.map((channel) => ({ ...channel })),
  enforcement: {
    gracePeriodDays: billingPolicy.enforcement.gracePeriodDays,
    delinquencyStages: billingPolicy.enforcement.delinquencyStages.map((stage) => ({ ...stage })),
  },
  communications: { ...billingPolicy.communications },
})
