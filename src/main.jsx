import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { copy, cssMotionVariables, formatText, motion, timing } from './config'
import bgmUrl from '../bgm.mp3'
import ambientBgmUrl from '../ambient-bgm.mp3'
import volumeReminderDoroUrl from '../doro_bq/optimized/retouch_2026111621494445.webp'
import './styles.css'

const supportedStickerPattern = /\.(png|jpe?g|webp|gif|avif|svg)$/i

const formatClientError = error => {
  if (!error) return '未知错误'
  const lines = []
  if (error.name || error.message) lines.push(`${error.name || 'Error'}: ${error.message || '未知错误'}`)
  if (error.status) lines.push(`status: ${error.status}`)
  if (error.cause) {
    const cause = error.cause
    lines.push(`cause: ${cause?.name || 'Error'}: ${cause?.message || String(cause)}`)
    if (cause?.code) lines.push(`cause.code: ${cause.code}`)
  }
  if (error.stack) lines.push(error.stack)
  return lines.join('\n').slice(0, 4000) || String(error)
}

function DebugErrorPopup({ error, onClose }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const closeOnEscape = event => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const copyDetails = async () => {
    const text = `${error.title}\n时间：${error.timestamp}\n\n${error.details}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="debug-error-backdrop" role="presentation" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="debug-error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="debug-error-title">
        <button className="debug-error-close" type="button" aria-label="关闭错误弹窗" onClick={onClose}>×</button>
        <p className="debug-error-kicker">DEBUG ERROR</p>
        <h2 id="debug-error-title">{error.title}</h2>
        <p className="debug-error-time">发生时间：{error.timestamp}</p>
        <pre className="debug-error-details">{error.details}</pre>
        <div className="debug-error-actions">
          <button type="button" className="debug-error-copy" onClick={copyDetails}>{copied ? '已复制' : '复制错误信息'}</button>
          <button type="button" className="debug-error-confirm" onClick={onClose}>关闭</button>
        </div>
      </section>
    </div>
  )
}

const loadedStickerImages = Object.entries(import.meta.glob('../doro_bq/optimized/*', { eager: true, query: '?url', import: 'default' }))
  .filter(([id]) => supportedStickerPattern.test(id))
  .map(([id, src]) => ({ id, src }))
const stickerImages = loadedStickerImages.slice()
for (let index = stickerImages.length - 1; index > 0; index -= 1) {
  const randomIndex = Math.floor(Math.random() * (index + 1))
  ;[stickerImages[index], stickerImages[randomIndex]] = [stickerImages[randomIndex], stickerImages[index]]
}

// Warm the browser cache and finish decoding every sticker before the animated field mounts.
// This prevents the first animation frame from showing empty image boxes on a cold load.
const preloadStickerImage = ({ src }, onComplete) => new Promise(resolve => {
  const image = new window.Image()
  let settled = false
  const finish = () => {
    if (settled) return
    settled = true
    onComplete?.()
    resolve()
  }
  image.decoding = 'async'
  image.onload = () => {
    if (typeof image.decode !== 'function') {
      finish()
      return
    }
    image.decode().catch(() => {}).then(finish)
  }
  image.onerror = finish
  image.src = src
})

const createSticker = (id, kind = 'doro', delay = 0) => ({
  id,
  kind,
  side: Math.random() < .5 ? 'left' : 'right',
  x: 1 + Math.random() * 14,
  restY: 4 + Math.random() * 78,
  delay,
  duration: (timing.stickerLifetimeMinMs + Math.random() * timing.stickerLifetimeRangeMs) / 1000,
  drift: (Math.random() < .5 ? -1 : 1) * (17 + Math.random() * 24),
})

const randomStickerAppearance = initialIndex => ({
  image: stickerImages[initialIndex ?? Math.floor(Math.random() * stickerImages.length)],
  rotation: Math.round(Math.random() * 60) - 30,
  scale: 0.9 + Math.random() * 0.2,
})

const faceOutline = 'M53 59Q60 48 86 47Q110 38 134 47q26 1 33 12l15 16c8 19 23 54 17 76q6 24-16 32-32 9-73 7-41 2-73-7-22-8-16-32-6-22 17-76Z'
const faceShade = 'M22 151q88 20 176 0 3 24-15 32-32 9-73 7-41 2-73-7-18-8-15-32Z'
const earOutline = 'M38 75 C44 55 54 25 62 3 C72 21 80 43 86 47 L79 76Z'
const earInner = 'M52 57 C55 44 59 26 62 12 C69 25 76 39 80 43Z'
const ovalPath = (x, y, rx, ry) => `M${x + rx} ${y}a${rx} ${ry} 0 1 0 ${-2 * rx} 0a${rx} ${ry} 0 1 0 ${2 * rx} 0Z`
const sampledPaths = new Map()
const bgmBandCount = 16

const radialPulseAt = (x, y, bands) => {
  if (!bands) return { dx: 0, dy: 0 }
  const radialX = x - 110
  const radialY = y - 111
  const radius = Math.hypot(radialX, radialY)
  if (radius < 1) return { dx: 0, dy: 0 }
  // Low frequencies begin above the head; each higher band advances clockwise.
  const sector = ((Math.atan2(radialY, radialX) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * bands.length
  const first = Math.floor(sector) % bands.length
  const blend = sector - Math.floor(sector)
  const smoothBlend = blend * blend * (3 - 2 * blend)
  const level = bands[first] * (1 - smoothBlend) + bands[(first + 1) % bands.length] * smoothBlend
  const distance = 17 * level * Math.min(radius / 75, 1)
  return { dx: radialX / radius * distance, dy: radialY / radius * distance }
}

function warpedPath(pathData, deformation, mirror = false, audioBands = null) {
  if ((!deformation || (!deformation.dx && !deformation.dy)) && !audioBands) return pathData
  if (!sampledPaths.has(pathData)) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', pathData)
    const length = path.getTotalLength()
    const count = Math.max(16, Math.ceil(length / 3))
    sampledPaths.set(pathData, Array.from({ length: count + 1 }, (_, index) => path.getPointAtLength(length * index / count)))
  }
  const points = sampledPaths.get(pathData)
  const influence = point => {
    if (!deformation) return 0
    const px = mirror ? 220 - point.x : point.x
    const distance = Math.hypot(px - deformation.x, point.y - deformation.y)
    const t = Math.max(0, 1 - distance / 82)
    return t * t * (3 - 2 * t)
  }
  return points.map((point, index) => {
    const weight = influence(point)
    // Use the left half as the only audio reference. The right half mirrors
    // its displacement so both sides move in sync around the center line.
    const rightSide = !mirror && point.x > 110
    // Ear paths are authored on the left and mirrored by the SVG group, so
    // their audio sample must stay on the left reference side as well.
    const audioReferenceX = mirror ? point.x : (rightSide ? 220 - point.x : point.x)
    const pulse = radialPulseAt(audioReferenceX, point.y, audioBands)
    // The right ear is mirrored by its SVG group. Pointer deformation needs
    // the opposite local direction before that transform, while audio motion
    // should stay identical locally and be mirrored by the group itself.
    const deformationSign = mirror ? -1 : 1
    const audioSign = mirror || !rightSide ? 1 : -1
    const nextX = point.x + (deformation?.dx || 0) * weight * deformationSign + pulse.dx * audioSign
    return `${index ? 'L' : 'M'}${nextX.toFixed(2)} ${(point.y + (deformation?.dy || 0) * weight + pulse.dy).toFixed(2)}`
  }).join('') + (/z\s*$/i.test(pathData) ? 'Z' : '')
}

function DoroEar({ side, deformation, audioBands }) {
  const mirror = side === 'right'
  return (
    <g className={`doro-ear-${side}`} transform={side === 'right' ? 'translate(220 0) scale(-1 1)' : undefined}>
      <path d={warpedPath(earOutline, deformation, mirror, audioBands)} fill="#fffdf9" />
      <path d={warpedPath(earInner, deformation, mirror, audioBands)} fill="#ffe9aa" />
    </g>
  )
}

function DoroFaceArtwork({ deformation, audioBands = null }) {
  const face = path => warpedPath(path, deformation, false, audioBands)
  return (
    <>
      <DoroEar side="left" deformation={deformation} audioBands={audioBands} />
      <DoroEar side="right" deformation={deformation} audioBands={audioBands} />
      <path d={face(faceOutline)} fill="#fffdf9" />
      <path d={face(faceShade)} fill="#bdbab4" opacity=".2" />
      <path d={face('M40 76q19-3 38 0')} fill="none" stroke="#111715" strokeWidth="5.5" strokeLinecap="round" />
      <path d={face('M142 76q19-3 38 0')} fill="none" stroke="#111715" strokeWidth="5.5" strokeLinecap="round" />
      <path d={face(ovalPath(55, 98, 12.5, 12.5))} fill="#101412" />
      <path d={face(ovalPath(165, 98, 12.5, 12.5))} fill="#101412" />
      <path d={face(ovalPath(49, 128, 19, 10))} fill="#d99da2" />
      <path d={face(ovalPath(171, 128, 19, 10))} fill="#d99da2" />
      <path d={face('M87 133C91 166 129 166 133 133')} fill="none" stroke="#111715" strokeWidth="3.6" strokeLinecap="round" />
      <path d={face('M82 126c0 5 2 9 5 7 8-1 16-8 23-10 7 2 15 9 23 10 3 2 5-2 5-7')} fill="none" stroke="#111715" strokeWidth="4.1" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
}

function Strawberry({ x, y, rotate = 0, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <path d="M-14-5C-17 2-12 16 0 23 12 16 17 2 14-5 9-14-9-14-14-5Z" fill="#e98791" stroke="#cf6e7c" strokeWidth="1.8" />
      <path d="M-13-9q5-2 9 2L0-15l4 8q4-4 9-2l-5 6-8-1-8 1Z" fill="#a1bea2" />
      <path d="M0-14q1-7 6-9" fill="none" stroke="#829f83" strokeWidth="2" strokeLinecap="round" />
      <g fill="#fff6de">
        <ellipse cx="-7" cy="1" rx="1.1" ry="1.8" transform="rotate(-20 -7 1)" />
        <ellipse cx="4" cy="0" rx="1.1" ry="1.8" transform="rotate(20 4 0)" />
        <ellipse cx="-3" cy="9" rx="1.1" ry="1.8" transform="rotate(-20 -3 9)" />
        <ellipse cx="8" cy="8" rx="1.1" ry="1.8" transform="rotate(20 8 8)" />
        <ellipse cx="2" cy="16" rx="1" ry="1.5" />
      </g>
    </g>
  )
}

function StrawberryHalf({ x, y, rotate = 0, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <path d="M-14-7C-20 0-14 18 0 29 14 18 20 0 14-7 8-15-8-15-14-7Z" fill="#e98791" stroke="#cf6e7c" strokeWidth="1.8" />
      <path d="M-12-8q5-3 9 1L0-15l4 8q4-4 9-1l-5 6-8-1-8 1Z" fill="#a1bea2" />
      <path d="M0-10C-8-15-15-7-12 4-10 14-4 24 0 28 4 24 10 14 12 4 15-7 8-15 0-10Z" fill="#fff0e8" stroke="#f5bdc4" strokeWidth="1.6" />
      <path d="M0-7C-5-11-10-5-8 4-7 12-3 20 0 23 3 20 7 12 8 4 10-5 5-11 0-7Z" fill="#f9dce0" />
      <g fill="#d57b83">
        <ellipse cx="-14" cy="-1" rx="1.3" ry="2" transform="rotate(-18 -14 -1)" />
        <ellipse cx="14" cy="-1" rx="1.3" ry="2" transform="rotate(18 14 -1)" />
        <ellipse cx="-11" cy="10" rx="1.3" ry="2" transform="rotate(-18 -11 10)" />
        <ellipse cx="11" cy="10" rx="1.3" ry="2" transform="rotate(18 11 10)" />
        <ellipse cx="-6" cy="20" rx="1.2" ry="1.8" transform="rotate(-15 -6 20)" />
        <ellipse cx="6" cy="20" rx="1.2" ry="1.8" transform="rotate(15 6 20)" />
      </g>
    </g>
  )
}

function CakeCapsule({ x, y, rotate = 0, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <ellipse cy="10" rx="17" ry="4" fill="#b98191" opacity=".16" />
      <rect x="-19" y="-9" width="38" height="18" rx="9" fill="#fffaf8" />
      <path d="M0-9h10a9 9 0 0 1 0 18H0Z" fill="#f1aabd" />
      <path d="M0-8v16" fill="none" stroke="#e7a0b2" strokeWidth="1.4" />
      <rect x="-19" y="-9" width="38" height="18" rx="9" fill="none" stroke="#db9aab" strokeWidth="1.6" />
      <path d="M-13-4h9m9 0h6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".82" />
    </g>
  )
}

function FallingSticker({ sticker, bucketRef, onCollect, collectEnabled, onRemove, pillMode }) {
  const visualKind = pillMode ? 'pill' : sticker.kind
  const [appearance, setAppearance] = useState(() => randomStickerAppearance())
  const [drag, setDrag] = useState(null)
  const dragRef = useRef(null)
  const timersRef = useRef([])
  const lifetimeTimerRef = useRef(null)
  const onRemoveRef = useRef(onRemove)
  onRemoveRef.current = onRemove

  useEffect(() => {
    const lifetime = Math.max(200, sticker.duration * 1000 + sticker.delay * 1000 + timing.stickerLifetimeGraceMs)
    lifetimeTimerRef.current = window.setTimeout(() => {
      if (!dragRef.current) onRemoveRef.current()
    }, lifetime)
    return () => {
      window.clearTimeout(lifetimeTimerRef.current)
      timersRef.current.forEach(window.clearTimeout)
    }
  }, [sticker.duration, sticker.delay])

  const schedule = (callback, delay) => {
    const timer = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter(active => active !== timer)
      callback()
    }, delay)
    timersRef.current.push(timer)
  }

  const updateDrag = next => {
    dragRef.current = next
    setDrag(next)
  }

  const finishLanding = () => {
    const current = dragRef.current
    if (current?.phase !== 'falling-to-bucket') return
    if (collectEnabled) onCollect(appearance.image.id)
    updateDrag({ ...current, phase: 'fading' })
    schedule(onRemove, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? timing.reducedMotionSettleMs : timing.stickerFadeOutMs)
  }

  const handlePointerDown = event => {
    if (dragRef.current?.phase === 'dragging' || dragRef.current?.phase === 'fading' || (event.pointerType === 'mouse' && event.button !== 0)) return
    const bounds = event.currentTarget.getBoundingClientRect()
    window.clearTimeout(lifetimeTimerRef.current)
    timersRef.current.forEach(window.clearTimeout)
    timersRef.current = []
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    updateDrag({
      phase: 'dragging',
      pointerId: event.pointerId,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
    })
  }

  const handlePointerMove = event => {
    const current = dragRef.current
    if (!current || current.phase !== 'dragging' || current.pointerId !== event.pointerId) return
    updateDrag({ ...current, left: event.clientX - current.offsetX, top: event.clientY - current.offsetY })
  }

  const finishDrag = (event, canceled = false) => {
    const current = dragRef.current
    if (!current || current.phase !== 'dragging' || current.pointerId !== event.pointerId) return
    const next = { ...current, left: event.clientX - current.offsetX, top: event.clientY - current.offsetY }
    const bucket = bucketRef.current?.getBoundingClientRect()
    const centerX = next.left + next.width / 2
    const fallSpeed = window.innerHeight * 1.45 / sticker.duration
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const willLandInBucket = collectEnabled && !canceled && bucket &&
      centerX >= bucket.left + 16 && centerX <= bucket.right - 16 &&
      next.top < bucket.bottom - 18

    if (willLandInBucket) {
      const releaseY = Math.max(0, bucket.bottom - 18 - (next.top + next.height))
      const releaseDuration = Math.max(0.01, releaseY / fallSpeed)
      const landing = { ...next, phase: 'falling-to-bucket', releaseY, releaseDuration, travelX: 0, travelY: releaseY }
      updateDrag(landing)
      schedule(finishLanding, reducedMotion ? timing.reducedMotionLandingMs : releaseDuration * 1000 + timing.stickerReleaseLandingBufferMs)
    } else {
      const releaseY = Math.max(0, window.innerHeight - next.top + next.height + 20)
      const releaseDuration = Math.max(0.01, releaseY / fallSpeed)
      updateDrag({ ...next, phase: 'released', releaseY, releaseDuration })
      schedule(onRemove, reducedMotion ? timing.reducedMotionSettleMs : releaseDuration * 1000)
    }
  }

  return (
    <span
      className={'falling-sticker ' + sticker.side + (visualKind === 'pill' ? ' pill-mode' : visualKind === 'snow' ? ' snow-mode' : '') + (drag ? ' ' + drag.phase : '')}
      style={{
        '--x': sticker.x + 'vw',
        '--rest-y': sticker.restY + 'vh',
        '--size': '112px',
        '--scale': appearance.scale,
        '--delay': sticker.delay + 's',
        '--duration': sticker.duration + 's',
        '--drift': sticker.drift + 'px',
        '--rotation': appearance.rotation + 'deg',
        ...(drag && {
          left: drag.left + 'px',
          right: 'auto',
          top: drag.top + 'px',
          '--travel-x': (drag.travelX ?? 0) + 'px',
          '--travel-y': (drag.travelY ?? 0) + 'px',
          '--release-y': (drag.releaseY ?? 0) + 'px',
          '--release-duration': (drag.releaseDuration ?? 0) + 's',
        }),
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={event => finishDrag(event, true)}
      onAnimationEnd={event => {
        if (event.target !== event.currentTarget) return
        if (event.animationName === 'fall' && !dragRef.current) onRemove()
        if (event.animationName === 'release-doro') finishLanding()
      }}
    >
      {visualKind === 'pill' ? <span className="pill-art" aria-hidden="true" /> : visualKind === 'snow' ? <span className="snowflake-art" aria-hidden="true">❄️</span> : <img src={appearance.image.src} alt="" draggable="false" />}
    </span>
  )
}

function FallingStickers({ bucketRef, onCollect, collectEnabled, isComplete, pillMode, snowMode }) {
  const nextIdRef = useRef(0)
  const [activeStickers, setActiveStickers] = useState([])

  const removeSticker = id => setActiveStickers(current => current.filter(sticker => sticker.id !== id))

  useEffect(() => {
    setActiveStickers(current => [...current, createSticker(nextIdRef.current++, snowMode ? 'snow' : 'doro')])
  }, [])

  useEffect(() => {
    let interval = pillMode ? timing.stickerSpawnPillMs : (isComplete ? timing.stickerSpawnCompleteMs : timing.stickerSpawnInitialMs)
    let timer
    const spawn = () => {
      const id = nextIdRef.current++
      setActiveStickers(current => [...current, createSticker(id, snowMode ? 'snow' : 'doro')])
      if (!isComplete) interval = Math.max(timing.stickerSpawnMinimumMs, interval - timing.stickerSpawnAccelerationMs)
      timer = window.setTimeout(spawn, interval)
    }
    timer = window.setTimeout(spawn, interval)
    return () => window.clearTimeout(timer)
  }, [isComplete, pillMode, snowMode])

  return (
    <div className="sticker-field" aria-hidden="true">
      {activeStickers.map(sticker => (
        <FallingSticker key={sticker.id} sticker={sticker} bucketRef={bucketRef} onCollect={onCollect} collectEnabled={collectEnabled} onRemove={() => removeSticker(sticker.id)} pillMode={pillMode} />
      ))}
    </div>
  )
}

// A logarithmic pull keeps moving without a hard stop, but resists longer drags.
const resistedPull = (distance, strength) =>
  Math.sign(distance) * strength * Math.log1p(Math.abs(distance) / 24)

function Cake({ wishMade, collectedCount, showDoro, candleVisible, candleFlyingAway, isRevealing, showDoroHints, doroSqueezeCount, onDoroSqueeze, isCut, noteDropped, bgmAnalyser }) {
  const digits = String(collectedCount).split('')
  const candlePositions = digits.map((_, index) => 310 + (index - (digits.length - 1) / 2) * (digits.length > 2 ? 38 : 50))
  const [deformation, setDeformation] = useState(null)
  const [audioBands, setAudioBands] = useState(null)
  const [dragTarget, setDragTarget] = useState(null)
  const dragRef = useRef(null)
  const deformationRef = useRef(null)
  const reboundRef = useRef(null)

  useEffect(() => () => window.cancelAnimationFrame(reboundRef.current), [])

  useEffect(() => {
    if (!bgmAnalyser || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const frequencies = new Uint8Array(bgmAnalyser.frequencyBinCount)
    const smoothed = new Float32Array(bgmBandCount)
    const binWidth = bgmAnalyser.context.sampleRate / bgmAnalyser.fftSize
    let frameId
    let lastSample = 0
    const update = now => {
      frameId = window.requestAnimationFrame(update)
      if (now - lastSample < 32) return
      lastSample = now
      bgmAnalyser.getByteFrequencyData(frequencies)
      for (let index = 0; index < bgmBandCount; index += 1) {
        const low = 80 * (5000 / 80) ** (index / bgmBandCount)
        const high = 80 * (5000 / 80) ** ((index + 1) / bgmBandCount)
        const from = Math.min(frequencies.length - 1, Math.max(1, Math.floor(low / binWidth)))
        const to = Math.min(frequencies.length - 1, Math.max(from, Math.ceil(high / binWidth)))
        let sum = 0
        for (let bin = from; bin <= to; bin += 1) sum += frequencies[bin]
        const level = Math.min(1, Math.pow(Math.max(0, sum / (to - from + 1) - 2) / 68, .48))
        smoothed[index] += (level - smoothed[index]) * (level > smoothed[index] ? .68 : .28)
      }
      setAudioBands(Array.from(smoothed))
    }
    frameId = window.requestAnimationFrame(update)
    return () => window.cancelAnimationFrame(frameId)
  }, [bgmAnalyser])

  const handleDoroPointerDown = event => {
    if (!showDoro || dragRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return
    const doro = event.target.closest?.('.doro-head')
    if (!doro) return
    const target = event.target.closest?.('.doro-ear-left') ? 'earLeft' :
      event.target.closest?.('.doro-ear-right') ? 'earRight' : 'face'
    const inverse = event.currentTarget.querySelector('.doro-squish').getScreenCTM().inverse()
    const origin = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse)
    window.cancelAnimationFrame(reboundRef.current)
    deformationRef.current = null
    setDeformation(null)
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, x: origin.x, y: origin.y, inverse }
    setDragTarget(target)
  }

  const handleDoroPointerMove = event => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(drag.inverse)
    const next = {
      x: drag.x,
      y: drag.y,
      dx: resistedPull(point.x - drag.x, 8),
      dy: resistedPull(point.y - drag.y, 6),
    }
    deformationRef.current = next
    setDeformation(next)
  }

  const handleDoroPointerEnd = event => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) return
    const wasCanceled = event.type === 'pointercancel'
    dragRef.current = null
    setDragTarget(null)
    if (!wasCanceled) onDoroSqueeze?.(Boolean(deformationRef.current))
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      deformationRef.current = null
      setDeformation(null)
      return
    }
    const from = deformationRef.current
    if (!from) return
    const start = performance.now()
    const rebound = now => {
      const progress = Math.min((now - start) / timing.doroReboundMs, 1)
      const remaining = (1 - progress) ** 3
      const next = progress < 1 ? { ...from, dx: from.dx * remaining, dy: from.dy * remaining } : null
      deformationRef.current = next
      setDeformation(next)
      if (progress < 1) reboundRef.current = window.requestAnimationFrame(rebound)
    }
    reboundRef.current = window.requestAnimationFrame(rebound)
  }

  return (
    <svg
      className={'cake-svg' + (isCut ? ' doro-is-cut' : '')}
      viewBox="0 0 620 550"
      aria-hidden="true"
      focusable="false"
      onPointerDown={handleDoroPointerDown}
      onPointerMove={handleDoroPointerMove}
      onPointerUp={handleDoroPointerEnd}
      onPointerCancel={handleDoroPointerEnd}
    >
      <defs>
        <linearGradient id="cakeSide" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f9d9de" />
          <stop offset=".52" stopColor="#f2bdc8" />
          <stop offset="1" stopColor="#e8a8b7" />
        </linearGradient>
        <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff6f4" />
          <stop offset="1" stopColor="#e8ced4" />
        </linearGradient>
        <linearGradient id="candleWax" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff1e7" />
          <stop offset="1" stopColor="#d2e6d2" />
        </linearGradient>
        <linearGradient id="candleWaxPink" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff0ef" />
          <stop offset="1" stopColor="#edb8c8" />
        </linearGradient>
        <filter id="cakeShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="15" stdDeviation="14" floodColor="#aa989a" floodOpacity=".2" />
        </filter>
        <clipPath id="doroCutLeft" clipPathUnits="userSpaceOnUse">
          <rect x="0" y="0" width="108" height="250" />
        </clipPath>
        <clipPath id="doroCutRight" clipPathUnits="userSpaceOnUse">
          <rect x="108" y="0" width="112" height="250" />
        </clipPath>
      </defs>

      <ellipse cx="310" cy="495" rx="219" ry="25" fill="#9bb59f" opacity=".13" />
      <path d="M264 450h92l16 34q-62 15-124 0Z" fill="url(#plate)" stroke="#dcbfc7" strokeWidth="2" />
      <ellipse cx="310" cy="484" rx="106" ry="14" fill="#f7e5e7" stroke="#dcbfc7" strokeWidth="2" />
      <ellipse cx="310" cy="447" rx="225" ry="34" fill="#f9e9ea" stroke="#dcbfc7" strokeWidth="3" />
      <ellipse cx="310" cy="442" rx="202" ry="25" fill="#fff7ef" />

      <g filter="url(#cakeShadow)">
        <path d="M128 307h364v111q0 27-182 27T128 418Z" fill="url(#cakeSide)" stroke="#d795a5" strokeWidth="3" />
        <ellipse cx="310" cy="307" rx="182" ry="39" fill="#fbe0e4" stroke="#d795a5" strokeWidth="3" />
        <path d="M128 307q19 13 34 4c15-9 17 31 35 26 15-4 14-31 32-26 18 4 16 38 35 36 17-1 17-29 34-25 15 4 15 28 33 24 18-4 12-35 31-34 17 1 17 29 35 25 18-4 15-34 32-27 17 7 28 3 63-3v24q-20 11-34 5c-15-6-15 24-34 24-17 0-18-32-36-26-18 6-17 32-36 31-19-1-18-29-37-26-18 3-14 27-35 27s-19-31-38-30c-19 1-14 32-34 30-19-2-17-28-36-23-17 5-16 24-33 20-15-4-21-12-32-16Z" fill="#fff8ef" stroke="#f5e6df" strokeWidth="2" />
        <path d="M174 377q136 65 272 0" fill="none" stroke="#fff3f0" strokeWidth="3" strokeDasharray="3 12" opacity=".8" />
        <path d="m218 387 7-8 8 8-8 8Z" fill="#fff6ef" />
        <path d="m280 407 7-8 8 8-8 8Z" fill="#d8e7cf" />
        <path d="m340 409 7-8 8 8-8 8Z" fill="#fff6ef" />
        <path d="m404 388 7-8 8 8-8 8Z" fill="#d8e7cf" />
      </g>

      {showDoro && !isCut && (
        <g className={'doro-head' + (dragTarget ? ' doro-dragging' : '')} transform="translate(164 76) scale(1.34)" filter="url(#cakeShadow)">
          <g className="doro-reveal">
            <g className="doro-squish">
              <DoroFaceArtwork deformation={deformation} audioBands={bgmAnalyser ? audioBands : null} />
            </g>
          </g>
        </g>
      )}
      {showDoro && isCut && (
        <g className="doro-cut-head" transform="translate(164 76) scale(1.34)" filter="url(#cakeShadow)">
          <g className="doro-cut-half doro-cut-half-left">
            <g transform="translate(70 117) rotate(-8)">
              <g className={'doro-hidden-note' + (noteDropped ? ' is-dropped' : '')}>
              <path d="M2 2h19l5 6v43q-11-3-23 2Z" fill="#fff8e8" stroke="#caa99c" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M21 2v7h5" fill="none" stroke="#caa99c" strokeWidth="1.3" />
              <path d="M7 19h13M7 26h12M8 33h13" fill="none" stroke="#c8ad9c" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M13 42q3-4 6 0-3 5-6 0Z" fill="#e8a9b4" />
              </g>
            </g>
            <g clipPath="url(#doroCutLeft)">
              <DoroFaceArtwork deformation={null} />
              <path className="doro-jam-edge doro-jam-edge-left" d="M101 61c5 4 3 10 7 14v116c-4-5-3-11-7-15 3-12-2-18 1-30-4-13 2-21-1-34 4-12-2-21 1-32-3-7-1-13-1-19Z" />
              <path className="doro-jam-gloss doro-jam-gloss-left" d="M104 80c2 9-1 17 2 24m-1 45c-2 8 1 14 2 20" />
              <path className="doro-jam-drip-edge doro-jam-drip-edge-left" d="M104 127c-3 10 2 18-1 27m2 17c-2 7 1 12 1 18" />
            </g>
          </g>
          <g className="doro-cut-half doro-cut-half-right" clipPath="url(#doroCutRight)">
            <DoroFaceArtwork deformation={null} />
            <path className="doro-jam-edge doro-jam-edge-right" d="M108 75c4-5 3-10 8-14-1 7 2 12-1 19 4 12-2 20 1 32-4 13 2 20-1 33 4 12-2 20 1 31-4 5-3 11-8 15V75Z" />
            <path className="doro-jam-gloss doro-jam-gloss-right" d="M111 86c-2 8 1 16-2 24m1 42c2 8-1 14-2 20" />
            <path className="doro-jam-drip-edge doro-jam-drip-edge-right" d="M111 125c3 10-2 18 1 27m-2 17c2 7-1 12-1 18" />
          </g>
        </g>
      )}
      {showDoro && showDoroHints && (
        <g className={'doro-pinch-hints' + (doroSqueezeCount >= 3 ? ' is-fading' : '')} fill="none" stroke="#d7a2b2" strokeWidth="4" strokeLinecap="round">
          <path d="M204 133 175 116M197 184 161 182M204 234 176 251" />
          <path d="m416 133 29-17M423 184 459 182M416 234l28 17" />
        </g>
      )}

      <g className="cake-strawberries">
        <Strawberry x={158} y={294} rotate={-23} />
        <Strawberry x={188} y={306} rotate={12} scale={0.74} />
        <Strawberry x={432} y={306} rotate={-12} scale={0.74} />
        <Strawberry x={462} y={294} rotate={23} />
        <StrawberryHalf x={414} y={284} rotate={17} scale={1.55} />
      </g>
      <g className="cake-capsules" pointerEvents="none">
        <CakeCapsule x={180} y={338} rotate={-22} scale={0.82} />
        <CakeCapsule x={440} y={338} rotate={22} scale={0.82} />
      </g>

      {candleVisible && <g className={'candle ' + (showDoro ? 'candle-on-doro' : 'candle-on-cake') + (isRevealing ? ' candle-reveal' : '') + (candleFlyingAway ? ' candle-flying-away' : '')}>
        <g className="candle-count" key={collectedCount}>
          {digits.map((digit, index) => {
            const x = candlePositions[index]
            return (
              <g key={index} className="candle-digit">
                <path d={'M' + x + ' 128v22'} stroke="#a8c6ad" strokeWidth="5" strokeLinecap="round" />
                <text x={x} y="122" textAnchor="middle" fontFamily="Georgia, serif" fontSize={digits.length > 2 ? 52 : 70} fontWeight="700" fill={digits.length > 1 && index === 0 ? 'url(#candleWaxPink)' : 'url(#candleWax)'} stroke={digits.length > 1 && index === 0 ? '#d79ead' : '#9fbba4'} strokeWidth="3.5" paintOrder="stroke">{digit}</text>
                {!wishMade && (
                  <g className="flame" style={{ transformOrigin: x + 'px 72px', animationDelay: (-index * .55) + 's' }}>
                    <path d={'M' + x + ' 72q-16-13 0-35 16 22 0 35Z'} fill="#f6ba73" />
                    <path d={'M' + x + ' 68q-8-9 0-21 8 12 0 21Z'} fill="#fff2ce" />
                    <path d={'M' + x + ' 64v7'} stroke="#866e68" strokeWidth="2.5" strokeLinecap="round" />
                  </g>
                )}
                {wishMade && <path d={'M' + (x + 5) + ' 62q11-8 0-17'} fill="none" stroke="#c5aaa3" strokeWidth="3" strokeLinecap="round" opacity=".65" />}
              </g>
            )
          })}
        </g>
      </g>}

      <g className="cake-clover cake-clover-left" transform="translate(114 171) scale(1.18)" fill="#b8d8bc">
        <g transform="rotate(30)">
          <path d={cloverHeartPath} />
          <path d={cloverHeartPath} transform="rotate(90)" />
          <path d={cloverHeartPath} transform="rotate(180)" />
          <path d={cloverHeartPath} transform="rotate(270)" />
        </g>
        <path d="M0 0q0 9-5 15" fill="none" stroke="#a7c9ac" strokeWidth="2.1" strokeLinecap="round" />
      </g>
      <g className="cake-clover cake-clover-right" transform="translate(510 217) scale(1.08)" fill="#b8d8bc">
        <g transform="rotate(30)">
          <path d={cloverHeartPath} />
          <path d={cloverHeartPath} transform="rotate(90)" />
          <path d={cloverHeartPath} transform="rotate(180)" />
          <path d={cloverHeartPath} transform="rotate(270)" />
        </g>
        <path d="M0 0q0 8-4 13" fill="none" stroke="#a7c9ac" strokeWidth="2" strokeLinecap="round" />
      </g>
      <circle cx="125" cy="239" r="3" fill="#b7d1ba" />
      <circle cx="486" cy="136" r="4" fill="#c5dcc5" />
      <circle cx="493" cy="271" r="2.5" fill="#e9b7c2" />
    </svg>
  )
}

const cloverHeartPath = 'M0 0C-1.6-2.7-6.6-6-6.6-8.8c0-2.1 3-2.8 4.6-.8L0-8.9l1.8-.7c1.6-2 4.6-1.3 4.6.8C6.6-6 1.6-2.7 0 0Z'

function CloverIcon({ className = '' }) {
  return (
    <svg className={'clover-icon ' + className} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <g transform="translate(14 14) rotate(30)" fill="currentColor">
        <path d={cloverHeartPath} />
        <path d={cloverHeartPath} transform="rotate(90)" />
        <path d={cloverHeartPath} transform="rotate(180)" />
        <path d={cloverHeartPath} transform="rotate(270)" />
      </g>
      <path d="M14 14q0 8-4.5 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CapsuleIcon() {
  return <span className="capsule-icon" aria-hidden="true" />
}

const confetti = Array.from({ length: 14 }, (_, index) => ({
  angle: `${index * (360 / 14)}deg`,
  distance: `${95 + (index % 4) * 22}px`,
  delay: `${(index % 3) * 45}ms`,
}))

const introParticles = Array.from({ length: 8 }, (_, index) => ({
  angle: `${index * 45}deg`,
  distance: `${26 + (index % 3) * 9}px`,
  delay: `${(index % 3) * 35}ms`,
}))

function playCutGlitchSound(context, durationMs) {
  if (!context || context.state !== 'running') return
  const duration = Math.max(.05, durationMs / 1000)
  const sampleCount = Math.ceil(context.sampleRate * duration)
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let index = 0; index < sampleCount; index += 1) {
    const pulse = Math.floor(index / (context.sampleRate * .026)) % 3
    samples[index] = (Math.random() * 2 - 1) * (pulse === 0 ? .22 : 1)
  }
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const volume = context.createGain()
  const start = context.currentTime
  source.buffer = buffer
  filter.type = 'bandpass'
  filter.frequency.value = 1450
  filter.Q.value = .6
  volume.gain.setValueAtTime(.001, start)
  volume.gain.linearRampToValueAtTime(.1, start + Math.min(.02, duration / 4))
  volume.gain.setValueAtTime(.1, start + Math.max(.02, duration - .045))
  volume.gain.linearRampToValueAtTime(.001, start + duration)
  source.connect(filter).connect(volume).connect(context.destination)
  source.start(start)
  source.stop(start + duration)
  source.onended = () => { source.disconnect(); filter.disconnect(); volume.disconnect() }
}

function playCollectionDing(context) {
  if (!context || context.state === 'closed') return
  const play = () => {
    if (context.state !== 'running') return
    const start = context.currentTime
    ;[[1320, .06, .38], [1980, .022, .3]].forEach(([frequency, peak, duration]) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(.0001, start)
      gain.gain.exponentialRampToValueAtTime(peak, start + .012)
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + duration)
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
    })
  }
  if (context.state === 'suspended') void context.resume().then(play).catch(() => {})
  else play()
}

function playSqueezeBoing(context) {
  if (!context || context.state === 'closed') return
  const play = () => {
    if (context.state !== 'running') return
    const start = context.currentTime
    ;[['sine', 1, .12], ['triangle', 2, .024]].forEach(([type, harmonic, peak]) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = type
      oscillator.frequency.setValueAtTime(360 * harmonic, start)
      oscillator.frequency.exponentialRampToValueAtTime(190 * harmonic, start + .075)
      oscillator.frequency.exponentialRampToValueAtTime(260 * harmonic, start + .14)
      oscillator.frequency.exponentialRampToValueAtTime(210 * harmonic, start + .24)
      gain.gain.setValueAtTime(.0001, start)
      gain.gain.exponentialRampToValueAtTime(peak, start + .012)
      gain.gain.exponentialRampToValueAtTime(.0001, start + .25)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + .25)
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
    })
  }
  if (context.state === 'suspended') void context.resume().then(play).catch(() => {})
  else play()
}

function playTypewriterSound(context, message, voice) {
  if (!context || context.state !== 'running' || !message || !motion.introCharacterMs || !motion.introCharacterStaggerMs || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}
  const output = context.createGain()
  output.connect(context.destination)
  const start = context.currentTime
  const step = motion.introCharacterStaggerMs / 1000
  const clickLength = Math.max(.008, Math.min(.045, motion.introCharacterMs / 1000 * .12))
  let remaining = Array.from(message).length
  Array.from(message).forEach((character, index) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const at = start + index * step
    const pitch = (voice === 'pink' ? 920 : 470) + (index % 3) * (voice === 'pink' ? 75 : 38)
    oscillator.type = voice === 'pink' ? 'square' : 'triangle'
    oscillator.frequency.setValueAtTime(pitch, at)
    oscillator.frequency.exponentialRampToValueAtTime(pitch * .72, at + clickLength)
    gain.gain.setValueAtTime(.0001, at)
    gain.gain.linearRampToValueAtTime(voice === 'pink' ? .03 : .05, at + .003)
    gain.gain.exponentialRampToValueAtTime(.0001, at + clickLength)
    oscillator.connect(gain).connect(output)
    oscillator.start(at)
    oscillator.stop(at + clickLength)
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
      remaining -= 1
      if (remaining === 0) output.disconnect()
    }
  })
  return () => output.disconnect()
}

function createAmbientPlayer(context, onError) {
  const audio = new Audio(ambientBgmUrl)
  audio.loop = true
  audio.preload = 'auto'
  const mediaSource = context?.createMediaElementSource(audio)
  const gain = mediaSource && context.createGain()
  if (gain) {
    gain.gain.value = 0
    mediaSource.connect(gain).connect(context.destination)
  } else {
    audio.volume = 0
  }
  audio.load()

  let pauseTimer = 0
  let volumeFrame = 0
  let generation = 0
  let disposed = false

  const fadeTo = (target, durationMs) => {
    window.cancelAnimationFrame(volumeFrame)
    if (gain) {
      const now = context.currentTime
      const level = gain.gain.value
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(level, now)
      gain.gain.linearRampToValueAtTime(target, now + Math.max(.001, durationMs / 1000))
      return
    }
    const start = performance.now()
    const initial = audio.volume
    const advance = now => {
      const progress = durationMs ? Math.min(1, (now - start) / durationMs) : 1
      audio.volume = initial + (target - initial) * progress
      if (progress < 1) volumeFrame = window.requestAnimationFrame(advance)
    }
    advance(start)
  }

  const play = () => {
    if (disposed) return
    const request = ++generation
    window.clearTimeout(pauseTimer)
    if (context?.state === 'suspended') void context.resume().catch(onError)
    const started = audio.paused ? audio.play() : Promise.resolve()
    void started.then(() => {
      if (disposed || request !== generation) {
        if (request !== generation) audio.pause()
        return
      }
      fadeTo(.17, motion.ambientFadeMs)
    }).catch(error => {
      if (!disposed && request === generation) onError(error)
    })
  }

  const pause = (durationMs = motion.ambientFadeMs) => {
    ++generation
    window.clearTimeout(pauseTimer)
    fadeTo(0, durationMs)
    if (durationMs === 0) audio.pause()
    else pauseTimer = window.setTimeout(() => audio.pause(), durationMs)
  }

  const slowAndLowerPitch = () => {
    audio.preservesPitch = false
    if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = false
    if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = false
    audio.playbackRate = .9
  }

  const restoreNormalPitch = () => {
    audio.preservesPitch = true
    if ('webkitPreservesPitch' in audio) audio.webkitPreservesPitch = true
    if ('mozPreservesPitch' in audio) audio.mozPreservesPitch = true
    audio.playbackRate = 1
  }

  const dispose = () => {
    disposed = true
    ++generation
    window.clearTimeout(pauseTimer)
    window.cancelAnimationFrame(volumeFrame)
    audio.pause()
    mediaSource?.disconnect()
    gain?.disconnect()
  }

  return { play, pause, slowAndLowerPitch, restoreNormalPitch, dispose }
}

function createWindPlayer(context) {
  const duration = 7
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
  const samples = buffer.getChannelData(0)
  let breeze = 0
  for (let index = 0; index < samples.length; index += 1) {
    breeze = (breeze + (Math.random() * 2 - 1) * .06) / 1.06
    samples[index] = breeze * 3
  }
  const edge = Math.ceil(context.sampleRate * .04)
  for (let index = 0; index < edge; index += 1) {
    const fade = index / edge
    samples[index] *= fade
    samples[samples.length - 1 - index] *= fade
  }
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gust = context.createGain()
  const master = context.createGain()
  const lfo = context.createOscillator()
  const depth = context.createGain()
  source.buffer = buffer
  source.loop = true
  filter.type = 'bandpass'
  filter.frequency.value = 480
  filter.Q.value = .35
  gust.gain.value = .05
  master.gain.value = 0
  lfo.type = 'sine'
  lfo.frequency.value = .13
  depth.gain.value = .035
  source.connect(filter).connect(gust).connect(master).connect(context.destination)
  lfo.connect(depth).connect(gust.gain)
  let started = false
  let disposed = false
  const play = () => {
    const start = () => {
      if (started || disposed || context.state !== 'running') return
      started = true
      const now = context.currentTime
      master.gain.setValueAtTime(0, now)
      master.gain.linearRampToValueAtTime(1, now + 1.5)
      source.start(now)
      lfo.start(now)
    }
    if (context.state === 'suspended') void context.resume().then(start).catch(() => {})
    else start()
  }
  const pause = (durationMs = motion.ambientFadeMs) => {
    if (!started || disposed) return
    const now = context.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(0, now + Math.max(.001, durationMs / 1000))
  }
  const dispose = () => {
    disposed = true
    if (started) { source.stop(); lfo.stop() }
    source.disconnect()
    filter.disconnect()
    gust.disconnect()
    master.disconnect()
    lfo.disconnect()
    depth.disconnect()
  }
  return { play, pause, dispose }
}

function App() {
  const [wishMade, setWishMade] = useState(false)
  const [cakeRevealed, setCakeRevealed] = useState(false)
  const [wishDialogPhase, setWishDialogPhase] = useState('closed')
  const [wishText, setWishText] = useState('')
  const [wishSaving, setWishSaving] = useState(false)
  const [wishSaveError, setWishSaveError] = useState('')
  const [debugError, setDebugError] = useState(null)
  const [wishSequence, setWishSequence] = useState(0)
  const [blowProgress, setBlowProgress] = useState(0)
  const [candleBlowPhase, setCandleBlowPhase] = useState('lit')
  const [cutPhase, setCutPhase] = useState('hidden')
  const [cutKnifeStyle, setCutKnifeStyle] = useState(null)
  const [cutProgress, setCutProgress] = useState(0)
  const [cutWarningMessage, setCutWarningMessage] = useState('')
  const [cutWarningSequence, setCutWarningSequence] = useState(0)
  const [cutChoicesReenabled, setCutChoicesReenabled] = useState(false)
  const [cutGlitch, setCutGlitch] = useState(false)
  const [doroCut, setDoroCut] = useState(false)
  const [noteDropped, setNoteDropped] = useState(false)
  const [paperButtonVisible, setPaperButtonVisible] = useState(false)
  const [paperDialogOpen, setPaperDialogOpen] = useState(false)
  const [wishPointerCancelled, setWishPointerCancelled] = useState(false)
  const [pressedButton, setPressedButton] = useState(null)
  const [collectedIds, setCollectedIds] = useState(() => new Set())
  const collectedIdsRef = useRef(new Set())
  const [stickersReady, setStickersReady] = useState(stickerImages.length === 0)
  const [loadedResources, setLoadedResources] = useState(0)
  const [loadingComplete, setLoadingComplete] = useState(false)
  const [loadingExitStarted, setLoadingExitStarted] = useState(false)
  const [loadingDismissed, setLoadingDismissed] = useState(false)
  const [volumeReminderVisible, setVolumeReminderVisible] = useState(false)
  const [revealPhase, setRevealPhase] = useState('idle')
  const [startPromptVisible, setStartPromptVisible] = useState(false)
  const [revealSequence, setRevealSequence] = useState(0)
  const [introMessage, setIntroMessage] = useState(copy.initialPrompt)
  const [introSequence, setIntroSequence] = useState(0)
  const [bgmPromptVisible, setBgmPromptVisible] = useState(false)
  const [bgmFlowComplete, setBgmFlowComplete] = useState(false)
  const [bgmAnalyser, setBgmAnalyser] = useState(null)
  const [snowMode, setSnowMode] = useState(false)
  const [fallingStopped, setFallingStopped] = useState(false)
  const [candleFlyingAway, setCandleFlyingAway] = useState(false)
  const [candleGone, setCandleGone] = useState(false)
  const [doroVisible, setDoroVisible] = useState(false)
  const [doroRevealSequence, setDoroRevealSequence] = useState(0)
  const [doroSqueezeCount, setDoroSqueezeCount] = useState(0)
  const [doroHintsVisible, setDoroHintsVisible] = useState(false)
  const [candleBlowReady, setCandleBlowReady] = useState(false)
  const pageShellRef = useRef(null)
  const bucketRef = useRef(null)
  const cakeTouchRef = useRef(null)
  const wishInputRef = useRef(null)
  const wishTriggerRef = useRef(null)
  const paperOpenRef = useRef(null)
  const paperCloseRef = useRef(null)
  const wishDialogTimerRef = useRef(null)
  const wishOpenTimerRef = useRef(null)
  const bgmAudioRef = useRef(null)
  const bgmAudioContextRef = useRef(null)
  const ambientPlayerRef = useRef(null)
  const windPlayerRef = useRef(null)
  const ambientFadeStartTimerRef = useRef(null)
  const bgmAudioBufferPromiseRef = useRef(null)
  const bgmAudioSourceRef = useRef(null)
  const bgmAnalyserRef = useRef(null)
  const bgmLoadErrorRef = useRef(null)
  const bgmStartTimerRef = useRef(null)
  const bgmFinishTimerRef = useRef(null)
  const bgmTriggeredRef = useRef(false)
  const bgmPlaybackSettledRef = useRef(false)
  const wishPointerRef = useRef(null)
  const loadingDismissTimerRef = useRef(null)
  const startPromptTimerRef = useRef(null)
  const titleRevealTimerRef = useRef(null)
  const revealTimerRef = useRef(null)
  const revealBucketTimerRef = useRef(null)
  const revealCandleTimerRef = useRef(null)
  const revealFallingTimerRef = useRef(null)
  const introTimerRef = useRef(null)
  const doroRevealTimerRef = useRef(null)
  const doroHintsTimerRef = useRef(null)
  const doroHintTimerRef = useRef(null)
  const candleReadyTimerRef = useRef(null)
  const postCandleMessageTimerRef = useRef(null)
  const candleFlyTimerRef = useRef(null)
  const knifeRevealTimerRef = useRef(null)
  const cutChoiceTimerRef = useRef(null)
  const cutWarningTimerRef = useRef(null)
  const cutGlitchAudioRef = useRef(null)
  const cutHoldRef = useRef(null)
  const cutMoveTimerRef = useRef(null)
  const cutRestTimerRef = useRef(null)
  const cutBlackoutTimerRef = useRef(null)
  const postCutJamTimerRef = useRef(null)
  const noteDropTimerRef = useRef(null)
  const paperHintTimerRef = useRef(null)
  const paperButtonTimerRef = useRef(null)
  const cutCancelPointerRef = useRef(null)
  const doroSqueezeCountRef = useRef(0)
  const introMessageRef = useRef(copy.initialPrompt)
  const buttonPressRef = useRef(null)
  const cancelledButtonRef = useRef(null)
  const wishSubmittingRef = useRef(false)
  const debugErrorSequenceRef = useRef(0)
  const blowHoldRef = useRef(null)
  const blackoutTimerRef = useRef(null)
  const collectedCount = collectedIds.size
  const isComplete = revealPhase === 'active' && stickerImages.length > 0 && collectedCount === stickerImages.length
  const showDoro = isComplete && doroVisible
  const wishReady = showDoro && doroSqueezeCount >= 10 && bgmFlowComplete && !cakeRevealed && !wishMade
  const actionButtonVisible = wishReady || (showDoro && cakeRevealed && candleBlowReady && !wishMade)
  const contentVisible = revealPhase !== 'idle'
  const cutInteractionVisible = ['knife', 'ready', 'holding', 'knife-moving', 'knife-resting', 'blackout', 'warning'].includes(cutPhase)
  const [collectionOpen, setCollectionOpen] = useState(false)
  const paperLines = copy.paperMessage.trim().split(/\s+/).filter(Boolean)
  const totalResources = stickerImages.length + 2
  const loadingProgress = Math.min(100, Math.round(loadedResources / totalResources * 100))

  const showDebugError = (title, details) => {
    debugErrorSequenceRef.current += 1
    setDebugError({
      id: debugErrorSequenceRef.current,
      title,
      details: String(details || '未知错误').slice(0, 4000),
      timestamp: new Date().toLocaleString('zh-CN', { hour12: false }),
    })
  }

  useEffect(() => {
    const handleError = event => {
      if (event.error) showDebugError('页面发生错误', formatClientError(event.error))
    }
    const handleUnhandledRejection = event => {
      showDebugError('异步操作发生错误', formatClientError(event.reason))
      event.preventDefault()
    }
    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  useEffect(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      const context = new AudioContextClass()
      bgmAudioContextRef.current = context
      bgmAudioBufferPromiseRef.current = fetch(bgmUrl)
        .then(response => {
          if (!response.ok) throw new Error(`bgm.mp3 请求失败：HTTP ${response.status}`)
          return response.arrayBuffer()
        })
        .then(data => context.decodeAudioData(data))
        .catch(error => {
          bgmLoadErrorRef.current = error
          return null
        })
    } else {
      const audio = new Audio(bgmUrl)
      audio.preload = 'auto'
      audio.loop = false
      bgmAudioRef.current = audio
      audio.load()
    }
    ambientPlayerRef.current = createAmbientPlayer(bgmAudioContextRef.current, error => {
      showDebugError('常态背景音乐播放失败', formatClientError(error))
    })

    return () => {
      ambientPlayerRef.current?.dispose()
      ambientPlayerRef.current = null
      windPlayerRef.current?.dispose()
      windPlayerRef.current = null
      bgmAudioRef.current?.pause()
      bgmAudioSourceRef.current?.stop()
      bgmAudioSourceRef.current?.disconnect()
      bgmAnalyserRef.current?.disconnect()
      if (bgmAudioContextRef.current && bgmAudioContextRef.current.state !== 'closed') {
        void bgmAudioContextRef.current.close().catch(() => {})
      }
      bgmAudioSourceRef.current = null
      bgmAnalyserRef.current = null
      bgmAudioBufferPromiseRef.current = null
      bgmAudioContextRef.current = null
      bgmAudioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!loadingDismissed) return undefined
    return playTypewriterSound(bgmAudioContextRef.current, introMessage, 'green')
  }, [introMessage, introSequence, loadingDismissed])

  useEffect(() => {
    if (!loadingDismissed) return undefined
    const showTimer = window.setTimeout(() => setVolumeReminderVisible(true), timing.volumeReminderDelayMs)
    const hideTimer = window.setTimeout(() => setVolumeReminderVisible(false),
      timing.volumeReminderDelayMs + timing.volumeReminderVisibleMs + motion.volumeReminderMs * 2)
    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
    }
  }, [loadingDismissed])

  useEffect(() => playTypewriterSound(bgmAudioContextRef.current, cutWarningMessage, 'pink'), [cutWarningMessage, cutWarningSequence])

  useEffect(() => () => {
    window.clearTimeout(wishDialogTimerRef.current)
    window.clearTimeout(wishOpenTimerRef.current)
    window.clearTimeout(bgmStartTimerRef.current)
    window.clearTimeout(bgmFinishTimerRef.current)
    window.clearTimeout(ambientFadeStartTimerRef.current)
    bgmAudioSourceRef.current?.stop()
    bgmAudioSourceRef.current?.disconnect()
    bgmAnalyserRef.current?.disconnect()
    window.clearTimeout(loadingDismissTimerRef.current)
    window.clearTimeout(startPromptTimerRef.current)
    window.clearTimeout(titleRevealTimerRef.current)
    window.clearTimeout(revealTimerRef.current)
    window.clearTimeout(revealBucketTimerRef.current)
    window.clearTimeout(revealCandleTimerRef.current)
    window.clearTimeout(revealFallingTimerRef.current)
    window.clearTimeout(introTimerRef.current)
    window.clearTimeout(doroRevealTimerRef.current)
    window.clearTimeout(doroHintsTimerRef.current)
    window.clearTimeout(doroHintTimerRef.current)
    window.clearTimeout(candleReadyTimerRef.current)
    window.clearTimeout(postCandleMessageTimerRef.current)
    window.clearTimeout(candleFlyTimerRef.current)
    window.clearTimeout(knifeRevealTimerRef.current)
    window.clearTimeout(cutChoiceTimerRef.current)
    window.clearTimeout(cutWarningTimerRef.current)
    window.clearTimeout(cutHoldRef.current?.timerId)
    window.clearTimeout(cutMoveTimerRef.current)
    window.clearTimeout(cutRestTimerRef.current)
    window.clearTimeout(cutBlackoutTimerRef.current)
    window.clearTimeout(postCutJamTimerRef.current)
    window.clearTimeout(noteDropTimerRef.current)
    window.clearTimeout(paperHintTimerRef.current)
    window.clearTimeout(paperButtonTimerRef.current)
    window.clearTimeout(blackoutTimerRef.current)
    window.clearTimeout(blowHoldRef.current?.timerId)
    if (cutGlitchAudioRef.current) void cutGlitchAudioRef.current.close().catch(() => {})
    cutCancelPointerRef.current = null
  }, [])

  const updateIntroMessage = message => {
    if (introMessageRef.current === message) return
    introMessageRef.current = message
    setIntroMessage(message)
    setIntroSequence(previous => previous + 1)
  }

  const startWind = () => {
    const context = bgmAudioContextRef.current
    if (!context || context.state === 'closed') return
    windPlayerRef.current ||= createWindPlayer(context)
    windPlayerRef.current.play()
  }

  const restoreAmbientAfterPaper = () => {
    windPlayerRef.current?.pause(motion.ambientFadeMs)
    ambientPlayerRef.current?.restoreNormalPitch()
    ambientPlayerRef.current?.play()
  }

  const handleDoroSqueeze = wasDragged => {
    if (wasDragged) playSqueezeBoing(bgmAudioContextRef.current)
    const nextCount = Math.min(10, doroSqueezeCountRef.current + 1)
    doroSqueezeCountRef.current = nextCount
    setDoroSqueezeCount(nextCount)
    if (nextCount === 10 && !bgmTriggeredRef.current) {
      bgmTriggeredRef.current = true
      bgmPlaybackSettledRef.current = false
      setBgmPromptVisible(true)
      updateIntroMessage(copy.volumePrompt)
      // Resume the audio context directly in the user's squeeze gesture so
      // mobile browsers allow playback when the five-second cue expires.
      if (bgmAudioContextRef.current?.state === 'suspended') {
        bgmAudioContextRef.current.resume().catch(error => { bgmLoadErrorRef.current = error })
      }
      ambientFadeStartTimerRef.current = window.setTimeout(
        () => ambientPlayerRef.current?.pause(),
        Math.max(0, timing.bgmStartDelayMs - motion.ambientFadeMs),
      )
      bgmStartTimerRef.current = window.setTimeout(() => {
        bgmStartTimerRef.current = null
        ambientPlayerRef.current?.pause(0)
        const context = bgmAudioContextRef.current
        if (context) {
          const startDecodedBgm = async () => {
            const buffer = await bgmAudioBufferPromiseRef.current
            if (!buffer) throw bgmLoadErrorRef.current || new Error('bgm.mp3 解码失败')
            if (context.state !== 'running') await context.resume()
            const source = context.createBufferSource()
            const analyser = context.createAnalyser()
            analyser.fftSize = 2048
            analyser.smoothingTimeConstant = .5
            bgmAudioSourceRef.current = source
            bgmAnalyserRef.current = analyser
            source.buffer = buffer
            source.connect(analyser)
            analyser.connect(context.destination)
            source.onended = () => finishBgmStep()
            source.start()
            setSnowMode(true)
            setBgmAnalyser(analyser)
          }
          startDecodedBgm().catch(error => {
            showDebugError('背景音乐播放失败', formatClientError(error))
            finishBgmStep()
          })
          return
        }

        const audio = bgmAudioRef.current
        if (!audio) {
          showDebugError('背景音乐无法播放', 'bgm.mp3 音频对象尚未准备好')
          finishBgmStep()
          return
        }

        const onEnded = () => {
          audio.removeEventListener('error', onError)
          finishBgmStep()
        }
        const onError = () => {
          const mediaError = audio.error
          const error = new Error(`bgm.mp3 加载失败${mediaError ? `（MediaError code ${mediaError.code}）` : ''}`)
          audio.removeEventListener('ended', onEnded)
          showDebugError('背景音乐播放失败', formatClientError(error))
          finishBgmStep()
        }

        audio.currentTime = 0
        audio.addEventListener('ended', onEnded)
        audio.addEventListener('error', onError)
        audio.play().then(() => setSnowMode(true)).catch(error => {
          audio.removeEventListener('ended', onEnded)
          audio.removeEventListener('error', onError)
          showDebugError('背景音乐播放失败', formatClientError(error))
          finishBgmStep()
        })
      }, timing.bgmStartDelayMs)
    }
  }

  const finishBgmStep = () => {
    if (bgmPlaybackSettledRef.current) return
    bgmPlaybackSettledRef.current = true
    setSnowMode(false)
    if (bgmAudioSourceRef.current) {
      bgmAudioSourceRef.current.onended = null
      bgmAudioSourceRef.current.disconnect()
      bgmAudioSourceRef.current = null
    }
    bgmAnalyserRef.current?.disconnect()
    bgmAnalyserRef.current = null
    setBgmAnalyser(null)
    ambientPlayerRef.current?.play()
    bgmFinishTimerRef.current = window.setTimeout(() => {
      bgmFinishTimerRef.current = null
      setBgmPromptVisible(false)
      setBgmFlowComplete(true)
    }, timing.bgmAfterPlayDelayMs)
  }

  const finishCandleBlow = () => {
    setBlowProgress(0)
    setCandleBlowReady(false)
    ambientPlayerRef.current?.slowAndLowerPitch()
    setCandleBlowPhase('blackout')
    updateIntroMessage('')
    blackoutTimerRef.current = window.setTimeout(() => {
      blackoutTimerRef.current = null
      setWishMade(true)
      setCandleBlowPhase('dim')
      setWishSequence(previous => previous + 1)
    }, timing.candleBlackoutMs)
  }

  const measureCutKnife = () => {
    const cake = cakeTouchRef.current?.querySelector('.cake-svg')
    const bounds = cake?.getBoundingClientRect()
    if (!bounds?.width || !bounds.height) return
    const scale = bounds.width / 620
    // The cut belongs to the Doro face, whose two halves meet around the
    // center of the cake artwork (x=310 in the 620 viewBox).
    const cutTipX = bounds.left + 310 * scale
    const cutTipY = bounds.top + 210 * scale
    const viewportPadding = 24
    // The blade tip stays on the Doro cut; both the resting and entry poses fit on narrow screens.
    const knifeScale = Math.max(0, Math.min(scale * .68, (window.innerWidth - viewportPadding - cutTipX) / 506))
    const knifeWidth = 520 * knifeScale
    const knifeLeft = cutTipX - 14 * knifeScale
    const knifeHeight = 205 * knifeScale
    const maxKnifeTop = Math.max(viewportPadding, window.innerHeight - viewportPadding - knifeHeight)
    const clampKnifeTop = top => Math.min(maxKnifeTop, Math.max(viewportPadding, top))
    const knifeTop = clampKnifeTop(cutTipY - 193 * knifeScale)
    const entryTipX = Math.min(bounds.left + 410 * scale, window.innerWidth - viewportPadding - 506 * knifeScale)
    // Keep the entry pose on the same safe vertical baseline as the cutting
    // pose. The rise animation supplies the vertical entrance movement; a
    // negative resting offset would clip the knife and make the phase switch
    // look like a teleport.
    const entryTop = knifeTop
    setCutKnifeStyle({
      left: `${knifeLeft}px`,
      top: `${knifeTop}px`,
      width: `${knifeWidth}px`,
      height: `${knifeHeight}px`,
      '--knife-entry-x': `${entryTipX - cutTipX}px`,
      '--knife-entry-y': `${entryTop - knifeTop}px`,
    })
  }

  useEffect(() => {
    if (!cutInteractionVisible) return undefined
    measureCutKnife()
    window.addEventListener('resize', measureCutKnife)
    return () => window.removeEventListener('resize', measureCutKnife)
  }, [cutInteractionVisible])

  const startCutHold = event => {
    if (cutPhase !== 'ready' || cutHoldRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return
    measureCutKnife()
    event.preventDefault()
    const button = event.currentTarget
    const ringX = Math.max(24, Math.min(window.innerWidth - 24, event.clientX + 26))
    const ringY = Math.max(24, Math.min(window.innerHeight - 24, event.clientY - 28))
    const side = button.dataset.cutSide
    const hold = { pointerId: event.pointerId, start: performance.now(), ringX, ringY, timerId: 0 }
    cutHoldRef.current = hold
    setPressedButton(`cut-${side}`)
    setCutProgress(.001)
    setCutPhase('holding')
    try { button.setPointerCapture?.(event.pointerId) } catch {}
    const tick = now => {
      if (cutHoldRef.current !== hold) return
      const progress = Math.min(1, (now - hold.start) / timing.cutHoldMs)
      setCutProgress(progress)
      if (progress >= 1) {
        cutHoldRef.current = null
        setPressedButton(null)
        try { button.releasePointerCapture?.(event.pointerId) } catch {}
        setCutPhase('knife-moving')
        cutMoveTimerRef.current = window.setTimeout(() => {
          cutMoveTimerRef.current = null
          setCutPhase('knife-resting')
          cutRestTimerRef.current = window.setTimeout(() => {
            cutRestTimerRef.current = null
            setDoroCut(true)
            setFallingStopped(true)
            updateIntroMessage('')
            ambientPlayerRef.current?.pause(0)
            startWind()
            setCutPhase('blackout')
            cutBlackoutTimerRef.current = window.setTimeout(() => {
              cutBlackoutTimerRef.current = null
              setCutPhase('done')
              postCutJamTimerRef.current = window.setTimeout(() => {
                postCutJamTimerRef.current = null
                updateIntroMessage(copy.strawberryJam)
                noteDropTimerRef.current = window.setTimeout(() => {
                  noteDropTimerRef.current = null
                  setNoteDropped(true)
                  paperHintTimerRef.current = window.setTimeout(() => {
                    paperHintTimerRef.current = null
                    updateIntroMessage(copy.paperHint)
                    paperButtonTimerRef.current = window.setTimeout(() => {
                      paperButtonTimerRef.current = null
                      setPaperButtonVisible(true)
                    }, timing.paperButtonDelayMs)
                  }, timing.postCutPaperHintMs)
                }, timing.postCutNoteDropMs)
              }, timing.brightnessRestoreMs + timing.postCutJamMs)
            }, timing.cutBlackoutMs)
          }, timing.cutKnifeRestMs)
        }, timing.cutKnifeMoveMs)
        return
      }
      hold.timerId = window.setTimeout(() => tick(performance.now()), timing.progressUpdateIntervalMs)
    }
    hold.timerId = window.setTimeout(() => tick(performance.now()), timing.progressUpdateIntervalMs)
  }

  const cancelCutHold = event => {
    const hold = cutHoldRef.current
    if (!hold || hold.pointerId !== event.pointerId) return
    window.clearTimeout(hold.timerId)
    cutHoldRef.current = null
    setPressedButton(null)
    setCutProgress(0)
    setCutPhase('ready')
    try { event.currentTarget.releasePointerCapture?.(event.pointerId) } catch {}
  }

  const cancelCutChoice = () => {
    if (cutPhase !== 'ready' || cutHoldRef.current) return
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      try {
        cutGlitchAudioRef.current ||= new AudioContextClass()
        if (cutGlitchAudioRef.current.state === 'suspended') void cutGlitchAudioRef.current.resume().catch(() => {})
      } catch {}
    }
    window.clearTimeout(cutChoiceTimerRef.current)
    window.clearTimeout(cutWarningTimerRef.current)
    setCutChoicesReenabled(false)
    setCutPhase('warning')
    updateIntroMessage('')
    const messages = [copy.cutWarningOne, copy.cutWarningTwo, copy.cutWarningThree]
    let index = 0
    const showWarning = () => {
      setCutWarningMessage(messages[index])
      setCutWarningSequence(previous => previous + 1)
      if (index < messages.length - 1) {
        index += 1
        cutWarningTimerRef.current = window.setTimeout(showWarning, timing.cutWarningStepMs)
        return
      }
      cutWarningTimerRef.current = window.setTimeout(() => {
        cutWarningTimerRef.current = null
        updateIntroMessage(copy.cutWarningRecovery)
        cutWarningTimerRef.current = window.setTimeout(() => {
          cutWarningTimerRef.current = null
          ambientPlayerRef.current?.pause(0)
          setFallingStopped(true)
          startWind()
          playCutGlitchSound(cutGlitchAudioRef.current, motion.cutGlitchMs)
          setCutGlitch(true)
          setCutWarningMessage('')
          cutWarningTimerRef.current = window.setTimeout(() => {
            cutWarningTimerRef.current = null
            setCutGlitch(false)
            updateIntroMessage(copy.candleWentDark)
            setCutChoicesReenabled(true)
            setCutPhase('ready')
          }, motion.cutGlitchMs)
        }, timing.cutWarningRecoveryMs)
      }, timing.cutWarningAfterLastMs)
    }
    showWarning()
  }

  const startCutCancelPointer = event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    cutCancelPointerRef.current = { pointerId: event.pointerId }
    cancelledButtonRef.current = null
    setPressedButton('cut-cancel')
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch {}
  }

  const cancelCutCancelPointer = event => {
    const pointer = cutCancelPointerRef.current
    if (!pointer || pointer.pointerId !== event.pointerId) return
    cutCancelPointerRef.current = null
    cancelledButtonRef.current = 'cut-cancel'
    setPressedButton(null)
    try { event.currentTarget.releasePointerCapture?.(event.pointerId) } catch {}
    window.setTimeout(() => {
      if (cancelledButtonRef.current === 'cut-cancel') cancelledButtonRef.current = null
    }, timing.buttonCancelResetMs)
  }

  const moveCutCancelPointer = event => {
    const pointer = cutCancelPointerRef.current
    if (pointer?.pointerId === event.pointerId && !isPointerInsideButton(event.currentTarget, event)) cancelCutCancelPointer(event)
  }

  const finishCutCancelPointer = event => {
    const pointer = cutCancelPointerRef.current
    if (!pointer || pointer.pointerId !== event.pointerId) return
    if (!isPointerInsideButton(event.currentTarget, event)) {
      cancelCutCancelPointer(event)
      return
    }
    cutCancelPointerRef.current = null
    setPressedButton(null)
    try { event.currentTarget.releasePointerCapture?.(event.pointerId) } catch {}
    cancelCutChoice()
  }

  const openWishDialogAfterBounce = () => {
    if (wishDialogPhase !== 'closed') return
    window.clearTimeout(wishOpenTimerRef.current)
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : timing.wishDialogBounceMs
    wishOpenTimerRef.current = window.setTimeout(() => {
      wishOpenTimerRef.current = null
      setWishDialogPhase('open')
    }, delay)
  }

  const isPointerInsideButton = (button, event) => {
    const bounds = button.getBoundingClientRect()
    const width = button.offsetWidth || bounds.width
    const height = button.offsetHeight || bounds.height
    const centerX = (bounds.left + bounds.right) / 2
    const centerY = (bounds.top + bounds.bottom) / 2
    return event.clientX >= centerX - width / 2 && event.clientX <= centerX + width / 2 && event.clientY >= centerY - height / 2 && event.clientY <= centerY + height / 2
  }

  const releaseWishPointer = event => {
    if (wishPointerRef.current !== event.pointerId) return
    wishPointerRef.current = null
    setPressedButton(null)
    try { event.currentTarget.releasePointerCapture?.(event.pointerId) } catch {}
  }

  const cancelWishPointer = event => {
    if (wishPointerRef.current !== event.pointerId) return
    setWishPointerCancelled(true)
    releaseWishPointer(event)
  }

  const handleWishPointerDown = event => {
    if (cakeRevealed) {
      startCandleBlow(event)
      return
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return
    setWishPointerCancelled(false)
    setPressedButton('wish')
    wishPointerRef.current = event.pointerId
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch {}
  }

  const handleWishPointerUp = event => {
    if (cakeRevealed) {
      cancelCandleBlow(event)
      return
    }
    if (wishPointerRef.current !== event.pointerId || !isPointerInsideButton(event.currentTarget, event)) {
      cancelWishPointer(event)
      return
    }
    releaseWishPointer(event)
    openWishDialogAfterBounce()
  }

  const handleWishPointerMove = event => {
    if (cakeRevealed) {
      if (!isPointerInsideButton(event.currentTarget, event)) cancelCandleBlow(event)
      return
    }
    if (wishPointerRef.current === event.pointerId && !isPointerInsideButton(event.currentTarget, event)) cancelWishPointer(event)
  }

  const handleWishPointerCancel = event => {
    if (cakeRevealed) {
      cancelCandleBlow(event)
      return
    }
    cancelWishPointer(event)
  }

  const startCandleBlow = event => {
    if (!cakeRevealed || wishMade || candleBlowPhase !== 'lit' || blowHoldRef.current) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    const button = event.currentTarget
    const ringX = Math.max(24, Math.min(window.innerWidth - 24, event.clientX + 26))
    const ringY = Math.max(24, Math.min(window.innerHeight - 24, event.clientY - 28))
    const hold = { pointerId: event.pointerId, start: performance.now(), ringX, ringY, timerId: 0 }
    blowHoldRef.current = hold
    setWishPointerCancelled(false)
    setPressedButton('wish')
    setBlowProgress(.001)
    try { button.setPointerCapture?.(event.pointerId) } catch {}
    const tick = now => {
      if (blowHoldRef.current !== hold) return
      const progress = Math.min(1, (now - hold.start) / timing.candleHoldMs)
      setBlowProgress(progress)
      if (progress >= 1) {
        blowHoldRef.current = null
        setPressedButton(null)
        try { button.releasePointerCapture?.(event.pointerId) } catch {}
        finishCandleBlow()
        return
      }
      hold.timerId = window.setTimeout(() => tick(performance.now()), timing.progressUpdateIntervalMs)
    }
    hold.timerId = window.setTimeout(() => tick(performance.now()), timing.progressUpdateIntervalMs)
  }

  const cancelCandleBlow = event => {
    const hold = blowHoldRef.current
    if (!hold || hold.pointerId !== event.pointerId) return
    window.clearTimeout(hold.timerId)
    blowHoldRef.current = null
    setWishPointerCancelled(true)
    setPressedButton(null)
    setBlowProgress(0)
    try { event.currentTarget.releasePointerCapture?.(event.pointerId) } catch {}
  }

  const enterPage = () => {
    if (!loadingComplete || loadingExitStarted) return
    if (bgmAudioContextRef.current?.state === 'suspended') {
      void bgmAudioContextRef.current.resume().catch(() => {})
    }
    ambientPlayerRef.current?.play()
    setLoadingExitStarted(true)
    window.clearTimeout(startPromptTimerRef.current)
    startPromptTimerRef.current = window.setTimeout(() => {
      startPromptTimerRef.current = null
      setStartPromptVisible(true)
    }, timing.pageStartPromptMs)
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : timing.loadingFadeMs
    loadingDismissTimerRef.current = window.setTimeout(() => {
      loadingDismissTimerRef.current = null
      setLoadingDismissed(true)
    }, delay)
  }

  const startReveal = () => {
    if (!startPromptVisible || revealPhase !== 'idle') return
    if (pageShellRef.current) pageShellRef.current.scrollTop = 0
    setStartPromptVisible(false)
    setRevealPhase('revealing')
    setRevealSequence(previous => previous + 1)
    window.clearTimeout(titleRevealTimerRef.current)
    titleRevealTimerRef.current = window.setTimeout(() => {
      titleRevealTimerRef.current = null
      const page = pageShellRef.current
      const cake = cakeTouchRef.current
      if (!page || !cake) return
      const target = page.scrollTop + cake.getBoundingClientRect().top - page.getBoundingClientRect().top - 20
      page.scrollTo({ top: target, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    }, motion.headingFadeMs)
    window.clearTimeout(revealTimerRef.current)
    window.clearTimeout(revealBucketTimerRef.current)
    window.clearTimeout(revealCandleTimerRef.current)
    window.clearTimeout(revealFallingTimerRef.current)
    window.clearTimeout(introTimerRef.current)
    revealBucketTimerRef.current = window.setTimeout(() => setRevealPhase('bucket'), timing.revealBucketMs)
    revealCandleTimerRef.current = window.setTimeout(() => setRevealPhase('candle'), timing.revealCandleMs)
    revealFallingTimerRef.current = window.setTimeout(() => {
      revealFallingTimerRef.current = null
      setRevealPhase('active')
      introTimerRef.current = window.setTimeout(() => {
        introTimerRef.current = null
        updateIntroMessage(copy.canDragDoro)
      }, timing.revealIntroPromptMs)
    }, timing.revealStickersMs)
  }

  const pressButton = buttonId => () => {
    buttonPressRef.current = { id: buttonId, cancelled: false }
    cancelledButtonRef.current = null
    setPressedButton(buttonId)
  }
  const cancelButtonPress = buttonId => () => {
    const press = buttonPressRef.current
    if (!press || press.id !== buttonId) return
    press.cancelled = true
    cancelledButtonRef.current = buttonId
    buttonPressRef.current = null
    setPressedButton(null)
  }
  const releaseButton = buttonId => () => {
    const press = buttonPressRef.current
    if (!press || press.id !== buttonId) return
    if (press.cancelled) cancelledButtonRef.current = buttonId
    buttonPressRef.current = null
    setPressedButton(null)
  }
  const clickButton = (buttonId, action) => event => {
    if (cancelledButtonRef.current === buttonId) {
      cancelledButtonRef.current = null
      event.preventDefault()
      return
    }
    action()
  }

  const closePaperDialog = () => {
    setPaperDialogOpen(false)
    paperOpenRef.current?.focus()
  }

  const openPaperDialog = () => {
    restoreAmbientAfterPaper()
    setSnowMode(false)
    setFallingStopped(false)
    setPaperDialogOpen(true)
  }

  useEffect(() => {
    if (paperDialogOpen) paperCloseRef.current?.focus()
  }, [paperDialogOpen])

  useEffect(() => {
    if (wishDialogPhase !== 'open') return
    wishInputRef.current?.focus()
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeWishDialog()
        return
      }
      if (event.key === 'Tab') {
        const controls = [...document.querySelectorAll('#wish-dialog button:not(:disabled), #wish-dialog textarea:not(:disabled)')]
        const current = controls.indexOf(document.activeElement)
        if (event.shiftKey && current === 0) {
          event.preventDefault()
          controls.at(-1)?.focus()
        } else if (!event.shiftKey && current === controls.length - 1) {
          event.preventDefault()
          controls[0]?.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [wishDialogPhase])

  const closeWishDialog = (submitted = false) => {
    if (wishDialogPhase !== 'open' || wishDialogTimerRef.current !== null || (wishSubmittingRef.current && !submitted)) return
    setWishDialogPhase('closing')
    const finish = () => {
      wishDialogTimerRef.current = null
      setWishDialogPhase('closed')
      if (submitted) {
        setCakeRevealed(true)
        setWishText('')
        setWishSaveError('')
      }
      wishTriggerRef.current?.focus()
    }
    wishDialogTimerRef.current = window.setTimeout(finish, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : timing.wishDialogCloseMs)
  }

  const submitWish = async event => {
    event.preventDefault()
    const wish = wishText.trim()
    if (!wish || wishSubmittingRef.current) return
    wishSubmittingRef.current = true
    setWishSaving(true)
    setWishSaveError('')
    setCandleBlowReady(false)
    updateIntroMessage(copy.wishSending)
    closeWishDialog(true)
    try {
      const response = await fetch('/api/wishes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wish }),
      })
      const rawResponse = await response.text()
      let payload = null
      try {
        payload = rawResponse ? JSON.parse(rawResponse) : null
      } catch {
        payload = null
      }
      if (!response.ok) {
        const requestError = new Error(payload?.error || copy.wishSaveFailed)
        requestError.status = response.status
        requestError.debugDetails = [
          '请求：POST /api/wishes',
          `HTTP：${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
          payload?.debug ? `服务端调试信息：\n${payload.debug}` : '',
          !payload?.debug && rawResponse ? `响应内容：\n${rawResponse.slice(0, 1200)}` : '',
        ].filter(Boolean).join('\n\n')
        throw requestError
      }
      updateIntroMessage(copy.wishSent)
      window.clearTimeout(candleReadyTimerRef.current)
      candleReadyTimerRef.current = window.setTimeout(() => {
        candleReadyTimerRef.current = null
        setCandleBlowReady(true)
      }, timing.wishCandleReadyMs)
    } catch (error) {
      window.clearTimeout(wishDialogTimerRef.current)
      wishDialogTimerRef.current = null
      setWishDialogPhase('open')
      setWishText(wish)
      setWishSaveError(copy.wishSaveFailed)
      showDebugError('愿望发送失败', error?.debugDetails || formatClientError(error))
    } finally {
      wishSubmittingRef.current = false
      setWishSaving(false)
    }
  }

  useEffect(() => {
    if (candleBlowPhase !== 'dim' || !wishMade || doroCut) return undefined
    window.clearTimeout(postCandleMessageTimerRef.current)
    window.clearTimeout(knifeRevealTimerRef.current)
    window.clearTimeout(cutChoiceTimerRef.current)
    setCutPhase('restoring')
    postCandleMessageTimerRef.current = window.setTimeout(() => {
      postCandleMessageTimerRef.current = null
      setCandleFlyingAway(true)
      candleFlyTimerRef.current = window.setTimeout(() => {
        candleFlyTimerRef.current = null
        setCandleGone(true)
        updateIntroMessage(copy.candleWentDark)
        setCutWarningMessage('')
        setCutChoicesReenabled(false)
        setCandleFlyingAway(false)
        setCutPhase('message')
        knifeRevealTimerRef.current = window.setTimeout(() => {
          knifeRevealTimerRef.current = null
          setCutPhase('knife')
          cutChoiceTimerRef.current = window.setTimeout(() => {
            cutChoiceTimerRef.current = null
            setCutPhase('ready')
          }, timing.cutChoicesAfterKnifeMs)
        }, timing.knifeRevealAfterDarkMessageMs)
      }, motion.candleFlyAwayMs)
    }, timing.brightnessRestoreMs + timing.postBrightnessCandleExitMs)
    return () => {
      window.clearTimeout(postCandleMessageTimerRef.current)
      window.clearTimeout(candleFlyTimerRef.current)
      window.clearTimeout(knifeRevealTimerRef.current)
      window.clearTimeout(cutChoiceTimerRef.current)
    }
  }, [candleBlowPhase, wishMade, doroCut])

  useEffect(() => {
    let active = true
    let completed = 0
    const markResourceComplete = () => {
      if (!active) return
      completed += 1
      setLoadedResources(completed)
    }
    const imageTasks = stickerImages.map(image => preloadStickerImage(image, markResourceComplete))
    const bgmTask = bgmAudioBufferPromiseRef.current || new Promise(resolve => {
      const audio = bgmAudioRef.current
      if (!audio) {
        resolve()
        return
      }
      const settle = () => {
        audio.removeEventListener('canplaythrough', settle)
        audio.removeEventListener('loadeddata', settle)
        audio.removeEventListener('error', settle)
        resolve()
      }
      audio.addEventListener('canplaythrough', settle)
      audio.addEventListener('loadeddata', settle)
      audio.addEventListener('error', settle)
    })
    bgmTask.then(markResourceComplete)
    // Only gate the loading card on the font it actually displays. A global
    // font readiness wait also waits for large Japanese faces used later in
    // the page, which makes the first screen feel stalled.
    const fontTask = document.fonts?.load
      ? Promise.all([
        document.fonts.load('400 21px "ZCOOL KuaiLe"', copy.loadingPreparing),
        document.fonts.load('400 14px "ZCOOL KuaiLe"', '100%'),
      ]).catch(() => {})
      : Promise.resolve()
    Promise.all(imageTasks).then(() => {
      if (active) setStickersReady(true)
    })
    // Let the user enter as soon as the loading UI's font and one sticker are
    // ready. The remaining stickers continue decoding in the background and
    // are mounted when the full set is available.
    const firstStickerTask = imageTasks.length > 0 ? Promise.race(imageTasks) : Promise.resolve()
    Promise.all([firstStickerTask, fontTask.then(markResourceComplete)]).then(() => {
      if (!active) return
      setLoadingComplete(true)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!isComplete) return undefined
    setCollectionOpen(false)
    updateIntroMessage(copy.allCollected)
    window.clearTimeout(doroRevealTimerRef.current)
    window.clearTimeout(doroHintsTimerRef.current)
    window.clearTimeout(doroHintTimerRef.current)
    setDoroHintsVisible(false)
    doroRevealTimerRef.current = window.setTimeout(() => {
      doroRevealTimerRef.current = null
      setDoroVisible(true)
      setDoroRevealSequence(previous => previous + 1)
      updateIntroMessage(copy.doroAppeared)
      // The emergence burst lasts about 1.45s; wait one more second before
      // bringing in the pinch guidance so the two effects do not overlap.
      doroHintsTimerRef.current = window.setTimeout(() => {
        doroHintsTimerRef.current = null
        setDoroHintsVisible(true)
      }, timing.doroHintsAppearanceMs)
      doroHintTimerRef.current = window.setTimeout(() => {
        doroHintTimerRef.current = null
        if (doroSqueezeCountRef.current < 10) updateIntroMessage(copy.canSqueezeDoro)
      }, timing.doroSqueezePromptMs)
    }, timing.doroAppearanceMs)
    return () => {
      window.clearTimeout(doroRevealTimerRef.current)
      window.clearTimeout(doroHintsTimerRef.current)
      window.clearTimeout(doroHintTimerRef.current)
    }
  }, [isComplete])

  useEffect(() => {
    if (wishReady) updateIntroMessage(copy.readyToWish)
  }, [wishReady])

  useEffect(() => {
    if (!collectionOpen) return
    const closeOnEscape = event => { if (event.key === 'Escape') setCollectionOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [collectionOpen])

  const handleCollect = imageId => {
    if (revealPhase !== 'active') return
    if (collectedIdsRef.current.has(imageId)) return
    const next = new Set(collectedIdsRef.current)
    next.add(imageId)
    collectedIdsRef.current = next
    setCollectedIds(next)
    playCollectionDing(bgmAudioContextRef.current)
  }

  return (
    <main ref={pageShellRef} className={'page-shell' + (candleBlowPhase === 'dim' && cutPhase !== 'done' ? ' wish-made' : '') + (candleBlowPhase === 'blackout' || cutPhase === 'blackout' ? ' candle-blackout' : '') + (cutGlitch ? ' cut-glitch' : '') + (cutInteractionVisible ? ' cut-interacting' : '')} style={cssMotionVariables}>
      {!loadingDismissed && (
        <div className={'loading-screen' + (loadingExitStarted ? ' is-done' : '')} role="status" aria-live="polite" aria-label={loadingComplete ? copy.loadingReady : copy.loadingPreparing}>
          <div className="loading-card">
            <span className="pill-art loading-pill" aria-hidden="true" />
            <h2>{loadingComplete ? copy.loadingReady : copy.loadingPreparing}</h2>
            <div className="loading-progress" role="progressbar" aria-label={copy.loadingProgressAria} aria-valuemin="0" aria-valuemax="100" aria-valuenow={loadingComplete ? 100 : loadingProgress}>
              <span className="loading-progress-fill" style={{ width: (loadingComplete ? 100 : loadingProgress) + '%' }} />
            </div>
            <p className="loading-status">{loadingComplete ? 100 : loadingProgress}%</p>
            {loadingComplete && <button className={'loading-enter-button' + (pressedButton === 'enter' ? ' is-pressed' : '')} type="button" onPointerDown={pressButton('enter')} onPointerUp={releaseButton('enter')} onPointerLeave={cancelButtonPress('enter')} onPointerCancel={cancelButtonPress('enter')} onClick={clickButton('enter', enterPage)}>{copy.loadingEnter}</button>}
          </div>
        </div>
      )}
      {volumeReminderVisible && (
        <aside className="volume-reminder" role="status">
          <img className="volume-reminder-doro" src={volumeReminderDoroUrl} alt="" />
          <span>{copy.volumeReminder}</span>
          <button className="volume-reminder-close" type="button" aria-label="关闭音量提醒" onClick={() => setVolumeReminderVisible(false)}>×</button>
        </aside>
      )}
      {stickersReady && revealPhase === 'active' && !fallingStopped && <FallingStickers bucketRef={bucketRef} onCollect={handleCollect} collectEnabled={!isComplete} isComplete={isComplete} pillMode={candleBlowPhase !== 'lit'} snowMode={snowMode} />}
      <div className="page-noise" aria-hidden="true" />
      {revealPhase === 'revealing' && (
        <div className="reveal-confetti" aria-hidden="true" key={revealSequence}>
          {confetti.map((piece, index) => <span key={index} style={{ '--angle': piece.angle, '--distance': piece.distance, '--piece-delay': piece.delay }}><CloverIcon /></span>)}
        </div>
      )}
      <section className="hero" id="top" aria-labelledby="birthday-heading">
        <h1 id="birthday-heading" className={contentVisible ? 'birthday-heading-entering' : 'birthday-heading-hidden'} lang="ja" aria-hidden={!contentVisible} aria-label={contentVisible ? `${copy.birthdayGreeting} ${copy.potionNameForScreenReaders}` : undefined}>
          <span className="birthday-greeting" aria-hidden="true">{copy.birthdayGreeting}</span><br />
          <span className="potion-line" aria-hidden="true">
            <span className="potion-word">
              <span className="potion-glyph">
                <span className="potion-capsule" />
                <span className="potion-stem" />
              </span>
              <span>{copy.potionWordSuffix}</span>
            </span>
          </span>
          <span className="heading-flower" aria-hidden="true">✿</span>
        </h1>
        <div className="prompt-stack">
        <p className={'intro' + (introSequence > 0 ? ' intro-updated' : '') + (bgmPromptVisible ? ' is-bgm-prompt' : '') + (!loadingDismissed ? ' is-loading' : '')} key={introSequence}>
          <span className="intro-message">
            <span className="visually-hidden">{introMessage}</span>
            <span aria-hidden="true">{Array.from(introMessage).map((character, index) => <span className="intro-character" key={index} style={{ '--char-index': index }}>{character}</span>)}</span>
          </span>
          {introSequence > 0 && introMessage && <span className="intro-particle-burst" aria-hidden="true">{introParticles.map((particle, index) => <span key={index} style={{ '--angle': particle.angle, '--distance': particle.distance, '--particle-delay': particle.delay }}>✦</span>)}</span>}
        </p>
        {cutWarningMessage && (
          <p className="cut-warning-message" key={cutWarningSequence}>
            <span className="visually-hidden">{cutWarningMessage}</span>
            <span aria-hidden="true">{Array.from(cutWarningMessage).map((character, index) => <span className="intro-character" key={index} style={{ '--char-index': index }}>{character}</span>)}</span>
            <span className="intro-particle-burst" aria-hidden="true">{introParticles.map((particle, index) => <span key={index} style={{ '--angle': particle.angle, '--distance': particle.distance, '--particle-delay': particle.delay }}>✦</span>)}</span>
          </p>
        )}
        </div>

        <div className="cake-scene">
            <div className="cake-halo" aria-hidden="true" />
            <div className="cake-touch" ref={cakeTouchRef} role="img" aria-label={copy.cakeDragAria}>
              <Cake wishMade={wishMade} collectedCount={collectedCount} showDoro={showDoro} candleVisible={!candleGone && (revealPhase === 'candle' || revealPhase === 'active')} candleFlyingAway={candleFlyingAway} isRevealing={revealPhase === 'candle'} showDoroHints={doroHintsVisible} doroSqueezeCount={doroSqueezeCount} onDoroSqueeze={handleDoroSqueeze} isCut={doroCut} noteDropped={noteDropped} bgmAnalyser={bgmAnalyser} />
            </div>
            {showDoro && doroRevealSequence > 0 && (
              <div className="doro-emerge-confetti" aria-hidden="true" key={doroRevealSequence}>
                {confetti.map((piece, index) => <span key={index} style={{ '--angle': piece.angle, '--distance': piece.distance, '--piece-delay': piece.delay }}><CloverIcon /></span>)}
              </div>
            )}
            {startPromptVisible && revealPhase === 'idle' && (
              <div className="scene-start-area">
              <button className={'scene-start-button' + (pressedButton === 'start-reveal' ? ' is-pressed' : '')} type="button" onPointerDown={pressButton('start-reveal')} onPointerUp={releaseButton('start-reveal')} onPointerLeave={cancelButtonPress('start-reveal')} onPointerCancel={cancelButtonPress('start-reveal')} onClick={clickButton('start-reveal', startReveal)}>{copy.revealStartButton}</button>
              </div>
            )}
            {wishMade && (
              <div className="confetti" aria-hidden="true" key={wishSequence}>
                {confetti.map((piece, index) => <span key={index} style={{ '--angle': piece.angle, '--distance': piece.distance, '--piece-delay': piece.delay }}><CloverIcon /></span>)}
              </div>
            )}
        </div>

      </section>

      {cutInteractionVisible && (
        <div className={'cut-ritual cut-phase-' + cutPhase} aria-label={copy.cutInteractionAria}>
          <div className={'cut-knife' + (cutKnifeStyle ? ' is-positioned' : '')} style={cutKnifeStyle || undefined} aria-hidden="true">
              <svg viewBox="0 0 520 205" focusable="false">
              <defs>
                <linearGradient id="knife-steel" x1="0" y1="0" x2=".84" y2="1">
                  <stop offset="0" stopColor="#fffefd" />
                  <stop offset=".5" stopColor="#e9edef" />
                  <stop offset="1" stopColor="#aab6bc" />
                </linearGradient>
                <linearGradient id="knife-wood" x1="0" y1="0" x2=".7" y2="1">
                  <stop offset="0" stopColor="#29252a" />
                  <stop offset=".45" stopColor="#52444a" />
                  <stop offset="1" stopColor="#1f1c21" />
                </linearGradient>
              </defs>
                <path d="M14 193Q43 166 96 145L283 58Q291 54 298 61L318 83Q322 89 314 93L95 180Q42 202 14 193Z" fill="url(#knife-steel)" stroke="#9faab0" strokeWidth="1.8" />
                <path d="M14 193Q95 173 197 130L317 86Q320 91 314 93L95 180Q42 202 14 193Z" fill="#f8faf9" opacity=".88" />
                <path d="M85 151 284 63Q291 60 296 66" fill="none" stroke="#ffffff" strokeWidth="2.5" opacity=".75" />
                <path d="M297 59 309 48 341 89 327 101Z" fill="#766d70" stroke="#4d464a" strokeWidth="1.6" />
                <path d="M309 49 467 3Q479 -1 488 8L513 32Q520 40 509 46L340 94Z" fill="url(#knife-wood)" stroke="#211e22" strokeWidth="2.5" strokeLinejoin="round" />
                <path d="M322 49 471 11Q479 9 484 15L503 33" fill="none" stroke="#918388" strokeWidth="2.5" strokeLinecap="round" opacity=".55" />
                <path d="M350 80 499 42" fill="none" stroke="#171519" strokeWidth="1.8" opacity=".45" />
            </svg>
          </div>
          {(cutPhase === 'ready' || cutPhase === 'holding') && (
            <div className="cut-choice-buttons">
              <button
                type="button"
                data-cut-side="left"
                className={'wish-button cut-choice-button cut-choice-cut' + (pressedButton === 'cut-left' ? ' is-pressed' : '')}
                style={{ '--cut-opacity': pressedButton === 'cut-left' ? cutProgress * .86 : 0 }}
                onPointerDown={startCutHold}
                onPointerMove={event => {
                  if (!isPointerInsideButton(event.currentTarget, event)) cancelCutHold(event)
                }}
                onPointerLeave={cancelCutHold}
                onPointerUp={cancelCutHold}
                onPointerCancel={cancelCutHold}
                onContextMenu={event => event.preventDefault()}
              >
                <span className="cut-hold-label">{copy.cutButton}</span>
              </button>
              {cutChoicesReenabled ? (
                <button
                  type="button"
                  data-cut-side="right"
                  className={'wish-button cut-choice-button cut-choice-cut' + (pressedButton === 'cut-right' ? ' is-pressed' : '')}
                  style={{ '--cut-opacity': pressedButton === 'cut-right' ? cutProgress * .86 : 0 }}
                  onPointerDown={startCutHold}
                  onPointerMove={event => {
                    if (!isPointerInsideButton(event.currentTarget, event)) cancelCutHold(event)
                  }}
                  onPointerLeave={cancelCutHold}
                  onPointerUp={cancelCutHold}
                  onPointerCancel={cancelCutHold}
                  onContextMenu={event => event.preventDefault()}
                >
                  <span className="cut-hold-label">{copy.cutButton}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className={'wish-button cut-choice-button cut-choice-cancel' + (pressedButton === 'cut-cancel' ? ' is-pressed' : '')}
                  onPointerDown={startCutCancelPointer}
                  onPointerMove={moveCutCancelPointer}
                  onPointerLeave={cancelCutCancelPointer}
                  onPointerUp={finishCutCancelPointer}
                  onPointerCancel={cancelCutCancelPointer}
                  onClick={clickButton('cut-cancel', cancelCutChoice)}
                >{copy.cancelCutButton}</button>
              )}
            </div>
          )}
        </div>
      )}

      {paperButtonVisible && (
        <div className="paper-open-entrance">
          <button
            ref={paperOpenRef}
            className={'wish-button paper-open-button' + (pressedButton === 'paper-open' ? ' is-pressed' : '')}
            type="button"
            aria-haspopup="dialog"
            aria-controls="paper-dialog"
            onPointerDown={pressButton('paper-open')}
            onPointerMove={event => { if (!isPointerInsideButton(event.currentTarget, event)) cancelButtonPress('paper-open')() }}
            onPointerUp={releaseButton('paper-open')}
            onPointerLeave={cancelButtonPress('paper-open')}
            onPointerCancel={cancelButtonPress('paper-open')}
            onClick={clickButton('paper-open', openPaperDialog)}
          >{copy.paperOpenButton}</button>
        </div>
      )}

      <aside className={'collection-station' + (revealPhase === 'active' && collectedCount > 0 ? ' has-collection' : ' is-empty') + (isComplete ? ' is-complete' : '') + (actionButtonVisible ? ' is-wish-ready' : '') + (wishMade ? ' wish-made' : '')} aria-label={copy.collectStationAria}>
        <div className="collection-toolbar" aria-hidden={collectedCount === 0 || isComplete}>
          <div
            className="collection-progress"
            role="progressbar"
            aria-label={copy.collectionProgressAria}
            aria-valuemin={0}
            aria-valuemax={stickerImages.length}
            aria-valuenow={collectedCount}
          >
            <span className="collection-progress-fill" style={{ width: (collectedCount / stickerImages.length * 100) + '%' }} />
          </div>
          <button className={'collection-more' + (pressedButton === 'more' ? ' is-pressed' : '')} type="button" aria-label={copy.collectionButtonAria} aria-expanded={collectionOpen} aria-controls="collection-panel" disabled={collectedCount === 0 || isComplete} onPointerDown={pressButton('more')} onPointerUp={releaseButton('more')} onPointerLeave={cancelButtonPress('more')} onPointerCancel={cancelButtonPress('more')} onClick={clickButton('more', () => setCollectionOpen(open => !open))}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
          </button>
        </div>
        <button ref={wishTriggerRef} className={'wish-button collection-wish-button ' + (cakeRevealed ? 'candle-blow-button' : 'wish-open-button') + (pressedButton === 'wish' ? ' is-pressed' : '') + (blowProgress > 0 ? ' is-holding' : '') + (wishPointerCancelled ? ' is-pointer-cancelled' : '')} style={{ touchAction: 'none', '--blow-progress': blowProgress, '--blow-opacity': blowProgress * .86 }} type="button" aria-haspopup={cakeRevealed ? undefined : 'dialog'} aria-controls={cakeRevealed ? undefined : 'wish-dialog'} aria-label={cakeRevealed ? formatText(copy.blowCandleButtonAria, { seconds: timing.candleHoldMs / 1000 }) : undefined} aria-hidden={!actionButtonVisible} tabIndex={actionButtonVisible && !wishMade ? 0 : -1} disabled={!actionButtonVisible || wishMade} onPointerDown={handleWishPointerDown} onPointerMove={handleWishPointerMove} onPointerUp={handleWishPointerUp} onPointerCancel={handleWishPointerCancel} onKeyUp={event => { if (!cakeRevealed && actionButtonVisible && (event.key === 'Enter' || event.key === ' ') && wishPointerRef.current === null) openWishDialogAfterBounce() }} onContextMenu={event => event.preventDefault()}>
          {cakeRevealed ? <CapsuleIcon /> : <CloverIcon />}
          <span className="wish-button-label">{cakeRevealed ? copy.blowCandleButton : copy.wishButton}</span>
          {cakeRevealed ? <CapsuleIcon /> : <CloverIcon />}
        </button>
        {collectionOpen && (
          <section className="collection-panel" id="collection-panel" role="dialog" aria-label={copy.collectionDialogAria}>
            <div className="collection-panel-header">
              <span>{copy.collectionTitle}</span>
              <button type="button" className={'collection-close' + (pressedButton === 'collection-close' ? ' is-pressed' : '')} aria-label={copy.collectionCloseAria} onPointerDown={pressButton('collection-close')} onPointerUp={releaseButton('collection-close')} onPointerLeave={cancelButtonPress('collection-close')} onPointerCancel={cancelButtonPress('collection-close')} onClick={clickButton('collection-close', () => setCollectionOpen(false))}>{copy.closeButton}</button>
            </div>
            <ul className="collection-gallery-grid">
              {stickerImages.map((image, index) => {
                const collected = collectedIds.has(image.id)
                return (
                  <li key={image.id} className={collected ? 'collected' : 'uncollected'}>
                    <img src={image.src} alt={(collected ? copy.collectedDoroAlt : copy.uncollectedDoroAlt) + ' ' + (index + 1)} loading="lazy" draggable="false" />
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </aside>
      {cakeRevealed && blowProgress > 0 && blowHoldRef.current && (
        <span className="blow-hold-progress" style={{ left: blowHoldRef.current.ringX + 'px', top: blowHoldRef.current.ringY + 'px' }} aria-hidden="true">
          <svg viewBox="0 0 44 44"><circle className="blow-hold-track" cx="22" cy="22" r="18" /><circle className="blow-hold-value" cx="22" cy="22" r="18" pathLength="100" style={{ strokeDashoffset: 100 - blowProgress * 100 }} /></svg>
        </span>
      )}
      {cutPhase === 'holding' && cutProgress > 0 && cutHoldRef.current && (
        <span className="blow-hold-progress" style={{ left: cutHoldRef.current.ringX + 'px', top: cutHoldRef.current.ringY + 'px' }} aria-hidden="true">
          <svg viewBox="0 0 44 44"><circle className="blow-hold-track" cx="22" cy="22" r="18" /><circle className="blow-hold-value" cx="22" cy="22" r="18" pathLength="100" style={{ strokeDashoffset: 100 - cutProgress * 100 }} /></svg>
        </span>
      )}
      {wishDialogPhase !== 'closed' && (
        <div className={'wish-dialog-backdrop' + (wishDialogPhase === 'closing' ? ' is-closing' : '')} onPointerDown={event => { if (event.target === event.currentTarget) closeWishDialog() }}>
          <section className="wish-dialog" id="wish-dialog" role="dialog" aria-modal="true" aria-labelledby="wish-dialog-title">
            <button className={'wish-dialog-close' + (pressedButton === 'dialog-close' ? ' is-pressed' : '')} type="button" aria-label={copy.wishDialogCloseAria} onPointerDown={pressButton('dialog-close')} onPointerUp={releaseButton('dialog-close')} onPointerLeave={cancelButtonPress('dialog-close')} onPointerCancel={cancelButtonPress('dialog-close')} onClick={clickButton('dialog-close', () => closeWishDialog())} disabled={wishDialogPhase === 'closing' || wishSaving}>{copy.closeButton}</button>
            <span className="wish-dialog-spark"><CloverIcon /></span>
            <form onSubmit={submitWish}>
              <label id="wish-dialog-title" htmlFor="wish-input">{copy.wishInputLabel}</label>
              <textarea ref={wishInputRef} id="wish-input" value={wishText} onChange={event => { setWishText(event.target.value); if (wishSaveError) setWishSaveError('') }} maxLength={200} rows={4} placeholder={copy.wishInputPlaceholder} disabled={wishDialogPhase === 'closing' || wishSaving} required />
              {wishSaveError && <p className="wish-dialog-error" role="alert">{wishSaveError}</p>}
              <button className={'wish-dialog-submit' + (pressedButton === 'dialog-submit' ? ' is-pressed' : '')} type="submit" onPointerDown={pressButton('dialog-submit')} onPointerUp={releaseButton('dialog-submit')} onPointerLeave={cancelButtonPress('dialog-submit')} onPointerCancel={cancelButtonPress('dialog-submit')} onClick={clickButton('dialog-submit', () => {})} disabled={!wishText.trim() || wishDialogPhase === 'closing' || wishSaving}>{copy.wishSubmitButton} <CloverIcon /></button>
            </form>
          </section>
        </div>
      )}
      {paperDialogOpen && (
        <div className="paper-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) closePaperDialog() }}>
          <section className="paper-sheet" id="paper-dialog" role="dialog" aria-modal="true" aria-label={copy.paperOpenButton} onKeyDown={event => {
            if (event.key === 'Escape') closePaperDialog()
            if (event.key === 'Tab') { event.preventDefault(); paperCloseRef.current?.focus() }
          }}>
            <button ref={paperCloseRef} className={'wish-dialog-close paper-close' + (pressedButton === 'paper-close' ? ' is-pressed' : '')} type="button" aria-label={copy.paperCloseButtonAria} onPointerDown={pressButton('paper-close')} onPointerUp={releaseButton('paper-close')} onPointerLeave={cancelButtonPress('paper-close')} onPointerCancel={cancelButtonPress('paper-close')} onClick={clickButton('paper-close', closePaperDialog)}>{copy.closeButton}</button>
            <p className="paper-message">
              {paperLines.map((line, index) => <span key={index}>{line}</span>)}
            </p>
          </section>
        </div>
      )}
      {(revealPhase === 'bucket' || revealPhase === 'candle' || revealPhase === 'active') && <>
        <div className={'collection-bucket collection-bucket-back' + (revealPhase === 'bucket' ? ' bucket-reveal' : '') + (isComplete ? ' bucket-collected' : '')} ref={bucketRef} aria-hidden="true">
          <div className="bucket-interior" />
          <div className="bucket-back-rim" />
        </div>
        <div className={'collection-bucket collection-bucket-front' + (revealPhase === 'bucket' ? ' bucket-reveal' : '') + (isComplete ? ' bucket-collected' : '')} aria-hidden="true">
          <div className="bucket-body" />
          <div className="bucket-rim" />
          <span className="pill-art bucket-hairclip" />
        </div>
      </>}
      {debugError && <DebugErrorPopup key={debugError.id} error={debugError} onClose={() => setDebugError(null)} />}
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
