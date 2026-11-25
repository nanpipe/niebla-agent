'use strict'

const { loadConfig } = require('./src/config')
const { createApp } = require('./src/app')

const config = loadConfig()

if (!config.appSecret) {
  // Sin App Secret no se acepta ningún POST (la firma nunca valida).
  console.warn('META_APP_SECRET no está definido: el webhook rechaza todo.')
}

// Fase 0: el webhook verifica la firma y descarta. El agente con herramientas llega después
// y se conecta en onMessage / onEcho.
const app = createApp(config, {
  onMessage: async () => {},
  onEcho: async () => {}
})

app.listen(config.port, () => console.log(`Servidor corriendo en puerto ${config.port} (modo ${config.mode})`))
