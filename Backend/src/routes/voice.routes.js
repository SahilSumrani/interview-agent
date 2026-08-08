const express = require("express")
const voiceController = require("../controllers/voice.controller")
const upload = require("../middlewares/file.middleware")

const voiceRouter = express.Router()

/**
 * @route POST /api/voice/sessions
 * @description Start a public voice interview with resume PDF (no login)
 */
voiceRouter.post("/sessions", (req, res, next) => {
    upload.single("resume")(req, res, (err) => {
        if (err) {
            return res.status(400).json({ message: err.message || "File upload failed." })
        }
        next()
    })
}, voiceController.startSession)

/**
 * @route GET /api/voice/playbooks
 * @description List company interview playbooks (Google / Microsoft / Accenture / General)
 */
voiceRouter.get("/playbooks", voiceController.listPlaybooks)
voiceRouter.get("/roles", voiceController.listRoles)

/**
 * @route POST /api/voice/sessions/:sessionId/turn
 * @description Submit candidate spoken answer as text
 */
voiceRouter.post("/sessions/:sessionId/turn", voiceController.submitTurn)

/**
 * @route POST /api/voice/sessions/:sessionId/fail
 * @description Mark session failed due to anti-cheat (screen share / focus)
 */
voiceRouter.post("/sessions/:sessionId/fail", voiceController.failSession)

/**
 * @route POST /api/voice/sessions/:sessionId/violations
 * @description Log an integrity violation without necessarily failing
 */
voiceRouter.post("/sessions/:sessionId/violations", voiceController.logViolation)

/**
 * @route GET /api/voice/sessions/:sessionId/report
 * @description Full interview report (scores, STAR, transcript)
 */
voiceRouter.get("/sessions/:sessionId/report", voiceController.getSessionReport)

/**
 * @route GET /api/voice/sessions/:sessionId/report.pdf
 * @description Printable PDF report with charts and per-answer metrics
 */
voiceRouter.get("/sessions/:sessionId/report.pdf", voiceController.getSessionReportPdf)

/**
 * @route POST /api/voice/tts
 * @description Proxy ElevenLabs TTS so the API key stays on the server
 */
voiceRouter.post("/tts", voiceController.synthesizeSpeech)

module.exports = voiceRouter
