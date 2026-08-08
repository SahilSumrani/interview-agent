import React, { useEffect, useLayoutEffect, useRef, useState } from "react"
import AgentAudioVisualizerAura from "./AgentAudioVisualizerAura"

const MIN_AURA = 190
const MAX_AURA = 440

function MicIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden focusable="false">
            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
            <path d="M18 11a6 6 0 0 1-12 0M12 17v4" />
        </svg>
    )
}

function RepeatIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden focusable="false">
            <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8" />
            <path d="M20 4v4h-4" />
            <path d="M20 12a8 8 0 0 1-13.7 5.6L4 16" />
            <path d="M4 20v-4h4" />
        </svg>
    )
}

function ExitIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden focusable="false">
            <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
            <path d="M10 16l-4-4 4-4M6 12h9" />
        </svg>
    )
}

function Metric({ label, value, pct, tone = "" }) {
    return (
        <li className={`hud-metric ${tone ? `hud-metric--${tone}` : ""}`}>
            <span className="hud-metric__label">{label}</span>
            <span className="hud-metric__value">{value}</span>
            {typeof pct === "number" && (
                <span className="hud-metric__track" aria-hidden>
                    <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                </span>
            )}
        </li>
    )
}

function paceTone(wpm) {
    if (!wpm) return ""
    if (wpm < 105) return "warn"
    if (wpm > 175) return "warn"
    return "good"
}

/**
 * Live HUD — deliberately low contrast and free of motion so a candidate
 * mid-answer can ignore it completely.
 */
function LiveCoachHud({ delivery, visual, visualStatus, silentMs }) {
    const items = []

    if (visual) {
        items.push(
            <Metric
                key="eye"
                label="Eye contact"
                value={`${visual.eyeContactPct}%`}
                pct={visual.eyeContactPct}
                tone={visual.eyeContactPct >= 60 ? "good" : "warn"}
            />
        )
        items.push(
            <Metric
                key="steady"
                label="Head steady"
                value={`${visual.headStability}%`}
                pct={visual.headStability}
                tone={visual.headStability >= 65 ? "good" : "warn"}
            />
        )
        items.push(
            <Metric
                key="presence"
                label={visual.facePresencePct >= 80 ? "In frame" : "Framing"}
                value={`${visual.facePresencePct}%`}
                pct={visual.facePresencePct}
                tone={visual.facePresencePct >= 80 ? "good" : "warn"}
            />
        )
    }

    if (delivery) {
        if (delivery.paceWpm) {
            items.push(
                <Metric
                    key="pace"
                    label="Pace"
                    value={`${delivery.paceWpm} wpm`}
                    pct={Math.min(100, (delivery.paceWpm / 200) * 100)}
                    tone={paceTone(delivery.paceWpm)}
                />
            )
        }
        items.push(
            <Metric
                key="filler"
                label="Fillers"
                value={`${delivery.fillerCount}`}
                tone={delivery.fillerCount >= 4 ? "warn" : "good"}
            />
        )
        if (silentMs > 900) {
            items.push(
                <Metric key="pause" label="Pause" value={`${(silentMs / 1000).toFixed(1)}s`} tone="warn" />
            )
        }
    }

    if (!items.length) {
        return (
            <div className="live-hud live-hud--empty">
                <p>{visualStatus === "loading" ? "Warming up coach…" : "Coach ready"}</p>
            </div>
        )
    }

    return (
        <div className="live-hud">
            <p className="live-hud__title">Live coach</p>
            <ul className="live-hud__list">{items}</ul>
        </div>
    )
}

export default function LiveInterviewStage({
    statusLabel,
    auraState,
    auraLevel,
    startingHint,
    isSpeaking,
    isListening,
    isThinking,
    question,
    questionType,
    turnCount,
    maxTurns,
    roleLabel,
    companyLabel,
    fieldLabel,
    candidateName,
    elapsedLabel,
    cameraReady,
    screenReady,
    camVideoRef,
    screenVideoRef,
    competencyCoverage,
    violations,
    maxViolations,
    liveTranscript,
    messages,
    error,
    thinkingStuck,
    delivery,
    visual,
    visualStatus,
    silentMs,
    canRepeat,
    onRepeatQuestion,
    onInterrupt,
    onSendNow,
    onRetry,
    onExit,
}) {
    const panelRef = useRef(null)
    const transcriptEndRef = useRef(null)
    const [ auraPx, setAuraPx ] = useState(300)
    const [ showCriteria, setShowCriteria ] = useState(false)
    const [ exitArmed, setExitArmed ] = useState(false)
    const [ coachOn, setCoachOn ] = useState(true)

    useLayoutEffect(() => {
        const el = panelRef.current
        if (!el || typeof ResizeObserver === "undefined") return undefined
        const measure = () => {
            const { width, height } = el.getBoundingClientRect()
            const next = Math.round(Math.min(width * 0.55, height * 0.78))
            setAuraPx(Math.max(MIN_AURA, Math.min(MAX_AURA, next)))
        }
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }, [ messages, liveTranscript ])

    useEffect(() => {
        if (!exitArmed) return undefined
        const t = setTimeout(() => setExitArmed(false), 4000)
        return () => clearTimeout(t)
    }, [ exitArmed ])

    const answered = Math.min(turnCount, maxTurns)
    const progressPct = maxTurns ? Math.round((answered / maxTurns) * 100) : 0
    const questionNumber = Math.min(turnCount + 1, maxTurns)

    return (
        <section className="live-stage">
            <div className="live-stage__main">
                <div className={`stage-panel stage-panel--${auraState}`} ref={panelRef}>
                    <div className="stage-panel__aura">
                        <AgentAudioVisualizerAura
                            state={auraState}
                            audioLevel={auraLevel}
                            size={auraPx}
                            color="#1FD5F9"
                            colorShift={0.3}
                            themeMode="dark"
                        />
                    </div>

                    <div className="stage-panel__top">
                        <span className="stage-tag">
                            <i className={`stage-tag__dot stage-tag__dot--${auraState}`} aria-hidden />
                            Maya · AI interviewer
                        </span>
                        {violations > 0 && (
                            <span className="stage-tag stage-tag--warn">
                                Warnings {violations}/{maxViolations}
                            </span>
                        )}
                    </div>

                    <p className="stage-panel__status">{statusLabel}</p>
                    {startingHint && <p className="stage-panel__hint">{startingHint}</p>}

                    <span className="stage-timer">{elapsedLabel}</span>

                    {coachOn && (
                        <LiveCoachHud
                            delivery={isListening ? delivery : null}
                            visual={visual}
                            visualStatus={visualStatus}
                            silentMs={silentMs}
                        />
                    )}

                    <div className="stage-panel__cta">
                        {isSpeaking && (
                            <button type="button" className="stage-action" onClick={onInterrupt}>
                                <MicIcon />
                                Interrupt &amp; answer
                            </button>
                        )}
                        {isListening && (
                            <button type="button" className="stage-action stage-action--live" onClick={onSendNow}>
                                <span className="stage-action__pulse" aria-hidden />
                                Send answer
                            </button>
                        )}
                        {isThinking && (
                            <span className="stage-action stage-action--muted">Maya is thinking…</span>
                        )}
                        {thinkingStuck && (
                            <button type="button" className="stage-action stage-action--ghost" onClick={onRetry}>
                                Retry answer
                            </button>
                        )}
                    </div>
                </div>

                <div className="question-card">
                    <div className="question-card__head">
                        <span className="question-card__type">{questionType}</span>
                        <button
                            type="button"
                            className="repeat-btn"
                            onClick={onRepeatQuestion}
                            disabled={!canRepeat}
                            title={canRepeat ? "Play the question again" : "Available while Maya waits for your answer"}
                        >
                            <RepeatIcon />
                            Repeat question
                        </button>
                    </div>
                    <p className="question-card__text">
                        {question || "Maya is preparing your first question…"}
                    </p>
                    {isListening && (
                        <p className="question-card__hint">
                            Speak naturally — pause about 2 seconds and your answer sends automatically.
                        </p>
                    )}
                    {error && <p className="error-text">{error}</p>}
                </div>
            </div>

            <aside className="live-stage__rail">
                <div className="pip-card">
                    {cameraReady ? (
                        <video ref={camVideoRef} autoPlay muted playsInline />
                    ) : (
                        <span className="pip-card__off">Camera off</span>
                    )}
                    <span className="pip-card__badge">You</span>
                </div>

                <div className="rail-card">
                    <p className="rail-card__title">{roleLabel || "Interview"}</p>
                    <p className="rail-card__sub">
                        {[ companyLabel, fieldLabel || "Role related" ].filter(Boolean).join(" · ")}
                    </p>

                    <div className="rail-progress">
                        <div className="rail-progress__meta">
                            <span>Progress</span>
                            <strong>{progressPct}%</strong>
                        </div>
                        <div className="rail-progress__track" aria-hidden>
                            <i style={{ width: `${progressPct}%` }} />
                        </div>
                        <p className="rail-progress__count">
                            Question {questionNumber} of {maxTurns}
                            {candidateName ? ` · ${candidateName}` : ""}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="rail-link"
                        aria-expanded={showCriteria}
                        onClick={() => setShowCriteria((v) => !v)}
                    >
                        Evaluation criteria
                    </button>

                    {showCriteria && (
                        <ul className="criteria-list">
                            {competencyCoverage.length ? (
                                competencyCoverage.map((c) => (
                                    <li key={c.key || c.label} className={c.covered ? "ok" : ""}>
                                        <span>{c.label || c.key}</span>
                                        <em>{c.covered ? "covered" : "pending"}</em>
                                    </li>
                                ))
                            ) : (
                                <li>
                                    <span>Depth, ownership, trade-offs and communication</span>
                                </li>
                            )}
                        </ul>
                    )}

                    <label className="coach-toggle">
                        <input
                            type="checkbox"
                            checked={coachOn}
                            onChange={(e) => setCoachOn(e.target.checked)}
                        />
                        <span>Live coach overlay</span>
                    </label>

                    <button
                        type="button"
                        className={`rail-exit ${exitArmed ? "rail-exit--armed" : ""}`}
                        onClick={() => {
                            if (!exitArmed) {
                                setExitArmed(true)
                                return
                            }
                            setExitArmed(false)
                            onExit()
                        }}
                    >
                        <ExitIcon />
                        {exitArmed ? "Tap again to end" : "Exit interview"}
                    </button>
                </div>

                <div className="rail-card rail-card--screen">
                    <p className="rail-card__label">Screen share</p>
                    <div className="screen-preview">
                        {screenReady ? (
                            <video ref={screenVideoRef} autoPlay muted playsInline />
                        ) : (
                            <span>Not shared</span>
                        )}
                    </div>
                    <p className="rail-card__note">
                        {screenReady ? "Required for integrity — keep it running." : "Screen share stopped."}
                    </p>
                </div>
            </aside>

            <div className="stage-transcript">
                <p className="stage-transcript__title">Transcript</p>
                <div className="stage-transcript__body">
                    {messages.map((m, i) => (
                        <div key={i} className={`bubble bubble--${m.role}`}>
                            <strong>{m.role === "interviewer" ? "Maya" : "You"}</strong>
                            <p>{m.text}</p>
                        </div>
                    ))}
                    {isListening && liveTranscript && (
                        <div className="bubble bubble--candidate bubble--live">
                            <strong>You</strong>
                            <p>{liveTranscript}</p>
                        </div>
                    )}
                    <div ref={transcriptEndRef} />
                </div>
            </div>
        </section>
    )
}
