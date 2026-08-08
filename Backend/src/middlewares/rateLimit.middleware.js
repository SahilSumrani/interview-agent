const rateLimit = require("express-rate-limit")

/**
 * Abuse protection for the public (unauthenticated) voice routes.
 *
 * Every limit is env-tunable because the two things being protected — the Groq
 * free-tier daily token budget and paid ElevenLabs credits — are account
 * specific. Defaults are sized so one real 10-turn interview (1 session start,
 * ~10 turns, ~15 TTS calls plus briefing replays, 1 report, 1 PDF) never gets
 * close to tripping anything.
 */

const num = (value, fallback) => {
    const n = Number(value)
    return Number.isFinite(n) && n >= 0 ? n : fallback
}

const MINUTE = 60 * 1000
const LOCAL_IPS = new Set([ "127.0.0.1", "::1", "::ffff:127.0.0.1" ])

// Off by default: the limits below are generous enough for local dev, so
// localhost still gets exercised (and therefore actually tested). Flip to 1 if
// a load test or a scripted demo needs to bypass the limiter entirely.
const SKIP_LOCALHOST = process.env.RATE_LIMIT_SKIP_LOCALHOST === "1"

const isLocalhost = (req) => LOCAL_IPS.has(String(req.ip || "").trim())

// Preflights carry no payload and cost nothing, so they should not eat quota.
const skipRequest = (req) => req.method === "OPTIONS" || (SKIP_LOCALHOST && isLocalhost(req))

const limitReached = (code, message) => (req, res) => {
    console.warn(`Rate limit hit [${code}] ip=${req.ip} ${req.method} ${req.originalUrl}`)
    res.status(429).json({ message, code })
}

function buildLimiter({ windowMs, limit, code, message }) {
    return rateLimit({
        windowMs,
        limit,
        standardHeaders: "draft-6", // discrete RateLimit-Limit / -Remaining / -Reset headers
        legacyHeaders: false,
        skip: skipRequest,
        handler: limitReached(code, message),
    })
}

/**
 * Broad safety net across the whole API. Sized at roughly ten full interviews
 * per 15 minutes from one IP, so it only catches scripted hammering.
 */
const apiLimiter = buildLimiter({
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MINUTES, 15) * MINUTE,
    limit: num(process.env.RATE_LIMIT_MAX, 600),
    code: "RATE_LIMITED",
    message: "Too many requests. Please slow down and try again in a few minutes.",
})

/**
 * Session creation is the single most expensive endpoint: a resume upload, a
 * PDF/DOCX parse and two Groq calls (opening question + resume digest). The
 * Groq free tier only funds a handful of interviews per day anyway, so a low
 * hourly cap costs a legitimate user nothing.
 */
const sessionCreateLimiter = buildLimiter({
    windowMs: num(process.env.SESSION_RATE_LIMIT_WINDOW_MINUTES, 60) * MINUTE,
    limit: num(process.env.SESSION_RATE_LIMIT_MAX, 10),
    code: "SESSION_RATE_LIMITED",
    message: "Too many interviews started from this network. Please wait a while before starting another.",
})

/**
 * TTS spends real money per uncached character. Identical text is served from
 * the disk cache for free, so the cap only needs to cover fresh lines.
 */
const ttsLimiter = buildLimiter({
    windowMs: num(process.env.TTS_RATE_LIMIT_WINDOW_MINUTES, 15) * MINUTE,
    limit: num(process.env.TTS_RATE_LIMIT_MAX, 200),
    code: "TTS_RATE_LIMITED",
    message: "Too many voice requests. Please wait a minute before continuing.",
})

/**
 * Second line of defence for TTS: a per-IP daily character budget. Request
 * count alone does not bound spend, because one request may carry up to
 * TTS_MAX_CHARS. In-memory on purpose — a process restart resets it, which is
 * acceptable for a single-instance app and avoids a Redis dependency.
 */
const TTS_DAILY_CHAR_BUDGET = num(process.env.TTS_DAILY_CHAR_BUDGET, 60000)
const ttsCharUsage = new Map()

function ttsCharBudget(req, res, next) {
    if (!TTS_DAILY_CHAR_BUDGET || skipRequest(req)) return next()

    const today = new Date().toISOString().slice(0, 10)
    const key = `${req.ip}|${today}`
    // Yesterday's keys are dead weight; drop them on the first request of a new day.
    if (ttsCharUsage.size > 500) {
        for (const k of ttsCharUsage.keys()) {
            if (!k.endsWith(today)) ttsCharUsage.delete(k)
        }
    }

    const used = ttsCharUsage.get(key) || 0
    const chars = String(req.body?.text || "").length
    if (used + chars > TTS_DAILY_CHAR_BUDGET) {
        console.warn(`TTS daily char budget exhausted ip=${req.ip} used=${used} requested=${chars}`)
        return res.status(429).json({
            message: "Daily voice synthesis budget reached for this network. Please try again tomorrow.",
            code: "TTS_BUDGET_EXHAUSTED",
        })
    }

    ttsCharUsage.set(key, used + chars)
    res.set("X-TTS-Budget-Remaining", String(Math.max(0, TTS_DAILY_CHAR_BUDGET - used - chars)))
    next()
}

module.exports = {
    apiLimiter,
    sessionCreateLimiter,
    ttsLimiter,
    ttsCharBudget,
}
