import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import { requireAuth, signToken } from './auth.js'

export function createApp(db) {
  const app = express()
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',') || 'http://localhost:5173' }))
  app.use(express.json())
  const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
  const positiveId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0
  const clean = (v) => typeof v === 'string' ? v.trim() : ''

  app.get('/', (req, res) => res.json({ mensaje: 'API TuVitrina funcionando' }))

  app.post('/usuarios', asyncRoute(async (req, res) => {
    const nombre = clean(req.body?.name ?? req.body?.nombre)
    const email = clean(req.body?.email).toLowerCase()
    const password = req.body?.password
    if (!nombre || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Nombre, email y contraseña (mínimo 6 caracteres) requeridos' })
    }
    const hash = await bcrypt.hash(password, 10)
    try {
      const result = await db.query('INSERT INTO usuarios (nombre, email, password_hash) VALUES ($1, $2, $3) RETURNING id, nombre, email', [nombre, email, hash])
      return res.status(201).json(result.rows[0])
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Correo ya registrado' })
      throw error
    }
  }))

  app.post('/login', asyncRoute(async (req, res) => {
    const email = clean(req.body?.email).toLowerCase()
    const password = req.body?.password
    if (!email || typeof password !== 'string') return res.status(400).json({ error: 'Email y contraseña requeridos' })
    const result = await db.query('SELECT id, nombre, email, password_hash FROM usuarios WHERE email = $1', [email])
    const user = result.rows[0]
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Credenciales incorrectas' })
    const token = signToken(user)
    return res.json({ token, user: { id: user.id, name: user.nombre, email: user.email } })
  }))

  app.get('/categorias', asyncRoute(async (_req, res) => {
    const result = await db.query('SELECT id, nombre FROM categorias ORDER BY id')
    res.json(result.rows)
  }))

  app.get('/publicaciones', asyncRoute(async (req, res) => {
    const q = clean(req.query.q)
    const categoria = clean(req.query.categoria)
    const result = await db.query(`
      SELECT p.id, p.titulo AS title, p.descripcion AS description, p.precio AS price,
        p.imagen_url AS image_url, p.ubicacion, c.nombre AS category,
        u.nombre AS seller, p.usuario_id AS "ownerId"
      FROM publicaciones p
      JOIN usuarios u ON u.id = p.usuario_id
      JOIN categorias c ON c.id = p.categoria_id
      WHERE ($1 = '' OR p.titulo ILIKE '%' || $1 || '%' OR p.descripcion ILIKE '%' || $1 || '%')
        AND ($2 = '' OR c.nombre = $2)
      ORDER BY p.id DESC`, [q, categoria])
    res.json(result.rows)
  }))

  app.get('/publicaciones/:id', asyncRoute(async (req, res) => {
    if (!positiveId(req.params.id)) return res.status(400).json({ error: 'ID inválido' })
    const result = await db.query(`
      SELECT p.id, p.titulo AS title, p.descripcion AS description, p.precio AS price,
        p.imagen_url AS image_url, p.ubicacion, c.nombre AS category,
        u.nombre AS seller, p.usuario_id AS "ownerId"
      FROM publicaciones p
      JOIN usuarios u ON u.id = p.usuario_id
      JOIN categorias c ON c.id = p.categoria_id
      WHERE p.id = $1`, [req.params.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Publicación no encontrada' })
    res.json(result.rows[0])
  }))

  app.post('/publicaciones', requireAuth, asyncRoute(async (req, res) => {
    const titulo = clean(req.body?.title ?? req.body?.titulo)
    const descripcion = clean(req.body?.description ?? req.body?.descripcion)
    const categoria = clean(req.body?.category ?? req.body?.categoria)
    const precio = Number(req.body?.price ?? req.body?.precio)
    const ubicacion = clean(req.body?.ubicacion)
    const imagenUrl = clean(req.body?.image_url) || null
    if (!titulo || !categoria || req.body?.price === undefined && req.body?.precio === undefined ||
        !Number.isSafeInteger(precio) || precio < 0) {
      return res.status(400).json({ error: 'Título, categoría y precio válido requeridos' })
    }
    const match = await db.query('SELECT id FROM categorias WHERE nombre = $1', [categoria])
    if (!match.rows.length) return res.status(400).json({ error: 'Categoría no existe' })
    const result = await db.query(`
      INSERT INTO publicaciones (usuario_id, categoria_id, titulo, descripcion, precio, ubicacion, imagen_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.user.id, match.rows[0].id, titulo, descripcion, precio, ubicacion, imagenUrl])
    res.status(201).json({ id: result.rows[0].id, title: titulo, description: descripcion, price: precio, category: categoria, ownerId: req.user.id, image_url: imagenUrl })
  }))

  app.get('/perfil', requireAuth, asyncRoute(async (req, res) => {
    const result = await db.query('SELECT id, nombre AS name, email FROM usuarios WHERE id = $1', [req.user.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json(result.rows[0])
  }))

  app.get('/mis-publicaciones', requireAuth, asyncRoute(async (req, res) => {
    const result = await db.query('SELECT id, titulo AS title, precio AS price FROM publicaciones WHERE usuario_id = $1 ORDER BY id DESC', [req.user.id])
    res.json(result.rows)
  }))

  app.get('/favoritos', requireAuth, asyncRoute(async (req, res) => {
    const result = await db.query('SELECT publicacion_id AS "productId" FROM favoritos WHERE usuario_id = $1 ORDER BY publicacion_id', [req.user.id])
    res.json(result.rows)
  }))

  app.post('/favoritos', requireAuth, asyncRoute(async (req, res) => {
    const productId = req.body?.productId ?? req.body?.publicacion_id
    if (!positiveId(productId)) return res.status(400).json({ error: 'Publicación inválida' })
    const exists = await db.query('SELECT id FROM publicaciones WHERE id = $1', [productId])
    if (!exists.rows.length) return res.status(404).json({ error: 'Publicación no encontrada' })
    await db.query('INSERT INTO favoritos (usuario_id, publicacion_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.user.id, productId])
    res.status(201).json({ mensaje: 'Favorito guardado', productId: Number(productId) })
  }))

  app.delete('/favoritos/:id', requireAuth, asyncRoute(async (req, res) => {
    if (!positiveId(req.params.id)) return res.status(400).json({ error: 'ID inválido' })
    await db.query('DELETE FROM favoritos WHERE usuario_id = $1 AND publicacion_id = $2', [req.user.id, req.params.id])
    res.json({ mensaje: 'Favorito eliminado' })
  }))

  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }))
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'JSON inválido' })
    console.error('Error en API:', error.message)
    res.status(500).json({ error: 'Error interno del servidor' })
  })
  return app
}
