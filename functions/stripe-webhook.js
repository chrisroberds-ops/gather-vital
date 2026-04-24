/**
 * Cloudflare Worker — Stripe webhook handler
 * Route: POST /api/stripe-webhook
 *
 * Deployed as a Cloudflare Pages Function or standalone Worker.
 * Receives Stripe webhook events and takes action based on event type.
 *
 * Environment variables required (set in Cloudflare dashboard or wrangler.toml):
 *   STRIPE_SECRET_KEY       — your Stripe secret key (sk_live_... or sk_test_...)
 *   STRIPE_WEBHOOK_SECRET   — from `stripe listen --print-secret` or dashboard
 *
 * To test locally:
 *   stripe listen --forward-to localhost:8788/api/stripe-webhook
 */

export async function onRequestPost(context) {
  const { request, env } = context

  const payload = await request.text()
  const sigHeader = request.headers.get('stripe-signature') ?? ''

  console.log(`[stripe-webhook] Received webhook, sig header present: ${!!sigHeader}`)

  // ── Signature verification ────────────────────────────────────────────────────
  // TODO: Wire signature verification here.
  // Replace the block below with real verification once STRIPE_WEBHOOK_SECRET is set:
  //
  //   const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' })
  //   let event
  //   try {
  //     event = stripe.webhooks.constructEvent(payload, sigHeader, env.STRIPE_WEBHOOK_SECRET)
  //   } catch (err) {
  //     console.error('[stripe-webhook] Signature verification failed:', err.message)
  //     return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  //   }
  //
  // For now, parse the raw payload without verification (TEST MODE ONLY — never in production):
  let event
  try {
    event = JSON.parse(payload)
  } catch {
    console.error('[stripe-webhook] Failed to parse payload')
    return new Response('Invalid JSON payload', { status: 400 })
  }

  console.log(`[stripe-webhook] Event type: ${event.type}`)

  // ── Event routing ─────────────────────────────────────────────────────────────
  // Acknowledge quickly (Stripe requires a 2xx within 30 seconds, ideally < 2s).
  // Heavy processing should be done via Cloudflare Queues or Durable Objects.

  switch (event.type) {

    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object
      console.log(`[stripe-webhook] payment_intent.succeeded: ${paymentIntent.id}`)
      console.log(`[stripe-webhook]   amount: ${paymentIntent.amount} cents`)
      console.log(`[stripe-webhook]   customer: ${paymentIntent.customer ?? 'none'}`)
      console.log(`[stripe-webhook]   metadata:`, paymentIntent.metadata)

      // TODO: Extract payment details and create a GivingRecord in the database.
      //
      // Expected metadata on the PaymentIntent (set server-side when creating it):
      //   paymentIntent.metadata.church_id   — which church this donation is for
      //   paymentIntent.metadata.person_id   — donor's person record ID (if known)
      //   paymentIntent.metadata.fund_id     — fund designation
      //   paymentIntent.metadata.frequency   — 'one_time' | 'weekly' | etc.
      //
      // Implementation:
      //   const { church_id, person_id, fund_id, frequency } = paymentIntent.metadata
      //   const amount = paymentIntent.amount / 100  // convert cents to dollars
      //   await db.createGivingRecord({
      //     church_id,
      //     person_id,
      //     amount,
      //     date: new Date().toISOString().split('T')[0],
      //     method: 'online_card',
      //     fund: fund_id,
      //     source: 'stripe',
      //     frequency,
      //     is_online: true,
      //     stripe_payment_intent_id: paymentIntent.id,
      //     stripe_customer_id: paymentIntent.customer,
      //   })
      break
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object
      console.log(`[stripe-webhook] invoice.payment_succeeded: ${invoice.id}`)
      console.log(`[stripe-webhook]   subscription: ${invoice.subscription}`)
      console.log(`[stripe-webhook]   amount_paid: ${invoice.amount_paid} cents`)
      console.log(`[stripe-webhook]   customer: ${invoice.customer}`)

      // TODO: Extract subscription charge details and create a GivingRecord.
      //
      // This fires for every recurring charge. The subscription ID links back to
      // your recurring_subscriptions table to look up church_id, person_id, fund_id.
      //
      // Implementation:
      //   const sub = await db.getRecurringSubscriptionByStripeId(invoice.subscription)
      //   if (!sub) { console.warn('No matching subscription found for', invoice.subscription); break }
      //   await db.createGivingRecord({
      //     church_id: sub.church_id,
      //     person_id: sub.person_id,
      //     amount: invoice.amount_paid / 100,
      //     date: new Date().toISOString().split('T')[0],
      //     method: 'online_card',
      //     fund: sub.fund_id,
      //     source: 'stripe',
      //     frequency: sub.frequency,
      //     is_online: true,
      //     stripe_subscription_id: invoice.subscription,
      //     stripe_customer_id: invoice.customer,
      //   })
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object
      console.log(`[stripe-webhook] customer.subscription.deleted: ${subscription.id}`)
      console.log(`[stripe-webhook]   customer: ${subscription.customer}`)
      console.log(`[stripe-webhook]   status: ${subscription.status}`)

      // TODO: Mark subscription as cancelled in the database.
      //
      // Implementation:
      //   const sub = await db.getRecurringSubscriptionByStripeId(subscription.id)
      //   if (sub) {
      //     await db.cancelRecurringSubscription(sub.id)
      //   }
      break
    }

    default:
      console.log(`[stripe-webhook] Unhandled event type: ${event.type} — ignoring`)
  }

  // Always return 200 quickly so Stripe does not retry unnecessarily.
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
