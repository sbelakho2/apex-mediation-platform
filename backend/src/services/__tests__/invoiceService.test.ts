import { InvoiceService, Invoice } from '../invoiceService';

// Mock pg Pool used inside the module to avoid real DB
jest.mock('pg', () => {
  const mClient = {
    query: jest.fn(async (sql: string) => {
      if (/FROM users/i.test(sql)) {
        return { rows: [{ name: 'Test Co', address: '123 Test St' }] } as any;
      }
      return { rows: [] } as any;
    }),
  };
  return { Pool: jest.fn(() => mClient) };
});

describe('InvoiceService', () => {
  const service = new InvoiceService();

  const baseInvoice: Invoice = {
    id: 'inv_1',
    invoice_number: '2025-0001',
    customer_id: 'cust_1',
    subscription_id: null,
    invoice_date: new Date('2025-01-01').toISOString(),
    due_date: new Date('2025-01-15').toISOString(),
    amount_cents: 1000,
    tax_amount_cents: 200,
    total_amount_cents: 1200,
    currency: 'usd',
    status: 'pending',
    paid_at: null,
    stripe_invoice_id: null,
    pdf_url: null,
    line_items: [
      { description: 'Service fee', quantity: 1, unit_price_cents: 1000, total_cents: 1000 },
    ],
    notes: null,
    created_at: new Date('2025-01-01').toISOString(),
    updated_at: new Date('2025-01-01').toISOString(),
  };

  it('generates a PDF buffer with valid line items', async () => {
    const pdf = await service.generateInvoicePDF(baseInvoice);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(0);
  });

  it('throws for invalid line items (negative quantity)', async () => {
    const bad: Invoice = {
      ...baseInvoice,
      id: 'inv_bad',
      line_items: [{ description: 'Bad', quantity: -1, unit_price_cents: 100, total_cents: 100 }],
    };
    await expect(service.generateInvoicePDF(bad)).rejects.toThrow(/quantity must be a non-negative/);
  });

  it('adjusts totals in PDF generation when mismatched (logs warning path)', async () => {
    const mismatched: Invoice = {
      ...baseInvoice,
      id: 'inv_mismatch',
      amount_cents: 999, // does not equal subtotal (1000)
      total_amount_cents: 1199, // does not equal subtotal + tax (1200)
    };
    const buf = await service.generateInvoicePDF(mismatched);
    expect(buf.byteLength).toBeGreaterThan(0);
  });
});
