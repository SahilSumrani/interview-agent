const pdfParse = require("pdf-parse")
const mammoth = require("mammoth")
const mongoose = require("mongoose")
const voiceSessionModel = require("../models/voiceSession.model")
const {
    startVoiceInterview,
    continueVoiceInterview,
    extractResumeDigest,
    getPlaybook,
    generateVoiceSessionReport,
    generatePdfFromHtml,
    summarizeDelivery,
    ROLE_CATALOG,
} = require("../services/ai.service")
const { renderReportHtml } = require("../services/reportHtml.service")
const { listActivePlaybooks, getPlaybookByCompany } = require("../services/playbookSeed")
const { getRoleByKey } = require("../services/interviewTraining")
const { requestChatterboxAudio, TTS_PROVIDER, isChatterboxHealthy } = require("../services/chatterbox.service")
const { cacheKey, readCachedAudio, writeCachedAudio, compressForTts } = require("../services/ttsCache.service")

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"
// Flash uses fewer credits than multilingual — important on free / low quota plans
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5"

const ALLOWED_FIELDS = [ "tech", "finance", "consulting", "product", "marketing", "healthcare", "general" ]
const ALLOWED_COMPANIES = [ "google", "microsoft", "amazon", "meta", "accenture", "indian_it", "startup", "general" ]

function isDocx(file) {
    const name = String(file?.originalname || "").toLowerCase()
    const mime = String(file?.mimetype || "")
    return name.endsWith(".docx") || name.endsWith(".doc")
        || mime.includes("wordprocessingml")
        || mime === "application/msword"
}

async function parseResumeFile(file) {
    if (!file?.buffer) return ""
    if (isDocx(file)) {
        const result = await mammoth.extractRawText({ buffer: file.buffer })
        return String(result?.value || "").trim()
    }
    const parser = new pdfParse.PDFParse({ data: file.buffer })
    try {
        const resumeContent = await parser.getText()
        return String(resumeContent.text || "").trim()
    } finally {
        await parser.destroy()
    }
}

async function requestElevenLabsAudio(voiceId, text) {
    const spoken = compressForTts(text, Number(process.env.TTS_MAX_CHARS || 420))
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`
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
    const body = Buffer.from(await response.arrayBuffer())
    let errorDetail = ""
    if (!response.ok) {
        try {
            const parsed = JSON.parse(body.toString("utf8"))
            errorDetail = parsed?.detail?.message || parsed?.detail?.code || parsed?.message || ""
        } catch {
            errorDetail = body.toString("utf8").slice(0, 240)
        }
    }
    return { response, body, errorDetail, spoken }
}

async function synthesizeSpeech(req, res) {
    try {
        const text = String(req.body?.text || "").trim()
        if (!text) return res.status(400).json({ message: "text is required." })

        const preferEleven = TTS_PROVIDER === "elevenlabs" || TTS_PROVIDER === "auto" || !TTS_PROVIDER
        const preferChatterbox = TTS_PROVIDER === "chatterbox"
            || (TTS_PROVIDER === "auto" && process.env.CHATTERBOX_FALLBACK === "1")

        // ElevenLabs first — disk cache means replay / same lines cost 0 credits
        if (preferEleven && ELEVENLABS_API_KEY) {
            const spoken = compressForTts(text, Number(process.env.TTS_MAX_CHARS || 420))
            const key = cacheKey({ text: spoken, model: ELEVENLABS_MODEL, voiceId: ELEVENLABS_VOICE_ID })
            const cached = readCachedAudio(key, "mp3")
            if (cached?.length) {
                res.set({
                    "Content-Type": "audio/mpeg",
                    "Content-Length": cached.length,
                    "Cache-Control": "no-store",
                    "X-TTS-Engine": "elevenlabs-cache",
                    "X-TTS-Model": ELEVENLABS_MODEL,
                    "X-TTS-Chars": String(spoken.length),
                })
                return res.status(200).send(cached)
            }

            const { response, body, errorDetail } = await requestElevenLabsAudio(ELEVENLABS_VOICE_ID, spoken)
            if (response.ok && body?.length) {
                writeCachedAudio(key, body, "mp3")
                res.set({
                    "Content-Type": "audio/mpeg",
                    "Content-Length": body.length,
                    "Cache-Control": "no-store",
                    "X-TTS-Engine": "elevenlabs",
                    "X-TTS-Voice-Id": ELEVENLABS_VOICE_ID,
                    "X-TTS-Model": ELEVENLABS_MODEL,
                    "X-TTS-Chars": String(spoken.length),
                })
                return res.status(200).send(body)
            }
            console.error("ElevenLabs TTS error:", response.status, errorDetail || "(no detail)")
            if (TTS_PROVIDER === "elevenlabs" || !preferChatterbox) {
                const quota = /quota|credits|limit/i.test(String(errorDetail))
                return res.status(502).json({
                    message: quota
                        ? "ElevenLabs quota exceeded — check billing or lower TTS_MAX_CHARS"
                        : (errorDetail || "Voice synthesis unavailable. Please try again."),
                    code: quota ? "ELEVENLABS_QUOTA" : "ELEVENLABS_ERROR",
                })
            }
        }

        if (preferChatterbox) {
            try {
                if (await isChatterboxHealthy()) {
                    const spoken = compressForTts(text, Number(process.env.TTS_MAX_CHARS || 420))
                    const cb = await requestChatterboxAudio(spoken)
                    if (cb.response.ok && cb.body?.length) {
                        res.set({
                            "Content-Type": cb.contentType || "audio/wav",
                            "Content-Length": cb.body.length,
                            "Cache-Control": "no-store",
                            "X-TTS-Engine": "chatterbox",
                            "X-TTS-Model": cb.model || "chatterbox",
                        })
                        return res.status(200).send(cb.body)
                    }
                }
            } catch (err) {
                console.error("Chatterbox TTS exception:", err.message)
            }
        }

        return res.status(503).json({
            message: "No TTS available. Set ELEVENLABS_API_KEY in Backend/.env",
            code: "TTS_UNAVAILABLE",
        })
    } catch (err) {
        console.error("synthesizeSpeech:", err)
        return res.status(500).json({ message: err.message || "Failed to synthesize speech." })
    }
}

const normalizeKey = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "")

function applyCompetencyUpdate(session, aiTurn) {
    if (!aiTurn?.competencyKey) return
    // The model sometimes returns a label or a differently-cased key; match loosely
    // so coverage isn't silently stuck at 0.
    const wanted = normalizeKey(aiTurn.competencyKey)
    let idx = session.competencyCoverage.findIndex((c) => c.key === aiTurn.competencyKey)
    if (idx < 0) {
        idx = session.competencyCoverage.findIndex((c) => normalizeKey(c.key) === wanted
            || normalizeKey(c.label) === wanted)
    }
    const depth = typeof aiTurn.competencyDepthScore === "number" ? aiTurn.competencyDepthScore : 50
    if (idx >= 0) {
        session.competencyCoverage[idx].depthScore = Math.max(session.competencyCoverage[idx].depthScore || 0, depth)
        if (depth >= 50) session.competencyCoverage[idx].covered = true
        if (aiTurn.probeFocus) session.competencyCoverage[idx].notes = aiTurn.probeFocus
    }
}

function applyRubricScores(session, rubricScores) {
    if (!rubricScores || typeof rubricScores !== "object") return
    if (!session.rubricScores || typeof session.rubricScores.set !== "function") {
        session.rubricScores = new Map()
    }
    for (const [ key, val ] of Object.entries(rubricScores)) {
        if (typeof val === "number") session.rubricScores.set(key, val)
    }
}

function applyStarScores(session, starScores) {
    if (!starScores || typeof starScores !== "object") return
    if (!session.starScores || typeof session.starScores.set !== "function") {
        session.starScores = new Map()
    }
    for (const [ key, val ] of Object.entries(starScores)) {
        if (typeof val === "number") session.starScores.set(key, val)
    }
}

function mapToObject(mapLike) {
    if (!mapLike) return {}
    if (typeof mapLike.entries === "function") return Object.fromEntries(mapLike)
    if (typeof mapLike === "object") return { ...mapLike }
    return {}
}

function buildSessionReport(session, companyLabel = "") {
    let rubricScores = mapToObject(session.rubricScores)
    let starScores = mapToObject(session.starScores)
    const transcript = (session.messages || []).map((m) => ({
        role: m.role,
        text: m.text,
        at: m.createdAt || null,
        voiceMetrics: m.voiceMetrics || null,
        answerEval: m.answerEval || null,
    }))
    const covered = (session.competencyCoverage || []).filter((c) => c.covered).length
    const totalComp = (session.competencyCoverage || []).length

    if (!Object.keys(starScores).length && typeof session.score === "number") {
        const base = Math.max(0, Math.min(100, session.score))
        starScores = {
            situation: Math.max(0, base - 4),
            task: base,
            action: Math.max(0, base - 2),
            result: Math.max(0, base - 6),
            ownership: base,
            communication: Math.max(0, base - 3),
        }
    }

    return {
        sessionId: String(session._id),
        status: session.status,
        candidateName: session.candidateName || "",
        role: session.role || "",
        field: session.field || "",
        companyKey: session.companyKey || "general",
        companyLabel: companyLabel || session.companyKey || "General",
        score: session.score,
        summary: session.summary || "",
        turnCount: session.turnCount,
        maxTurns: session.maxTurns,
        shallowAnswerCount: session.shallowAnswerCount || 0,
        violationCount: session.violationCount || 0,
        violations: (session.violations || []).slice(-20),
        competencyCoverage: session.competencyCoverage || [],
        competencyCoveredCount: covered,
        competencyTotal: totalComp,
        rubricScores,
        starScores,
        skills: session.skills || [],
        transcript,
        // Pure arithmetic, so it stays available even if the analysis call fails
        delivery: summarizeDelivery(session.messages),
        analysis: session.finalReport || null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
    }
}

async function listRoles(_req, res) {
    try {
        res.status(200).json({
            roles: (ROLE_CATALOG || []).map((r) => ({
                key: r.key,
                label: r.label,
                field: r.field,
                focus: r.defaultFocus,
            })),
        })
    } catch (err) {
        console.error("listRoles:", err)
        res.status(500).json({ message: err.message || "Failed to list roles." })
    }
}

async function listPlaybooks(_req, res) {
    try {
        const playbooks = await listActivePlaybooks()
        res.status(200).json({
            playbooks: playbooks.map((p) => ({
                companyKey: p.companyKey,
                name: p.name,
                shortLabel: p.shortLabel,
                competencies: p.competencies,
                evaluationRubric: p.evaluationRubric,
            }))
        })
    } catch (err) {
        console.error("listPlaybooks:", err)
        res.status(500).json({ message: err.message || "Failed to list playbooks." })
    }
}

async function startSession(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "Resume PDF is required to start the interview." })
        }

        const resumeText = await parseResumeFile(req.file)
        if (!resumeText || resumeText.length < 40) {
            return res.status(400).json({
                message: "Could not read enough text from the resume. Upload a text-based PDF or DOCX."
            })
        }

        const companyKeyRaw = String(req.body?.companyKey || "general").toLowerCase()
        const companyKey = ALLOWED_COMPANIES.includes(companyKeyRaw) ? companyKeyRaw : "general"
        const roleKeyRaw = String(req.body?.roleKey || "general").toLowerCase()
        const roleMeta = getRoleByKey(roleKeyRaw)
        const roleKey = roleMeta.key
        const roleLabel = String(req.body?.roleLabel || roleMeta.label || "").trim() || roleMeta.label

        // Both are Groq calls, so run them together — the digest then costs no
        // extra wall-clock time on session start. The digest is best-effort: a
        // rate limit or bad JSON must never stop the interview from starting,
        // the turn loop just falls back to raw resume text.
        const [ aiTurn, resumeDigest ] = await Promise.all([
            startVoiceInterview({ resumeText, companyKey, roleKey, roleLabel }),
            extractResumeDigest({ resumeText }).catch((err) => {
                console.error("extractResumeDigest failed, continuing without digest:", err.message)
                return null
            }),
        ])
        const field = (aiTurn.field && ALLOWED_FIELDS.includes(aiTurn.field))
            ? aiTurn.field
            : (roleMeta.field || getPlaybook(aiTurn.role || roleLabel, resumeText.slice(0, 400)).field)

        const company = await getPlaybookByCompany(companyKey)
        const competencyCoverage = (company.competencies || []).map((c) => ({
            key: c.key,
            label: c.label,
            covered: false,
            depthScore: 0,
            notes: ""
        }))

        const session = await voiceSessionModel.create({
            candidateName: aiTurn.candidateName || "",
            role: aiTurn.role || roleLabel,
            roleKey: aiTurn.roleKey || roleKey,
            jobDescription: "",
            companyKey,
            playbookId: company._id,
            field,
            resumeText,
            resumeDigest,
            skills: aiTurn.skills || [],
            skillsSummary: aiTurn.skillsSummary || "",
            competencyCoverage,
            turnCount: 0,
            // 8 question phases + wrap-up (see getPhaseForField)
            maxTurns: 10,
            messages: [ { role: "interviewer", text: aiTurn.interviewerMessage } ]
        })

        res.status(201).json({
            sessionId: String(session._id),
            interviewerMessage: aiTurn.interviewerMessage,
            turnCount: session.turnCount,
            maxTurns: session.maxTurns,
            candidateName: session.candidateName,
            role: session.role,
            roleKey: session.roleKey,
            field,
            fieldLabel: aiTurn.fieldLabel || getPlaybook(session.role, "").label,
            companyKey: session.companyKey,
            companyLabel: aiTurn.companyLabel || company.shortLabel,
            skills: session.skills,
            skillsSummary: session.skillsSummary,
            competencyCoverage: session.competencyCoverage,
            isComplete: false
        })
    } catch (err) {
        console.error("startSession:", err)
        res.status(500).json({ message: err.message || "Failed to start voice interview." })
    }
}

function sanitizeVoiceMetrics(raw) {
    if (!raw || typeof raw !== "object") return null
    const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0)
    return {
        wordCount: num(raw.wordCount),
        durationMs: num(raw.durationMs),
        paceWpm: num(raw.paceWpm),
        fillerCount: num(raw.fillerCount),
        fillerWords: Array.isArray(raw.fillerWords)
            ? raw.fillerWords.slice(0, 12).map((w) => String(w).slice(0, 20))
            : [],
        avgPauseMs: num(raw.avgPauseMs),
        longestPauseMs: num(raw.longestPauseMs),
        pauseCount: num(raw.pauseCount),
    }
}

async function processTurn(session, answerText, voiceMetrics = null) {
    session.messages.push({
        role: "candidate",
        text: String(answerText).trim(),
        voiceMetrics: sanitizeVoiceMetrics(voiceMetrics),
    })
    const candidateMsgIndex = session.messages.length - 1
    session.turnCount += 1

    const aiTurn = await continueVoiceInterview({
        role: session.role,
        jobDescription: session.jobDescription,
        field: session.field,
        companyKey: session.companyKey,
        messages: session.messages,
        turnCount: session.turnCount,
        maxTurns: session.maxTurns,
        resumeText: session.resumeText,
        resumeDigest: session.resumeDigest || null,
        skills: session.skills,
        skillsSummary: session.skillsSummary,
        consecutiveShallow: session.consecutiveShallow || 0,
        consecutiveEscalations: session.consecutiveEscalations || 0,
        competencyCoverage: session.competencyCoverage,
        replyLanguage: "en",
        roleKey: session.roleKey || "",
    })

    session.replyLanguage = "en"

    // Once the streak forces a topic switch, restart the count so the new topic
    // gets its own dig attempts instead of being abandoned immediately.
    const MAX_CONSECUTIVE_DIGS = 2
    const wasForcedToMoveOn = (session.consecutiveShallow || 0) >= MAX_CONSECUTIVE_DIGS
    const answeredShallow = Boolean(aiTurn.wasShallow) || aiTurn.answerDepth === "shallow"

    if (answeredShallow) {
        session.shallowAnswerCount = (session.shallowAnswerCount || 0) + 1
    }
    if (wasForcedToMoveOn) {
        session.consecutiveShallow = answeredShallow ? 1 : 0
    } else if (answeredShallow) {
        session.consecutiveShallow = (session.consecutiveShallow || 0) + 1
    } else {
        session.consecutiveShallow = 0
    }

    // Escalations only stack while we stay on one story, so anything that moves
    // the interview to a new topic clears the counter and the next strong answer
    // earns its own escalation.
    session.consecutiveEscalations = aiTurn.didEscalate
        ? (session.consecutiveEscalations || 0) + 1
        : 0

    applyCompetencyUpdate(session, aiTurn)

    session.messages[candidateMsgIndex].answerEval = {
        answerDepth: aiTurn.answerDepth || "",
        depthScore: typeof aiTurn.competencyDepthScore === "number" ? aiTurn.competencyDepthScore : 0,
        competencyKey: aiTurn.competencyKey || "",
        starMethodUsed: Boolean(aiTurn.starMethodUsed),
        answerGap: aiTurn.answerGap || "",
        gaps: Array.isArray(aiTurn.gapsIdentified)
            ? aiTurn.gapsIdentified.slice(0, 4).map((g) => String(g).slice(0, 200))
            : [],
    }

    session.messages.push({ role: "interviewer", text: aiTurn.interviewerMessage })

    if (aiTurn.isComplete || session.turnCount >= session.maxTurns) {
        session.status = "completed"
        session.summary = aiTurn.summary || ""
        session.score = typeof aiTurn.score === "number" ? aiTurn.score : null
        applyRubricScores(session, aiTurn.rubricScores)
        applyStarScores(session, aiTurn.starScores)
    }

    await session.save()

    const companyLabel = session.companyKey
    const payload = {
        sessionId: String(session._id),
        interviewerMessage: aiTurn.interviewerMessage,
        turnCount: session.turnCount,
        maxTurns: session.maxTurns,
        field: session.field,
        companyKey: session.companyKey,
        isComplete: session.status === "completed",
        score: session.score,
        summary: session.summary,
        probeFocus: aiTurn.probeFocus,
        answerDepth: aiTurn.answerDepth,
        competencyCoverage: session.competencyCoverage,
        rubricScores: mapToObject(session.rubricScores),
        starScores: mapToObject(session.starScores),
        consecutiveShallow: session.consecutiveShallow,
        shallowAnswerCount: session.shallowAnswerCount || 0,
        replyLanguage: session.replyLanguage || "en",
    }

    if (session.status === "completed") {
        payload.report = buildSessionReport(session, companyLabel)
    }

    return payload
}

async function submitTurn(req, res) {
    try {
        const { sessionId } = req.params
        const { answerText, metrics } = req.body || {}

        if (!sessionId || sessionId === "null" || sessionId === "undefined" || !mongoose.isValidObjectId(sessionId)) {
            return res.status(400).json({ message: "Valid sessionId is required. Please restart the interview." })
        }
        if (!answerText || !String(answerText).trim()) {
            return res.status(400).json({ message: "answerText is required." })
        }

        const session = await voiceSessionModel.findById(sessionId)
        if (!session) return res.status(404).json({ message: "Session not found." })
        if (session.status === "completed" || session.status === "failed") {
            return res.status(400).json({
                message: session.status === "failed"
                    ? "Interview ended due to an integrity violation."
                    : "Interview already completed."
            })
        }

        const payload = await processTurn(session, answerText, metrics)
        res.status(200).json(payload)
    } catch (err) {
        console.error("submitTurn:", err)
        res.status(500).json({ message: err.message || "Failed to process answer." })
    }
}

async function failSession(req, res) {
    try {
        const { sessionId } = req.params
        const { reason = "integrity_violation", violationCount, detail = "" } = req.body || {}

        if (!sessionId || !mongoose.isValidObjectId(sessionId)) {
            return res.status(400).json({ message: "Valid sessionId is required." })
        }

        const session = await voiceSessionModel.findById(sessionId)
        if (!session) return res.status(404).json({ message: "Session not found." })

        session.violations.push({
            type: String(reason).slice(0, 80),
            detail: String(detail || reason).slice(0, 300),
            at: new Date()
        })
        if (typeof violationCount === "number") {
            session.violationCount = violationCount
        } else {
            session.violationCount = (session.violationCount || 0) + 1
        }

        if (session.status === "active") {
            const hardFail = [
                "screen_share_stopped",
                "repeated_focus_loss",
                "external_display_suspected",
                "camera_stopped"
            ].includes(reason) || session.violationCount >= 5

            if (hardFail) {
                session.status = "failed"
                session.failReason = String(reason).slice(0, 200)
                session.summary = session.summary || `Interview ended: ${session.failReason}`
                session.score = 0
            }
        }

        await session.save()

        res.status(200).json({
            sessionId: String(session._id),
            status: session.status,
            failReason: session.failReason,
            violationCount: session.violationCount,
            violations: session.violations,
            score: session.score,
            summary: session.summary
        })
    } catch (err) {
        console.error("failSession:", err)
        res.status(500).json({ message: err.message || "Failed to end session." })
    }
}

async function logViolation(req, res) {
    try {
        const { sessionId } = req.params
        const { type = "focus_loss", detail = "" } = req.body || {}
        if (!sessionId || !mongoose.isValidObjectId(sessionId)) {
            return res.status(400).json({ message: "Valid sessionId is required." })
        }
        const session = await voiceSessionModel.findById(sessionId)
        if (!session) return res.status(404).json({ message: "Session not found." })

        session.violations.push({ type: String(type).slice(0, 80), detail: String(detail).slice(0, 300), at: new Date() })
        session.violationCount = (session.violationCount || 0) + 1
        await session.save()

        res.status(200).json({
            sessionId: String(session._id),
            violationCount: session.violationCount,
            violations: session.violations.slice(-10)
        })
    } catch (err) {
        console.error("logViolation:", err)
        res.status(500).json({ message: err.message || "Failed to log violation." })
    }
}

/**
 * Runs the post-session analysis once and caches it. A failure here must never
 * block the basic report, so callers get null instead of an error.
 */
async function ensureFinalAnalysis(session, companyLabel) {
    if (session.finalReport) return session.finalReport
    if (session.status === "active") return null
    try {
        const analysis = await generateVoiceSessionReport({ session, companyLabel })
        session.finalReport = analysis
        await session.save()
        return analysis
    } catch (err) {
        console.error("generateVoiceSessionReport:", err.message)
        return null
    }
}

async function getSessionReport(req, res) {
    try {
        const { sessionId } = req.params
        if (!sessionId || !mongoose.isValidObjectId(sessionId)) {
            return res.status(400).json({ message: "Valid sessionId is required." })
        }
        const session = await voiceSessionModel.findById(sessionId)
        if (!session) return res.status(404).json({ message: "Session not found." })

        let companyLabel = session.companyKey
        try {
            const company = await getPlaybookByCompany(session.companyKey)
            companyLabel = company?.shortLabel || companyLabel
        } catch {
            // ignore
        }

        await ensureFinalAnalysis(session, companyLabel)
        res.status(200).json({ report: buildSessionReport(session, companyLabel) })
    } catch (err) {
        console.error("getSessionReport:", err)
        res.status(500).json({ message: err.message || "Failed to load report." })
    }
}

async function getSessionReportPdf(req, res) {
    try {
        const { sessionId } = req.params
        if (!sessionId || !mongoose.isValidObjectId(sessionId)) {
            return res.status(400).json({ message: "Valid sessionId is required." })
        }
        const session = await voiceSessionModel.findById(sessionId)
        if (!session) return res.status(404).json({ message: "Session not found." })

        let companyLabel = session.companyKey
        try {
            const company = await getPlaybookByCompany(session.companyKey)
            companyLabel = company?.shortLabel || companyLabel
        } catch {
            // ignore
        }

        await ensureFinalAnalysis(session, companyLabel)
        const report = buildSessionReport(session, companyLabel)
        const pdf = await generatePdfFromHtml(renderReportHtml(report), {
            printBackground: true,
            margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
        })

        const safeName = (report.candidateName || "candidate").replace(/[^a-z0-9]+/gi, "-").toLowerCase()
        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename=interview-report-${safeName}.pdf`,
        })
        return res.send(pdf)
    } catch (err) {
        console.error("getSessionReportPdf:", err)
        return res.status(500).json({ message: err.message || "Failed to build PDF report." })
    }
}

module.exports = {
    startSession,
    submitTurn,
    synthesizeSpeech,
    failSession,
    listPlaybooks,
    listRoles,
    logViolation,
    getSessionReport,
    getSessionReportPdf,
    processTurn,
    ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID,
    ELEVENLABS_MODEL,
}
