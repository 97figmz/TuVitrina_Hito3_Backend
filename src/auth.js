import jwt from 'jsonwebtoken'

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const [type, token] = header.split(' ')
  if (type !== 'Bearer' || !token) return res.status(401).json({ error: 'Token requerido' })
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'test-secret-only')
    next()
  } catch {
    return res.status(401).json({ error: 'Token inválido o vencido' })
  }
}

export function signToken(user) {
  if (!process.env.JWT_SECRET) throw new Error('Configura JWT_SECRET en .env')
  return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '2h' })
}
