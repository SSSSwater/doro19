import { onRequestGet, onRequestPost } from './functions/api/wishes.js'

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname

    if (pathname === '/api/wishes') {
      if (request.method === 'POST') return onRequestPost({ request, env, ctx })
      return onRequestGet({ request, env, ctx })
    }

    return env.ASSETS.fetch(request)
  },
}
