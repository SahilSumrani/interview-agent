/**
 * Client-side camera analysis for the live interview.
 *
 * Raw frames never leave the browser: MediaPipe Face Landmarker runs on wasm
 * self-hosted from /public/mediapipe, and only numeric samples are emitted.
 *
 * Every failure mode (missing model, blocked camera, slow device, WebGL loss)
 * resolves to "analysis off" — the interview itself must never be affected.
 */

const WASM_PATH = "/mediapipe/wasm"
const MODEL_URL = "/mediapipe/face_landmarker.task"

const DEG = 180 / Math.PI
const LOAD_TIMEOUT_MS = 20000

// Sampling stays deliberately low so the interview thread keeps its frames.
const DEFAULT_FPS = 1.5
const MIN_FPS = 0.5
// Rolling inference cost above this means the device is struggling.
const SLOW_INFERENCE_MS = 160
const GIVE_UP_INFERENCE_MS = 600

let landmarkerPromise = null

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
    ])
}

async function loadLandmarker() {
    if (!landmarkerPromise) {
        landmarkerPromise = (async () => {
            const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision")
            const fileset = await FilesetResolver.forVisionTasks(WASM_PATH)
            const build = (delegate) => FaceLandmarker.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: MODEL_URL, delegate },
                runningMode: "VIDEO",
                numFaces: 1,
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
            })
            try {
                return await build("GPU")
            } catch {
                return build("CPU")
            }
        })().catch((err) => {
            landmarkerPromise = null
            throw err
        })
    }
    return landmarkerPromise
}

function blendshapeScores(result) {
    const categories = result?.faceBlendshapes?.[0]?.categories
    if (!categories?.length) return null
    const map = {}
    for (const c of categories) map[c.categoryName] = c.score
    return map
}

/**
 * Head orientation from the facial transformation matrix (column-major 4x4).
 * We read the forward axis instead of a Euler decomposition so the angles stay
 * near zero when the candidate faces the camera, whatever the handedness.
 */
function headPose(result) {
    const data = result?.facialTransformationMatrixes?.[0]?.data
    if (!data || data.length < 16) return null
    const fx = data[8]
    const fy = data[9]
    const fz = Math.max(Math.abs(data[10]), 1e-6)
    return {
        yaw: Math.atan2(fx, fz) * DEG,
        pitch: Math.atan2(fy, fz) * DEG,
        roll: Math.atan2(data[1], data[0] || 1e-6) * DEG,
    }
}

function pick(map, ...keys) {
    let best = 0
    for (const k of keys) {
        const v = map?.[k]
        if (typeof v === "number" && v > best) best = v
    }
    return best
}

function toSample(result, inferenceMs) {
    const facePresent = Boolean(result?.faceLandmarks?.length)
    if (!facePresent) {
        return { facePresent: false, eyeContact: false, inferenceMs }
    }

    const bs = blendshapeScores(result)
    const pose = headPose(result)

    const blink = pick(bs, "eyeBlinkLeft", "eyeBlinkRight")
    const gazeSide = pick(bs, "eyeLookOutLeft", "eyeLookOutRight", "eyeLookInLeft", "eyeLookInRight")
    const gazeVert = pick(bs, "eyeLookUpLeft", "eyeLookUpRight", "eyeLookDownLeft", "eyeLookDownRight")
    const smile = (pick(bs, "mouthSmileLeft") + pick(bs, "mouthSmileRight")) / 2
    const tension = Math.max(
        (pick(bs, "browDownLeft") + pick(bs, "browDownRight")) / 2,
        (pick(bs, "eyeSquintLeft") + pick(bs, "eyeSquintRight")) / 2 * 0.8,
        pick(bs, "mouthPressLeft", "mouthPressRight") * 0.7
    )

    const headCentred = !pose || (Math.abs(pose.yaw) <= 22 && Math.abs(pose.pitch) <= 18)
    const eyeContact = headCentred && gazeSide < 0.55 && gazeVert < 0.6 && blink < 0.5

    return {
        facePresent: true,
        eyeContact,
        blinking: blink >= 0.5,
        yaw: pose?.yaw ?? 0,
        pitch: pose?.pitch ?? 0,
        roll: pose?.roll ?? 0,
        smile,
        tension,
        inferenceMs,
    }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/**
 * Rolls individual samples into the numbers the HUD and the report need.
 * Same shape is reused for the per-answer window and the whole session.
 */
export function createVisualAggregator() {
    let samples = 0
    let facePresent = 0
    let eyeContact = 0
    let blinks = 0
    let smileSum = 0
    let tensionSum = 0
    let motionSum = 0
    let motionSamples = 0
    let lastYaw = null
    let lastPitch = null
    let firstAt = 0
    let lastAt = 0

    const reset = () => {
        samples = 0
        facePresent = 0
        eyeContact = 0
        blinks = 0
        smileSum = 0
        tensionSum = 0
        motionSum = 0
        motionSamples = 0
        lastYaw = null
        lastPitch = null
        firstAt = 0
        lastAt = 0
    }

    const add = (sample) => {
        if (!sample) return
        const now = Date.now()
        if (!firstAt) firstAt = now
        lastAt = now
        samples += 1
        if (!sample.facePresent) {
            lastYaw = null
            lastPitch = null
            return
        }
        facePresent += 1
        if (sample.eyeContact) eyeContact += 1
        if (sample.blinking) blinks += 1
        smileSum += sample.smile || 0
        tensionSum += sample.tension || 0
        if (lastYaw !== null) {
            motionSum += Math.abs(sample.yaw - lastYaw) + Math.abs(sample.pitch - lastPitch)
            motionSamples += 1
        }
        lastYaw = sample.yaw
        lastPitch = sample.pitch
    }

    const summary = () => {
        if (!samples) return null
        const facePresencePct = Math.round((facePresent / samples) * 100)
        const eyeContactPct = facePresent ? Math.round((eyeContact / facePresent) * 100) : 0
        const smileAvg = facePresent ? smileSum / facePresent : 0
        const tensionAvg = facePresent ? tensionSum / facePresent : 0
        const motionAvgDeg = motionSamples ? motionSum / motionSamples : 0
        const headStability = Math.round(clamp(100 - motionAvgDeg * 5, 0, 100))
        const composure = clamp(100 - tensionAvg * 120, 0, 100)
        const confidence = Math.round(clamp(
            0.4 * eyeContactPct
            + 0.25 * headStability
            + 0.2 * composure
            + 0.15 * facePresencePct
            + smileAvg * 8,
            0,
            100
        ))
        return {
            samples,
            facePresencePct,
            eyeContactPct,
            headStability,
            smileAvg: Math.round(smileAvg * 100) / 100,
            tensionAvg: Math.round(tensionAvg * 100) / 100,
            confidence,
            blinkRatePerMin: firstAt && lastAt > firstAt
                ? Math.round((blinks / ((lastAt - firstAt) / 60000)) * 10) / 10
                : 0,
            windowMs: lastAt && firstAt ? lastAt - firstAt : 0,
        }
    }

    return {
        add,
        summary,
        reset,
        flush: () => {
            const out = summary()
            reset()
            return out
        },
    }
}

/**
 * @param {object} opts
 * @param {(sample: object) => void} opts.onSample  numeric sample, ~`fps` times a second
 * @param {(status: string, detail?: string) => void} opts.onStatus  loading | running | unavailable
 */
export function createFaceAnalyzer({ onSample, onStatus, fps = DEFAULT_FPS } = {}) {
    let landmarker = null
    let videoEl = null
    let timer = 0
    let running = false
    let disposed = false
    let currentFps = fps
    let lastTimestamp = 0
    let slowStreak = 0
    const recentCosts = []

    const notify = (status, detail) => {
        try {
            onStatus?.(status, detail)
        } catch {
            // never let a UI listener break analysis
        }
    }

    const disable = (detail) => {
        running = false
        if (timer) {
            clearTimeout(timer)
            timer = 0
        }
        notify("unavailable", detail)
    }

    const scheduleNext = () => {
        if (!running || disposed) return
        timer = setTimeout(tick, Math.max(200, 1000 / currentFps))
    }

    const trackCost = (ms) => {
        recentCosts.push(ms)
        if (recentCosts.length > 8) recentCosts.shift()
        const avg = recentCosts.reduce((a, b) => a + b, 0) / recentCosts.length
        if (avg > GIVE_UP_INFERENCE_MS) {
            slowStreak += 1
            if (slowStreak >= 3) disable("device too slow")
            return
        }
        if (avg > SLOW_INFERENCE_MS && currentFps > MIN_FPS) {
            currentFps = Math.max(MIN_FPS, currentFps / 2)
            recentCosts.length = 0
        }
        slowStreak = 0
    }

    const tick = () => {
        if (!running || disposed) return
        try {
            if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
                scheduleNext()
                return
            }
            // detectForVideo rejects non-increasing timestamps
            const ts = Math.max(performance.now(), lastTimestamp + 1)
            lastTimestamp = ts
            const started = performance.now()
            const result = landmarker.detectForVideo(videoEl, ts)
            const cost = performance.now() - started
            trackCost(cost)
            try {
                onSample?.(toSample(result, Math.round(cost)))
            } catch {
                // a HUD error must not kill the loop
            }
        } catch (err) {
            disable(err?.message || "detection failed")
            return
        }
        scheduleNext()
    }

    return {
        async start(element) {
            if (disposed || running) return false
            videoEl = element
            if (!videoEl) return false
            notify("loading")
            try {
                landmarker = await withTimeout(loadLandmarker(), LOAD_TIMEOUT_MS, "model load timeout")
            } catch (err) {
                console.warn("Face analysis unavailable:", err?.message || err)
                disable(err?.message || "model unavailable")
                return false
            }
            if (disposed) return false
            running = true
            currentFps = fps
            notify("running")
            scheduleNext()
            return true
        },
        stop() {
            running = false
            if (timer) {
                clearTimeout(timer)
                timer = 0
            }
        },
        dispose() {
            disposed = true
            this.stop()
            videoEl = null
            landmarker = null
        },
        get fps() {
            return currentFps
        },
    }
}
