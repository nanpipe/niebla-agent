'use strict'

const express = require('express')
const { verifyMetaSignature, safeEqual } = require('./signature')
const { parseWebhook, maskPhone } = require('./meta')
const { shouldHandle } = require('./config')

const MAX_BODY = '1mb'
const SEEN_MAX = 5000

/**
 * @param {object} config  de loadConfig()
 * @param {object} deps    { onMessage(event), onEcho(event), log }
 */
function createApp (config, deps = {}) {
  const log = deps.log || console
  const onMessage = deps.onMessage || (async () => {})
  const onEcho = deps.onEcho || (async () => {})
  const seen = new Set() // Meta reintenta: cada id se procesa una sola vez

  const app = express()
  app.disable('x-powered-by')

  app.get('/', (req, res) => {
    res.json({ status: 'Niebla Agent activo' })
  })

  app.get('/webhook', (req, res) => {
    const ok = req.query['hub.mode'] === 'subscribe' && safeEqual(String(req.query['hub.verify_token'] || ''), config.verifyToken)
    if (!ok) return res.status(403).send('Forbidden')
    res.status(200).type('text/plain').send(String(req.query['hub.challenge'] || ''))
  })

  // Cuerpo crudo: la firma se calcula sobre los bytes exactos que mandó Meta.
  app.post('/webhook', express.raw({ type: '*/*', limit: MAX_BODY }), (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
    if (!verifyMetaSignature(raw, req.get('x-hub-signature-256'), config.appSecret)) {
      return res.status(401).json({ ok: false })
    }
    let body
    try {
      body = JSON.parse(raw.toString('utf8'))
    } catch {
      return res.status(400).json({ ok: false })
    }
    // Responder ya: Meta espera un 200 rápido. Lo demás corre después.
    res.status(200).json({ ok: true })

    for (const ev of parseWebhook(body)) {
      if (ev.kind === 'status') continue
      if (seen.has(ev.id)) continue
      seen.add(ev.id)
      if (seen.size > SEEN_MAX) seen.delete(seen.values().next().value)

      if (ev.kind === 'echo') {
        Promise.resolve(onEcho(ev)).catch(err => log.error('echo', err && err.message))
      } else if (ev.kind === 'message') {
        if (!shouldHandle(config, ev.from)) continue
        log.log(`mensaje ${ev.type} de ${maskPhone(ev.from)}`)
        Promise.resolve(onMessage(ev)).catch(err => log.error('mensaje', err && err.message))
      }
    }
  })

  app.use((err, req, res, next) => {
    // Cuerpo demasiado grande o mal formado: sin detalles hacia afuera.
    res.status(err && err.status ? err.status : 500).json({ ok: false })
  })

  return app
}

module.exports = { createApp }
