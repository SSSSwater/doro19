import { sendWishEmail, WishEmailError } from '../../server/send-wish-email.js'

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function errorDetails(error) {
  const lines = []
  if (error?.name || error?.message) lines.push(`${error.name || 'Error'}: ${error.message || '未知错误'}`)
  if (error?.code) lines.push(`code: ${error.code}`)
  if (error?.cause) {
    const cause = error.cause
    lines.push(`cause: ${cause?.name || 'Error'}: ${cause?.message || String(cause)}`)
    if (cause?.code) lines.push(`cause.code: ${cause.code}`)
  }
  return lines.join('\n').slice(0, 1200) || '未知服务端错误'
}

export async function onRequestPost({ request, env }) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return json({ error: '请求格式不正确' }, 415)
  }

  let body
  try {
    const raw = await request.text()
    if (new TextEncoder().encode(raw).length > 2048) return json({ error: '请求内容太长' }, 413)
    body = JSON.parse(raw)
  } catch {
    return json({ error: '请求格式不正确' }, 400)
  }

  try {
    await sendWishEmail({
      wish: body?.wish,
      apiKey: env.RESEND_API_KEY,
      recipient: env.WISH_RECIPIENT_EMAIL,
      from: env.WISH_FROM_EMAIL,
    })
    return json({ sent: true }, 201)
  } catch (error) {
    const status = error instanceof WishEmailError ? error.status : 500
    if (!(error instanceof WishEmailError)) console.error('Failed to send wish email:', error)
    return json({
      error: error instanceof WishEmailError ? error.message : '愿望发送失败，请稍后再试',
      debug: error instanceof WishEmailError ? (error.details || error.message) : errorDetails(error),
    }, status)
  }
}

export function onRequestGet() {
  return json({ error: '只支持提交愿望' }, 405)
}
