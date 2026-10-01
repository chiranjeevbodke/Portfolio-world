// Build-time image dimensions for content/projects/*/ so the site can pick the image whose shape
// best fits each display frame without downloading it first. Reads file headers only (PNG, JPEG,
// WebP, GIF); no dependencies. Exposed as the virtual module "virtual:image-sizes":
//   { "/content/projects/<slug>/<file>": { w, h } }
import fs from 'node:fs'
import path from 'node:path'

const ID = 'virtual:image-sizes'
const RESOLVED = '\0' + ID
const EXT = /\.(jpe?g|png|webp|gif)$/i

function sizeOf(buf) {
  // PNG
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }
  // GIF
  if (buf.toString('ascii', 0, 3) === 'GIF') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) }
  // WebP
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const kind = buf.toString('ascii', 12, 16)
    if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff }
    if (kind === 'VP8L') {
      const b = buf.readUInt32LE(21)
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }
    }
    if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) }
  }
  // JPEG: walk markers to the first SOFn
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue }
      const m = buf[i + 1]
      const len = buf.readUInt16BE(i + 2)
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) }
      i += 2 + len
    }
  }
  return null
}

export default function imageSizes() {
  let root = process.cwd()
  const scan = () => {
    const out = {}
    const base = path.join(root, 'content', 'projects')
    if (!fs.existsSync(base)) return out
    for (const slug of fs.readdirSync(base)) {
      const dir = path.join(base, slug)
      if (!fs.statSync(dir).isDirectory()) continue
      for (const file of fs.readdirSync(dir)) {
        if (!EXT.test(file)) continue
        try {
          const fd = fs.openSync(path.join(dir, file), 'r')
          const buf = Buffer.alloc(256 * 1024)
          const n = fs.readSync(fd, buf, 0, buf.length, 0)
          fs.closeSync(fd)
          const s = sizeOf(buf.subarray(0, n))
          if (s && s.w && s.h) out[`/content/projects/${slug}/${file}`] = s
        } catch {
          /* unreadable file: the site falls back to cover-cropping */
        }
      }
    }
    return out
  }
  return {
    name: 'image-sizes',
    configResolved(c) {
      root = c.root
    },
    resolveId(id) {
      return id === ID ? RESOLVED : null
    },
    load(id) {
      return id === RESOLVED ? `export default ${JSON.stringify(scan())}` : null
    },
    handleHotUpdate({ file, server }) {
      if (file.includes(`${path.sep}content${path.sep}projects${path.sep}`)) {
        const mod = server.moduleGraph.getModuleById(RESOLVED)
        if (mod) server.moduleGraph.invalidateModule(mod)
      }
    },
  }
}
