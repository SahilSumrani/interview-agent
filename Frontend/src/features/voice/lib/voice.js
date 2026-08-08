import { fetchTtsAudio } from "../services/voice.api"

let ttsPromise = null
let kokoroReady = false
let audioCtx = null
let currentAudio = null
let levelListeners = new Set()
let analyserRaf = 0
let speakSeq = 0

const FEMALE_VOICE = "af_bella"

export function isKokoroReady() {
    return kokoroReady
}

export function unlockAudio() {
    const ctx = getAudioContext()
    if (ctx.state === "suspended") {
        return ctx.resume()
    }
    return Promise.resolve()
}

// Silences audio without invalidating the in-flight speakText turn.
function haltAudio() {
    stopAnalyserLoop()
    try {
        currentAudio?.pause?.()
        currentAudio = null
    } catch {
        // ignore
    }
    try {
        window.speechSynthesis?.cancel?.()
    } catch {
        // ignore
    }
    emitAudioLevel(0)
}

export function stopSpeaking() {
    speakSeq += 1
    haltAudio()
}

export function onAudioLevel(listener) {
    levelListeners.add(listener)
    return () => levelListeners.delete(listener)
}

function emitAudioLevel(level) {
    for (const fn of levelListeners) {
        try {
            fn(level)
        } catch {
            // ignore
        }
    }
}

function stopAnalyserLoop() {
    if (analyserRaf) {
        cancelAnimationFrame(analyserRaf)
        analyserRaf = 0
    }
}

function startAnalyserLoop(analyser) {
    stopAnalyserLoop()
    const data = new Uint8Array(analyser.fftSize)
    const tick = () => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128
            sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        emitAudioLevel(Math.min(1, rms * 3.2))
        analyserRaf = requestAnimationFrame(tick)
    }
    analyserRaf = requestAnimationFrame(tick)
}

export function preloadVoice() {
    if (!ttsPromise) {
        ttsPromise = (async () => {
            const { KokoroTTS } = await import("kokoro-js")
            const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
                dtype: "q8",
                device: "wasm",
            })
            try {
                await tts.generate("Hello.", { voice: FEMALE_VOICE })
            } catch {
                // warm-up optional
            }
            kokoroReady = true
            return tts
        })().catch((err) => {
            ttsPromise = null
            kokoroReady = false
            throw err
        })
    }
    return ttsPromise
}

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    }
    return audioCtx
}

async function playFloatAudio(floatData, sampleRate) {
    const ctx = getAudioContext()
    if (ctx.state === "suspended") {
        await ctx.resume()
    }

    const float32 = floatData instanceof Float32Array
        ? floatData
        : new Float32Array(floatData)

    if (!float32.length) {
        throw new Error("Empty audio buffer")
    }

    const buffer = ctx.createBuffer(1, float32.length, sampleRate || 24000)
    buffer.getChannelData(0).set(float32)

    await new Promise((resolve, reject) => {
        const source = ctx.createBufferSource()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        source.buffer = buffer
        source.connect(analyser)
        analyser.connect(ctx.destination)
        startAnalyserLoop(analyser)
        source.onended = () => {
            stopAnalyserLoop()
            emitAudioLevel(0)
            resolve()
        }
        try {
            source.start(0)
        } catch (err) {
            stopAnalyserLoop()
            reject(err)
        }
    })
}

export async function playAudioBlob(blob, { maxMs = 60000 } = {}) {
    if (!blob || blob.size === 0) {
        throw new Error("Empty TTS audio")
    }

    const ctx = getAudioContext()
    if (ctx.state === "suspended") {
        await ctx.resume()
    }

    const url = URL.createObjectURL(blob)
    try {
        haltAudio()
        const audio = new Audio(url)
        currentAudio = audio
        audio.crossOrigin = "anonymous"

        try {
            const source = ctx.createMediaElementSource(audio)
            const analyser = ctx.createAnalyser()
            analyser.fftSize = 256
            source.connect(analyser)
            analyser.connect(ctx.destination)
            startAnalyserLoop(analyser)
        } catch {
            // MediaElementSource can only be created once per element; fall back to plain play
        }

        await new Promise((resolve, reject) => {
            let settled = false
            const done = (fn, arg) => {
                if (settled) return
                settled = true
                clearTimeout(watchdog)
                stopAnalyserLoop()
                emitAudioLevel(0)
                fn(arg)
            }
            // Cap hang, but allow long briefing scripts to finish
            const watchdog = setTimeout(() => done(resolve), Math.max(20000, maxMs))
            audio.onended = () => done(resolve)
            audio.onerror = () => done(reject, new Error("Audio playback failed"))
            audio.play().catch((err) => done(reject, err))
        })
    } finally {
        if (currentAudio?.src === url) {
            currentAudio = null
        }
        URL.revokeObjectURL(url)
    }
}

function pickFemaleBrowserVoice() {
    const voices = window.speechSynthesis?.getVoices?.() || []
    const preferred = [
        /zira/i,
        /jenny/i,
        /sara/i,
        /samantha/i,
        /female/i,
        /google us english/i,
        /microsoft.*english/i,
    ]
    for (const re of preferred) {
        const hit = voices.find((v) => v.lang?.startsWith("en") && re.test(v.name))
        if (hit) return hit
    }
    return voices.find((v) => v.lang?.startsWith("en")) || null
}

export function speakWithBrowser(text, { lang = "en-US" } = {}) {
    return new Promise((resolve, reject) => {
        if (!window.speechSynthesis) {
            reject(new Error("Speech synthesis not supported"))
            return
        }

        window.speechSynthesis.cancel()

        let started = false
        const speakNow = () => {
            if (started) return
            started = true
            speechSynthesis.removeEventListener("voiceschanged", onVoices)

            const utter = new SpeechSynthesisUtterance(text)
            utter.lang = "en-US"
            utter.rate = 1
            utter.pitch = 1.05
            const preferred = pickFemaleBrowserVoice()
            if (preferred) utter.voice = preferred

            const pulseId = setInterval(() => {
                emitAudioLevel(0.35 + Math.random() * 0.45)
            }, 80)

            let settled = false
            const finish = (fn, arg) => {
                if (settled) return
                settled = true
                clearInterval(pulseId)
                clearTimeout(watchdog)
                emitAudioLevel(0)
                fn(arg)
            }
            const watchdog = setTimeout(
                () => finish(resolve),
                Math.min(90000, Math.max(12000, text.length * 90))
            )

            utter.onend = () => finish(resolve)
            utter.onerror = (e) => finish(reject, e.error || new Error("TTS failed"))
            window.speechSynthesis.speak(utter)
        }

        const onVoices = () => speakNow()

        if (speechSynthesis.getVoices().length === 0) {
            speechSynthesis.addEventListener("voiceschanged", onVoices)
            setTimeout(speakNow, 400)
        } else {
            speakNow()
        }
    })
}

export async function speakText(text, {
    onStart,
    onEnd,
    preferElevenLabs = true,
    preferKokoro = false,
    lang = "en-US",
    maxMs = 45000,
} = {}) {
    if (!text?.trim()) return

    // Cancel any previous turn first, then claim the newest sequence number.
    stopSpeaking()
    const mySeq = ++speakSeq
    onStart?.()
    await unlockAudio()
    if (mySeq !== speakSeq) return { engine: "cancelled" }

    const fetchMs = Math.min(25000, Math.max(12000, maxMs))
    // Long scripts (integrity briefing) need play time beyond fetch timeout
    const playMs = Math.min(90000, Math.max(maxMs, 12000 + String(text).length * 90))
    let elevenErr = null

    const withTimeout = (promise, ms, label = "TTS timeout") => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
    ])

    if (preferElevenLabs) {
        try {
            const blob = await withTimeout(fetchTtsAudio(text), fetchMs, "TTS fetch timeout")
            if (mySeq !== speakSeq) return { engine: "cancelled" }
            // Do NOT race-timeout playback into browser fallback — that causes duplicate voice
            // (ElevenLabs keeps playing while browser TTS also starts).
            await playAudioBlob(blob, { maxMs: playMs })
            if (mySeq !== speakSeq) return { engine: "cancelled" }
            onEnd?.()
            return { engine: "elevenlabs" }
        } catch (err) {
            haltAudio()
            console.warn("ElevenLabs TTS unavailable, falling back:", err?.message || err)
            elevenErr = err
            // Fall through only when fetch/start failed — never after audio already overlapping
        }
    }

    if (mySeq !== speakSeq) return { engine: "cancelled" }

    if (preferKokoro && kokoroReady) {
        try {
            const tts = await preloadVoice()
            if (mySeq !== speakSeq) return { engine: "cancelled" }
            const raw = await Promise.race([
                tts.generate(text, { voice: FEMALE_VOICE }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Kokoro timeout")), 15000)),
            ])
            const audio = raw?.audio ?? raw?.data?.audio
            const rate = raw?.sampling_rate || raw?.sample_rate || 24000
            await playFloatAudio(audio, rate)
            if (mySeq !== speakSeq) return { engine: "cancelled" }
            onEnd?.()
            return { engine: "kokoro", fallbackReason: elevenErr?.message || "" }
        } catch (err) {
            console.warn("Kokoro failed, falling back to browser TTS:", err)
        }
    }

    if (mySeq !== speakSeq) return { engine: "cancelled" }
    await speakWithBrowser(text, { lang: "en-US" })
    if (mySeq !== speakSeq) return { engine: "cancelled" }
    onEnd?.()
    return {
        engine: "browser",
        fallbackReason: elevenErr?.message || "",
        fallbackCode: elevenErr?.code || "",
    }
}

export function createSpeechRecognizer({ onResult, onError, onEnd, lang = "en-US" }) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
        throw new Error("Speech recognition is not supported in this browser. Use Chrome or Edge.")
    }

    const recognition = new SpeechRecognition()
    recognition.lang = lang || "en-US"
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
        let transcript = ""
        let isFinal = false
        let confidence = 0
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript
            if (event.results[i].isFinal) {
                isFinal = true
                confidence = event.results[i][0].confidence || 0
            }
        }
        onResult?.({ transcript: transcript.trim(), isFinal, confidence })
    }

    recognition.onerror = (event) => {
        onError?.(event.error)
    }

    recognition.onend = () => {
        onEnd?.()
    }

    return recognition
}
