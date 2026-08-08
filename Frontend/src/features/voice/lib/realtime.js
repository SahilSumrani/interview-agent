import { createVoiceSocket } from "../services/voice.api"
import { unlockAudio } from "./voice"

/**
 * Bidirectional voice socket: submit turns over WS and optionally collect streamed TTS.
 * Turn results resolve as soon as Groq replies — TTS is best-effort and must not block the interview.
 */
export function createInterviewRealtime({
    onThinking,
    onTurnResult,
    onError,
} = {}) {
    let socket = null
    let pending = new Map()
    let audioChunks = new Map()

    const clearSocket = () => {
        try { socket?.close?.() } catch { /* ignore */ }
        socket = null
    }

    const ensure = () => {
        const state = socket?.ws?.readyState
        if (state === WebSocket.OPEN) return socket
        // Never reuse a stuck CONNECTING / CLOSED socket
        if (state === WebSocket.CONNECTING || state === WebSocket.CLOSING || state === WebSocket.CLOSED) {
            clearSocket()
        }

        socket = createVoiceSocket({
            onOpen: () => {},
            onClose: () => {
                socket = null
            },
            onError: () => {
                onError?.("WebSocket connection error")
                clearSocket()
            },
            onMessage: (msg) => {
                const id = msg.requestId
                if (msg.type === "thinking") {
                    onThinking?.(msg)
                    return
                }
                if (msg.type === "turn_result") {
                    const entry = pending.get(id)
                    if (entry) {
                        entry.result = msg
                        entry.gotResult = true
                        // Resolve immediately — don't wait on TTS
                        finishTurn(id)
                    } else {
                        onTurnResult?.(msg)
                    }
                    return
                }
                if (msg.type === "tts_start") {
                    audioChunks.set(id, [])
                    return
                }
                if (msg.type === "tts_chunk" && msg.audio) {
                    const list = audioChunks.get(id) || []
                    list.push(msg.audio)
                    audioChunks.set(id, list)
                    return
                }
                if (msg.type === "tts_end") {
                    const list = audioChunks.get(id) || []
                    audioChunks.delete(id)
                    const blob = base64ChunksToBlob(list)
                    const turnId = String(id).replace(/-tts$/, "")
                    const entry = pending.get(turnId)
                    if (entry) {
                        entry.audioBlob = blob
                        entry.gotTts = true
                        // If turn already resolved, nothing else to do
                    }
                    return
                }
                if (msg.type === "tts_error" || msg.type === "error") {
                    const turnId = String(id || "").replace(/-tts$/, "")
                    const entry = pending.get(turnId) || pending.get(id)
                    if (entry) {
                        entry.gotTts = true
                        entry.ttsError = msg.message
                        if (entry.gotResult) finishTurn(turnId || id)
                        else if (msg.type === "error") {
                            pending.delete(turnId || id)
                            entry.reject?.(new Error(msg.message || "Realtime error"))
                        }
                    } else {
                        onError?.(msg.message || "Realtime error")
                    }
                }
            },
        })
        return socket
    }

    function finishTurn(id) {
        const entry = pending.get(id)
        if (!entry?.gotResult || entry.finished) return
        entry.finished = true
        if (entry.ttsWaitTimer) clearTimeout(entry.ttsWaitTimer)

        // Brief grace so a fast TTS stream can attach audio; never block long
        const settle = () => {
            if (!pending.has(id)) return
            pending.delete(id)
            entry.resolve({
                result: entry.result,
                audioBlob: entry.audioBlob || null,
            })
        }

        if (entry.audioBlob || entry.gotTts || entry.force) {
            settle()
        } else {
            entry.ttsWaitTimer = setTimeout(settle, 2500)
        }
    }

    return {
        connect() {
            try { ensure() } catch { /* ignore */ }
        },
        async sendTurn(sessionId, answerText) {
            const s = ensure()
            await waitOpen(s.ws)
            const requestId = String(Date.now())
            return new Promise((resolve, reject) => {
                const entry = {
                    resolve,
                    reject,
                    gotResult: false,
                    gotTts: false,
                    finished: false,
                    result: null,
                    audioBlob: null,
                    ttsWaitTimer: null,
                }
                pending.set(requestId, entry)
                const timer = setTimeout(() => {
                    if (!pending.has(requestId)) return
                    if (entry.gotResult) {
                        entry.force = true
                        finishTurn(requestId)
                    } else {
                        pending.delete(requestId)
                        reject(new Error("Realtime turn timed out"))
                    }
                }, 35000)
                const origResolve = entry.resolve
                const origReject = entry.reject
                entry.resolve = (val) => {
                    clearTimeout(timer)
                    origResolve(val)
                }
                entry.reject = (err) => {
                    clearTimeout(timer)
                    origReject(err)
                }
                try {
                    s.sendTurn(sessionId, answerText, requestId)
                } catch (err) {
                    pending.delete(requestId)
                    clearTimeout(timer)
                    reject(err)
                }
            })
        },
        async speakText(text) {
            const s = ensure()
            await waitOpen(s.ws)
            await unlockAudio()
            const requestId = `solo-${Date.now()}`
            return new Promise((resolve, reject) => {
                const entry = {
                    resolve: ({ audioBlob }) => resolve(audioBlob),
                    reject,
                    gotResult: true,
                    gotTts: false,
                    finished: false,
                    result: {},
                    audioBlob: null,
                }
                pending.set(requestId, entry)
                const timer = setTimeout(() => {
                    if (pending.has(requestId)) {
                        pending.delete(requestId)
                        reject(new Error("TTS stream timed out"))
                    }
                }, 20000)
                const origResolve = entry.resolve
                entry.resolve = (val) => {
                    clearTimeout(timer)
                    origResolve(val)
                }
                // Pair TTS end with this requestId
                const wrapFinish = () => {
                    if (entry.audioBlob) {
                        pending.delete(requestId)
                        entry.resolve({ audioBlob: entry.audioBlob })
                    }
                }
                // Hook via pending map updates from tts_end
                const poll = setInterval(() => {
                    if (entry.gotTts) {
                        clearInterval(poll)
                        clearTimeout(timer)
                        pending.delete(requestId)
                        resolve(entry.audioBlob || null)
                    }
                }, 100)
                setTimeout(() => clearInterval(poll), 21000)
                s.sendTts(text, requestId)
                void wrapFinish
            })
        },
        close() {
            for (const entry of pending.values()) {
                if (entry.ttsWaitTimer) clearTimeout(entry.ttsWaitTimer)
            }
            pending.clear()
            audioChunks.clear()
            clearSocket()
        },
    }
}

function waitOpen(ws) {
    if (!ws) return Promise.reject(new Error("No WebSocket"))
    if (ws.readyState === WebSocket.OPEN) return Promise.resolve()
    if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        return Promise.reject(new Error("WebSocket closed"))
    }
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("WS open timeout")), 4000)
        const onOpen = () => {
            clearTimeout(t)
            cleanup()
            resolve()
        }
        const onErr = () => {
            clearTimeout(t)
            cleanup()
            reject(new Error("WS failed"))
        }
        const cleanup = () => {
            ws.removeEventListener("open", onOpen)
            ws.removeEventListener("error", onErr)
        }
        ws.addEventListener("open", onOpen)
        ws.addEventListener("error", onErr)
    })
}

function base64ChunksToBlob(chunks) {
    if (!chunks?.length) return null
    const binary = chunks.map((c) => atob(c)).join("")
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([ bytes ], { type: "audio/mpeg" })
}
