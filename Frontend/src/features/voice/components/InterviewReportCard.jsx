import React, { useMemo } from "react"

function ScoreBars({ title, scores }) {
    const entries = Object.entries(scores || {}).filter(([, v ]) => typeof v === "number")
    if (!entries.length) return null
    return (
        <div className="report-section">
            <h3>{title}</h3>
            <ul className="score-bars">
                {entries.map(([ key, val ]) => (
                    <li key={key}>
                        <div className="score-bars__meta">
                            <span>{key}</span>
                            <strong>{Math.round(val)}</strong>
                        </div>
                        <div className="score-bars__track" aria-hidden>
                            <i style={{ width: `${Math.max(0, Math.min(100, val))}%` }} />
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}

function CompetencyRadar({ items }) {
    const points = useMemo(() => {
        const list = (items || []).slice(0, 6)
        if (!list.length) return null
        const cx = 80
        const cy = 80
        const r = 56
        const n = list.length
        const coords = list.map((c, i) => {
            const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / n
            const score = typeof c.depthScore === "number" ? c.depthScore : (c.covered ? 70 : 20)
            const rr = r * (Math.max(0, Math.min(100, score)) / 100)
            return {
                label: c.label || c.key,
                x: cx + rr * Math.cos(angle),
                y: cy + rr * Math.sin(angle),
                ox: cx + r * Math.cos(angle),
                oy: cy + r * Math.sin(angle),
            }
        })
        return { coords, polygon: coords.map((p) => `${p.x},${p.y}`).join(" ") }
    }, [ items ])

    if (!points) return null

    return (
        <div className="report-section report-radar">
            <h3>Competency depth</h3>
            <svg viewBox="0 0 160 160" className="radar-svg" role="img" aria-label="Competency radar">
                <circle cx="80" cy="80" r="56" className="radar-ring" />
                <circle cx="80" cy="80" r="37" className="radar-ring" />
                <circle cx="80" cy="80" r="18" className="radar-ring" />
                {points.coords.map((p) => (
                    <line key={p.label} x1="80" y1="80" x2={p.ox} y2={p.oy} className="radar-axis" />
                ))}
                <polygon points={points.polygon} className="radar-fill" />
            </svg>
            <ul className="radar-legend">
                {(items || []).slice(0, 6).map((c) => (
                    <li key={c.key || c.label} className={c.covered ? "ok" : ""}>
                        {c.label || c.key}
                        <em>{typeof c.depthScore === "number" ? Math.round(c.depthScore) : (c.covered ? 70 : 20)}</em>
                    </li>
                ))}
            </ul>
        </div>
    )
}

function DeliveryStats({ delivery }) {
    if (!delivery) return null
    const cards = [
        { label: "Avg pace", value: delivery.avgPaceWpm ? `${delivery.avgPaceWpm} wpm` : "—" },
        { label: "Fillers", value: `${delivery.totalFillers || 0}` },
        { label: "Avg pause", value: delivery.avgPauseMs ? `${(delivery.avgPauseMs / 1000).toFixed(1)}s` : "—" },
        { label: "Words", value: `${delivery.totalWords || 0}` },
    ]
    return (
        <div className="report-section">
            <h3>Delivery</h3>
            <ul className="delivery-stats">
                {cards.map((c) => (
                    <li key={c.label}>
                        <strong>{c.value}</strong>
                        <span>{c.label}</span>
                    </li>
                ))}
            </ul>
        </div>
    )
}

function PresenceStats({ visual }) {
    if (!visual?.samples) return null
    const cards = [
        { label: "Eye contact", value: `${visual.eyeContactPct}%` },
        { label: "Head steady", value: `${visual.headStability}` },
        { label: "In frame", value: `${visual.facePresencePct}%` },
        { label: "Confidence", value: `${visual.confidence}` },
    ]
    return (
        <div className="report-section">
            <h3>On-camera presence</h3>
            <ul className="delivery-stats">
                {cards.map((c) => (
                    <li key={c.label}>
                        <strong>{c.value}</strong>
                        <span>{c.label}</span>
                    </li>
                ))}
            </ul>
            <p className="presence-note">Measured on your device — no video ever left this browser.</p>
        </div>
    )
}

function Bullets({ title, items }) {
    const list = (items || []).filter(Boolean)
    if (!list.length) return null
    return (
        <div className="report-section">
            <h3>{title}</h3>
            <ul className="learning-path">
                {list.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
        </div>
    )
}

export default function InterviewReportCard({
    report,
    score,
    summary,
    failed = false,
    visual = null,
    onDownloadTranscript,
    onDownloadPdf,
    onRestart,
}) {
    const data = report || {}
    const star = data.starScores || {}
    const rubric = data.rubricScores || {}
    const comps = data.competencyCoverage || []
    const analysis = data.analysis || null

    return (
        <div className={`result report-card ${failed ? "report-card--fail" : ""}`}>
            <p className={`score ${failed ? "score--fail" : ""}`}>
                {typeof (data.score ?? score) === "number"
                    ? `Score: ${data.score ?? score}/100`
                    : failed
                        ? "Integrity fail"
                        : "Interview complete"}
            </p>

            {analysis?.recommendation && (
                <p className="verdict-chip">{analysis.recommendation}</p>
            )}

            {(analysis?.headline || data.summary || summary) && (
                <p className="summary">{analysis?.headline || data.summary || summary}</p>
            )}

            <div className="report-meta">
                {[ data.companyLabel, data.candidateName, data.role ].filter(Boolean).join(" · ")}
                {typeof data.shallowAnswerCount === "number" && (
                    <span>Shallow answers: {data.shallowAnswerCount}</span>
                )}
                {typeof data.violationCount === "number" && data.violationCount > 0 && (
                    <span>Violations: {data.violationCount}</span>
                )}
                {typeof data.competencyCoveredCount === "number" && (
                    <span>
                        Competencies: {data.competencyCoveredCount}/{data.competencyTotal || comps.length}
                    </span>
                )}
            </div>

            <ScoreBars title="STAR / communication" scores={star} />
            <ScoreBars title="Technical & rubric" scores={rubric} />
            <CompetencyRadar items={comps} />
            <DeliveryStats delivery={data.delivery} />
            <PresenceStats visual={visual || data.visual} />

            <Bullets title="Strengths" items={analysis?.strengths} />
            <Bullets title="Red flags" items={analysis?.red_flags} />

            {analysis?.next_steps?.length ? (
                <Bullets title="Do this next" items={analysis.next_steps} />
            ) : (
                <div className="report-section">
                    <h3>Suggested learning path</h3>
                    <ul className="learning-path">
                        <li>Rehearse ownership stories with metrics (decision → trade-off → result).</li>
                        <li>Deepen 1–2 resume projects tied to the target role.</li>
                        <li>Practice company-style follow-ups (why you, why this trade-off, failure modes).</li>
                    </ul>
                </div>
            )}

            <div className="report-actions">
                <button type="button" className="voice-cta voice-cta--secondary" onClick={onDownloadTranscript}>
                    Download text
                </button>
                <button type="button" className="voice-cta voice-cta--secondary" onClick={onDownloadPdf}>
                    Download PDF
                </button>
                <button type="button" className="voice-cta" onClick={onRestart}>
                    Start another interview
                </button>
            </div>
        </div>
    )
}
