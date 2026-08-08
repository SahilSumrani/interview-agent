/** Filter accidental / noise / filler STT captures (English interview only) */
export function isJunkUtterance(text = "") {
    const raw = String(text || "").trim()
    if (!raw) return true

    const t = raw.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim()
    const words = t.split(" ").filter(Boolean)

    if (raw.length < 8) return true
    if (words.length < 2) return true

    const fillerOnly = /^(um+|uh+|ah+|er+|hmm+|mm+|ok|okay|yes|no|yeah|sorry|what|so|and|the|a|i|oh|hello|hi|test|testing|thanks|thank you)([\s]+(um+|uh+|ah+|ok|okay|yes|no|sorry|what|so|and|the|i|oh))*[.!?]*$/i
    if (fillerOnly.test(t)) return true

    if (words.length <= 4 && /^(so|what|sorry|is|the|a|i|am|like|just)\b/.test(t) && !hasInterviewSignal(t)) {
        return true
    }

    const unique = new Set(words)
    if (words.length >= 4 && unique.size <= 2) return true

    return false
}

function hasInterviewSignal(t) {
    return /\b(project|built|build|work|worked|experience|flutter|react|node|api|team|decision|trade|owned|implemented|designed|kafka|fcm|app|backend|frontend|database|client|feature|used|using|because|chose)\b/i.test(t)
}

/** Acceptable for auto-submit / done — keep permissive so real answers aren't blocked */
export function isAcceptableAnswer(text = "") {
    if (isJunkUtterance(text)) return false
    const words = String(text).trim().split(/\s+/).filter(Boolean)
    return words.length >= 3 || String(text).trim().length >= 18
}

export function speechLangFor() {
    return "en-US"
}

// Browser STT often strips "um"/"uh", so treat these counts as a floor, not a exact tally.
const FILLER_PATTERNS = [
    /\bum+\b/gi,
    /\buh+\b/gi,
    /\ber+\b/gi,
    /\bhmm+\b/gi,
    /\blike\b/gi,
    /\byou know\b/gi,
    /\bi mean\b/gi,
    /\bbasically\b/gi,
    /\bactually\b/gi,
    /\bliterally\b/gi,
    /\bsort of\b/gi,
    /\bkind of\b/gi,
]

/**
 * Turn one spoken answer into the numbers the report needs.
 * `pauses` is the list of silence gaps (ms) recorded between speech events.
 */
export function computeVoiceMetrics(text = "", { durationMs = 0, pauses = [] } = {}) {
    const clean = String(text || "").trim()
    const words = clean ? clean.split(/\s+/).filter(Boolean) : []
    const wordCount = words.length

    const fillerWords = []
    let fillerCount = 0
    for (const re of FILLER_PATTERNS) {
        const hits = clean.match(re)
        if (hits?.length) {
            fillerCount += hits.length
            fillerWords.push(hits[0].toLowerCase())
        }
    }

    const realPauses = (pauses || []).filter((p) => Number.isFinite(p) && p > 0)
    const avgPauseMs = realPauses.length
        ? Math.round(realPauses.reduce((a, b) => a + b, 0) / realPauses.length)
        : 0
    const longestPauseMs = realPauses.length ? Math.round(Math.max(...realPauses)) : 0

    const minutes = durationMs > 0 ? durationMs / 60000 : 0
    // Very short clips make WPM meaningless, so only report it past ~2s of speech
    const paceWpm = minutes > 0.03 ? Math.round(wordCount / minutes) : 0

    return {
        wordCount,
        durationMs: Math.round(durationMs) || 0,
        paceWpm,
        fillerCount,
        fillerWords: [...new Set(fillerWords)],
        avgPauseMs,
        longestPauseMs,
        pauseCount: realPauses.length,
    }
}
