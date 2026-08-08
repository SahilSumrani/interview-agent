const mongoose = require("mongoose")

// Delivery metrics measured in the browser for one spoken answer
const voiceMetricsSchema = new mongoose.Schema({
    wordCount: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    paceWpm: { type: Number, default: 0 },
    fillerCount: { type: Number, default: 0 },
    fillerWords: { type: [ String ], default: [] },
    avgPauseMs: { type: Number, default: 0 },
    longestPauseMs: { type: Number, default: 0 },
    pauseCount: { type: Number, default: 0 }
}, { _id: false })

// What the interviewer model thought of that answer
const answerEvalSchema = new mongoose.Schema({
    answerDepth: { type: String, default: "" },
    depthScore: { type: Number, default: 0 },
    competencyKey: { type: String, default: "" },
    starMethodUsed: { type: Boolean, default: false },
    // Deterministic classification of the answer's defect (vague / we_heavy /
    // no_metric / no_tradeoff / strong) — drives the next turn's follow-up shape.
    answerGap: { type: String, default: "" },
    gaps: { type: [ String ], default: [] }
}, { _id: false })

const messageSchema = new mongoose.Schema({
    role: { type: String, enum: [ "interviewer", "candidate" ], required: true },
    text: { type: String, required: true },
    voiceMetrics: { type: voiceMetricsSchema, default: null },
    answerEval: { type: answerEvalSchema, default: null },
    createdAt: { type: Date, default: Date.now }
}, { _id: false })

const competencyCoverageSchema = new mongoose.Schema({
    key: { type: String, required: true },
    label: { type: String, default: "" },
    covered: { type: Boolean, default: false },
    depthScore: { type: Number, default: 0 },
    notes: { type: String, default: "" }
}, { _id: false })

const violationSchema = new mongoose.Schema({
    type: { type: String, required: true },
    detail: { type: String, default: "" },
    at: { type: Date, default: Date.now }
}, { _id: false })

const voiceSessionSchema = new mongoose.Schema({
    candidateName: { type: String, default: "" },
    role: { type: String, default: "Software Engineer" },
    roleKey: { type: String, default: "general" },
    jobDescription: { type: String, default: "" },
    companyKey: {
        type: String,
        enum: [ "google", "microsoft", "amazon", "meta", "accenture", "indian_it", "startup", "general" ],
        default: "general"
    },
    playbookId: { type: mongoose.Schema.Types.ObjectId, ref: "InterviewPlaybook", default: null },
    field: {
        type: String,
        enum: [ "tech", "finance", "consulting", "product", "marketing", "healthcare", "general" ],
        default: "tech"
    },
    resumeText: { type: String, default: "" },
    // Compact structured resume extracted once at session start. Sent instead of
    // resumeText on every turn to keep Groq token usage down. Null on older
    // sessions and whenever the extraction call failed — callers fall back to
    // resumeText in that case.
    resumeDigest: { type: mongoose.Schema.Types.Mixed, default: null },
    skills: { type: [ String ], default: [] },
    skillsSummary: { type: String, default: "" },
    status: {
        type: String,
        enum: [ "active", "completed", "failed" ],
        default: "active"
    },
    failReason: { type: String, default: "" },
    violationCount: { type: Number, default: 0 },
    violations: { type: [ violationSchema ], default: [] },
    competencyCoverage: { type: [ competencyCoverageSchema ], default: [] },
    rubricScores: { type: Map, of: Number, default: {} },
    starScores: { type: Map, of: Number, default: {} },
    shallowAnswerCount: { type: Number, default: 0 },
    consecutiveShallow: { type: Number, default: 0 },
    // Escalations spent on the current story. Capped so a strong candidate still
    // covers multiple topics instead of three topics in eight turns.
    consecutiveEscalations: { type: Number, default: 0 },
    replyLanguage: {
        type: String,
        enum: [ "en" ],
        default: "en"
    },
    turnCount: { type: Number, default: 0 },
    maxTurns: { type: Number, default: 10 },
    messages: [ messageSchema ],
    summary: { type: String, default: "" },
    // Cached post-session analysis so the report LLM call runs at most once
    finalReport: { type: mongoose.Schema.Types.Mixed, default: null },
    score: { type: Number, default: null }
}, { timestamps: true })

module.exports = mongoose.model("VoiceSession", voiceSessionSchema)
