// Placeholder artwork for display frames and /work cards, drawn on a canvas until real
// images are added to content/projects/<slug>/. Styled like printed hoardings.

export const DISPLAY_FONT = '"Inter Tight", "Inter", system-ui, sans-serif'

export type PosterSpec = {
  aspect: number
  bg: string
  fg: string
  kicker: string // small line at the top (category)
  title: string
  footer: string // small line at the bottom (slot id / CTA)
  number?: string
  muted?: boolean
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, maxW: number, maxH: number) {
  let size = maxH
  ctx.font = `${weight} ${size}px ${DISPLAY_FONT}`
  const w = ctx.measureText(text).width
  if (w > maxW) size = Math.max(8, (size * maxW) / w)
  ctx.font = `${weight} ${size}px ${DISPLAY_FONT}`
  return size
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const t = line ? `${line} ${w}` : w
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line)
      line = w
    } else line = t
  }
  if (line) lines.push(line)
  return lines
}

export function drawPoster(spec: PosterSpec, maxPx = 1024): HTMLCanvasElement {
  const wide = spec.aspect >= 3
  let h = wide ? 256 : maxPx * 0.75
  let w = h * spec.aspect
  if (w > maxPx * 2) {
    w = maxPx * 2
    h = w / spec.aspect
  }
  const c = document.createElement('canvas')
  c.width = Math.round(w)
  c.height = Math.round(h)
  const ctx = c.getContext('2d')!
  const W = c.width, H = c.height
  const u = Math.min(W, H) / 100 // layout unit

  ctx.fillStyle = spec.bg
  ctx.fillRect(0, 0, W, H)

  // graphic motif: a big sun disc and horizon stripes, cropped by the frame
  ctx.save()
  ctx.globalAlpha = spec.muted ? 0.08 : 0.16
  ctx.fillStyle = spec.fg
  const r = wide ? H * 1.1 : Math.max(W, H) * 0.42
  ctx.beginPath()
  ctx.arc(wide ? W - H * 0.9 : W * 0.78, wide ? H * 0.5 : H * 0.3, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = spec.muted ? 0.05 : 0.1
  const stripes = 5
  for (let i = 0; i < stripes; i++) ctx.fillRect(0, H * (0.62 + i * 0.07), W, H * 0.025)
  ctx.restore()

  ctx.fillStyle = spec.fg
  ctx.textBaseline = 'alphabetic'
  const pad = wide ? H * 0.16 : 7 * u

  if (wide) {
    const kh = H * 0.13
    ctx.font = `600 ${kh}px ${DISPLAY_FONT}`
    ctx.globalAlpha = 0.75
    ctx.fillText(spec.kicker.toUpperCase(), pad, pad + kh)
    ctx.globalAlpha = 1
    const titleMaxW = W * 0.7 - pad
    fitFont(ctx, spec.title, 800, titleMaxW, H * 0.46)
    ctx.fillText(spec.title, pad, H - pad)
    ctx.font = `600 ${H * 0.12}px ${DISPLAY_FONT}`
    ctx.textAlign = 'right'
    ctx.globalAlpha = 0.8
    ctx.fillText(spec.footer, W - pad, H - pad)
    ctx.textAlign = 'left'
    ctx.globalAlpha = 1
    return c
  }

  // tall / standard hoarding
  const kh = 4.2 * u
  ctx.font = `600 ${kh}px ${DISPLAY_FONT}`
  ctx.globalAlpha = 0.8
  ctx.fillText(spec.kicker.toUpperCase(), pad, pad + kh)
  if (spec.number) {
    ctx.textAlign = 'right'
    ctx.fillText(spec.number, W - pad, pad + kh)
    ctx.textAlign = 'left'
  }
  ctx.globalAlpha = 1

  // title: as big as fits in the lower two thirds, up to 3 lines
  const maxW = W - pad * 2
  let size = Math.min(H * 0.3, W * 0.22)
  let lines: string[] = []
  for (; size > 8; size *= 0.92) {
    ctx.font = `800 ${size}px ${DISPLAY_FONT}`
    lines = wrap(ctx, spec.title, maxW)
    const tooWide = lines.some((l) => ctx.measureText(l).width > maxW)
    if (!tooWide && lines.length <= 3 && lines.length * size * 1.02 < H * 0.58) break
  }
  const lh = size * 0.98
  const bottom = H - pad - 6 * u
  lines.forEach((l, i) => ctx.fillText(l, pad - size * 0.04, bottom - (lines.length - 1 - i) * lh))

  ctx.font = `500 ${3.4 * u}px ${DISPLAY_FONT}`
  ctx.globalAlpha = 0.75
  ctx.fillText(spec.footer, pad, H - pad + 1.5 * u)
  ctx.globalAlpha = 1
  return c
}

let fontsReady: Promise<unknown> | null = null
/** Wait for the display font so canvases don't render with a fallback font. */
export function whenFontsReady() {
  if (!fontsReady) {
    fontsReady = Promise.race([
      Promise.all([
        document.fonts.load(`800 40px ${DISPLAY_FONT}`),
        document.fonts.load(`600 40px ${DISPLAY_FONT}`),
        document.fonts.load(`500 40px ${DISPLAY_FONT}`),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ])
  }
  return fontsReady
}
