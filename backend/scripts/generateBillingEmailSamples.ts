import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import {
  BillingPreviewEmailContent,
  PaymentFailedEmailContent,
  PaymentRetryEmailContent,
  PaymentSucceededEmailContent,
  buildBillingPreviewEmail,
  buildPaymentFailedEmail,
  buildPaymentRetryEmail,
  buildPaymentSucceededEmail,
} from '../services/email/billingEmailBuilders';

const OUTPUT_DIR = path.resolve(__dirname, '../../docs/Internal/QA/billing-policy/samples');

const billingPreviewSample: BillingPreviewEmailContent = {
  invoice_month: 'November 2025',
  amount_due: '4,800.00',
  currency: 'eur',
  autopay_date: 'Nov 30, 2025',
  invoice_url: 'https://console.apexmediation.ee/billing/invoices/2025-11',
  update_payment_url: 'https://console.apexmediation.ee/billing/payment-method',
  payment_method_brand: 'Visa',
  payment_method_last4: '4242',
};

const paymentFailedSample: PaymentFailedEmailContent = {
  invoice_id: 'in_test_failed',
  amount_due: '4,800.00',
  currency: 'eur',
  payment_url: 'https://console.apexmediation.ee/billing/pay/in_test_failed',
  next_retry_date: 'Dec 2, 2025',
  payment_method_summary: 'Visa •••• 4242',
};

const paymentRetrySample: PaymentRetryEmailContent = {
  attempt_number: 2,
  days_until_retry: 2,
  max_retries: 3,
  next_retry_date: 'Dec 4, 2025',
  payment_method_summary: 'Visa •••• 4242',
  payment_url: 'https://console.apexmediation.ee/billing',
};

const paymentSucceededSample: PaymentSucceededEmailContent = {
  amount_paid: '4,800.00',
  currency: 'eur',
  invoice_url: 'https://console.apexmediation.ee/billing/receipts/in_test_failed',
  payment_method_summary: 'Visa •••• 4242',
};

function wrapHtmlDocument(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; background: #f5f6fb; }
      .email-preview { max-width: 640px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 12px; box-shadow: 0 3px 12px rgba(0,0,0,0.08); }
      h1, h2 { font-weight: 600; }
      p, li { font-size: 15px; line-height: 1.6; color: #0f172a; }
      ul { padding-left: 20px; }
      a { color: #00295A; }
    </style>
  </head>
  <body>
    <div class="email-preview">
      ${body}
    </div>
  </body>
</html>`;
}

function ensureOutputDir(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

function writePreview(filename: string, subject: string, html: string): void {
  const fullHtml = wrapHtmlDocument(subject, html);
  writeFileSync(path.join(OUTPUT_DIR, filename), fullHtml, 'utf8');
}

function main(): void {
  ensureOutputDir();

  const previews = [
    { name: 'billing-preview-sample.html', render: () => buildBillingPreviewEmail(billingPreviewSample) },
    { name: 'payment-failed-sample.html', render: () => buildPaymentFailedEmail(paymentFailedSample) },
    { name: 'payment-retry-sample.html', render: () => buildPaymentRetryEmail(paymentRetrySample) },
    { name: 'payment-succeeded-sample.html', render: () => buildPaymentSucceededEmail(paymentSucceededSample) },
  ];

  previews.forEach(({ name, render }) => {
    const { subject, html } = render();
    writePreview(name, subject, html);
  });

  console.log(`Generated ${previews.length} billing email previews in ${OUTPUT_DIR}`);
}

main();
