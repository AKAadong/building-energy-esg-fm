import { onUnmounted, ref } from 'vue'

/**
 * 浏览器麦克风录音，并转换为 16kHz 单声道 WAV（百度短语音识别常用格式）。
 */

/** @param {Float32Array} samples @param {number} fromRate @param {number} toRate */
function resampleLinear(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples
  const ratio = fromRate / toRate
  const outLen = Math.max(1, Math.round(samples.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i += 1) {
    const pos = i * ratio
    const idx = Math.floor(pos)
    const frac = pos - idx
    const s0 = samples[idx] ?? 0
    const s1 = samples[idx + 1] ?? s0
    out[i] = s0 + (s1 - s0) * frac
  }
  return out
}

/** @param {Float32Array} left @param {Float32Array} [right] */
function mixToMono(left, right) {
  if (!right) return left
  const len = Math.min(left.length, right.length)
  const out = new Float32Array(len)
  for (let i = 0; i < len; i += 1) out[i] = (left[i] + right[i]) * 0.5
  return out
}

/** @param {Float32Array} samples @param {number} sampleRate */
function encodeWav(samples, sampleRate) {
  const numSamples = samples.length
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, numSamples * 2, true)

  let offset = 44
  for (let i = 0; i < numSamples; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return buffer
}

/** @param {Blob} blob */
export async function blobToWav16k(blob) {
  const arrayBuffer = await blob.arrayBuffer()
  const audioContext = new AudioContext()
  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))
    const mono = mixToMono(
      decoded.getChannelData(0),
      decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : undefined,
    )
    const resampled = resampleLinear(mono, decoded.sampleRate, 16000)
    return new Blob([encodeWav(resampled, 16000)], { type: 'audio/wav' })
  } finally {
    await audioContext.close()
  }
}

export function isSpeechRecognitionSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
}

/**
 * 麦克风录音 composable。
 * @param {{ onTranscript?: (text: string) => void, transcribe?: (wavBlob: Blob) => Promise<string> }} options
 */
export function useVoiceInput(options = {}) {
  const { onTranscript, transcribe } = options

  const recording = ref(false)
  const transcribing = ref(false)

  /** @type {MediaRecorder | null} */
  let mediaRecorder = null
  /** @type {MediaStream | null} */
  let mediaStream = null
  /** @type {Blob[]} */
  let chunks = []

  async function startRecording() {
    if (recording.value || transcribing.value) return
    if (!isSpeechRecognitionSupported()) {
      throw new Error('当前浏览器不支持麦克风录音')
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })

    chunks = []
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : ''

    mediaRecorder = mimeType
      ? new MediaRecorder(mediaStream, { mimeType })
      : new MediaRecorder(mediaStream)

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }

    mediaRecorder.start(200)
    recording.value = true
  }

  function stopTracks() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop())
      mediaStream = null
    }
  }

  async function stopRecording() {
    if (!recording.value || !mediaRecorder) return null

    const recorder = mediaRecorder
    recording.value = false

    const blob = await new Promise((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm'
        resolve(new Blob(chunks, { type }))
      }
      if (recorder.state !== 'inactive') recorder.stop()
      else resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
    })

    stopTracks()
    mediaRecorder = null
    chunks = []

    if (!blob.size) return null

    if (typeof transcribe === 'function') {
      transcribing.value = true
      try {
        const wavBlob = await blobToWav16k(blob)
        const text = await transcribe(wavBlob)
        const trimmed = (text || '').trim()
        if (trimmed && typeof onTranscript === 'function') onTranscript(trimmed)
        return trimmed
      } finally {
        transcribing.value = false
      }
    }

    return null
  }

  async function toggleRecording() {
    if (transcribing.value) return
    if (recording.value) {
      await stopRecording()
      return
    }
    await startRecording()
  }

  function cleanup() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop()
      } catch {
        /* ignore */
      }
    }
    stopTracks()
    recording.value = false
    transcribing.value = false
    mediaRecorder = null
    chunks = []
  }

  onUnmounted(cleanup)

  return {
    recording,
    transcribing,
    startRecording,
    stopRecording,
    toggleRecording,
    cleanup,
    isSupported: isSpeechRecognitionSupported(),
  }
}
