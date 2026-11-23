import { loadEnv, defineConfig } from 'vite'
import { sendWishEmail, WishEmailError } from './server/send-wish-email.js'

function respond(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

async function sendWish(request, response, env) {
  if (request.method !== 'POST') return respond(response, 405, { error: '只支持提交愿望' })
  if (!request.headers['content-type']?.startsWith('application/json')) {
    return respond(response, 415, { error: '请求格式不正确' })
  }

  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 2048) return respond(response, 413, { error: '愿望内容太长' })
    chunks.push(chunk)
  }

  let body
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return respond(response, 400, { error: '请求格式不正确' })
  }
  try {
    await sendWishEmail({
      wish: body?.wish,
      apiKey: env.RESEND_API_KEY,
      recipient: env.WISH_RECIPIENT_EMAIL,
      from: env.WISH_FROM_EMAIL,
    })
    respond(response, 201, { sent: true })
  } catch (error) {
    const status = error instanceof WishEmailError ? error.status : 500
    if (!(error instanceof WishEmailError)) console.error('Failed to send wish email:', error)
    respond(response, status, { error: error instanceof WishEmailError ? error.message : '愿望发送失败，请稍后再试' })
  }
}

function wishMiddleware(request, response, next, env) {
  const pathname = request.url?.split('?')[0]
  if (pathname === '/save' || pathname?.startsWith('/save/')) {
    respond(response, 404, { error: '未找到' })
    return
  }
  if (pathname !== '/api/wishes') return next()
  sendWish(request, response, env).catch(error => {
    console.error('Failed to send wish email:', error)
    if (!response.headersSent) respond(response, 500, { error: '愿望发送失败，请稍后再试' })
  })
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [{
      name: 'local-wish-email',
      configureServer(server) { server.middlewares.use((request, response, next) => wishMiddleware(request, response, next, env)) },
      configurePreviewServer(server) { server.middlewares.use((request, response, next) => wishMiddleware(request, response, next, env)) },
    }],
    server: {
      allowedHosts: ['doro19.minamo.life'],
    },
    preview: {
      allowedHosts: ['doro19.minamo.life'],
    },
  }
})
