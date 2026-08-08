const express = require("express")
const cookieParser = require("cookie-parser")
const cors = require("cors")
const helmet = require("helmet")
const compression = require("compression")

const { errorHandler, notFoundHandler } = require("./middlewares/errorHandler")
const {
    apiLimiter,
    sessionCreateLimiter,
    ttsLimiter,
    ttsCharBudget,
} = require("./middlewares/rateLimit.middleware")

const app = express()

// Defaults to trusting nothing: the browser talks to this process directly, so
// honouring X-Forwarded-For here would let an attacker rotate fake IPs and walk
// straight past the rate limiter. Set TRUST_PROXY_HOPS when a real reverse
// proxy (nginx, Render, Railway) actually sits in front.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS) || 0)

// contentSecurityPolicy is disabled because this process serves only JSON and
// binary downloads to a separate origin — a CSP here protects nothing and only
// risks breaking the PDF the browser opens in a new tab. CORP is relaxed to
// cross-origin so the frontend on :5173 can consume audio/PDF bytes from :3000.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
}))

// Audio and PDF bytes are already compressed; gzipping them wastes CPU and
// drops the Content-Length the TTS client relies on.
app.use(compression({
    filter: (req, res) => {
        const type = String(res.getHeader("Content-Type") || "")
        if (type.startsWith("audio/") || type === "application/pdf") return false
        return compression.filter(req, res)
    },
}))

app.use(cors({
    origin: [ "http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174" ],
    credentials: true
}))

// After CORS so 429 responses are still readable by the browser.
app.use("/api", apiLimiter)

app.use(express.json({ limit: "256kb" }))
app.use(express.urlencoded({ extended: true, limit: "256kb" }))
app.use(cookieParser())

/* require all the routes here */
const authRouter = require("./routes/auth.routes")
const interviewRouter = require("./routes/interview.routes")
const voiceRouter = require("./routes/voice.routes")

/* endpoint-specific limits, mounted ahead of the routers */
app.post("/api/voice/sessions", sessionCreateLimiter)
app.post("/api/voice/tts", ttsLimiter, ttsCharBudget)

/* using all the routes here */
app.use("/api/auth", authRouter)
app.use("/api/interview", interviewRouter)
app.use("/api/voice", voiceRouter)

app.get("/health", (_req, res) => res.status(200).json({ status: "ok", uptime: process.uptime() }))

// Pathless app.use as the catch-all — Express 5 rejects the Express 4
// app.use("*", ...) wildcard form.
app.use(notFoundHandler)
app.use(errorHandler)

module.exports = app
