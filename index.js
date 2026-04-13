const express = require('express')
const app = express()

app.use(express.json())

app.get('/', (req, res) => {
  res.json({ status: 'Niebla Agent activo' })
})

app.post('/webhook', (req, res) => {
  console.log('BODY:', JSON.stringify(req.body, null, 2))
  console.log('HEADERS:', JSON.stringify(req.headers, null, 2))
  res.status(200).json({ ok: true })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`))