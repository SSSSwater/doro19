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
    return json({ error: error instanceof WishEmailError ? error.message : '愿望发送失败，请稍后再试' }, status)
  }
}

export function onRequestGet() {
  return json({ error: '只支持提交愿望' }, 405)
}
