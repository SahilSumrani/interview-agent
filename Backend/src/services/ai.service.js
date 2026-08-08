const Groq = require("groq-sdk")
const puppeteer = require("puppeteer")
const { getPlaybook, getPhaseForField, getPhaseHint, applyCompanyArc, PLAYBOOKS } = require("./interviewPlaybooks")
const { getPlaybookByCompany } = require("./playbookSeed")
const {
    buildTrainingBlock,
    buildTurnTrainingBlock,
    getRoleByKey,
    resolveRoleKeyFromLabel,
    ROLE_CATALOG,
} = require("./interviewTraining")
const { buildExemplarBlock } = require("./interviewQuestionBank")

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile"

async function groqJson(systemPrompt, userPrompt, { temperature = 0.55 } = {}) {
    const completion = await groq.chat.completions.create({
        model: GROQ_MODEL,
        temperature,
        response_format: { type: "json_object" },
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ]
    })
    return JSON.parse(completion.choices?.[0]?.message?.content || "{}")
}

async function generateInterviewReport({ resume, selfDescription, jobDescription }) {
    const playbook = getPlaybook("", jobDescription || selfDescription || "")
    const systemPrompt = `You are an expert interview coach for ${playbook.label} roles. Return ONLY valid JSON with matchScore, technicalQuestions, behavioralQuestions, skillGaps, preparationPlan, title.`
    return groqJson(systemPrompt, `Resume: ${resume}\nSelf: ${selfDescription}\nJD: ${jobDescription}`)
}

async function generatePdfFromHtml(htmlContent, { printBackground = false, margin } = {}) {
    const browser = await puppeteer.launch()
    try {
        const page = await browser.newPage()
        await page.setContent(htmlContent, { waitUntil: "networkidle0" })
        return await page.pdf({
            format: "A4",
            printBackground,
            margin: margin || { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
        })
    } finally {
        await browser.close()
    }
}

async function generateResumePdf({ resume, selfDescription, jobDescription }) {
    const jsonContent = await groqJson(
        `Return ONLY JSON { "html": string } for an ATS-friendly resume.`,
        `Resume: ${resume}\nSelf: ${selfDescription}\nJD: ${jobDescription}`
    )
    return generatePdfFromHtml(jsonContent.html)
}

function summarizeDelivery(messages = []) {
    const withMetrics = messages.filter((m) => m.role === "candidate" && m.voiceMetrics?.wordCount)
    if (!withMetrics.length) return null

    const total = (fn) => withMetrics.reduce((sum, m) => sum + (fn(m.voiceMetrics) || 0), 0)
    const paced = withMetrics.filter((m) => m.voiceMetrics.paceWpm > 0)
    const avgPace = paced.length
        ? Math.round(paced.reduce((s, m) => s + m.voiceMetrics.paceWpm, 0) / paced.length)
        : 0
    const withPauses = withMetrics.filter((m) => m.voiceMetrics.avgPauseMs > 0)

    return {
        answersMeasured: withMetrics.length,
        avgPaceWpm: avgPace,
        totalWords: total((v) => v.wordCount),
        totalFillers: total((v) => v.fillerCount),
        fillersPer100Words: total((v) => v.wordCount)
            ? Number(((total((v) => v.fillerCount) / total((v) => v.wordCount)) * 100).toFixed(1))
            : 0,
        avgPauseMs: withPauses.length
            ? Math.round(withPauses.reduce((s, m) => s + m.voiceMetrics.avgPauseMs, 0) / withPauses.length)
            : 0,
        longestPauseMs: Math.max(0, ...withMetrics.map((m) => m.voiceMetrics.longestPauseMs || 0)),
        perTurnPaceWpm: withMetrics.map((m) => m.voiceMetrics.paceWpm || 0),
    }
}

/**
 * One text-only Groq call after the interview ends. Kept separate from the live
 * turn loop so it never adds latency or TTS cost mid-interview.
 */
async function generateVoiceSessionReport({ session, companyLabel = "" }) {
    const delivery = summarizeDelivery(session.messages)
    const transcript = (session.messages || [])
        .map((m) => `${m.role === "interviewer" ? "Maya" : "Candidate"}: ${m.text}`)
        .join("\n")

    const perTurn = (session.messages || [])
        .filter((m) => m.role === "candidate")
        .map((m, i) => {
            const v = m.voiceMetrics
            const e = m.answerEval
            const bits = [ `A${i + 1}` ]
            if (v?.paceWpm) bits.push(`${v.paceWpm}wpm`)
            if (v?.fillerCount) bits.push(`${v.fillerCount} fillers`)
            if (e?.answerDepth) bits.push(e.answerDepth)
            if (e?.gaps?.length) bits.push(`gaps: ${e.gaps.join("; ")}`)
            return bits.join(" | ")
        })
        .join("\n")

    const competencies = (session.competencyCoverage || [])
        .map((c) => `${c.key} (${c.label}): depth ${c.depthScore}${c.covered ? ", covered" : ""}`)
        .join("\n")

    const systemPrompt = `You are a senior ${companyLabel || session.companyKey} interviewer writing the post-interview debrief for a ${session.role} candidate.
Be specific and evidence-based: cite what the candidate actually said. Never invent metrics.
Return ONLY JSON in this exact shape:
{
 "headline": string,
 "recommendation": "Strong Hire"|"Hire"|"Lean Hire"|"Lean No Hire"|"No Hire",
 "confidence": "high"|"medium"|"low",
 "communication_analysis": {"pace_verdict": string, "filler_verdict": string, "clarity": string, "trend": string},
 "content_analysis": {"star_usage": string, "technical_depth": string, "weakest_area": string},
 "resume_vs_performance": {"claims_verified": string[], "claims_unverified": string[]},
 "strengths": string[],
 "red_flags": string[],
 "next_steps": string[]
}
strengths/red_flags/next_steps: 2-4 items each, one sentence each. red_flags may be empty.
next_steps must be concrete practice actions, not generic advice.`

    const userPrompt = `Role: ${session.role} at ${companyLabel || session.companyKey}
Final score: ${session.score ?? "n/a"}
Competency coverage:
${competencies || "none recorded"}
Delivery metrics (measured in browser): ${delivery ? JSON.stringify(delivery) : "not captured"}
Per-answer notes:
${perTurn || "none"}
Resume excerpt:
${truncate(session.resumeText || "", 2500)}
Transcript:
${truncate(transcript, 6000)}`

    return groqJson(systemPrompt, userPrompt)
}

const BASE_PHASE_INSTRUCTIONS = {
    open_intro: "Ask for the two-minute self-introduction. Allowed ONCE, this turn only.",
    open_project: "Dig into ONE concrete claim. Get ownership. No generic re-intro.",
    probe_ownership: "Probe I vs we. Personal decision.",
    probe_constraints: "Trade-offs / what they would cut.",
    probe_technical: "Domain probe WITH a hard constraint.",
    probe_incident: "Something broke: first signal, first hypothesis and why it was wrong, what changed permanently.",
    probe_conflict: "Disagreement with a person. Their position, their influence, the outcome.",
    probe_failure: "A time THEY were wrong. What they believed, what corrected them, what they do differently now.",
    probe_metrics: "A metric moved the wrong way: define it, segment it, name the likeliest driver, commit to ONE action.",
    probe_fundamentals: "One core-concept check, spoken. Ask for reasoning plus an example from their own work.",
    probe_fit: "Fit: relocation, shifts, motivation for this company. Short and direct.",
    probe_judgment: "Prioritization / what they chose NOT to do.",
    wrap_up: "FINAL: feedback + score + rubricScores. isComplete=true."
}

function resolvePlaybook(role, jobDescription, field) {
    if (field && PLAYBOOKS[field]) return { field, ...PLAYBOOKS[field] }
    return getPlaybook(role, jobDescription)
}

function truncate(text, max = 6000) {
    const s = String(text || "").trim()
    return s.length <= max ? s : `${s.slice(0, max)}…`
}

const DIGEST_LIMITS = {
    skills: 14,
    experience: 5,
    projects: 6,
    shortField: 60,
    impact: 160,
    education: 180,
}

const str = (v, max) => truncate(String(v ?? "").replace(/\s+/g, " "), max).replace(/…$/, "")

/**
 * Trims whatever the model returned down to a predictable, small shape. Runs on
 * both fresh extractions and digests loaded from old DB documents, so the
 * prompt size stays bounded even if a stored digest was written by an earlier
 * (looser) version of this code.
 */
function normalizeResumeDigest(raw) {
    if (!raw || typeof raw !== "object") return null
    const L = DIGEST_LIMITS
    const digest = {
        name: str(raw.name, 80) || null,
        skills: (Array.isArray(raw.skills) ? raw.skills : [])
            .map((s) => str(s, 40)).filter(Boolean).slice(0, L.skills),
        experience: (Array.isArray(raw.experience) ? raw.experience : [])
            .filter((e) => e && typeof e === "object")
            .map((e) => ({
                role: str(e.role, L.shortField),
                company: str(e.company, L.shortField),
                duration: str(e.duration, 40),
                tech: str(Array.isArray(e.tech) ? e.tech.join(", ") : e.tech, 100),
            }))
            .filter((e) => e.role || e.company)
            .slice(0, L.experience),
        projects: (Array.isArray(raw.projects) ? raw.projects : [])
            .filter((p) => p && typeof p === "object")
            .map((p) => ({
                title: str(p.title, L.shortField),
                tech: str(Array.isArray(p.tech) ? p.tech.join(", ") : p.tech, 100),
                impact: str(p.impact, L.impact),
            }))
            .filter((p) => p.title)
            .slice(0, L.projects),
        education: str(raw.education, L.education) || null,
    }
    const hasContent = digest.skills.length || digest.experience.length || digest.projects.length
    return hasContent ? digest : null
}

/**
 * One low-temperature Groq call at session start. The result replaces the raw
 * resume text on every later turn, which is where the token bill actually is.
 */
async function extractResumeDigest({ resumeText = "" }) {
    if (!resumeText?.trim()) return null

    const systemPrompt = `You extract a compact factual digest from a resume for an interviewer to use later.
Return ONLY valid JSON in exactly this shape:
{"name":string|null,"skills":string[],"experience":[{"role":string,"company":string,"duration":string,"tech":string}],"projects":[{"title":string,"tech":string,"impact":string}],"education":string|null}
HARD RULES:
1) Copy only what the resume actually states. NEVER invent, infer, embellish or guess a name, company, metric, date or technology.
2) If something is missing, use an empty array or null. Do not write "N/A", "unknown" or placeholder text.
3) "impact" = ONE short factual line (max 25 words). If the resume states a metric (%, latency, users, revenue, count), include that exact metric. If it states no metric, describe what the project did — do not fabricate a number.
4) "tech" = comma-separated technologies named in the resume for that item only.
5) "projects" should also include concrete achievements described under experience or education (a system rolled out, a platform built, an event delivered) — anything an interviewer could ask "walk me through that". Prefer items that state an outcome or metric.
6) Max ${DIGEST_LIMITS.projects} projects and max ${DIGEST_LIMITS.experience} experience entries — keep the most substantial ones. Max ${DIGEST_LIMITS.skills} skills, most relevant first.
7) Be terse. No prose, no summaries, no marketing adjectives.`

    const raw = await groqJson(systemPrompt, `Resume:\n${truncate(resumeText, 7000)}`, { temperature: 0.1 })
    return normalizeResumeDigest(raw)
}

function digestContextBlock(digest) {
    const parts = [ "CANDIDATE RESUME DIGEST (extracted from the resume — treat as factual, do not invent beyond it):" ]
    if (digest.name) parts.push(`Name: ${digest.name}`)
    if (digest.skills.length) parts.push(`Skills: ${digest.skills.join(", ")}`)
    if (digest.experience.length) {
        parts.push("Experience:")
        for (const e of digest.experience) {
            const head = [ e.role, e.company ].filter(Boolean).join(" @ ")
            parts.push(`- ${head}${e.duration ? ` (${e.duration})` : ""}${e.tech ? ` — ${e.tech}` : ""}`)
        }
    }
    if (digest.projects.length) {
        parts.push("Projects:")
        for (const p of digest.projects) {
            parts.push(`- ${p.title}${p.tech ? ` [${p.tech}]` : ""}${p.impact ? ` — ${p.impact}` : ""}`)
        }
    }
    if (digest.education) parts.push(`Education: ${digest.education}`)
    return parts.join("\n")
}

function resumeContextBlock({ resumeText, skills, skillsSummary, resumeDigest = null }) {
    const skillList = Array.isArray(skills) ? skills.filter(Boolean) : []
    const digest = normalizeResumeDigest(resumeDigest)
    const parts = []
    if (skillsSummary) parts.push(`Skills summary: ${skillsSummary}`)
    // The digest already carries the skill list, so avoid printing it twice.
    if (skillList.length && !digest) parts.push(`Claimed skills: ${skillList.join(", ")}`)
    if (digest) {
        parts.push(digestContextBlock(digest))
    } else if (resumeText) {
        parts.push(`Resume excerpt:\n${truncate(resumeText, 5500)}`)
    }
    return parts.join("\n") || "No resume provided."
}

// A 10-second spoken answer runs about 130 characters, so the previous 80-char
// floor treated genuinely thin answers as adequate. Digs are capped elsewhere,
// so raising this cannot trap the interview on one story.
const SHALLOW_MIN_CHARS = 140

const VAGUE_WORDS = /\b(basically|just|stuff|things|etc|various|somehow|kind of|sort of|and all|all that)\b/i
const METRIC_RE = /\b\d+(?:[.,]\d+)?\s*(?:%|percent|x|k|m|bn|ms|milliseconds?|s\b|secs?|seconds?|mins?|minutes?|hours?|hrs?|days?|weeks?|months?|years?|users?|customers?|students?|requests?|rps|qps|queries|rows|records|tickets?|calls?|crore|lakh|rupees?|inr|usd|dollars?|gb|mb|tb|fps|bugs?)\b/i
const TRADEOFF_RE = /\b(trade[- ]?off|instead of|rather than|as opposed to|versus|vs\.?|alternative|considered|we considered|i considered|decided against|ruled out|downside|cost us|at the cost of|compromise|chose .* over|why not)\b/i

/**
 * Names the specific defect in an answer so the next probe can be derived from
 * it. A generic "that was shallow" prompt produces a generic follow-up; naming
 * the gap is what lets the follow-up ladder pick a sharp one.
 */
function classifyAnswerGap(text = "", threshold = SHALLOW_MIN_CHARS) {
    const t = String(text || "").trim()
    if (!t) return "vague"
    if (t.length < threshold) return "vague"

    const words = t.split(/\s+/).filter(Boolean)
    if (words.length < 25) return "vague"
    if (VAGUE_WORDS.test(t) && t.length < 260) return "vague"

    const lower = t.toLowerCase()
    const weCount = (lower.match(/\b(we|our|us)\b/g) || []).length
    const iCount = (lower.match(/\b(i|my|mine)\b/g) || []).length
    // The old check demanded zero "i" in the transcript, which no spoken answer
    // satisfies, so we-heavy probing never fired. A ratio catches the real case:
    // a candidate hiding behind the team while still saying "I" once or twice.
    if (weCount >= 3 && weCount >= iCount * 1.5) return "we_heavy"

    if (!METRIC_RE.test(t)) return "no_metric"
    if (!TRADEOFF_RE.test(t)) return "no_tradeoff"
    return "strong"
}

function isShallowAnswer(text = "", threshold = SHALLOW_MIN_CHARS) {
    const gap = classifyAnswerGap(text, threshold)
    return gap === "vague" || gap === "we_heavy"
}

const NON_PROFESSIONAL_ROLE = /\b(intern|internship|trainee|apprentice|student|volunteer|freelance project|summer)\b/i

/**
 * Turns a duration string from the resume digest into months. Handles both the
 * "2 years 3 months" form and the "Jun 2023 - Present" range form.
 */
function parseDurationMonths(raw = "") {
    const s = String(raw || "").toLowerCase().trim()
    if (!s) return 0

    const yearMatch = s.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?|y\b)/)
    const monthMatch = s.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:months?|mos?|mths?)/)
    if (yearMatch || monthMatch) {
        return Math.round((Number(yearMatch?.[1] || 0) * 12) + Number(monthMatch?.[1] || 0))
    }

    const MONTHS = [ "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec" ]
    const point = (chunk) => {
        if (/present|current|now|till date|ongoing/.test(chunk)) {
            const now = new Date()
            return (now.getFullYear() * 12) + now.getMonth()
        }
        const year = chunk.match(/(19|20)\d{2}/)
        if (!year) return null
        const monthIdx = MONTHS.findIndex((m) => chunk.includes(m))
        return (Number(year[0]) * 12) + (monthIdx >= 0 ? monthIdx : 0)
    }

    const parts = s.split(/\s*(?:-|–|—|to)\s*/).filter(Boolean)
    if (parts.length >= 2) {
        const from = point(parts[0])
        const to = point(parts[parts.length - 1])
        if (from !== null && to !== null && to >= from) return to - from + 1
    }
    return 0
}

/**
 * Reads seniority off the resume digest so phase hints stop asking a final-year
 * student about workplace politics. Internships and student roles are excluded
 * from the total — they are real experience but they do not give a candidate the
 * kind of stories the experienced hints assume.
 *
 * Digest extraction is best-effort (it can fail on a Groq rate limit), and with
 * no digest we cannot tell a graduate from a director. In that case we return
 * "experienced", which is exactly how the system behaved before this existed.
 */
function detectSeniority(resumeDigest) {
    const digest = normalizeResumeDigest(resumeDigest)
    if (!digest) return "experienced"

    const entries = digest.experience || []
    if (!entries.length) return "fresher"

    const professional = entries.filter((e) => !NON_PROFESSIONAL_ROLE.test(`${e.role} ${e.company}`))
    if (!professional.length) return "fresher"

    const months = professional.reduce((sum, e) => sum + parseDurationMonths(e.duration), 0)
    // A professional entry with an unparseable duration still means employment;
    // assume a conservative year each so a missing date does not read as fresher.
    const assumed = professional.filter((e) => !parseDurationMonths(e.duration)).length * 12
    const total = months + assumed

    if (total < 6) return "fresher"
    if (total < 30) return "early_career"
    return "experienced"
}

const SENIORITY_PROFILE = {
    fresher: "CANDIDATE PROFILE: fresher — no full-time industry experience. Ground every question in college projects, internships, hackathons or self-built work. Do NOT ask about workplace politics, direct reports, or company-level decisions. Fundamentals are fair game even outside their project.",
    early_career: "CANDIDATE PROFILE: early career (under ~2 years). Expect team-level scope, not org-level. Probe their own slice deeply.",
    experienced: "",
}

const ALLOWED_FIELDS = ["tech", "finance", "consulting", "product", "marketing", "healthcare", "general"]

async function startVoiceInterview({ resumeText = "", companyKey = "general", roleKey = "", roleLabel = "" }) {
    const company = await getPlaybookByCompany(companyKey || "general")
    const selectedRole = roleKey
        ? getRoleByKey(roleKey)
        : getRoleByKey(resolveRoleKeyFromLabel(roleLabel))
    const chosenRoleLabel = roleLabel || selectedRole.label
    const chosenField = selectedRole.field || "tech"
    const training = buildTrainingBlock({
        companyKey: company.companyKey,
        roleKey: selectedRole.key,
        roleLabel: chosenRoleLabel,
        skills: [],
    })

    if (!resumeText?.trim()) {
        const playbook = resolvePlaybook(chosenRoleLabel, "", chosenField)
        return {
            candidateName: "",
            role: chosenRoleLabel,
            roleKey: selectedRole.key,
            interviewerMessage: (company.openingTemplate || playbook.opening(chosenRoleLabel)).replace(/\{name\}/gi, "there"),
            field: playbook.field,
            fieldLabel: playbook.label,
            companyKey: company.companyKey,
            companyLabel: company.shortLabel,
            playbookId: company._id,
            competencies: company.competencies || [],
            skills: [],
            skillsSummary: "",
            isComplete: false,
            score: null,
            summary: ""
        }
    }

    const systemPrompt = `You are Maya starting a ${company.shortLabel}-style live voice interview for role: ${chosenRoleLabel}.
${company.personaPrompt}
${training}
Use the SELECTED ROLE (do not invent a different role). Infer name + skills from resume. Return ONLY JSON:
{"candidateName":string,"role":string,"field":"tech"|"finance"|"consulting"|"product"|"marketing"|"healthcare"|"general","skillsSummary":string,"skills":string[],"interviewerMessage":string,"openingProjectHint":string}
Opening must:
1) Greet briefly as Maya in ${company.shortLabel} style
${company.companyKey === "indian_it"
        ? `2) Ask for the two-minute self-introduction — in this loop that genuinely IS the opener
3) Keep it to 2 short speakable sentences. Every LATER question will be resume-grounded, but this one is the allowed exception.`
        : `2) Reference ONE concrete resume project/skill relevant to ${chosenRoleLabel}
3) Ask a single deep STAR/ownership question (speakable, 2 short sentences)
Do not ask generic "tell me about yourself".`}`

    try {
        const result = await groqJson(
            systemPrompt,
            `Company: ${company.name}\nSelected role: ${chosenRoleLabel} (${selectedRole.key})\nRole focus: ${selectedRole.defaultFocus}\nResume:\n${truncate(resumeText, 7000)}`
        )
        const role = chosenRoleLabel
        const field = ALLOWED_FIELDS.includes(result.field) ? result.field : chosenField
        const fieldPlaybook = resolvePlaybook(role, "", field)
        const skills = (Array.isArray(result.skills) ? result.skills.map(String).filter(Boolean) : []).slice(0, 16)
        const candidateName = String(result.candidateName || "").trim().slice(0, 80)
        return {
            candidateName,
            role,
            roleKey: selectedRole.key,
            interviewerMessage: result.interviewerMessage || (company.openingTemplate || "").replace(/\{name\}/gi, candidateName || "there"),
            field: fieldPlaybook.field,
            fieldLabel: fieldPlaybook.label,
            companyKey: company.companyKey,
            companyLabel: company.shortLabel,
            playbookId: company._id,
            competencies: company.competencies || [],
            skills,
            skillsSummary: result.skillsSummary || skills.slice(0, 6).join(", "),
            isComplete: false,
            score: null,
            summary: ""
        }
    } catch (err) {
        console.error("startVoiceInterview Groq error:", err.message)
        const playbook = resolvePlaybook(chosenRoleLabel, resumeText.slice(0, 500), chosenField)
        return {
            candidateName: "",
            role: chosenRoleLabel,
            roleKey: selectedRole.key,
            interviewerMessage: (company.openingTemplate || "Hi, I'm Maya. Walk me through a project you owned.").replace(/\{name\}/gi, "there"),
            field: playbook.field,
            fieldLabel: playbook.label,
            companyKey: company.companyKey,
            companyLabel: company.shortLabel,
            playbookId: company._id,
            competencies: company.competencies || [],
            skills: [],
            skillsSummary: "",
            isComplete: false,
            score: null,
            summary: ""
        }
    }
}

function detectReplyLanguageFromText() {
    return "en"
}

const MAX_ESCALATIONS_PER_STORY = 1

async function continueVoiceInterview({
    role, jobDescription, field, companyKey = "general", messages, turnCount, maxTurns,
    resumeText = "", skills = [], skillsSummary = "", consecutiveShallow = 0, competencyCoverage = [],
    replyLanguage = "en", roleKey = "", resumeDigest = null, consecutiveEscalations = 0
}) {
    const company = await getPlaybookByCompany(companyKey || "general")
    const selectedRole = roleKey
        ? getRoleByKey(roleKey)
        : getRoleByKey(resolveRoleKeyFromLabel(role))
    const playbook = applyCompanyArc(
        resolvePlaybook(role, jobDescription, field || selectedRole.field),
        company.companyKey
    )
    const history = messages.map((m) => `${m.role === "interviewer" ? "Interviewer" : "Candidate"}: ${m.text}`).join("\n")
    const candidateTurns = messages.filter((m) => m.role === "candidate")
    const lastCandidate = candidateTurns[candidateTurns.length - 1]
    const shallowThreshold = Math.max(SHALLOW_MIN_CHARS, Number(company.adaptiveRules?.shallowThresholdChars) || 0)
    const answerGap = classifyAnswerGap(lastCandidate?.text || "", shallowThreshold)
    const shallow = answerGap === "vague" || answerGap === "we_heavy"
    // The model already names what each answer was missing; that used to be
    // stored and never read back. Feeding the previous turn's gaps forward is
    // what stops the next question being generic.
    const priorGaps = (candidateTurns[candidateTurns.length - 2]?.answerEval?.gaps || [])
        .filter(Boolean).slice(0, 2)
    const seniority = detectSeniority(resumeDigest)
    // Cap digging on one story, otherwise a single weak answer keeps the whole
    // interview on that topic and the other competencies never get covered.
    const MAX_CONSECUTIVE_DIGS = Number(company.adaptiveRules?.maxConsecutiveDigs || 2)
    const mustMoveOn = consecutiveShallow >= MAX_CONSECUTIVE_DIGS
    const forceDig = !mustMoveOn && (shallow || consecutiveShallow > 0)
    const phase = getPhaseForField(playbook, turnCount, maxTurns)
    const shouldWrapUp = phase === "wrap_up"
    // A strong answer is where a rehearsed story breaks, so it earns one more
    // question rather than a topic change. Ranked below the shallow logic so it
    // can never fight the dig cap, and capped itself so a strong candidate still
    // covers the arc instead of three topics in eight turns.
    const escalate = !shouldWrapUp && !mustMoveOn && !forceDig
        && answerGap === "strong"
        && consecutiveEscalations < MAX_ESCALATIONS_PER_STORY
    const fieldHint = getPhaseHint(playbook, phase, seniority)
    const skillList = Array.isArray(skills) ? skills.filter(Boolean) : []
    const uncoveredList = (competencyCoverage || []).filter((c) => !c.covered)
    const uncovered = uncoveredList.map((c) => c.key).slice(0, 4)
    const targetCompetency = uncoveredList[0] || null
    const competencyKeys = (competencyCoverage || []).map((c) => c.key).filter(Boolean)
    const allowedCompetencyKeys = competencyKeys.length
        ? competencyKeys
        : (company.competencies || []).map((c) => c.key).filter(Boolean)
    const rubricDims = (company.evaluationRubric || []).map((r) => r.dimension)
    // The full training block duplicates the company persona almost line for
    // line. It runs once at session start; per turn only the role focus and the
    // unverified skill claims carry new information.
    const training = buildTurnTrainingBlock({
        roleKey: selectedRole.key,
        roleLabel: role || selectedRole.label,
        skills: skillList,
    })
    const exemplars = buildExemplarBlock({
        companyKey: company.companyKey,
        phase,
        turnCount,
        gapType: escalate ? "strong" : (shouldWrapUp ? "" : answerGap),
        seniority,
    })

    const systemPrompt = `You are Maya in a live English voice interview.
COMPANY (${company.shortLabel}):
${company.personaPrompt}
SELECTED ROLE: ${role || selectedRole.label} (${selectedRole.key}) — ${selectedRole.defaultFocus}
Field: ${playbook.label}. Focus: ${playbook.scoringFocus}.
${training}
${SENIORITY_PROFILE[seniority] || ""}
LANGUAGE: English only.
CRITICAL: Every question MUST reference a concrete resume project, skill, or claim when available.${phase === "open_intro" ? " This turn is the ONE allowed self-introduction — ask it, then never ask a generic question again." : " Never ask generic \"tell me about yourself\"."}
Return ONLY JSON:
{"interviewerMessage":string,"isComplete":boolean,"score":number|null,"summary":string,"probeFocus":string,"answerDepth":"shallow"|"adequate"|"deep","competencyKey":string|null,"competencyDepthScore":number,"starMethodUsed":boolean,"gapsIdentified":string[],"rubricScores":object,"starScores":{"situation":number,"task":number,"action":number,"result":number,"ownership":number,"communication":number}}
gapsIdentified: at most 2 short phrases naming what the LAST answer was missing (e.g. "no metrics", "no failure handling"). Empty array if nothing material was missing.
LAST ANSWER READ AS: ${shouldWrapUp ? "n/a" : answerGap}${priorGaps.length ? ` | earlier gaps still unaddressed: ${priorGaps.join("; ")}` : ""}
ADAPTIVE: ${shouldWrapUp
        ? "Final turn — do not open a new probe. Close the interview, score it, and summarise."
        : mustMoveOn
            ? "This story has already been probed twice without a sharp answer. Do NOT ask about it again — switch to a DIFFERENT resume project/skill or the next phase topic, and record the gap through a low competencyDepthScore instead of re-asking."
            : forceDig
                ? `Last answer was shallow — stay on the SAME story with ONE sharper probe (dig ${consecutiveShallow + 1} of ${MAX_CONSECUTIVE_DIGS}). Target the named gap above.`
                : escalate
                    ? "Last answer was STRONG — do not reward it with a topic change. Stay on the SAME story and escalate once: why they rejected the obvious alternative, what they would do differently, or what broke after it shipped."
                    : "Last answer was adequate — move forward to the next topic."}
competencyKey MUST be exactly one of: ${allowedCompetencyKeys.join(", ") || "null"} — or null if none fits. Never invent a key or use the label.
Speak 1-2 very short sentences for voice (max ~60 words) to save TTS credits.
CRITICAL for voice length: Prefer one crisp question. No long preambles.
PHASE ${phase}: ${BASE_PHASE_INSTRUCTIONS[phase] || BASE_PHASE_INSTRUCTIONS.probe_technical}
${fieldHint}
${exemplars}
Uncovered competencies: ${uncovered.join(", ") || "any"}
${targetCompetency && !shouldWrapUp
        ? `TARGET THIS TURN: probe "${targetCompetency.label || targetCompetency.key}" (${targetCompetency.key}) and set competencyKey to "${targetCompetency.key}".`
        : ""}
NO REPEATS: Read the conversation. Never re-ask a question already asked, even reworded — each turn must open a new angle, project, or competency.
Wrap rubric dims: ${rubricDims.join(", ") || "ownership,depth,judgment,communication"}
On wrap-up: fill score 0-100, English summary (2-4 sentences), rubricScores, and starScores (each 0-100).`

    const userPrompt = `Company: ${company.name}
Role: ${role || selectedRole.label}
Shallow streak: ${consecutiveShallow}
${resumeContextBlock({ resumeText, skills: skillList, skillsSummary, resumeDigest })}
Turn: ${turnCount}/${maxTurns}
${shouldWrapUp
        ? "WRAP UP NOW."
        : mustMoveOn
            ? "MOVE ON — ask about a NEW resume project or an uncovered competency."
            : forceDig
                ? "ADAPTIVE DIG."
                : escalate
                    ? "ESCALATE on the same story — one harder question, not a new topic."
                    : "Ask ONE company+role-aligned probe grounded in resume."}
Conversation:
${history}`

    try {
        const result = await groqJson(systemPrompt, userPrompt)
        const answerDepth = result.answerDepth || (shallow ? "shallow" : "adequate")
        return {
            interviewerMessage: result.interviewerMessage || "What did YOU personally decide on that resume project, and what was the measurable result?",
            isComplete: Boolean(result.isComplete) || shouldWrapUp,
            score: typeof result.score === "number" ? result.score : (shouldWrapUp ? 70 : null),
            summary: result.summary || "",
            field: playbook.field,
            companyKey: company.companyKey,
            probeFocus: result.probeFocus || (forceDig ? "adaptive_dig" : "ownership"),
            answerDepth,
            competencyKey: result.competencyKey || null,
            competencyDepthScore: typeof result.competencyDepthScore === "number" ? result.competencyDepthScore : (answerDepth === "deep" ? 80 : answerDepth === "adequate" ? 55 : 25),
            starMethodUsed: Boolean(result.starMethodUsed),
            gapsIdentified: Array.isArray(result.gapsIdentified) ? result.gapsIdentified : [],
            rubricScores: result.rubricScores && typeof result.rubricScores === "object" ? result.rubricScores : null,
            starScores: result.starScores && typeof result.starScores === "object" ? result.starScores : null,
            replyLanguage: "en",
            wasShallow: shallow,
            answerGap,
            didEscalate: escalate
        }
    } catch (err) {
        console.error("continueVoiceInterview Groq error:", err.message)
        if (shouldWrapUp) {
            return {
                interviewerMessage: `Thanks for your time. For ${company.shortLabel}-style interviews, tighten ownership and measurable results tied to your ${role || selectedRole.label} work.`,
                isComplete: true, score: 68, summary: `Fallback wrap-up for ${company.companyKey}.`,
                field: playbook.field, companyKey: company.companyKey, wasShallow: shallow, rubricScores: null,
                replyLanguage: "en"
            }
        }
        // Rotate the offline probes so an API outage doesn't make Maya repeat
        // the exact same sentence every turn.
        const OFFLINE_PROBES = [
            "Be specific — which resume project decision did you own, and what trade-off came with it?",
            "Pick a different project from your resume: what constraint made it hard, and how did you work around it?",
            "Tell me about a disagreement on one of those projects — what was your position, and how was it resolved?",
            "What did you choose NOT to build on that project, and what convinced you it was the right call?",
            "Which number on your resume are you proudest of, and how exactly did you measure it?",
        ]
        return {
            interviewerMessage: mustMoveOn
                ? "Let's switch — pick a different project from your resume and tell me the toughest call you personally made on it."
                : forceDig
                    ? "That stayed high-level — on that resume project, what did YOU personally decide, and what measurable result followed?"
                    : OFFLINE_PROBES[Math.max(0, turnCount - 1) % OFFLINE_PROBES.length],
            isComplete: false, score: null, summary: "",
            field: playbook.field, companyKey: company.companyKey, probeFocus: "adaptive_dig",
            answerDepth: shallow ? "shallow" : "adequate", wasShallow: shallow,
            competencyKey: uncovered[0] || null, competencyDepthScore: 30, rubricScores: null,
            replyLanguage: "en", answerGap, didEscalate: false
        }
    }
}

module.exports = {
    generateInterviewReport, generateResumePdf, generatePdfFromHtml, generateVoiceSessionReport, summarizeDelivery,
    startVoiceInterview, continueVoiceInterview, getPlaybook, isShallowAnswer, detectReplyLanguageFromText, ROLE_CATALOG,
    extractResumeDigest, resumeContextBlock, classifyAnswerGap, detectSeniority, parseDurationMonths
}
