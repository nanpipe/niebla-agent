'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { createApp } = require('../src/app')
const { loadConfig, shouldHandle } = require('../src/config')
const { verifyMetaSignature, safeEqual } = require('../src/signature')
const { parseWebhook, maskPhone } = require('../src/meta')

const SECRET = 'secreto-de-prueba'
const TEAM = '573001112233'

const sign = (raw, secret = SECRET) => 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')

const textPayload = (from, id = 'wamid.1', body = 'Hola') => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: { messages: [{ id, from, timestamp: '1764000000', type: 'text', text: { body } }] } }] }]
})

async function withServer (config, deps, fn) {
  const app = createApp(config, { log: { log () {}, error () {} }, ...deps })
  const server = app.listen(0)
  await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    await fn(base)
  } finally {
    server.close()
  }
}

const post = (base, raw, headers = {}) => fetch(base + '/webhook', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: raw })
const tick = () => new Promise(resolve => setImmediate(resolve))

test('firma: válida, alterada, ausente y sin secreto', () => {
  const raw = Buffer.from('{"a":1}')
  assert.equal(verifyMetaSignature(raw, sign(raw), SECRET), true)
  assert.equal(verifyMetaSignature(Buffer.from('{"a":2}'), sign(raw), SECRET), false)
  assert.equal(verifyMetaSignature(raw, sign(raw, 'otro'), SECRET), false)
  assert.equal(verifyMetaSignature(raw, undefined, SECRET), false)
  assert.equal(verifyMetaSignature(raw, 'sha256=zz', SECRET), false)
  assert.equal(verifyMetaSignature(raw, sign(raw, ''), ''), false)
})

test('safeEqual exige textos iguales y no vacíos', () => {
  assert.equal(safeEqual('abc', 'abc'), true)
  assert.equal(safeEqual('abc', 'abd'), false)
  assert.equal(safeEqual('', ''), false)
  assert.equal(safeEqual('abc', undefined), false)
})

test('POST sin firma o con firma mala: 401 y no procesa nada', async () => {
  let calls = 0
  const config = loadConfig({ META_APP_SECRET: SECRET, AGENT_MODE: 'live' })
  await withServer(config, { onMessage: () => { calls++ } }, async base => {
    const raw = JSON.stringify(textPayload(TEAM))
    assert.equal((await post(base, raw)).status, 401)
    assert.equal((await post(base, raw, { 'x-hub-signature-256': sign(raw, 'otro') })).status, 401)
    // El formato viejo (SendWo) ya no sirve para nada sin firma.
    assert.equal((await post(base, JSON.stringify({ chat_id: TEAM, user_message: 'x' }))).status, 401)
    await tick()
    assert.equal(calls, 0)
  })
})

test('sin META_APP_SECRET se rechaza todo, aunque venga firmado', async () => {
  const config = loadConfig({ AGENT_MODE: 'live' })
  await withServer(config, {}, async base => {
    const raw = JSON.stringify(textPayload(TEAM))
    assert.equal((await post(base, raw, { 'x-hub-signature-256': sign(raw) })).status, 401)
  })
})

test('modo test: solo números del equipo; ids repetidos una vez', async () => {
  const got = []
  const config = loadConfig({ META_APP_SECRET: SECRET, AGENT_MODE: 'test', TEAM_NUMBERS: `+57 300 111 2233, 573009998877` })
  await withServer(config, { onMessage: ev => { got.push(ev) } }, async base => {
    for (const [from, id] of [[TEAM, 'wamid.A'], ['573005556666', 'wamid.B'], [TEAM, 'wamid.A']]) {
      const raw = JSON.stringify(textPayload(from, id))
      assert.equal((await post(base, raw, { 'x-hub-signature-256': sign(raw) })).status, 200)
    }
    await tick()
    assert.deepEqual(got.map(e => e.id), ['wamid.A'])
    assert.equal(got[0].text, 'Hola')
  })
})

test('modo off (por defecto): no atiende a nadie', async () => {
  let calls = 0
  const config = loadConfig({ META_APP_SECRET: SECRET, TEAM_NUMBERS: TEAM })
  assert.equal(config.mode, 'off')
  await withServer(config, { onMessage: () => { calls++ } }, async base => {
    const raw = JSON.stringify(textPayload(TEAM))
    assert.equal((await post(base, raw, { 'x-hub-signature-256': sign(raw) })).status, 200)
    await tick()
    assert.equal(calls, 0)
  })
})

test('JSON inválido firmado: 400', async () => {
  const config = loadConfig({ META_APP_SECRET: SECRET, AGENT_MODE: 'live' })
  await withServer(config, {}, async base => {
    const raw = '{no es json'
    assert.equal((await post(base, raw, { 'x-hub-signature-256': sign(raw) })).status, 400)
  })
})

test('GET de verificación', async () => {
  const config = loadConfig({ WEBHOOK_VERIFY_TOKEN: 'tok' })
  await withServer(config, {}, async base => {
    const ok = await fetch(base + '/webhook?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=123')
    assert.equal(ok.status, 200)
    assert.equal(await ok.text(), '123')
    assert.equal((await fetch(base + '/webhook?hub.mode=subscribe&hub.verify_token=mal&hub.challenge=1')).status, 403)
  })
  // Sin token configurado, nunca verifica (antes: undefined === undefined pasaba).
  await withServer(loadConfig({}), {}, async base => {
    assert.equal((await fetch(base + '/webhook?hub.mode=subscribe&hub.challenge=1')).status, 403)
  })
})

test('parseWebhook: ecos de la app (Coexistencia), imagen con pie y estados', () => {
  const evs = parseWebhook({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [
        { field: 'smb_message_echoes', value: { message_echoes: [{ id: 'wamid.E', to: '573001112233', timestamp: '1' }] } },
        { field: 'messages', value: { messages: [{ id: 'wamid.I', from: '573001112233', type: 'image', image: { id: 'm1', mime_type: 'image/jpeg', caption: 'comprobante' } }], statuses: [{ id: 'wamid.S', status: 'read', recipient_id: '57300' }] } }
      ]
    }]
  })
  assert.deepEqual(evs.map(e => e.kind), ['echo', 'message', 'status'])
  assert.equal(evs[1].mediaId, 'm1')
  assert.equal(evs[1].text, 'comprobante')
  assert.deepEqual(parseWebhook({ object: 'page' }), [])
})

test('shouldHandle y maskPhone', () => {
  assert.equal(shouldHandle(loadConfig({ AGENT_MODE: 'live' }), '1'), true)
  assert.equal(shouldHandle(loadConfig({ AGENT_MODE: 'raro' }), TEAM), false)
  assert.equal(maskPhone('573001112233'), '…2233')
})
