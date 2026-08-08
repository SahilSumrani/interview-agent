import axios from "axios"

const api = axios.create({
    baseURL: "http://localhost:3000",
})

export const fetchPlaybooks = async () => {
    const { data } = await api.get("/api/voice/playbooks", { timeout: 15000 })
    return data.playbooks || []
}

export const fetchRoles = async () => {
    const { data } = await api.get("/api/voice/roles", { timeout: 15000 })
    return data.roles || []
}

export const startVoiceSession = async ({ resumeFile, companyKey = "general", roleKey = "general", roleLabel = "" }) => {
    const form = new FormData()
    if (resumeFile) form.append("resume", resumeFile)
    form.append("companyKey", companyKey)
    form.append("roleKey", roleKey)
    if (roleLabel) form.append("roleLabel", roleLabel)

    const { data } = await api.post("/api/voice/sessions", form, {
        timeout: 90000,
    })
    return data
}

export const submitVoiceTurn = async ({ sessionId, answerText, metrics = null }) => {
    const { data } = await api.post(
        `/api/voice/sessions/${sessionId}/turn`,
        { answerText, metrics },
        { timeout: 45000 }
    )
    return data
}

export const voiceReportPdfUrl = (sessionId) =>
    `${api.defaults.baseURL}/api/voice/sessions/${sessionId}/report.pdf`

export const fetchVoiceReport = async (sessionId) => {
    const { data } = await api.get(`/api/voice/sessions/${sessionId}/report`, { timeout: 15000 })
    return data.report
}

export const failVoiceSession = async ({ sessionId, reason, violationCount, detail }) => {
    const { data } = await api.post(
        `/api/voice/sessions/${sessionId}/fail`,
        { reason, violationCount, detail },
        { timeout: 15000 }
    )
    return data
}

export const logVoiceViolation = async ({ sessionId, type, detail }) => {
    const { data } = await api.post(
        `/api/voice/sessions/${sessionId}/violations`,
        { type, detail },
        { timeout: 10000 }
    )
    return data
}

export const fetchTtsAudio = async (text) => {
    try {
        const response = await api.post(
            "/api/voice/tts",
            { text },
            {
                responseType: "blob",
                timeout: 45000,
            }
        )
        const blob = response.data
        if (!blob || blob.size === 0) {
            throw new Error("Empty TTS audio")
        }
        const contentType = String(response.headers?.["content-type"] || "")
        if (contentType.includes("application/json") || contentType.includes("text/")) {
            throw new Error("Voice synthesis unavailable")
        }
        // Accept audio/mpeg (ElevenLabs) and audio/wav (Chatterbox)
        return blob
    } catch (err) {
        let message = "Voice synthesis unavailable"
        let code = ""
        const data = err?.response?.data
        if (data instanceof Blob) {
            try {
                const parsed = JSON.parse(await data.text())
                if (parsed?.message && typeof parsed.message === "string" && !parsed.message.includes("{")) {
                    message = parsed.message
                }
                if (parsed?.code) code = parsed.code
            } catch {
                // ignore
            }
        } else if (err?.response?.data?.message && !String(err.response.data.message).includes("{")) {
            message = err.response.data.message
            code = err.response.data.code || ""
        }
        const error = new Error(message)
        if (code) error.code = code
        throw error
    }
}

/** WebSocket helper for duplex turn + streamed TTS */
export function createVoiceSocket({ onMessage, onOpen, onClose, onError } = {}) {
    const ws = new WebSocket("ws://localhost:3000/ws/voice")
    ws.binaryType = "arraybuffer"

    ws.addEventListener("open", () => onOpen?.())
    ws.addEventListener("close", () => onClose?.())
    ws.addEventListener("error", (e) => onError?.(e))
    ws.addEventListener("message", (ev) => {
        try {
            const msg = JSON.parse(String(ev.data))
            onMessage?.(msg)
        } catch {
            // ignore non-json
        }
    })

    return {
        ws,
        sendTurn(sessionId, answerText, requestId = String(Date.now())) {
            ws.send(JSON.stringify({ type: "turn", sessionId, answerText, requestId }))
            return requestId
        },
        sendTts(text, requestId = String(Date.now())) {
            ws.send(JSON.stringify({ type: "tts", text, requestId }))
            return requestId
        },
        close() {
            try { ws.close() } catch { /* ignore */ }
        }
    }
}
