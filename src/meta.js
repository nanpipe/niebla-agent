'use strict'

/**
 * Lee el webhook de WhatsApp Cloud API (con Coexistencia) y devuelve eventos simples.
 *
 *  - { kind: 'message', id, from, type, text, mediaId, mime, ts }  mensaje del cliente
 *  - { kind: 'echo', id, to, ts }  mensaje enviado desde la app WhatsApp Business (equipo)
 *  - { kind: 'status', id, status, to } estado de un mensaje que mandamos
 */
function parseWebhook (body) {
  const out = []
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return out
  for (const entry of body.entry) {
    for (const change of entry.changes || []) {
      const v = change.value || {}
      if (change.field === 'messages') {
        for (const m of v.messages || []) out.push(message(m))
        for (const s of v.statuses || []) {
          out.push({ kind: 'status', id: String(s.id || ''), status: String(s.status || ''), to: digits(s.recipient_id) })
        }
      } else if (change.field === 'smb_message_echoes') {
        for (const e of v.message_echoes || []) {
          out.push({ kind: 'echo', id: String(e.id || ''), to: digits(e.to), ts: Number(e.timestamp) || 0 })
        }
      }
    }
  }
  return out.filter(e => e.id)
}

function message (m) {
  const type = String(m.type || '')
  const media = ['image', 'document', 'audio', 'video', 'sticker'].includes(type) ? (m[type] || {}) : {}
  let text = ''
  if (type === 'text') text = m.text?.body || ''
  else if (type === 'button') text = m.button?.text || ''
  else if (type === 'interactive') text = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || ''
  else if (media.caption) text = media.caption
  return {
    kind: 'message',
    id: String(m.id || ''),
    from: digits(m.from),
    type,
    text: String(text).slice(0, 4000),
    mediaId: media.id ? String(media.id) : '',
    mime: media.mime_type ? String(media.mime_type) : '',
    ts: Number(m.timestamp) || 0
  }
}

function digits (v) {
  return String(v || '').replace(/\D+/g, '')
}

/** Para los registros: nunca el número completo. */
function maskPhone (p) {
  const d = digits(p)
  return d.length > 4 ? '…' + d.slice(-4) : '…'
}

module.exports = { parseWebhook, digits, maskPhone }
