import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { logger } from '../utils/logger';
import { invoiceService } from '../services/invoiceService';
import { Pool } from 'pg';

const router = Router();

let stripeClient: Stripe | null = null;

const getStripeClient = (): Stripe => {
  if (stripeClient) {
    return stripeClient;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Stripe secret key not configured');
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: '2025-10-29.clover',
  });

  return stripeClient;
};

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

/**
 * POST /api/v1/webhooks/stripe
 * Handle Stripe webhook events
 * 
 * Note: This endpoint must use raw body, not JSON parsed body
 */
router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    logger.warn('Stripe webhook: missing signature');
    return res.status(400).send('Missing signature');
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripeClient();
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,
      sig as string,
      webhookSecret
    );
  } catch (err) {
    logger.error('Stripe webhook signature verification failed', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    return res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  // Check for duplicate event (idempotency)
  const existingEvent = await db.query(
    `SELECT id FROM stripe_webhook_events WHERE stripe_event_id = $1`,
    [event.id]
  );

  if (existingEvent.rows.length > 0) {
    logger.info('Stripe webhook: duplicate event ignored', { eventId: event.id });
    return res.json({ received: true, duplicate: true });
  }

  // Store event for idempotency
  await db.query(
    `INSERT INTO stripe_webhook_events (stripe_event_id, event_type, processed, created_at)
     VALUES ($1, $2, false, NOW())`,
    [event.id, event.type]
  );

  // Handle the event
  try {
    switch (event.type) {
      case 'invoice.created':
        await handleInvoiceCreated(event.data.object as Stripe.Invoice);
        break;
      
      case 'invoice.finalized':
        await handleInvoiceFinalized(event.data.object as Stripe.Invoice);
        break;
      
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      
      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;
      
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      
      default:
        logger.info('Stripe webhook: unhandled event type', { type: event.type });
    }

    // Mark event as processed
    await db.query(
      `UPDATE stripe_webhook_events SET processed = true, processed_at = NOW()
       WHERE stripe_event_id = $1`,
      [event.id]
    );

    logger.info('Stripe webhook processed successfully', {
      eventId: event.id,
      type: event.type,
    });
  } catch (error) {
    logger.error('Error processing Stripe webhook', {
      eventId: event.id,
      type: event.type,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Don't return error to Stripe - we'll retry manually
    // Stripe will retry automatically if we return 5xx
  }

  res.json({ received: true });
});

/**
 * Handle invoice.created event
 */
async function handleInvoiceCreated(invoice: Stripe.Invoice): Promise<void> {
  logger.info('Handling invoice.created', { invoiceId: invoice.id });
  
  // Sync invoice to database
  await invoiceService.syncInvoiceFromStripe(invoice.id);
  
  // Log to audit trail
  await db.query(
    `INSERT INTO billing_audit (event_type, data, created_at)
     VALUES ($1, $2, NOW())`,
    ['invoice_created', JSON.stringify({ stripe_invoice_id: invoice.id })]
  );
}

/**
 * Handle invoice.finalized event
 */
async function handleInvoiceFinalized(invoice: Stripe.Invoice): Promise<void> {
  logger.info('Handling invoice.finalized', { invoiceId: invoice.id });
  
  await invoiceService.syncInvoiceFromStripe(invoice.id);
  
  await db.query(
    `INSERT INTO billing_audit (event_type, data, created_at)
     VALUES ($1, $2, NOW())`,
    ['invoice_finalized', JSON.stringify({ stripe_invoice_id: invoice.id })]
  );
}

/**
 * Handle invoice.payment_succeeded event
 */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  logger.info('Handling invoice.payment_succeeded', { invoiceId: invoice.id });
  
  // Update invoice status to paid
  await db.query(
    `UPDATE invoices 
     SET status = 'paid', paid_at = NOW(), updated_at = NOW()
     WHERE stripe_invoice_id = $1`,
    [invoice.id]
  );
  
  // Reset failed payment counter
  if ((invoice as any).subscription) {
    await db.query(
      `UPDATE subscriptions 
       SET failed_payment_count = 0, status = 'active'
       WHERE stripe_subscription_id = $1`,
      [(invoice as any).subscription]
    );
  }
  
  // Emit success event for email
  await db.query(
    `INSERT INTO events (event_type, data, created_at)
     VALUES ($1, $2, NOW())`,
    [
      'invoice.payment_succeeded',
      JSON.stringify({
        stripe_invoice_id: invoice.id,
        customer_id: invoice.customer,
        amount: invoice.total,
      }),
    ]
  );
  
  await db.query(
    `INSERT INTO billing_audit (event_type, data, created_at)
     VALUES ($1, $2, NOW())`,
    ['payment_succeeded', JSON.stringify({ stripe_invoice_id: invoice.id, amount: invoice.total })]
  );
}

/**
 * Handle invoice.payment_failed event
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  logger.warn('Handling invoice.payment_failed', { invoiceId: invoice.id });
  
  // Increment failed payment counter
  if ((invoice as any).subscription) {
    await db.query(
      `UPDATE subscriptions 
       SET failed_payment_count = failed_payment_count + 1,
           last_failed_payment_at = NOW(),
           status = 'past_due'
       WHERE stripe_subscription_id = $1`,
      [(invoice as any).subscription]
    );
  }
  
  // Emit failure event for dunning management
  await db.query(
    `INSERT INTO events (event_type, data, created_at)
     VALUES ($1, $2, NOW())`,
    [
      'invoice.payment_failed',
      JSON.stringify({
        stripe_invoice_id: invoice.id,
        customer_id: invoice.customer,
        amount: invoice.total,
        attempt_count: invoice.attempt_count,
      }),
    ]
  );
  
  await db.query(
    `INSERT INTO billing_audit (event_type, data, created_at)
     VALUES ($1, $2, NOW())`,
    ['payment_failed', JSON.stringify({ stripe_invoice_id: invoice.id })]
  );
}

/**
 * Handle charge.refunded event
 */
async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  logger.info('Handling charge.refunded', { chargeId: charge.id });
  
  // Update invoice status if linked
  if ((charge as any).invoice) {
    await db.query(
      `UPDATE invoices 
       SET status = 'refunded', updated_at = NOW()
       WHERE stripe_invoice_id = $1`,
      [(charge as any).invoice]
    );
  }
  
  await db.query(
    `INSERT INTO billing_audit (event_type, data, created_at)
     VALUES ($1, $2, NOW())`,
    ['charge_refunded', JSON.stringify({ charge_id: charge.id, amount: charge.amount_refunded })]
  );
}

/**
 * Handle customer.subscription.updated event
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  logger.info('Handling subscription.updated', { subscriptionId: subscription.id });
  
  // Update subscription in database
  await db.query(
    `UPDATE subscriptions
     SET status = $1,
         current_period_start = $2,
         current_period_end = $3,
         updated_at = NOW()
     WHERE stripe_subscription_id = $4`,
    [
      subscription.status,
      new Date((subscription as any).current_period_start * 1000),
      new Date((subscription as any).current_period_end * 1000),
      subscription.id,
    ]
  );
}

/**
 * Handle customer.subscription.deleted event
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  logger.info('Handling subscription.deleted', { subscriptionId: subscription.id });
  
  await db.query(
    `UPDATE subscriptions
     SET status = 'cancelled', 
         cancelled_at = NOW(),
         updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscription.id]
  );
  
  await db.query(
    `INSERT INTO billing_audit (event_type, data, created_at)
     VALUES ($1, $2, NOW())`,
    ['subscription_cancelled', JSON.stringify({ stripe_subscription_id: subscription.id })]
  );
}

export default router;
