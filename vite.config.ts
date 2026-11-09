import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, type Plugin } from 'vite'

// The page holds API keys in localStorage, so the built site allows network access only to the two APIs
// and runs no third-party code. Added only to the build: the dev server needs its own websocket.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://api.anthropic.com https://api.elevenlabs.io wss://api.elevenlabs.io",
  "media-src 'self' blob: data:",
  "img-src 'self' data:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ')

const csp = (): Plugin => ({
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
})

export default defineConfig({
  base: '/Jadlis-Live-Translation-Voice/',
  plugins: [svelte(), csp()],
  build: { target: 'es2022' },
})
