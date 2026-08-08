/** Self-contained HTML for the printable interview report (no external assets). */

const esc = (v) => String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

const list = (items, empty = "Nothing recorded.") => {
    const arr = (Array.isArray(items) ? items : []).filter(Boolean)
    if (!arr.length) return `<p class="muted">${esc(empty)}</p>`
    return `<ul>${arr.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
}

function scoreColor(score) {
    if (score >= 75) return "#1f9d55"
    if (score >= 50) return "#c58a00"
    return "#c0392b"
}

/** Radar chart of competency depth (0-100). */
function radarChart(competencies = []) {
    const pts = competencies.filter((c) => c?.key)
    if (pts.length < 3) return ""

    // Extra width beyond the plot so long axis labels don't clip
    const w = 420
    const h = 300
    const cx = w / 2
    const cy = h / 2 + 6
    const r = 88
    const n = pts.length
    const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2
    const at = (i, radius) => [ cx + Math.cos(angle(i)) * radius, cy + Math.sin(angle(i)) * radius ]

    const rings = [ 25, 50, 75, 100 ].map((pct) => {
        const d = pts.map((_, i) => at(i, (r * pct) / 100).join(",")).join(" ")
        return `<polygon points="${d}" fill="none" stroke="#e2e6ee" stroke-width="1"/>`
    }).join("")

    const spokes = pts.map((_, i) => {
        const [ x, y ] = at(i, r)
        return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e2e6ee" stroke-width="1"/>`
    }).join("")

    const shape = pts.map((c, i) => at(i, (r * Math.max(0, Math.min(100, c.depthScore || 0))) / 100).join(",")).join(" ")

    const labels = pts.map((c, i) => {
        const [ x, y ] = at(i, r + 18)
        const anchor = Math.abs(x - cx) < 12 ? "middle" : (x > cx ? "start" : "end")
        const raw = String(c.label || c.key)
        const text = raw.length > 22 ? `${raw.slice(0, 21)}…` : raw
        return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="radar-label">${esc(text)}</text>`
        + `<text x="${x}" y="${y + 11}" text-anchor="${anchor}" class="radar-value">${Math.round(c.depthScore || 0)}</text>`
    }).join("")

    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="230">
        ${rings}${spokes}
        <polygon points="${shape}" fill="rgba(46,105,235,0.18)" stroke="#2e69eb" stroke-width="2"/>
        ${labels}
    </svg>`
}

/** Horizontal bars for STAR / rubric dimensions. */
function barGroup(title, scores = {}) {
    const entries = Object.entries(scores || {}).filter(([ , v ]) => typeof v === "number")
    if (!entries.length) return ""
    const rows = entries.map(([ key, val ]) => {
        const pct = Math.max(0, Math.min(100, val))
        return `<div class="bar-row">
            <span class="bar-label">${esc(key)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${scoreColor(pct)}"></span></span>
            <span class="bar-value">${Math.round(val)}</span>
        </div>`
    }).join("")
    return `<div class="bar-group"><h3>${esc(title)}</h3>${rows}</div>`
}

/** Speaking pace across answers. */
function paceChart(perTurnPace = []) {
    const pts = perTurnPace.filter((p) => p > 0)
    if (pts.length < 2) return ""

    const w = 460
    const h = 130
    const pad = 28
    const max = Math.max(170, ...pts)
    const min = Math.min(80, ...pts)
    const span = Math.max(1, max - min)
    const x = (i) => pad + (i * (w - pad * 2)) / (pts.length - 1)
    const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2)

    const line = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
    const dots = pts.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="#2e69eb"/>`).join("")
    // 120-150 wpm is the usual comfortable interview range
    const bandTop = y(Math.min(max, 150))
    const bandBottom = y(Math.max(min, 120))

    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="130">
        <rect x="${pad}" y="${bandTop}" width="${w - pad * 2}" height="${Math.max(0, bandBottom - bandTop)}" fill="rgba(31,157,85,0.10)"/>
        <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#d7dce6"/>
        <path d="${line}" fill="none" stroke="#2e69eb" stroke-width="2"/>
        ${dots}
        <text x="${pad}" y="14" class="chart-note">words per minute per answer (green = 120-150 comfort band)</text>
    </svg>`
}

function metricCards(delivery) {
    if (!delivery) return ""
    const cards = [
        { label: "Avg pace", value: delivery.avgPaceWpm ? `${delivery.avgPaceWpm} wpm` : "—" },
        { label: "Filler words", value: `${delivery.totalFillers || 0} (${delivery.fillersPer100Words || 0}/100w)` },
        { label: "Avg pause", value: delivery.avgPauseMs ? `${(delivery.avgPauseMs / 1000).toFixed(1)}s` : "—" },
        { label: "Longest pause", value: delivery.longestPauseMs ? `${(delivery.longestPauseMs / 1000).toFixed(1)}s` : "—" },
        { label: "Words spoken", value: String(delivery.totalWords || 0) },
    ]
    return `<div class="cards">${cards.map((c) => `
        <div class="card"><span class="card-value">${esc(c.value)}</span><span class="card-label">${esc(c.label)}</span></div>
    `).join("")}</div>`
}

function transcriptBlock(transcript = []) {
    if (!transcript.length) return ""
    const rows = transcript.map((t) => {
        const who = t.role === "interviewer" ? "Maya" : "Candidate"
        const v = t.voiceMetrics
        const e = t.answerEval
        const chips = []
        if (v?.paceWpm) chips.push(`${v.paceWpm} wpm`)
        if (v?.fillerCount) chips.push(`${v.fillerCount} fillers`)
        if (e?.answerDepth) chips.push(e.answerDepth)
        const gaps = e?.gaps?.length ? `<p class="gap">Missing: ${esc(e.gaps.join("; "))}</p>` : ""
        return `<div class="turn turn--${t.role === "interviewer" ? "q" : "a"}">
            <p class="turn-who">${who}${chips.length ? `<span class="chips">${chips.map((c) => `<span class="chip">${esc(c)}</span>`).join("")}</span>` : ""}</p>
            <p class="turn-text">${esc(t.text)}</p>
            ${gaps}
        </div>`
    }).join("")
    return `<section class="page-break"><h2>Full transcript</h2>${rows}</section>`
}

function renderReportHtml(report = {}) {
    const a = report.analysis || {}
    const delivery = report.delivery || null
    const score = typeof report.score === "number" ? report.score : null
    const date = new Date(report.updatedAt || Date.now()).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
    })

    return `<!doctype html>
<html><head><meta charset="utf-8"><title>Interview report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1b2333; background: #fff; margin: 0; font-size: 12px; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  h2 { font-size: 15px; margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #eef1f6; }
  h3 { font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: .06em; color: #61708c; }
  p { margin: 0 0 6px; }
  ul { margin: 0 0 6px; padding-left: 16px; }
  li { margin-bottom: 3px; }
  .muted { color: #8792a8; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #2e69eb; padding-bottom: 12px; }
  .sub { color: #61708c; font-size: 12px; }
  .score { text-align: right; }
  .score-num { font-size: 34px; font-weight: 700; line-height: 1; }
  .verdict { display: inline-block; margin-top: 6px; padding: 3px 10px; border-radius: 99px; background: #eef2fb; color: #2e69eb; font-weight: 600; font-size: 11px; }
  .headline { margin: 14px 0 0; padding: 10px 12px; background: #f6f8fc; border-left: 3px solid #2e69eb; font-size: 13px; }
  .two-col { display: flex; gap: 20px; align-items: flex-start; }
  .two-col > * { flex: 1; min-width: 0; }
  .cards { display: flex; gap: 8px; margin: 10px 0; }
  .card { flex: 1; background: #f6f8fc; border-radius: 6px; padding: 8px; text-align: center; }
  .card-value { display: block; font-size: 15px; font-weight: 700; }
  .card-label { display: block; font-size: 10px; color: #61708c; text-transform: uppercase; letter-spacing: .04em; }
  .bar-group { margin-bottom: 14px; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
  .bar-label { width: 96px; font-size: 11px; text-transform: capitalize; }
  .bar-track { flex: 1; height: 8px; background: #eef1f6; border-radius: 99px; overflow: hidden; }
  .bar-fill { display: block; height: 100%; border-radius: 99px; }
  .bar-value { width: 26px; text-align: right; font-size: 11px; font-weight: 600; }
  .radar-label { font-size: 9px; fill: #61708c; }
  .radar-value { font-size: 9px; fill: #1b2333; font-weight: 700; }
  .chart-note { font-size: 9px; fill: #8792a8; }
  .turn { margin-bottom: 9px; padding-left: 9px; border-left: 2px solid #eef1f6; }
  .turn--q { border-left-color: #2e69eb; }
  .turn-who { font-weight: 600; font-size: 11px; color: #61708c; margin-bottom: 1px; }
  .turn-text { margin: 0; }
  .chips { margin-left: 6px; }
  .chip { display: inline-block; background: #eef1f6; border-radius: 99px; padding: 1px 6px; font-size: 9px; font-weight: 500; margin-right: 3px; }
  .gap { color: #c0392b; font-size: 10px; margin: 2px 0 0; }
  .page-break { page-break-before: always; }
  .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #eef1f6; font-size: 10px; color: #8792a8; }
</style></head>
<body>
  <div class="header">
    <div>
      <h1>${esc(report.candidateName || "Candidate")}</h1>
      <p class="sub">${esc(report.role || "")} · ${esc(report.companyLabel || "")}-style interview · ${esc(date)}</p>
    </div>
    <div class="score">
      ${score === null ? "" : `<span class="score-num" style="color:${scoreColor(score)}">${Math.round(score)}</span><span class="sub">/100</span>`}
      ${a.recommendation ? `<div><span class="verdict">${esc(a.recommendation)}</span></div>` : ""}
    </div>
  </div>

  ${a.headline ? `<p class="headline">${esc(a.headline)}</p>` : ""}
  ${report.summary ? `<p style="margin-top:12px">${esc(report.summary)}</p>` : ""}

  <h2>Competency coverage <span class="sub">(${report.competencyCoveredCount || 0}/${report.competencyTotal || 0} covered)</span></h2>
  ${(() => {
        const radar = radarChart(report.competencyCoverage)
        const bars = `${barGroup("Rubric", report.rubricScores)}${barGroup("STAR", report.starScores)}`
        if (radar && bars) return `<div class="two-col"><div>${radar}</div><div>${bars}</div></div>`
        return radar || bars || `<p class="muted">No competency scores were recorded.</p>`
    })()}

  <h2>Delivery &amp; communication</h2>
  ${delivery ? metricCards(delivery) : `<p class="muted">No delivery metrics were captured for this session.</p>`}
  ${delivery ? paceChart(delivery.perTurnPaceWpm) : ""}
  ${a.communication_analysis ? `
    <p><strong>Pace:</strong> ${esc(a.communication_analysis.pace_verdict || "—")}</p>
    <p><strong>Fillers:</strong> ${esc(a.communication_analysis.filler_verdict || "—")}</p>
    <p><strong>Clarity:</strong> ${esc(a.communication_analysis.clarity || "—")}</p>
    <p><strong>Across the session:</strong> ${esc(a.communication_analysis.trend || "—")}</p>` : ""}

  ${a.content_analysis ? `
  <h2>Content</h2>
  <p><strong>STAR usage:</strong> ${esc(a.content_analysis.star_usage || "—")}</p>
  <p><strong>Technical depth:</strong> ${esc(a.content_analysis.technical_depth || "—")}</p>
  <p><strong>Weakest area:</strong> ${esc(a.content_analysis.weakest_area || "—")}</p>` : ""}

  ${a.resume_vs_performance ? `
  <h2>Resume vs interview</h2>
  <div class="two-col">
    <div><h3>Backed up</h3>${list(a.resume_vs_performance.claims_verified, "No claims were clearly evidenced.")}</div>
    <div><h3>Not evidenced</h3>${list(a.resume_vs_performance.claims_unverified, "Nothing flagged.")}</div>
  </div>` : ""}

  <h2>Verdict</h2>
  <div class="two-col">
    <div><h3>Strengths</h3>${list(a.strengths)}</div>
    <div><h3>Red flags</h3>${list(a.red_flags, "None raised.")}</div>
  </div>
  <h3 style="margin-top:12px">Do this next</h3>
  ${list(a.next_steps, "No follow-up actions recorded.")}

  ${report.violationCount ? `<p class="gap">Integrity: ${report.violationCount} violation(s) logged${report.status === "failed" ? " — session was auto-failed." : "."}</p>` : ""}

  ${transcriptBlock(report.transcript)}

  <p class="footer">Generated by InterviewAI · ${esc(date)} · Delivery metrics are measured in-browser and are indicative, not clinical.</p>
</body></html>`
}

module.exports = { renderReportHtml }
