'use strict'

const crypto = require('node:crypto')

/**
 * Verifica X-Hub-Signature-256 de Meta: "sha256=" + HMAC-SHA256(cuerpo crudo, App Secret).
 * Falla cerrado: sin secreto, sin cuerpo o sin firma bien formada → false.
 */
function verifyMetaSignature (rawBody, header, appSecret) {
  if (!appSecret || !Buffer.isBuffer(rawBody) || typeof header !== 'string') return false
  const m = /^sha256=([a-f0-9]{64})$/i.exec(header.trim())
  if (!m) return false
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest()
  const given = Buffer.from(m[1], 'hex')
  return given.length === expected.length && crypto.timingSafeEqual(given, expected)
}

/** Comparación en tiempo constante de dos textos (verify token del GET). */
function safeEqual (a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a === '' || b === '') return false
  const ha = crypto.createHash('sha256').update(a).digest()
  const hb = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length
}

module.exports = { verifyMetaSignature, safeEqual }
