const express = require('express')
const app = express()

app.use(express.json())

app.get('/', (req, res) => {
  res.json({ status: 'Niebla Agent activo' })
})

app.post('/webhook', async (req, res) => {
  const { first_name, chat_id, user_message } = req.body

  if (!user_message || !chat_id) {
    return res.status(200).json({ ok: true })
  }

  try {
    // 1. Llamar a Claude
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1000,
        system: `Eres el asistente virtual de Niebla, marca colombiana de cuero artesanal con sede en Cali. 
Vendemos billeteras, porta pasaportes, cinturones y accesorios con grabado láser personalizado.

REGLAS:
- Responde siempre en español, tono amigable y profesional
- Solo habla de productos de Niebla
- Si preguntan por grabado: requiere 50% de pago anticipado y confirmación por email
- Envíos: Coordinadora para ciudades principales, Interrapidísimo para municipios
- Si el cliente quiere comprar o necesita asesor humano, diles que escriban "asesor"
- Nunca inventes precios ni productos que no conozcas
- Respuestas cortas y directas, máximo 3 párrafos`,
        messages: [
          {
            role: 'user',
            content: `Cliente: ${first_name}\nMensaje: ${user_message}`
          }
        ]
      })
    })

    const claudeData = await claudeRes.json()
    const reply = claudeData.content[0].text

    // 2. Enviar respuesta por SendWo
    await fetch('https://bot.sendwo.com/api/v1/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiToken: process.env.SENDWO_API_TOKEN,
        phone_number_id: process.env.SENDWO_PHONE_NUMBER_ID,
        message: reply,
        phone_number: chat_id
      })
    })

    res.status(200).json({ ok: true })

  } catch (error) {
    console.error('Error:', error)
    res.status(200).json({ ok: true })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`))