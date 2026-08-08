const crypto = require("crypto")
const fs = require("fs")
const path = require("path")

const CACHE_DIR = process.env.TTS_CACHE_DIR
    || path.join(__dirname, "..", "..", ".tts-cache")
const MAX_CACHE_FILES = Number(process.env.TTS_CACHE_MAX_FILES || 200)

function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true })
    }
}

function cacheKey({ text, model, voiceId }) {
    const raw = `${model || ""}|${voiceId || ""}|${String(text || "").trim()}`
    return crypto.createHash("sha256").update(raw).digest("hex")
}

function cachePath(key, ext = "mp3") {
    return path.join(CACHE_DIR, `${key}.${ext}`)
}

function readCachedAudio(key, ext = "mp3") {
    try {
        const file = cachePath(key, ext)
        if (!fs.existsSync(file)) return null
        const body = fs.readFileSync(file)
        if (!body?.length) return null
        return body
    } catch {
        return null
    }
}

function writeCachedAudio(key, body, ext = "mp3") {
    try {
        ensureCacheDir()
        fs.writeFileSync(cachePath(key, ext), body)
        trimCache()
    } catch (err) {
        console.warn("TTS cache write failed:", err.message)
    }
}

function trimCache() {
    try {
        const files = fs.readdirSync(CACHE_DIR)
            .filter((f) => f.endsWith(".mp3") || f.endsWith(".wav"))
            .map((f) => {
                const full = path.join(CACHE_DIR, f)
                const st = fs.statSync(full)
                return { full, mtime: st.mtimeMs }
            })
            .sort((a, b) => b.mtime - a.mtime)
        for (const old of files.slice(MAX_CACHE_FILES)) {
            try { fs.unlinkSync(old.full) } catch { /* ignore */ }
        }
    } catch {
        // ignore
    }
}

/** Compress spoken text to burn fewer ElevenLabs credits (≈1 credit / char). */
function compressForTts(text, maxChars = 420) {
    let t = String(text || "").trim().replace(/\s+/g, " ")
    if (t.length <= maxChars) return t
    // Prefer cutting at sentence boundary
    const slice = t.slice(0, maxChars)
    const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("? "), slice.lastIndexOf("! "))
    if (lastStop > maxChars * 0.55) return slice.slice(0, lastStop + 1).trim()
    return `${slice.trim()}…`
}

module.exports = {
    CACHE_DIR,
    cacheKey,
    readCachedAudio,
    writeCachedAudio,
    compressForTts,
    ensureCacheDir,
}
