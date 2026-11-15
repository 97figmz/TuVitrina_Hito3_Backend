import { test } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { createApp } from '../src/app.js'

process.env.JWT_SECRET = 'clave-de-prueba-solamente'
const auth = `Bearer ${jwt.sign({ id: 1, email: 'test@ejemplo.cl' }, process.env.JWT_SECRET)}`

function fakeDb(rows = []) {
  return { query: async () => ({ rows }) }
}

test('GET / responde 200', async () => {
  const res = await request(createApp(fakeDb())).get('/')
  assert.equal(res.status, 200)
  assert.match(res.body.mensaje, /TuVitrina/)
})

test('GET /categorias responde 200 con arreglo', async () => {
  const res = await request(createApp(fakeDb([{ id: 1, nombre: 'Motosierras' }]))).get('/categorias')
  assert.equal(res.status, 200)
  assert.equal(res.body[0].nombre, 'Motosierras')
})

test('GET /publicaciones responde 200', async () => {
  const res = await request(createApp(fakeDb([]))).get('/publicaciones')
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, [])
})

test('GET /publicaciones/2 responde 404 si no existe', async () => {
  const res = await request(createApp(fakeDb([]))).get('/publicaciones/2')
  assert.equal(res.status, 404)
})

test('GET /perfil rechaza sin token (401)', async () => {
  const res = await request(createApp(fakeDb())) .get('/perfil')
  assert.equal(res.status, 401)
})

test('GET /perfil acepta token válido (200)', async () => {
  const res = await request(createApp(fakeDb([{ id: 1, name: 'Ana', email: 'test@ejemplo.cl' }]))).get('/perfil').set('Authorization', auth)
  assert.equal(res.status, 200)
  assert.equal(res.body.name, 'Ana')
})

test('POST /usuarios valida campos faltantes (400)', async () => {
  const res = await request(createApp(fakeDb())).post('/usuarios').send({ email: 'mal' })
  assert.equal(res.status, 400)
})

test('POST /login rechaza credenciales incorrectas (401)', async () => {
  const res = await request(createApp(fakeDb())).post('/login').send({ email: 'test@ejemplo.cl', password: 'incorrecta' })
  assert.equal(res.status, 401)
})

test('POST /publicaciones requiere token (401)', async () => {
  const res = await request(createApp(fakeDb())).post('/publicaciones').send({ title: 'Cadena', price: 9000 })
  assert.equal(res.status, 401)
})

test('POST /publicaciones valida campos (400)', async () => {
  const res = await request(createApp(fakeDb())).post('/publicaciones').set('Authorization', auth).send({ title: '', price: -10 })
  assert.equal(res.status, 400)
})
