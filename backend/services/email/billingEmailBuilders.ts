export const SUPPORT_EMAIL_ADDRESS = 'support@apexmediation.ee';

export interface RenderedEmailContent {
  subject: string;
  html: string;
}

export interface BillingPreviewEmailContent {
  invoice_month: string;
  amount_due: string;
  currency: string;
  autopay_date: string;
  invoice_url: string;
  update_payment_url: string;
  payment_method_brand?: string;
  payment_method_last4?: string;
}

export type BillingPreviewEmailPayload = BillingPreviewEmailContent & {
  to: string;
  customer_id: string;
};

export interface PaymentFailedEmailContent {
  invoice_id: string;
  amount_due: string;
  currency: string;
  payment_url: string;
  next_retry_date?: string;
  payment_method_summary?: string;
}

export type PaymentFailedEmailPayload = PaymentFailedEmailContent & {
  to: string;
  customer_id: string;
};

export interface PaymentRetryEmailContent {
  attempt_number: number;
  days_until_retry: number;
  max_retries: number;
  next_retry_date?: string;
  payment_method_summary?: string;
  payment_url?: string;
}

export type PaymentRetryEmailPayload = PaymentRetryEmailContent & {
  to: string;
  customer_id: string;
};

export interface PaymentSucceededEmailContent {
  amount_paid: string;
  currency: string;
  invoice_url?: string;
  payment_method_summary?: string;
}

export type PaymentSucceededEmailPayload = PaymentSucceededEmailContent & {
  to: string;
  customer_id: string;
};

export function buildBillingPreviewEmail(data: BillingPreviewEmailContent): RenderedEmailContent {
  const methodSummary = data.payment_method_brand && data.payment_method_last4
    ? `${data.payment_method_brand} •••• ${data.payment_method_last4}`
    : 'your saved Stripe payment method';

  return {
    subject: `Heads-up: ${data.invoice_month} Apex fee auto-charges on ${data.autopay_date}`,
    html: `
        <h1>${data.invoice_month} billing preview</h1>
        <p>Hi there,</p>
        <p>We will auto-charge <strong>${data.currency.toUpperCase()} ${data.amount_due}</strong> on <strong>${data.autopay_date}</strong> using ${methodSummary}.</p>
        <p>If everything looks correct, no action is required.</p>

        <h2>Before we charge</h2>
        <ul>
          <li>Review the full invoice breakdown (apps, tiers, adjustments) at the link below.</li>
          <li>Need to switch payment rails? Stripe cards & wallets work globally, ACH covers US accounts, and SEPA Direct Debit covers the EU/EEA.</li>
          <li>Prefer a Wise wire this month? Reply to this email so we can note finance approval before the charge date.</li>
        </ul>

        <p>
          <a href="${data.invoice_url}" style="background: #00295A; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; display: inline-block; margin-right: 8px;">View invoice preview</a>
          <a href="${data.update_payment_url}" style="border: 1px solid #00295A; color: #00295A; padding: 12px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">Update payment method</a>
        </p>

        <p>If you do nothing, Stripe will charge the saved method automatically on ${data.autopay_date} and email you a receipt.</p>

        <p>Best regards,<br>
        ApexMediation Billing</p>
      `,
  };
}

export function buildPaymentFailedEmail(data: PaymentFailedEmailContent): RenderedEmailContent {
  const methodSummary = data.payment_method_summary || 'your saved Stripe autopay method';
  const retryLine = data.next_retry_date
    ? `We'll automatically retry on <strong>${data.next_retry_date}</strong>.`
    : 'Stripe will automatically retry over the next few days (day 3, 5, and 7).';

  return {
    subject: '⚠️ Payment failed - action required',
    html: `
        <h1>Payment Failed</h1>
        <p>Hi there,</p>
        <p>We attempted to auto-charge <strong>${data.currency.toUpperCase()} ${data.amount_due}</strong> using ${methodSummary}, but Stripe declined the payment.</p>
        
        <p>${retryLine}</p>
        
        <h2>Fix it now</h2>
        <p><a href="${data.payment_url}" style="background: #cc0000; color: white; padding: 10px 20px; text-decoration: none; display: inline-block; border-radius: 5px;">Update payment method</a></p>
        
        <h2>What happens next?</h2>
        <ul>
          <li>Your stored Stripe method (cards & wallets globally, ACH in the US, SEPA in the EU) will be retried automatically.</li>
          <li>If all retries fail, we pause mediation on day 7 until the balance clears. Wise wire instructions are available on request.</li>
        </ul>
        
        <p><strong>Common reasons for payment failure:</strong></p>
        <ul>
          <li>Insufficient funds</li>
          <li>Expired card</li>
          <li>Incorrect billing address</li>
          <li>Bank declined the charge</li>
        </ul>
        
        <p>Need help or prefer a manual wire this cycle? Reply to this email or contact <a href="mailto:${SUPPORT_EMAIL_ADDRESS}">${SUPPORT_EMAIL_ADDRESS}</a></p>
        
        <p>Best regards,<br>
        ApexMediation Team</p>
      `,
  };
}

export function buildPaymentRetryEmail(data: PaymentRetryEmailContent): RenderedEmailContent {
  const attemptsRemaining = data.max_retries - data.attempt_number;
  const methodSummary = data.payment_method_summary || 'your saved Stripe autopay method';
  const nextRetryLine = data.next_retry_date
    ? `Stripe will try again on <strong>${data.next_retry_date}</strong>.`
    : `Stripe will try again automatically in ${data.days_until_retry} day${data.days_until_retry > 1 ? 's' : ''}.`;

  const finalWarning = attemptsRemaining === 1
    ? `
          <p style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
            <strong>⚠️ Final Reminder:</strong> This is your last chance to update your payment method before your service is suspended.
          </p>
        `
    : '';

  return {
    subject: `Payment retry ${data.attempt_number} of ${data.max_retries}`,
    html: `
        <h1>Payment Retry Attempt ${data.attempt_number}</h1>
        <p>Hi there,</p>
        <p>Stripe couldn't auto-charge ${methodSummary} yet. ${nextRetryLine}</p>
        
        <p><strong>Attempts remaining:</strong> ${attemptsRemaining}</p>
        
        ${finalWarning}
        
        <p><a href="${data.payment_url || 'https://console.apexmediation.ee/billing'}" style="background: #cc0000; color: white; padding: 10px 20px; text-decoration: none; display: inline-block; border-radius: 5px;">Update payment method now</a></p>
        
        <p>If you need us to switch the charge to ACH, SEPA, or a Wise wire for this cycle, reply to this email.</p>
        
        <p>Best regards,<br>
        ApexMediation Team</p>
      `,
  };
}

export function buildPaymentSucceededEmail(data: PaymentSucceededEmailContent): RenderedEmailContent {
  const methodSummary = data.payment_method_summary || 'your saved Stripe autopay method';

  return {
    subject: `✅ Autopay receipt — ${data.currency.toUpperCase()} ${data.amount_paid}`,
    html: `
        <h1>Autopay successful</h1>
        <p>Hi there,</p>
        <p>Great news! We successfully charged <strong>${data.currency.toUpperCase()} ${data.amount_paid}</strong> using ${methodSummary}. Your account remains in good standing.</p>
        
        <h2>Need the invoice?</h2>
        <p><a href="${data.invoice_url || 'https://console.apexmediation.ee/billing'}" style="background: #00295A; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">Download invoice & receipt</a></p>
        
        <p>No further action is needed. If you prefer to use ACH, SEPA, or Wise wire for the next cycle, update your payment preferences before the next billing preview email.</p>
        
        <p>Best regards,<br>
        ApexMediation Team</p>
      `,
  };
}
