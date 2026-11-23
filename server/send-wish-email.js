const MAX_WISH_LENGTH = 200

export class WishEmailError extends Error {
  constructor(message, status = 500, details = '') {
    super(message)
    this.name = 'WishEmailError'
    this.status = status
    this.details = details
  }
}

export function validateWish(wish) {
  if (typeof wish !== 'string' || !wish.trim() || wish.length > MAX_WISH_LENGTH) {
    throw new WishEmailError('请填写 200 字以内的愿望', 400)
  }
  return wish.trim()
}

function receivedAt() {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date())
}

export async function sendWishEmail({ wish, apiKey, recipient, from, fetchImpl = fetch }) {
  const normalizedWish = validateWish(wish)
  if (!apiKey || !recipient || !from) {
    const missing = [
      !apiKey && 'RESEND_API_KEY',
      !recipient && 'WISH_RECIPIENT_EMAIL',
      !from && 'WISH_FROM_EMAIL',
    ].filter(Boolean)
    throw new WishEmailError('邮件服务尚未配置', 503, `缺少环境变量：${missing.join('、')}`)
  }

  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: 'Doro19 收到一个新的愿望',
      text: `收到时间（北京时间）：${receivedAt()}\n\n愿望内容：\n${normalizedWish}\n`,
    }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    console.error('Resend rejected wish email:', response.status, details.slice(0, 500))
    throw new WishEmailError(
      '愿望发送失败，请稍后再试',
      502,
      `Resend HTTP ${response.status}${details ? `\n${details.slice(0, 500)}` : ''}`,
    )
  }

  return response.json().catch(() => ({}))
}
