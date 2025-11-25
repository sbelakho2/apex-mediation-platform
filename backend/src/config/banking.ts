import { env } from './env';

export type BankAccountDetails = {
  label: string;
  accountName: string;
  bankName: string;
  iban?: string;
  bic?: string;
  swift?: string;
  accountNumber?: string;
  routingNumber?: string;
  accountType?: string;
  bankAddress?: string;
  notes?: string;
};

export type PaymentInstruction = {
  heading: string;
  description: string;
  account: BankAccountDetails;
  default: boolean;
};

const companyName = env.COMPANY_NAME;

const sepaBankAccount: BankAccountDetails = {
  label: 'SEPA (EUR)',
  accountName: companyName,
  bankName: env.SEPA_BANK_NAME,
  iban: env.SEPA_BANK_IBAN,
  bic: env.SEPA_BANK_BIC,
  swift: env.SEPA_BANK_BIC,
  bankAddress: env.SEPA_BANK_ADDRESS,
  notes: 'Please include the invoice number in the payment reference.',
};

const achBankAccount: BankAccountDetails = {
  label: 'ACH (USD)',
  accountName: companyName,
  bankName: env.ACH_BANK_NAME,
  accountNumber: env.ACH_ACCOUNT_NUMBER,
  routingNumber: env.ACH_ROUTING_NUMBER,
  accountType: env.ACH_ACCOUNT_TYPE,
  swift: env.ACH_SWIFT,
  bankAddress: env.ACH_BANK_ADDRESS,
  notes: 'ACH payments settle in 1-3 US business days.',
};

const sebBankAccount: BankAccountDetails | null = env.SEB_BANK_IBAN
  ? {
      label: 'SEB Pank (EUR)',
      accountName: companyName,
      bankName: env.SEB_BANK_NAME ?? 'SEB Pank AS',
      iban: env.SEB_BANK_IBAN,
      bic: env.SEB_BANK_BIC ?? 'EEUHEE2X',
      bankAddress: env.SEB_BANK_ADDRESS ?? 'Tornimäe 2, 15010 Tallinn, Estonia',
      notes: 'SEB account available upon request for customers that require local Estonian rails.',
    }
  : null;

export const primaryLedgerBankName = 'Bank - Wise';
export const secondarySebLedgerName = 'Bank - SEB';

export const paymentInstructions: PaymentInstruction[] = [
  {
    heading: 'Default: Bank Transfer (SEPA)',
    description:
      'Send EUR payments via SEPA directly to our Estonian Wise business account. Include the invoice number as the transfer reference.',
    account: sepaBankAccount,
    default: true,
  },
  {
    heading: 'Default for USD payers: ACH',
    description:
      'Send USD payments via ACH to our Wise-issued US account. Payments typically clear within 1-3 US business days.',
    account: achBankAccount,
    default: true,
  },
];

if (sebBankAccount) {
  paymentInstructions.splice(1, 0, {
    heading: 'Optional: SEB business account (EUR)',
    description: 'Local Estonian customers can request SEB settlement for government or enterprise procurement flows.',
    account: sebBankAccount,
    default: false,
  });
}

export function getPaymentInstructions(): PaymentInstruction[] {
  return paymentInstructions;
}

export const fallbackRails = {
  wiseMultiCurrency: {
    description: 'Wise multi-currency link (instant settlements, mid-market FX).',
  },
  stripe: {
    description: 'Stripe hosted payments portal (cards + wallets, 2.9% + fees).',
  },
};
