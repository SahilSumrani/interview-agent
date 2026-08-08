const CHATTERBOX_URL = (process.env.CHATTERBOX_URL || "http://127.0.0.1:7861").replace(/\/$/, "")
const TTS_PROVIDER = (process.env.TTS_PROVIDER || "auto").toLowerCase() // auto | chatterbox | elevenlabs

async function requestChatterboxAudio(text) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Number(process.env.CHATTERBOX_TIMEOUT_MS || 120000))
    try {
        const response = await fetch(`${CHATTERBOX_URL}/tts`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "audio/wav" },
            body: JSON.stringify({ text: String(text).slice(0, 2500) }),
            signal: controller.signal,
        })
        const body = Buffer.from(await response.arrayBuffer())
        let errorDetail = ""
        if (!response.ok) {
            try {
                const parsed = JSON.parse(body.toString("utf8"))
                errorDetail = parsed?.detail || parsed?.message || ""
            } catch {
                errorDetail = body.toString("utf8").slice(0, 240)
            }
        }
        return {
            response,
            body,
            errorDetail: typeof errorDetail === "string" ? errorDetail : JSON.stringify(errorDetail),
            contentType: response.headers.get("content-type") || "audio/wav",
            model: response.headers.get("x-tts-model") || "chatterbox",
        }
    } finally {
        clearTimeout(timer)
    }
}

async function isChatterboxHealthy() {
    try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 2500)
        const res = await fetch(`${CHATTERBOX_URL}/health`, { signal: controller.signal })
        clearTimeout(timer)
        if (!res.ok) return false
        const data = await res.json()
        return Boolean(data?.ok)
    } catch {
        return false
    }
}

module.exports = {
    CHATTERBOX_URL,
    TTS_PROVIDER,
    requestChatterboxAudio,
    isChatterboxHealthy,
}
