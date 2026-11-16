/**
 * Invio di messaggi WhatsApp tramite modelli (template) approvati.
 * WhatsApp consente ai mittenti aziendali di scrivere per primi solo con modelli approvati,
 * quindi ogni tipo di messaggio (conferma, promemoria, ...) corrisponde a un modello.
 *
 * Variabili passate al modello, in quest'ordine:
 *   {{1}} nome del paziente   {{2}} prestazione   {{3}} medico
 *   {{4}} data e ora          {{5}} link per gestire/annullare l'appuntamento
 */
const config = require('../lib/config');

const wa = config.whatsapp;

function whatsappEnabled() {
  if (wa.provider === 'meta') return !!(wa.meta.token && wa.meta.phoneNumberId);
  if (wa.provider === 'twilio') return !!(wa.twilio.accountSid && wa.twilio.authToken && wa.twilio.from);
  return false;
}

async function sendMeta({ to, template, params }) {
  const url = `https://graph.facebook.com/${wa.meta.apiVersion}/${wa.meta.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${wa.meta.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: template,
        language: { code: wa.language },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }],
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `WhatsApp (Meta) HTTP ${res.status}`);
  return data?.messages?.[0]?.id;
}

async function sendTwilio({ to, template, params }) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${wa.twilio.accountSid}/Messages.json`;
  const from = wa.twilio.from.startsWith('whatsapp:') ? wa.twilio.from : `whatsapp:${wa.twilio.from}`;
  const body = new URLSearchParams({
    From: from,
    To: `whatsapp:+${to}`,
    ContentSid: template,
    ContentVariables: JSON.stringify(Object.fromEntries(params.map((v, i) => [String(i + 1), String(v)]))),
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${wa.twilio.accountSid}:${wa.twilio.authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `WhatsApp (Twilio) HTTP ${res.status}`);
  return data?.sid;
}

/**
 * Invia un messaggio WhatsApp. Se il canale non è configurato registra il testo nel log.
 * @returns {Promise<{status: 'INVIATO'|'SIMULATO', providerId?: string}>}
 */
async function sendWhatsapp({ to, kind, params, previewText }) {
  const template = wa.templates[kind];
  if (!whatsappEnabled() || !template) {
    console.log(`[whatsapp simulato] A: +${to} (${kind})\n${previewText}\n`);
    return { status: 'SIMULATO' };
  }
  const providerId = wa.provider === 'meta' ? await sendMeta({ to, template, params }) : await sendTwilio({ to, template, params });
  return { status: 'INVIATO', providerId };
}

module.exports = { sendWhatsapp, whatsappEnabled };
