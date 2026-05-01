import { sendJson, sanitizeText } from './_shared.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Metodo nao permitido.' });

  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  if (!stripeKey) return sendJson(res, 501, { error: 'Configure STRIPE_SECRET_KEY na Vercel.' });

  const origin = req.headers.origin || process.env.SITE_URL || 'http://localhost:3000';
  const label = sanitizeText(req.body?.label || 'Synapse AI Supporter', 120);
  const amount = Math.max(100, Math.min(Number(req.body?.amount || 100), 100));

  const body = new URLSearchParams({
    mode: 'payment',
    success_url: `${origin}/?donation=success`,
    cancel_url: `${origin}/?donation=cancelled`,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][price_data][product_data][name]': label,
    'line_items[0][price_data][product_data][description]': 'Doacao de 1 dolar para apoiar o Synapse AI.'
  });

  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    const data = await response.json();
    if (!response.ok) return sendJson(res, response.status, { error: data.error?.message || 'Erro no Stripe.' });
    sendJson(res, 200, { url: data.url });
  } catch (error) {
    sendJson(res, 500, { error: error.message || 'Erro inesperado no checkout.' });
  }
}
