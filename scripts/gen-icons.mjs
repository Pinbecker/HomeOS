// Generates HomeOS app icons (pure JS, no deps). Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

// ---- tiny PNG encoder (RGBA, 8-bit) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// ---- drawing (normalised 0..1 coords, supersampled) ----
const SS = 4 // supersample factor

function lerp(a, b, t) { return a + (b - a) * t }
function mix(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)] }

// Background gradient (iOS blue, top -> deeper bottom)
const TOP = [10, 132, 255]    // #0A84FF
const BOT = [0, 86, 214]      // #0056D6

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
  const a = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d
  const b = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d
  const c = 1 - a - b
  return a >= 0 && b >= 0 && c >= 0
}
function inRoundRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false
  const cx = Math.min(Math.max(px, x0 + r), x1 - r)
  const cy = Math.min(Math.max(py, y0 + r), y1 - r)
  const dx = px - cx, dy = py - cy
  return dx * dx + dy * dy <= r * r
}

// Sample the icon colour at normalised (u,v). Returns [r,g,b].
function sample(u, v) {
  const bg = mix(TOP, BOT, v)
  const white = [255, 255, 255]

  // House geometry (normalised)
  const roof = pointInTriangle(u, v, 0.50, 0.255, 0.165, 0.515, 0.835, 0.515)
  const walls = inRoundRect(u, v, 0.275, 0.48, 0.725, 0.775, 0.035)
  const isHouse = roof || walls

  if (!isHouse) return bg

  // Door punched out of the house (shows background through it)
  const door = inRoundRect(u, v, 0.44, 0.60, 0.56, 0.78, 0.05)
  if (door) return bg

  return white
}

function render(size) {
  const S = size * SS
  const big = Buffer.alloc(S * S * 4)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S
      const v = (y + 0.5) / S
      const [r, g, b] = sample(u, v)
      const i = (y * S + x) * 4
      big[i] = Math.round(r); big[i + 1] = Math.round(g); big[i + 2] = Math.round(b); big[i + 3] = 255
    }
  }
  // Box downscale SS x SS -> size
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const i = ((y * SS + dy) * S + (x * SS + dx)) * 4
          r += big[i]; g += big[i + 1]; b += big[i + 2]
        }
      }
      const n = SS * SS
      const o = (y * size + x) * 4
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = 255
    }
  }
  return encodePNG(size, size, out)
}

mkdirSync('public/icons', { recursive: true })
const targets = [
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['public/apple-touch-icon.png', 180],
  ['public/icons/icon-180.png', 180],
]
for (const [path, size] of targets) {
  writeFileSync(path, render(size))
  console.log('wrote', path, size + 'x' + size)
}
console.log('done')
