const { WebSocketServer } = require("ws")
const mongoose = require("mongoose")
const voiceSessionModel = require("../models/voiceSession.model")
const {
    processTurn,
    ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID,
    ELEVENLABS_MODEL,
} = require("../controllers/voice.controller")
const { compressForTts } = require("../services/ttsCache.service")

async function streamElevenLabsToWs(ws, text, requestId) {
    if (!ELEVENLABS_API_KEY) {
        ws.send(JSON.stringify({ type: "tts_error", requestId, message: "TTS not configured" }))
        return
    }

    const spoken = compressForTts(text, Number(process.env.TTS_MAX_CHARS || 380))
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream?optimize_streaming_latency=3`
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
        },
        body: JSON.stringify({
            text: spoken,
            model_id: ELEVENLABS_MODEL,
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
            },
        }),
    })

    if (!response.ok || !response.body) {
        let detail = ""
        try { detail = await response.text() } catch { /* ignore */ }
        console.error("ElevenLabs stream error:", response.status, detail.slice(0, 200))
        const quota = /quota|credits|limit/i.test(detail)
        ws.send(JSON.stringify({
            type: "tts_error",
            requestId,
            message: quota
                ? "ElevenLabs quota exceeded — add credits or replace the API key"
                : "Voice synthesis unavailable",
        }))
        return
    }

    ws.send(JSON.stringify({ type: "tts_start", requestId, contentType: "audio/mpeg" }))

    const reader = response.body.getReader()
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value?.length) {
            ws.send(JSON.stringify({
                type: "tts_chunk",
                requestId,
                audio: Buffer.from(value).toString("base64"),
            }))
        }
    }

    ws.send(JSON.stringify({ type: "tts_end", requestId }))
}

function attachVoiceWebSocket(server) {
    const wss = new WebSocketServer({ server, path: "/ws/voice" })
    wss.on("error", (err) => {
        console.error("Voice WebSocket server error:", err.message)
    })

    wss.on("connection", (ws) => {
        ws.send(JSON.stringify({ type: "ready", message: "Voice WS connected" }))

        ws.on("message", async (raw) => {
            let msg
            try {
                msg = JSON.parse(String(raw))
            } catch {
                ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }))
                return
            }

            const requestId = msg.requestId || String(Date.now())

            try {
                if (msg.type === "ping") {
                    ws.send(JSON.stringify({ type: "pong", requestId }))
                    return
                }

                if (msg.type === "tts") {
                    const text = String(msg.text || "").trim()
                    if (!text) {
                        ws.send(JSON.stringify({ type: "error", requestId, message: "text required" }))
                        return
                    }
                    await streamElevenLabsToWs(ws, text, requestId)
                    return
                }

                if (msg.type === "turn") {
                    const { sessionId, answerText, metrics } = msg
                    if (!sessionId || !mongoose.isValidObjectId(sessionId)) {
                        ws.send(JSON.stringify({ type: "error", requestId, message: "Valid sessionId required" }))
                        return
                    }
                    if (!answerText?.trim()) {
                        ws.send(JSON.stringify({ type: "error", requestId, message: "answerText required" }))
                        return
                    }

                    const session = await voiceSessionModel.findById(sessionId)
                    if (!session) {
                        ws.send(JSON.stringify({ type: "error", requestId, message: "Session not found" }))
                        return
                    }
                    if (session.status !== "active") {
                        ws.send(JSON.stringify({ type: "error", requestId, message: `Session is ${session.status}` }))
                        return
                    }

                    ws.send(JSON.stringify({ type: "thinking", requestId }))
                    const payload = await processTurn(session, answerText, metrics)
                    ws.send(JSON.stringify({ type: "turn_result", requestId, ...payload }))

                    // Stream TTS for interviewer reply immediately
                    if (payload.interviewerMessage) {
                        await streamElevenLabsToWs(ws, payload.interviewerMessage, `${requestId}-tts`)
                    }
                    return
                }

                ws.send(JSON.stringify({ type: "error", requestId, message: `Unknown type: ${msg.type}` }))
            } catch (err) {
                console.error("voice WS error:", err)
                ws.send(JSON.stringify({ type: "error", requestId, message: err.message || "WS failure" }))
            }
        })
    })

    console.log("Voice WebSocket attached at /ws/voice")
    return wss
}

module.exports = { attachVoiceWebSocket }
