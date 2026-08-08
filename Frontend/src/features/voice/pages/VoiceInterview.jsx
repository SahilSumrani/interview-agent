import React, { useCallback, useEffect, useRef, useState } from "react"
import { failVoiceSession, fetchPlaybooks, fetchRoles, fetchVoiceReport, logVoiceViolation, startVoiceSession, submitVoiceTurn, voiceReportPdfUrl } from "../services/voice.api"
import { createSpeechRecognizer, onAudioLevel, playAudioBlob, speakText, stopSpeaking, unlockAudio } from "../lib/voice"
import { createInterviewRealtime } from "../lib/realtime"
import { computeVoiceMetrics, isAcceptableAnswer, isJunkUtterance, speechLangFor } from "../lib/speechQuality"
import { createFaceAnalyzer, createVisualAggregator } from "../lib/faceAnalysis"
import AgentAudioVisualizerAura from "../components/AgentAudioVisualizerAura"
import InterviewReportCard from "../components/InterviewReportCard"
import LiveInterviewStage from "../components/LiveInterviewStage"
import "./voice.scss"

const PHASE = {
    RESUME: "resume",
    CONFIG: "config",
    BRIEFING: "briefing",
    STARTING: "starting",
    SPEAKING: "speaking",
    LISTENING: "listening",
    THINKING: "thinking",
    DONE: "done",
    FAILED: "failed",
    ERROR: "error",
}

const MAX_FOCUS_VIOLATIONS = 5
const SETUP_PHASES = new Set([ PHASE.RESUME, PHASE.CONFIG, PHASE.BRIEFING ])
const LIVE_PHASES = new Set([ PHASE.STARTING, PHASE.SPEAKING, PHASE.LISTENING, PHASE.THINKING ])
const TURN_TIMEOUT_MS = 40000
const SILENCE_SUBMIT_MS = 2200
// Gaps shorter than this are normal speech rhythm, not a hesitation pause
const MIN_PAUSE_MS = 400

const formatClock = (totalSeconds) => {
    const s = Math.max(0, Math.floor(totalSeconds))
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

const DEFAULT_ROLES = [
    { key: "software_engineer", label: "Software Engineer" },
    { key: "fullstack", label: "Full Stack Developer" },
    { key: "agentic_ai", label: "Agentic AI / AI Agent Engineer" },
    { key: "ai_engineer", label: "AI / ML Engineer" },
    { key: "frontend", label: "Frontend / UI-UX" },
    { key: "mobile", label: "Mobile (Flutter/React Native)" },
    { key: "backend", label: "Backend Engineer" },
    { key: "product_manager", label: "Product Manager" },
    { key: "project_manager", label: "Project / Program Manager" },
    { key: "general", label: "General / Other" },
]

const BRIEFING_SCRIPT =
    "Hi, I'm Maya. Keep this tab open with camera, mic, and screen share on. No cheating. Then press Start interview."

const VoiceInterview = () => {
    const [ phase, setPhase ] = useState(PHASE.RESUME)
    const [ resumeFile, setResumeFile ] = useState(null)
    const [ resumeName, setResumeName ] = useState("")
    const [ dragOver, setDragOver ] = useState(false)

    const [ briefingHeard, setBriefingHeard ] = useState(false)
    const [ briefingSpeaking, setBriefingSpeaking ] = useState(false)

    const [ cameraReady, setCameraReady ] = useState(false)
    const [ micReady, setMicReady ] = useState(false)
    const [ screenReady, setScreenReady ] = useState(false)

    const [ playbooks, setPlaybooks ] = useState([])
    const [ roles, setRoles ] = useState(DEFAULT_ROLES)
    const [ companyKey, setCompanyKey ] = useState("general")
    const [ companyLabel, setCompanyLabel ] = useState("General")
    const [ roleKey, setRoleKey ] = useState("software_engineer")
    const [ fieldLabel, setFieldLabel ] = useState("")
    const [ roleLabel, setRoleLabel ] = useState("Software Engineer")
    const [ candidateName, setCandidateName ] = useState("")
    const [ sessionId, setSessionId ] = useState(null)
    const [ rubricScores, setRubricScores ] = useState(null)
    const [ competencyCoverage, setCompetencyCoverage ] = useState([])
    const [ messages, setMessages ] = useState([])
    const [ liveTranscript, setLiveTranscript ] = useState("")
    const [ turnCount, setTurnCount ] = useState(0)
    const [ maxTurns, setMaxTurns ] = useState(7)
    const [ score, setScore ] = useState(null)
    const [ summary, setSummary ] = useState("")
    const [ report, setReport ] = useState(null)
    const [ lastAnswer, setLastAnswer ] = useState("")
    const [ thinkingStuck, setThinkingStuck ] = useState(false)
    const [ error, setError ] = useState("")
    const [ audioLevel, setAudioLevel ] = useState(0)
    const [ startingHint, setStartingHint ] = useState("")

    const [ micLevel, setMicLevel ] = useState(0)
    const [ elapsedSec, setElapsedSec ] = useState(0)
    const [ liveDelivery, setLiveDelivery ] = useState(null)
    const [ silentMs, setSilentMs ] = useState(0)
    const [ visualLive, setVisualLive ] = useState(null)
    const [ visualStatus, setVisualStatus ] = useState("idle")
    const [ visualPerAnswer, setVisualPerAnswer ] = useState([])

    const [ violations, setViolations ] = useState(0)
    const [ warnBanner, setWarnBanner ] = useState("")
    const [ pauseReason, setPauseReason ] = useState("")

    const recognitionRef = useRef(null)
    const listeningRef = useRef(false)
    const finalTranscriptRef = useRef("")
    const sessionIdRef = useRef(null)
    const listenGenRef = useRef(0)
    const chatEndRef = useRef(null)
    const phaseRef = useRef(PHASE.RESUME)
    const cameraStreamRef = useRef(null)
    const screenStreamRef = useRef(null)
    const micStreamRef = useRef(null)
    const violationsRef = useRef(0)
    const endingRef = useRef(false)
    const answeringRef = useRef(false)
    const requestingPermsRef = useRef(false)
    const briefingGenRef = useRef(0)
    const cameraVideoRef = useRef(null)
    const screenVideoRef = useRef(null)
    const stageCamRef = useRef(null)
    const stageScreenRef = useRef(null)
    const realtimeRef = useRef(null)
    const silenceTimerRef = useRef(null)
    const speechStartRef = useRef(0)
    const lastSpeechAtRef = useRef(0)
    const pausesRef = useRef([])
    const speakGenRef = useRef(0)
    const micRafRef = useRef(0)
    const micCtxRef = useRef(null)
    const bargeGenRef = useRef(0)
    const bargeArmAtRef = useRef(0)
    const interviewStartRef = useRef(0)
    const liveTextRef = useRef("")
    const repeatingRef = useRef(false)
    const faceAnalyzerRef = useRef(null)
    const answerVisualRef = useRef(createVisualAggregator())
    const sessionVisualRef = useRef(createVisualAggregator())

    const setPhaseSafe = (next) => {
        phaseRef.current = next
        setPhase(next)
    }

    const clearSilenceTimer = () => {
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
            silenceTimerRef.current = null
        }
    }

    const disarmBargeIn = () => {
        bargeGenRef.current = 0
    }

    const stopMicMeter = () => {
        disarmBargeIn()
        if (micRafRef.current) {
            cancelAnimationFrame(micRafRef.current)
            micRafRef.current = 0
        }
        try {
            micCtxRef.current?.close?.()
        } catch {
            // ignore
        }
        micCtxRef.current = null
        setMicLevel(0)
    }

    const stopListening = () => {
        listeningRef.current = false
        listenGenRef.current += 1
        clearSilenceTimer()
        try {
            recognitionRef.current?.abort?.()
        } catch {
            // ignore
        }
        recognitionRef.current = null
    }

    const stopMediaTracks = (streamRef) => {
        const stream = streamRef.current
        if (stream) {
            stream.getTracks().forEach((t) => {
                try { t.stop() } catch { /* ignore */ }
            })
        }
        streamRef.current = null
    }

    const stopAllMedia = useCallback(() => {
        stopMediaTracks(cameraStreamRef)
        stopMediaTracks(screenStreamRef)
        stopMediaTracks(micStreamRef)
        setCameraReady(false)
        setMicReady(false)
        setScreenReady(false)
    }, [])

    const endForIntegrity = useCallback(async (reason, message) => {
        if (endingRef.current) return
        endingRef.current = true
        stopMicMeter()
        stopListening()
        stopSpeaking()
        stopAllMedia()
        setWarnBanner(message)
        setPauseReason(reason)
        setPhaseSafe(PHASE.FAILED)
        setScore(0)
        setSummary(message)

        const id = sessionIdRef.current
        if (id) {
            try {
                await failVoiceSession({
                    sessionId: id,
                    reason,
                    violationCount: violationsRef.current,
                })
            } catch (err) {
                console.warn("failVoiceSession:", err)
            }
        }
    }, [ stopAllMedia ])

    const registerFocusViolation = useCallback((detail) => {
        // Never fail during resume upload or integrity briefing TTS
        if (SETUP_PHASES.has(phaseRef.current)) return
        if (requestingPermsRef.current) return
        const activePhases = [ PHASE.STARTING, PHASE.SPEAKING, PHASE.LISTENING, PHASE.THINKING ]
        if (!activePhases.includes(phaseRef.current)) return
        if (endingRef.current) return

        violationsRef.current += 1
        const count = violationsRef.current
        setViolations(count)
        setPauseReason("focus")
        setWarnBanner(`Stay on this tab — focus warning ${count}/${MAX_FOCUS_VIOLATIONS}. ${detail}`)

        const sid = sessionIdRef.current
        if (sid) {
            logVoiceViolation({ sessionId: sid, type: "focus_loss", detail }).catch(() => {})
        }

        if (count >= MAX_FOCUS_VIOLATIONS) {
            endForIntegrity(
                "repeated_focus_loss",
                `Interview auto-failed after ${MAX_FOCUS_VIOLATIONS} tab/focus violations.`
            )
        }
        // Soft warnings only — don't pause/kill speaking state on early focus flickers.
    }, [ endForIntegrity ])

    const playBriefingInstructions = useCallback(async () => {
        const gen = ++briefingGenRef.current
        stopSpeaking()
        setError("")
        setBriefingSpeaking(true)
        try {
            await unlockAudio()
            if (gen !== briefingGenRef.current || phaseRef.current !== PHASE.BRIEFING) return
            const spoken = await speakText(BRIEFING_SCRIPT, {
                preferElevenLabs: true,
                preferKokoro: false,
                maxMs: 60000,
            })
            if (gen === briefingGenRef.current && spoken?.engine === "browser" && /quota|ElevenLabs/i.test(spoken.fallbackReason || "")) {
                setWarnBanner("ElevenLabs quota finished — using browser voice until you add credits / a new API key.")
            }
        } catch (err) {
            console.error(err)
            if (gen === briefingGenRef.current) {
                setError("Could not play instructions. Unmute the tab, then tap Replay instructions.")
            }
        } finally {
            if (gen === briefingGenRef.current) {
                setBriefingSpeaking(false)
                setBriefingHeard(true)
            }
        }
    }, [])

    const attachStream = (videoEl, stream) => {
        if (!videoEl || !stream) return
        videoEl.srcObject = stream
    }

    const requestCameraAndMic = async () => {
        if (!briefingHeard || briefingSpeaking) return
        setError("")
        requestingPermsRef.current = true
        try {
            stopMediaTracks(cameraStreamRef)
            stopMediaTracks(micStreamRef)
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user" },
                audio: true,
            })
            cameraStreamRef.current = stream
            micStreamRef.current = stream
            setCameraReady(true)
            setMicReady(true)
            attachStream(cameraVideoRef.current, stream)

            const videoTrack = stream.getVideoTracks()?.[0]
            if (videoTrack) {
                videoTrack.addEventListener("ended", () => {
                    if (SETUP_PHASES.has(phaseRef.current) || [ PHASE.DONE, PHASE.FAILED, PHASE.ERROR ].includes(phaseRef.current)) {
                        setCameraReady(false)
                        setMicReady(false)
                        return
                    }
                    const sid = sessionIdRef.current
                    if (sid) {
                        logVoiceViolation({
                            sessionId: sid,
                            type: "camera_stopped",
                            detail: "Camera track ended during interview",
                        }).catch(() => {})
                    }
                    endForIntegrity(
                        "camera_stopped",
                        "Camera stopped — interview ended for integrity."
                    )
                })
            }

            // Soft signal if multiple monitors are reported (not always available)
            try {
                if (window.screen?.isExtended) {
                    const sid = sessionIdRef.current
                    // logged later once session exists; store flag
                    window.__voiceMultiDisplay = true
                }
            } catch {
                // ignore
            }
        } catch (err) {
            console.error(err)
            setCameraReady(false)
            setMicReady(false)
            setError(err?.message || "Camera and microphone permission are required.")
        } finally {
            setTimeout(() => { requestingPermsRef.current = false }, 800)
        }
    }

    const requestScreenShare = async () => {
        if (!briefingHeard || briefingSpeaking) return
        setError("")
        requestingPermsRef.current = true
        try {
            stopMediaTracks(screenStreamRef)
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
            })
            screenStreamRef.current = stream
            setScreenReady(true)
            attachStream(screenVideoRef.current, stream)

            const [ track ] = stream.getVideoTracks()
            if (track) {
                track.addEventListener("ended", () => {
                    if (SETUP_PHASES.has(phaseRef.current) || [ PHASE.DONE, PHASE.FAILED, PHASE.ERROR ].includes(phaseRef.current)) {
                        setScreenReady(false)
                        screenStreamRef.current = null
                        return
                    }
                    endForIntegrity(
                        "screen_share_stopped",
                        "Screen share stopped — interview ended for integrity."
                    )
                    const sid = sessionIdRef.current
                    if (sid) {
                        logVoiceViolation({
                            sessionId: sid,
                            type: "screen_share_stopped",
                            detail: "User stopped screen share",
                        }).catch(() => {})
                    }
                })
            }
        } catch (err) {
            console.error(err)
            setScreenReady(false)
            setError(err?.message || "Screen share is required.")
        } finally {
            setTimeout(() => { requestingPermsRef.current = false }, 800)
        }
    }

    useEffect(() => {
        attachStream(cameraVideoRef.current, cameraStreamRef.current)
        attachStream(screenVideoRef.current, screenStreamRef.current)
        attachStream(stageCamRef.current, cameraStreamRef.current)
        attachStream(stageScreenRef.current, screenStreamRef.current)
    }, [ phase, cameraReady, screenReady, briefingHeard ])

    // Auto-play integrity briefing when Screen 2 opens
    useEffect(() => {
        if (phase !== PHASE.BRIEFING) return undefined
        let cancelled = false
        const timer = setTimeout(() => {
            if (!cancelled) playBriefingInstructions()
        }, 250)
        return () => {
            cancelled = true
            clearTimeout(timer)
            briefingGenRef.current += 1
            stopSpeaking()
            setBriefingSpeaking(false)
        }
    }, [ phase, playBriefingInstructions ])

    useEffect(() => {
        window.speechSynthesis?.getVoices?.()
        const onVoices = () => window.speechSynthesis?.getVoices?.()
        window.speechSynthesis?.addEventListener?.("voiceschanged", onVoices)
        const unsubLevel = onAudioLevel((level) => setAudioLevel(level))

        fetchPlaybooks()
            .then((list) => {
                if (Array.isArray(list) && list.length) setPlaybooks(list)
            })
            .catch(() => {
                setPlaybooks([
                    { companyKey: "google", shortLabel: "Google", name: "Google" },
                    { companyKey: "microsoft", shortLabel: "Microsoft", name: "Microsoft" },
                    { companyKey: "accenture", shortLabel: "Accenture", name: "Accenture" },
                    { companyKey: "general", shortLabel: "General", name: "General" },
                ])
            })

        fetchRoles()
            .then((list) => {
                if (Array.isArray(list) && list.length) setRoles(list)
            })
            .catch(() => setRoles(DEFAULT_ROLES))

        realtimeRef.current = createInterviewRealtime({
            onThinking: () => {
                if (!endingRef.current) setPhaseSafe(PHASE.THINKING)
            },
        })
        realtimeRef.current.connect()

        return () => {
            window.speechSynthesis?.removeEventListener?.("voiceschanged", onVoices)
            unsubLevel()
            stopListening()
            stopSpeaking()
            stopMicMeter()
            faceAnalyzerRef.current?.dispose()
            faceAnalyzerRef.current = null
            stopAllMedia()
            realtimeRef.current?.close?.()
            realtimeRef.current = null
        }
    }, [ stopAllMedia ])

    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === "hidden") {
                registerFocusViolation("Tab hidden or switched away.")
            }
        }
        const onBlur = () => {
            if (SETUP_PHASES.has(phaseRef.current) || requestingPermsRef.current) return
            setTimeout(() => {
                if (requestingPermsRef.current) return
                if (SETUP_PHASES.has(phaseRef.current)) return
                // Only count hard leave: tab hidden is more reliable than blur alone
                if (document.visibilityState === "hidden") {
                    registerFocusViolation("Window lost focus while tab hidden.")
                }
            }, 350)
        }

        document.addEventListener("visibilitychange", onVisibility)
        window.addEventListener("blur", onBlur)
        return () => {
            document.removeEventListener("visibilitychange", onVisibility)
            window.removeEventListener("blur", onBlur)
        }
    }, [ registerFocusViolation ])

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [ messages, liveTranscript ])

    useEffect(() => {
        liveTextRef.current = liveTranscript
    }, [ liveTranscript ])

    useEffect(() => {
        if (!LIVE_PHASES.has(phase)) return undefined
        const tick = () => {
            if (!interviewStartRef.current) return
            setElapsedSec(Math.floor((Date.now() - interviewStartRef.current) / 1000))
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [ phase ])

    // Live delivery coaching, derived from the same metrics the report uses
    useEffect(() => {
        if (phase !== PHASE.LISTENING) {
            setLiveDelivery(null)
            setSilentMs(0)
            return undefined
        }
        const id = setInterval(() => {
            const startedAt = speechStartRef.current
            if (!startedAt) return
            const lastAt = lastSpeechAtRef.current || startedAt
            setLiveDelivery(computeVoiceMetrics(liveTextRef.current || "", {
                durationMs: Math.max(0, lastAt - startedAt),
                pauses: pausesRef.current,
            }))
            setSilentMs(Math.max(0, Date.now() - lastAt))
        }, 500)
        return () => clearInterval(id)
    }, [ phase ])

    // On-device camera analysis. Any failure here leaves the interview untouched.
    useEffect(() => {
        const shouldRun = LIVE_PHASES.has(phase) && cameraReady
        if (!shouldRun) {
            faceAnalyzerRef.current?.dispose()
            faceAnalyzerRef.current = null
            return
        }
        if (faceAnalyzerRef.current) return

        const analyzer = createFaceAnalyzer({
            onStatus: (status) => setVisualStatus(status),
            onSample: (sample) => {
                answerVisualRef.current.add(sample)
                sessionVisualRef.current.add(sample)
                setVisualLive(sessionVisualRef.current.summary())
            },
        })
        faceAnalyzerRef.current = analyzer
        analyzer.start(stageCamRef.current).catch(() => setVisualStatus("unavailable"))
    }, [ phase, cameraReady ])

    const pushMessage = (roleName, text) => {
        setMessages((prev) => [ ...prev, { role: roleName, text } ])
    }

    const interruptMayaAndAnswer = () => {
        if (endingRef.current) return
        speakGenRef.current += 1
        disarmBargeIn()
        stopSpeaking()
        setError("")
        startListening()
    }

    /**
     * One mic analyser for the whole session: it feeds the aura while the
     * candidate speaks and doubles as the barge-in detector while Maya speaks.
     */
    const startMicMeter = () => {
        if (micRafRef.current) return
        const stream = micStreamRef.current
        if (!stream) return

        let audioCtx
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)()
            micCtxRef.current = audioCtx
            const source = audioCtx.createMediaStreamSource(stream)
            const analyser = audioCtx.createAnalyser()
            analyser.fftSize = 512
            source.connect(analyser)
            const data = new Uint8Array(analyser.fftSize)
            let hotFrames = 0
            let lastPush = 0

            const tick = () => {
                micRafRef.current = requestAnimationFrame(tick)
                analyser.getByteTimeDomainData(data)
                let sum = 0
                for (let i = 0; i < data.length; i++) {
                    const v = (data[i] - 128) / 128
                    sum += v * v
                }
                const rms = Math.sqrt(sum / data.length)

                const now = performance.now()
                if (now - lastPush > 90) {
                    lastPush = now
                    setMicLevel(Math.min(1, rms * 3.2))
                }

                const armedGen = bargeGenRef.current
                if (!armedGen || endingRef.current || phaseRef.current !== PHASE.SPEAKING) {
                    hotFrames = 0
                    return
                }
                if (armedGen !== speakGenRef.current) {
                    disarmBargeIn()
                    hotFrames = 0
                    return
                }
                if (now >= bargeArmAtRef.current && rms > 0.085) {
                    hotFrames += 1
                } else {
                    hotFrames = Math.max(0, hotFrames - 1)
                }
                if (hotFrames >= 8) {
                    hotFrames = 0
                    disarmBargeIn()
                    interruptMayaAndAnswer()
                }
            }
            micRafRef.current = requestAnimationFrame(tick)
        } catch (err) {
            console.warn("mic meter failed", err)
            try { audioCtx?.close?.() } catch { /* ignore */ }
            micCtxRef.current = null
        }
    }

    const armBargeIn = (speakGen) => {
        startMicMeter()
        bargeGenRef.current = speakGen
        // Ignore TTS bleed for a moment after Maya starts talking
        bargeArmAtRef.current = performance.now() + 900
    }

    const speakAndThenListen = async (text, { listenAfter = true, audioBlob = null } = {}) => {
        const gen = ++speakGenRef.current
        setPhaseSafe(PHASE.SPEAKING)
        setError("")
        armBargeIn(gen)
        try {
            const play = audioBlob
                ? playAudioBlob(audioBlob)
                : speakText(text, { preferElevenLabs: true, preferKokoro: false, lang: "en-US", maxMs: 45000 })
            // Soft cap so a hung TTS never blocks listening forever — but stop playback if we bail early
            const timedOut = await Promise.race([
                play.then(() => false).catch((err) => {
                    console.warn("TTS play failed:", err)
                    return false
                }),
                new Promise((resolve) => setTimeout(() => resolve(true), 50000)),
            ])
            if (timedOut) stopSpeaking()
        } catch (err) {
            console.warn("speakAndThenListen:", err)
        } finally {
            disarmBargeIn()
        }

        if (gen !== speakGenRef.current) return
        if (listenAfter && !endingRef.current && phaseRef.current !== PHASE.FAILED) {
            try {
                startListening()
            } catch (err) {
                console.error(err)
                setError("Mic failed to start — tap Interrupt & answer, or Send now.")
                setPhaseSafe(PHASE.LISTENING)
            }
            // Safety net: if still not listening shortly after, force LISTENING UI
            setTimeout(() => {
                if (gen !== speakGenRef.current || endingRef.current) return
                if (phaseRef.current === PHASE.SPEAKING && listenAfter) {
                    setError("Ready for your answer — speak now or tap Interrupt & answer.")
                    try { startListening() } catch { setPhaseSafe(PHASE.LISTENING) }
                }
            }, 400)
        }
    }

    const tryAutoSubmitAnswer = (gen) => {
        if (gen !== listenGenRef.current) return
        if (!listeningRef.current || endingRef.current || answeringRef.current) return
        if (phaseRef.current !== PHASE.LISTENING) return

        const answer = finalTranscriptRef.current.trim()
        if (!isAcceptableAnswer(answer)) return

        listeningRef.current = false
        clearSilenceTimer()
        handleAnswer(answer)
    }

    const scheduleSilenceSubmit = (gen) => {
        clearSilenceTimer()
        silenceTimerRef.current = setTimeout(() => tryAutoSubmitAnswer(gen), SILENCE_SUBMIT_MS)
    }

    const startListening = () => {
        if (!sessionIdRef.current) {
            setError("Interview session missing. Please start again.")
            setPhaseSafe(PHASE.ERROR)
            return
        }
        if (endingRef.current) return

        try {
            stopListening()
            finalTranscriptRef.current = ""
            speechStartRef.current = 0
            lastSpeechAtRef.current = 0
            pausesRef.current = []
            setLiveTranscript("")
            setPauseReason("")
            setError("")

            const gen = listenGenRef.current
            const recognition = createSpeechRecognizer({
                lang: speechLangFor(),
                onResult: ({ transcript, isFinal, confidence }) => {
                    if (gen !== listenGenRef.current) return
                    if (!transcript?.trim()) return

                    const now = Date.now()
                    if (!speechStartRef.current) {
                        speechStartRef.current = now
                    } else {
                        const gap = now - lastSpeechAtRef.current
                        if (gap >= MIN_PAUSE_MS) pausesRef.current.push(gap)
                    }
                    lastSpeechAtRef.current = now

                    // Barge-in: if Maya was speaking, cut her off
                    if (phaseRef.current === PHASE.SPEAKING) {
                        speakGenRef.current += 1
                        stopSpeaking()
                        setPhaseSafe(PHASE.LISTENING)
                    }

                    if (!isFinal) {
                        const preview = finalTranscriptRef.current
                            ? `${finalTranscriptRef.current} ${transcript}`.trim()
                            : transcript
                        setLiveTranscript(preview)
                        scheduleSilenceSubmit(gen)
                        return
                    }

                    if ((typeof confidence === "number" && confidence > 0 && confidence < 0.28) || isJunkUtterance(transcript)) {
                        scheduleSilenceSubmit(gen)
                        return
                    }

                    const prev = finalTranscriptRef.current
                    finalTranscriptRef.current = prev
                        ? `${prev} ${transcript.trim()}`.trim()
                        : transcript.trim()
                    setLiveTranscript(finalTranscriptRef.current)
                    scheduleSilenceSubmit(gen)
                },
                onError: (code) => {
                    if (gen !== listenGenRef.current) return
                    if (code === "aborted" || code === "no-speech" || code === "audio-capture") {
                        return
                    }
                    if (code === "network") {
                        setTimeout(() => {
                            if (gen === listenGenRef.current && listeningRef.current && !endingRef.current) {
                                try { recognitionRef.current?.start?.() } catch { /* ignore */ }
                            }
                        }, 600)
                        return
                    }
                    setError(`Mic error: ${code}. Tap Answer now to retry.`)
                },
                onEnd: () => {
                    if (gen !== listenGenRef.current) return
                    if (!listeningRef.current) return
                    setTimeout(() => {
                        if (gen !== listenGenRef.current || endingRef.current) return
                        if (!sessionIdRef.current) return
                        if (phaseRef.current !== PHASE.LISTENING) return
                        if (!listeningRef.current) return
                        try {
                            recognitionRef.current?.start?.()
                        } catch {
                            try { startListening() } catch { /* ignore */ }
                        }
                    }, 280)
                },
            })

            recognitionRef.current = recognition
            listeningRef.current = true
            setPhaseSafe(PHASE.LISTENING)
            recognition.start()
        } catch (err) {
            setError(err.message || "Could not start mic. Tap Answer now.")
            setPhaseSafe(PHASE.LISTENING)
        }
    }

    const onResumePicked = (file) => {
        if (!file) return
        const name = String(file.name || "").toLowerCase()
        const ok = file.type === "application/pdf"
            || file.type.includes("wordprocessingml")
            || file.type === "application/msword"
            || name.endsWith(".pdf")
            || name.endsWith(".docx")
            || name.endsWith(".doc")
        if (!ok) {
            setError("Please upload a PDF or DOCX resume.")
            return
        }
        if (file.size > 5 * 1024 * 1024) {
            setError("Resume must be under 5MB.")
            return
        }
        setError("")
        setResumeFile(file)
        setResumeName(file.name)
        setBriefingHeard(false)
        setBriefingSpeaking(false)
        setCameraReady(false)
        setMicReady(false)
        setScreenReady(false)
        stopAllMedia()
        setPhaseSafe(PHASE.CONFIG)
    }

    const canStart = Boolean(resumeFile)
        && briefingHeard
        && !briefingSpeaking
        && cameraReady
        && micReady
        && screenReady
        && !endingRef.current

    const handleReplayBriefing = () => {
        if (briefingSpeaking) return
        playBriefingInstructions()
    }

    const handleStart = async () => {
        if (!canStart) {
            setError("Enable camera, mic, and screen share before starting.")
            return
        }

        endingRef.current = false
        stopListening()
        stopSpeaking()
        setError("")
        setWarnBanner("")
        setPauseReason("")
        setViolations(0)
        violationsRef.current = 0
        setPhaseSafe(PHASE.STARTING)
        setStartingHint("Reading your resume and preparing Maya…")
        setMessages([])
        setScore(null)
        setSummary("")
        setReport(null)
        setLastAnswer("")
        setThinkingStuck(false)
        setSessionId(null)
        sessionIdRef.current = null

        interviewStartRef.current = Date.now()
        setElapsedSec(0)
        answerVisualRef.current.reset()
        sessionVisualRef.current.reset()
        setVisualLive(null)
        setVisualPerAnswer([])
        setVisualStatus("idle")
        startMicMeter()

        const startTimeout = setTimeout(() => {
            if (phaseRef.current === PHASE.STARTING) {
                setStartingHint("Still working — large resumes can take a moment…")
            }
        }, 12000)

        try {
            await unlockAudio()
            const data = await startVoiceSession({
                resumeFile,
                companyKey,
                roleKey,
                roleLabel,
            })
            clearTimeout(startTimeout)

            if (!data?.sessionId) {
                throw new Error("Server did not return a session id.")
            }
            sessionIdRef.current = String(data.sessionId)
            setSessionId(String(data.sessionId))
            setTurnCount(data.turnCount)
            setMaxTurns(data.maxTurns)
            setFieldLabel(data.fieldLabel || data.field || "")
            setRoleLabel(data.role || roleLabel || "")
            if (data.roleKey) setRoleKey(data.roleKey)
            setCandidateName(data.candidateName || "")
            setCompanyLabel(data.companyLabel || data.companyKey || companyKey)
            setCompetencyCoverage(data.competencyCoverage || [])
            setRubricScores(null)
            setStartingHint("")

            if (window.__voiceMultiDisplay) {
                logVoiceViolation({
                    sessionId: String(data.sessionId),
                    type: "multi_display",
                    detail: "Browser reported extended/multi-display setup",
                }).catch(() => {})
            }

            realtimeRef.current?.connect?.()
            pushMessage("interviewer", data.interviewerMessage)
            setPhaseSafe(PHASE.SPEAKING)
            await speakAndThenListen(data.interviewerMessage, { listenAfter: true })
        } catch (err) {
            clearTimeout(startTimeout)
            console.error(err)
            const msg = err?.code === "ECONNABORTED"
                ? "Start timed out. Check your connection and try again."
                : (err?.response?.data?.message || err.message || "Could not start interview")
            setError(msg)
            setStartingHint("")
            setPhaseSafe(PHASE.ERROR)
        }
    }

    const applyCompletedReport = async (data, activeSessionId) => {
        setScore(data.score)
        setSummary(data.summary || "")
        if (data.report) {
            setReport(data.report)
            return
        }
        try {
            const full = await fetchVoiceReport(activeSessionId)
            setReport(full)
        } catch {
            setReport({
                score: data.score,
                summary: data.summary || "",
                rubricScores: data.rubricScores || {},
                starScores: data.starScores || {},
                competencyCoverage: data.competencyCoverage || [],
                shallowAnswerCount: data.shallowAnswerCount || 0,
                transcript: messages,
            })
        }
    }

    const handleAnswer = async (answerText) => {
        const activeSessionId = sessionIdRef.current
        if (!activeSessionId) {
            setError("Interview session missing. Please start again.")
            setPhaseSafe(PHASE.ERROR)
            return
        }
        if (endingRef.current) return
        if (answeringRef.current) return
        answeringRef.current = true

        const cleaned = String(answerText || "").trim()
        if (!cleaned) {
            answeringRef.current = false
            setError("No speech captured. Pause after speaking, or tap Send now.")
            setPhaseSafe(PHASE.LISTENING)
            startListening()
            return
        }

        // Ignore accidental camera-noise / filler turns
        if (isJunkUtterance(cleaned)) {
            answeringRef.current = false
            setError("That didn't sound like an answer — say a bit more, then pause.")
            setPhaseSafe(PHASE.LISTENING)
            startListening()
            return
        }

        const spokenFrom = speechStartRef.current
        const spokenTo = lastSpeechAtRef.current
        const metrics = computeVoiceMetrics(cleaned, {
            durationMs: spokenFrom && spokenTo > spokenFrom ? spokenTo - spokenFrom : 0,
            pauses: pausesRef.current,
        })
        speechStartRef.current = 0
        lastSpeechAtRef.current = 0
        pausesRef.current = []

        // Visual metrics for this answer window. Kept client-side for now —
        // see `visualPerAnswer` for the payload a future turn request can carry.
        const visualMetrics = answerVisualRef.current.flush()
        if (visualMetrics) {
            setVisualPerAnswer((prev) => [ ...prev, { turn: prev.length + 1, ...visualMetrics } ])
        }

        stopListening()
        setLastAnswer(cleaned)
        setThinkingStuck(false)
        setError("")
        pushMessage("candidate", cleaned)
        setLiveTranscript("")
        setPhaseSafe(PHASE.THINKING)

        const stuckTimer = setTimeout(() => {
            if (answeringRef.current && phaseRef.current === PHASE.THINKING) {
                setThinkingStuck(true)
            }
        }, 18000)

        try {
            const data = await Promise.race([
                submitVoiceTurn({
                    sessionId: activeSessionId,
                    answerText: cleaned,
                    metrics,
                }),
                new Promise((_, reject) => {
                    setTimeout(() => {
                        const err = new Error("Maya is taking too long. Retry your answer.")
                        err.code = "THINKING_TIMEOUT"
                        reject(err)
                    }, TURN_TIMEOUT_MS)
                }),
            ])

            if (endingRef.current) return

            setTurnCount(data.turnCount)
            setMaxTurns(data.maxTurns)
            if (data.competencyCoverage) setCompetencyCoverage(data.competencyCoverage)
            if (data.rubricScores) setRubricScores(data.rubricScores)
            if (data.companyLabel) setCompanyLabel(data.companyLabel)
            pushMessage("interviewer", data.interviewerMessage)
            setThinkingStuck(false)
            setLastAnswer("")

            // Unlock the next answer BEFORE TTS — otherwise auto-submit / Send stay blocked
            // while Maya is still speaking the follow-up question.
            clearTimeout(stuckTimer)
            answeringRef.current = false

            if (data.isComplete) {
                await applyCompletedReport(data, activeSessionId)
                setPhaseSafe(PHASE.SPEAKING)
                await speakAndThenListen(data.interviewerMessage, { listenAfter: false })
                if (!endingRef.current) setPhaseSafe(PHASE.DONE)
            } else {
                setPhaseSafe(PHASE.SPEAKING)
                await speakAndThenListen(data.interviewerMessage, { listenAfter: true })
            }
        } catch (err) {
            console.error(err)
            const timedOut = err?.code === "THINKING_TIMEOUT" || err?.code === "ECONNABORTED"
            const msg = timedOut
                ? "Maya timed out. Tap Retry answer to send again."
                : (err?.response?.data?.message || err.message || "Failed to continue interview")
            setError(msg)
            setThinkingStuck(true)
            setPhaseSafe(PHASE.LISTENING)
            setLiveTranscript(cleaned)
            finalTranscriptRef.current = cleaned
            answeringRef.current = false
            startListening()
        } finally {
            clearTimeout(stuckTimer)
            answeringRef.current = false
        }
    }

    const handleRetryAnswer = () => {
        const answer = (lastAnswer || finalTranscriptRef.current || liveTranscript || "").trim()
        if (!answer) {
            setError("Nothing to retry — speak again, then press I'm done speaking.")
            return
        }
        setThinkingStuck(false)
        setError("")
        setMessages((prev) => {
            if (!prev.length) return prev
            const last = prev[prev.length - 1]
            if (last.role === "candidate" && last.text === answer) return prev.slice(0, -1)
            return prev
        })
        handleAnswer(answer)
    }

    const handleDoneSpeaking = () => {
        if (phase !== PHASE.LISTENING) return
        const answer = (finalTranscriptRef.current || liveTranscript).trim()
        listeningRef.current = false
        listenGenRef.current += 1
        clearSilenceTimer()
        try {
            recognitionRef.current?.stop?.()
        } catch {
            // ignore
        }
        if (isAcceptableAnswer(answer)) {
            handleAnswer(answer)
        } else {
            setError("Need a clearer answer — speak a bit more, then pause.")
            startListening()
        }
    }

    /** Re-speaks the pending question through the existing TTS path. */
    const handleRepeatQuestion = async () => {
        if (repeatingRef.current || endingRef.current) return
        if (phaseRef.current !== PHASE.LISTENING) return
        const question = [ ...messages ].reverse().find((m) => m.role === "interviewer")?.text
        if (!question) return

        repeatingRef.current = true
        const carry = (finalTranscriptRef.current || "").trim()
        stopListening()
        try {
            await speakAndThenListen(question, { listenAfter: true })
            if (carry && phaseRef.current === PHASE.LISTENING) {
                finalTranscriptRef.current = carry
                liveTextRef.current = carry
                setLiveTranscript(carry)
            }
        } finally {
            repeatingRef.current = false
        }
    }

    const handleExitInterview = () => {
        const id = sessionIdRef.current
        if (id && !endingRef.current) {
            failVoiceSession({
                sessionId: id,
                reason: "candidate_exit",
                violationCount: violationsRef.current,
            }).catch(() => {})
        }
        endingRef.current = true
        resetToSetup()
    }

    const downloadPdfReport = () => {
        const sid = report?.sessionId || sessionIdRef.current
        if (!sid) {
            setError("No finished session to export yet.")
            return
        }
        window.open(voiceReportPdfUrl(sid), "_blank", "noopener")
    }

    const downloadTranscript = () => {
        const lines = []
        lines.push(`InterviewAI — Detailed Feedback Report`)
        lines.push(`Company mode: ${companyLabel || "General"}`)
        lines.push(`Candidate: ${candidateName || "—"}`)
        lines.push(`Role: ${roleLabel || "—"}`)
        if (fieldLabel) lines.push(`Field: ${fieldLabel}`)
        if (typeof score === "number") lines.push(`Overall / Technical score: ${score}/100`)
        if (summary) {
            lines.push("")
            lines.push("Summary")
            lines.push(summary)
        }
        const rubric = report?.rubricScores || rubricScores
        if (rubric && typeof rubric === "object" && Object.keys(rubric).length) {
            lines.push("")
            lines.push("Rubric scores")
            for (const [ k, v ] of Object.entries(rubric)) {
                lines.push(`- ${k}: ${v}`)
            }
        }
        const star = report?.starScores
        if (star && typeof star === "object" && Object.keys(star).length) {
            lines.push("")
            lines.push("Communication / STAR")
            for (const [ k, v ] of Object.entries(star)) {
                lines.push(`- ${k}: ${v}`)
            }
        }
        const comps = report?.competencyCoverage || competencyCoverage
        if (Array.isArray(comps) && comps.length) {
            lines.push("")
            lines.push("Competency coverage")
            for (const c of comps) {
                lines.push(`- ${c.key || c.label || "item"}: ${c.covered ? "covered" : "weak / missing"} (depth ${c.depthScore ?? "—"})`)
            }
        }
        if (typeof report?.shallowAnswerCount === "number") {
            lines.push("")
            lines.push(`Shallow answers flagged: ${report.shallowAnswerCount}`)
        }
        if (visualLive) {
            lines.push("")
            lines.push("On-camera presence (analysed on your device only)")
            lines.push(`- Eye contact: ${visualLive.eyeContactPct}%`)
            lines.push(`- Head steadiness: ${visualLive.headStability}/100`)
            lines.push(`- In frame: ${visualLive.facePresencePct}%`)
            lines.push(`- Confidence signal: ${visualLive.confidence}/100`)
            for (const v of visualPerAnswer) {
                lines.push(`- Answer ${v.turn}: eye contact ${v.eyeContactPct}%, steadiness ${v.headStability}, confidence ${v.confidence}`)
            }
        }
        lines.push("")
        lines.push("Suggested learning path")
        lines.push("- Rehearse ownership stories with metrics (decision → trade-off → result).")
        lines.push("- Deepen 1–2 resume projects tied to the target role.")
        lines.push("- Practice company-style follow-ups (why you, why this trade-off, failure modes).")
        lines.push("")
        lines.push("Transcript")
        lines.push("")
        const transcript = report?.transcript?.length ? report.transcript : messages
        for (const m of transcript) {
            const who = m.role === "interviewer" ? "Maya" : "You"
            lines.push(`${who}: ${m.text}`)
            lines.push("")
        }
        const blob = new Blob([ lines.join("\n") ], { type: "text/plain;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `interview-transcript-${(candidateName || "candidate").replace(/\s+/g, "-").toLowerCase()}.txt`
        a.click()
        URL.revokeObjectURL(url)
    }

    const resetToSetup = () => {
        endingRef.current = false
        briefingGenRef.current += 1
        stopMicMeter()
        stopListening()
        stopSpeaking()
        stopAllMedia()
        setPhaseSafe(PHASE.RESUME)
        setResumeFile(null)
        setResumeName("")
        setBriefingHeard(false)
        setBriefingSpeaking(false)
        setMessages([])
        setSessionId(null)
        sessionIdRef.current = null
        setScore(null)
        setSummary("")
        setReport(null)
        setLastAnswer("")
        setThinkingStuck(false)
        setError("")
        setWarnBanner("")
        setPauseReason("")
        setViolations(0)
        violationsRef.current = 0
        setLiveTranscript("")
        setStartingHint("")
        setFieldLabel("")
        setCandidateName("")
        faceAnalyzerRef.current?.dispose()
        faceAnalyzerRef.current = null
        answerVisualRef.current.reset()
        sessionVisualRef.current.reset()
        setVisualLive(null)
        setVisualPerAnswer([])
        setVisualStatus("idle")
        setLiveDelivery(null)
        setSilentMs(0)
        setElapsedSec(0)
        interviewStartRef.current = 0
        liveTextRef.current = ""
        setRoleLabel(
            roles.find((r) => r.key === roleKey)?.label || "Software Engineer"
        )
        setCompanyLabel(
            playbooks.find((p) => p.companyKey === companyKey)?.shortLabel
            || playbooks.find((p) => p.companyKey === companyKey)?.name
            || "General"
        )
        setRubricScores(null)
        setCompetencyCoverage([])
        realtimeRef.current?.connect?.()
    }

    const statusLabel = {
        [ PHASE.STARTING ]: "Starting interview…",
        [ PHASE.SPEAKING ]: "Maya is speaking — you can interrupt",
        [ PHASE.LISTENING ]: "Listening — pause when finished (auto)",
        [ PHASE.THINKING ]: thinkingStuck ? "Still thinking — you can retry" : "Thinking…",
        [ PHASE.DONE ]: "Interview complete",
        [ PHASE.FAILED ]: "Integrity fail",
        [ PHASE.ERROR ]: "Something went wrong",
    }[ phase ]

    const auraState = {
        [ PHASE.STARTING ]: "starting",
        [ PHASE.SPEAKING ]: "speaking",
        [ PHASE.LISTENING ]: "listening",
        [ PHASE.THINKING ]: "thinking",
        [ PHASE.DONE ]: "done",
        [ PHASE.FAILED ]: "failed",
        [ PHASE.ERROR ]: "error",
    }[ phase ] || "idle"

    const inLiveStage = LIVE_PHASES.has(phase)
    const showResult = phase === PHASE.DONE || phase === PHASE.FAILED
    const inInterview = inLiveStage || showResult

    const auraLevel = phase === PHASE.SPEAKING
        ? Math.max(audioLevel, 0.35)
        : phase === PHASE.LISTENING
            ? Math.max(micLevel, 0.18)
            : audioLevel

    const currentQuestion = [ ...messages ].reverse().find((m) => m.role === "interviewer")?.text || ""
    const interviewerTurns = messages.filter((m) => m.role === "interviewer").length
    const questionType = phase === PHASE.STARTING
        ? "Getting started"
        : interviewerTurns <= 1
            ? "Opening question"
            : turnCount >= maxTurns
                ? "Closing question"
                : "Follow-up question"

    return (
        <main className={`voice-page ${inLiveStage ? "voice-page--live" : ""}`}>
            <header className={`voice-hero ${inLiveStage ? "voice-hero--compact" : ""}`}>
                <p className="voice-brand">InterviewAI</p>
                <h1>Voice interview with <span>Maya</span></h1>
                {!inInterview && (
                    <p className="voice-sub">
                        Resume → company → role — Maya asks questions trained on real interview patterns.
                    </p>
                )}
            </header>

            {warnBanner && inInterview && (
                <div className={`integrity-banner ${phase === PHASE.FAILED ? "integrity-banner--fail" : ""}`}>
                    <strong>Integrity</strong>
                    <span>{warnBanner}</span>
                    {violations > 0 && phase !== PHASE.FAILED && (
                        <em>Warnings: {violations}/{MAX_FOCUS_VIOLATIONS}</em>
                    )}
                    {pauseReason === "focus" && !endingRef.current && phase !== PHASE.FAILED && violations > 0 && (
                        <em className="integrity-soft-hint">Stay on this tab — interview still running.</em>
                    )}
                </div>
            )}

            {/* Screen 1 — Resume only */}
            {phase === PHASE.RESUME && (
                <section className="voice-card voice-card--resume">
                    <p className="step-label">Step 1 of 3</p>
                    <h2 className="step-title">Upload your resume</h2>
                    <p className="step-copy">PDF or DOCX. Next you&apos;ll pick company style and target role.</p>

                    <div
                        className={`dropzone dropzone--hero ${dragOver ? "dropzone--active" : ""}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault()
                            setDragOver(false)
                            onResumePicked(e.dataTransfer.files?.[0])
                        }}
                    >
                        <div className="dropzone__icon" aria-hidden>PDF</div>
                        <p className="dropzone__title">Drop your resume here</p>
                        <p className="dropzone__sub">or browse a PDF / DOCX (max 5MB)</p>
                        <label className="voice-cta dropzone__cta">
                            Choose file
                            <input
                                type="file"
                                accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
                                hidden
                                onChange={(e) => onResumePicked(e.target.files?.[0])}
                            />
                        </label>
                    </div>
                    {error && <p className="error-text">{error}</p>}
                </section>
            )}

            {/* Screen 2 — Company + Role */}
            {phase === PHASE.CONFIG && (
                <section className="voice-card voice-card--resume">
                    <p className="step-label">Step 2 of 3</p>
                    <h2 className="step-title">Company & role</h2>
                    <p className="step-copy">
                        Maya will interview in that company style for your selected role, grounded in your resume.
                    </p>
                    <p className="resume-chip">Resume: {resumeName}</p>

                    <p className="picker-label">Company style</p>
                    <div className="company-picker" role="group" aria-label="Interview company style">
                        {(playbooks.length
                            ? playbooks
                            : [
                                { companyKey: "google", shortLabel: "Google" },
                                { companyKey: "microsoft", shortLabel: "Microsoft" },
                                { companyKey: "amazon", shortLabel: "Amazon" },
                                { companyKey: "accenture", shortLabel: "Accenture" },
                                { companyKey: "startup", shortLabel: "Startup" },
                                { companyKey: "general", shortLabel: "General" },
                            ]
                        ).map((p) => (
                            <button
                                key={p.companyKey}
                                type="button"
                                className={`company-chip ${companyKey === p.companyKey ? "company-chip--active" : ""}`}
                                onClick={() => {
                                    setCompanyKey(p.companyKey)
                                    setCompanyLabel(p.shortLabel || p.name || p.companyKey)
                                }}
                            >
                                {p.shortLabel || p.name || p.companyKey}
                            </button>
                        ))}
                    </div>

                    <p className="picker-label">Target role</p>
                    <div className="company-picker role-picker" role="group" aria-label="Interview role">
                        {(roles.length ? roles : DEFAULT_ROLES).map((r) => (
                            <button
                                key={r.key}
                                type="button"
                                className={`company-chip ${roleKey === r.key ? "company-chip--active" : ""}`}
                                onClick={() => {
                                    setRoleKey(r.key)
                                    setRoleLabel(r.label)
                                }}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        className="linkish"
                        onClick={() => {
                            setResumeFile(null)
                            setResumeName("")
                            setPhaseSafe(PHASE.RESUME)
                        }}
                    >
                        Change resume
                    </button>

                    <button
                        type="button"
                        className="voice-cta voice-cta--lg"
                        onClick={() => {
                            setBriefingHeard(false)
                            setBriefingSpeaking(false)
                            setPhaseSafe(PHASE.BRIEFING)
                        }}
                    >
                        Continue to integrity check
                    </button>
                </section>
            )}

            {/* Screen 3 — Maya speaks rules first, then unlock permissions */}
            {phase === PHASE.BRIEFING && (
                <section className="voice-card voice-card--briefing">
                    <p className="step-label">Step 3 of 3</p>
                    <h2 className="step-title">Integrity check</h2>

                    <div className="briefing-aura">
                        <AgentAudioVisualizerAura
                            state={briefingSpeaking ? "speaking" : (briefingHeard ? "idle" : "starting")}
                            audioLevel={briefingSpeaking ? Math.max(audioLevel, 0.35) : audioLevel}
                            size="lg"
                            color="#1FD5F9"
                            colorShift={0.3}
                        />
                        <p className="aura-status">
                            {briefingSpeaking
                                ? "Maya is explaining the rules…"
                                : briefingHeard
                                    ? "Instructions complete — enable permissions below"
                                    : "Preparing Maya…"}
                        </p>
                    </div>

                    <div className="rules">
                        <p><strong>No cheating.</strong> Switching tabs, opening new windows, or stopping screen share will warn you — and can fail the interview.</p>
                        <p>Enable <strong>camera</strong>, <strong>microphone</strong>, and <strong>screen share</strong> to continue. Stay on this tab for the whole session.</p>
                    </div>

                    <p className="resume-chip">
                        {companyLabel} · {roleLabel} · Resume: {resumeName}
                    </p>
                    <button
                        type="button"
                        className="linkish"
                        disabled={briefingSpeaking}
                        onClick={() => {
                            briefingGenRef.current += 1
                            stopSpeaking()
                            setBriefingSpeaking(false)
                            setBriefingHeard(false)
                            setPhaseSafe(PHASE.CONFIG)
                        }}
                    >
                        Change company / role
                    </button>

                    {!briefingHeard && (
                        <p className="briefing-lock-hint">
                            {briefingSpeaking
                                ? "Listen to the instructions first — permission controls unlock when Maya finishes."
                                : "Permission controls unlock after Maya finishes speaking."}
                        </p>
                    )}

                    <div className={`perm-grid ${!briefingHeard || briefingSpeaking ? "perm-grid--locked" : ""}`}>
                        <div className="perm-card">
                            <div className="perm-preview perm-preview--cam">
                                {cameraReady ? (
                                    <video ref={cameraVideoRef} autoPlay muted playsInline />
                                ) : (
                                    <span>{briefingHeard ? "Camera off" : "Locked"}</span>
                                )}
                            </div>
                            <button
                                type="button"
                                className={`voice-cta ${cameraReady && micReady ? "voice-cta--ghost" : ""}`}
                                disabled={!briefingHeard || briefingSpeaking}
                                onClick={requestCameraAndMic}
                            >
                                {!briefingHeard || briefingSpeaking
                                    ? "Listen to instructions first"
                                    : cameraReady && micReady
                                        ? "Camera & mic on"
                                        : "Enable camera & mic"}
                            </button>
                        </div>
                        <div className="perm-card">
                            <div className="perm-preview">
                                {screenReady ? (
                                    <video ref={screenVideoRef} autoPlay muted playsInline />
                                ) : (
                                    <span>{briefingHeard ? "Screen off" : "Locked"}</span>
                                )}
                            </div>
                            <button
                                type="button"
                                className={`voice-cta ${screenReady ? "voice-cta--ghost" : ""}`}
                                disabled={!briefingHeard || briefingSpeaking}
                                onClick={requestScreenShare}
                            >
                                {!briefingHeard || briefingSpeaking
                                    ? "Listen to instructions first"
                                    : screenReady
                                        ? "Screen sharing"
                                        : "Share screen"}
                            </button>
                        </div>
                    </div>

                    {briefingHeard && (
                        <>
                            <ul className="perm-checklist">
                                <li className={cameraReady ? "ok" : ""}>Camera</li>
                                <li className={micReady ? "ok" : ""}>Microphone</li>
                                <li className={screenReady ? "ok" : ""}>Screen share</li>
                            </ul>

                            <button
                                type="button"
                                className="voice-cta voice-cta--secondary"
                                disabled={briefingSpeaking}
                                onClick={handleReplayBriefing}
                            >
                                Replay instructions
                            </button>

                            {error && <p className="error-text">{error}</p>}

                            <button className="voice-cta voice-cta--lg" disabled={!canStart} onClick={handleStart}>
                                Start interview
                            </button>
                            {!canStart && (
                                <p className="hint">Grant camera, mic, and screen share to unlock Start.</p>
                            )}
                        </>
                    )}

                    {!briefingHeard && error && <p className="error-text">{error}</p>}
                    {!briefingHeard && !briefingSpeaking && error && (
                        <button type="button" className="voice-cta voice-cta--secondary" onClick={handleReplayBriefing}>
                            Replay instructions
                        </button>
                    )}
                </section>
            )}

            {inLiveStage && (
                <LiveInterviewStage
                    statusLabel={statusLabel}
                    auraState={auraState}
                    auraLevel={auraLevel}
                    startingHint={phase === PHASE.STARTING ? startingHint : ""}
                    isSpeaking={phase === PHASE.SPEAKING}
                    isListening={phase === PHASE.LISTENING}
                    isThinking={phase === PHASE.THINKING}
                    question={currentQuestion}
                    questionType={questionType}
                    turnCount={turnCount}
                    maxTurns={maxTurns}
                    roleLabel={roleLabel}
                    companyLabel={companyLabel}
                    fieldLabel={fieldLabel}
                    candidateName={candidateName}
                    elapsedLabel={formatClock(elapsedSec)}
                    cameraReady={cameraReady}
                    screenReady={screenReady}
                    camVideoRef={stageCamRef}
                    screenVideoRef={stageScreenRef}
                    competencyCoverage={competencyCoverage}
                    violations={violations}
                    maxViolations={MAX_FOCUS_VIOLATIONS}
                    liveTranscript={liveTranscript}
                    messages={messages}
                    error={error}
                    thinkingStuck={thinkingStuck}
                    delivery={liveDelivery}
                    visual={visualLive}
                    visualStatus={visualStatus}
                    silentMs={silentMs}
                    canRepeat={phase === PHASE.LISTENING && Boolean(currentQuestion)}
                    onRepeatQuestion={handleRepeatQuestion}
                    onInterrupt={interruptMayaAndAnswer}
                    onSendNow={handleDoneSpeaking}
                    onRetry={handleRetryAnswer}
                    onExit={handleExitInterview}
                />
            )}

            {showResult && (
                <section className="voice-stage">
                    <div className="stage-aura">
                        <AgentAudioVisualizerAura
                            state={auraState}
                            audioLevel={audioLevel}
                            size="lg"
                            color="#1FD5F9"
                            colorShift={0.3}
                            themeMode="dark"
                        />
                        <p className="aura-status">{statusLabel}</p>
                        {phase === PHASE.FAILED && (
                            <span className="aura-fail-badge" role="status">Integrity failed</span>
                        )}
                    </div>

                    <div className="stage-meta-row">
                        <p className="turn-meta">
                            {[ companyLabel, candidateName, roleLabel, fieldLabel ].filter(Boolean).join(" · ")}
                            {(roleLabel || fieldLabel || companyLabel) ? " · " : ""}
                            {formatClock(elapsedSec)} · Q{Math.min(turnCount, maxTurns)}/{maxTurns}
                        </p>
                        {violations > 0 && (
                            <span className="warn-pill">Warnings {violations}/{MAX_FOCUS_VIOLATIONS}</span>
                        )}
                    </div>

                    <div className="transcript">
                        {messages.map((m, i) => (
                            <div key={i} className={`bubble bubble--${m.role}`}>
                                <strong>{m.role === "interviewer" ? "Maya" : "You"}</strong>
                                <p>{m.text}</p>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    <InterviewReportCard
                        report={report || {
                            score,
                            summary,
                            rubricScores: rubricScores || {},
                            competencyCoverage,
                            companyLabel,
                            candidateName,
                            role: roleLabel,
                            shallowAnswerCount: report?.shallowAnswerCount,
                            transcript: messages,
                        }}
                        score={score}
                        summary={summary}
                        failed={phase === PHASE.FAILED}
                        visual={visualLive}
                        onDownloadTranscript={downloadTranscript}
                        onDownloadPdf={downloadPdfReport}
                        onRestart={resetToSetup}
                    />
                </section>
            )}

            {phase === PHASE.ERROR && (
                <section className="voice-card voice-card--center">
                    <p className="error-text">{error}</p>
                    {lastAnswer && (
                        <button className="voice-cta voice-cta--secondary" onClick={handleRetryAnswer}>
                            Retry last answer
                        </button>
                    )}
                    <button className="voice-cta" onClick={resetToSetup}>
                        Try again
                    </button>
                </section>
            )}
        </main>
    )
}

export default VoiceInterview
