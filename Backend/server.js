require("dotenv").config({ override: true })
const http = require("http")
const app = require("./src/app")
const connectToDB = require("./src/config/database")
const { seedInterviewPlaybooks } = require("./src/services/playbookSeed")
const { attachVoiceWebSocket } = require("./src/realtime/voiceWs")

const PORT = Number(process.env.PORT) || 3000

async function boot() {
    await connectToDB()
    try {
        await seedInterviewPlaybooks()
    } catch (err) {
        console.error("Playbook seed failed:", err.message)
    }

    const server = http.createServer(app)
    attachVoiceWebSocket(server)

    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            console.error(`Port ${PORT} already in use. Stop the other node/server.js process, then retry.`)
            process.exit(1)
        }
        console.error("Server error:", err)
        process.exit(1)
    })

    const elKey = process.env.ELEVENLABS_API_KEY || ""
    console.log(`TTS: provider=${process.env.TTS_PROVIDER || "elevenlabs"} model=${process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5"} key=${elKey ? elKey.slice(0, 8) + "…" : "(missing)"}`)

    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`)
        console.log(`WebSocket: ws://localhost:${PORT}/ws/voice`)
    })
}

boot().catch((err) => {
    console.error("Failed to boot server:", err)
    process.exit(1)
})
