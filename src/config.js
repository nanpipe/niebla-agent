'use strict'

const { digits } = require('./meta')

/**
 * Configuración desde variables de entorno (se ponen en Hostinger, nunca en el repo).
 *
 *   META_APP_SECRET       firma de los webhooks de Meta (obligatoria para aceptar POST)
 *   WEBHOOK_VERIFY_TOKEN  verificación del GET al suscribir el webhook
 *   AGENT_MODE            off (por defecto) | test (solo TEAM_NUMBERS) | live
 *   TEAM_NUMBERS          números del equipo, separados por coma (573001234567,…)
 */
function loadConfig (env = process.env) {
  const mode = ['off', 'test', 'live'].includes(env.AGENT_MODE) ? env.AGENT_MODE : 'off'
  return {
    port: Number(env.PORT) || 3000,
    appSecret: env.META_APP_SECRET || '',
    verifyToken: env.WEBHOOK_VERIFY_TOKEN || '',
    mode,
    team: new Set(String(env.TEAM_NUMBERS || '').split(',').map(digits).filter(Boolean))
  }
}

/** ¿El agente debe atender a este número? */
function shouldHandle (config, from) {
  if (config.mode === 'live') return true
  if (config.mode === 'test') return config.team.has(digits(from))
  return false
}

module.exports = { loadConfig, shouldHandle }
