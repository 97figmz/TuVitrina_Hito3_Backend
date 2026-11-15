import 'dotenv/config'
import { createApp } from './app.js'
import { pool } from './db.js'

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  console.error('Faltan DATABASE_URL o JWT_SECRET en .env')
  process.exit(1)
}

const port = Number(process.env.PORT || 3000)
const app = createApp(pool)
app.listen(port, () => console.log(`TuVitrina API: http://localhost:${port}`))
