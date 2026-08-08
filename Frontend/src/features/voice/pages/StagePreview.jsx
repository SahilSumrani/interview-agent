import React, { useEffect, useRef } from "react"
import LiveInterviewStage from "../components/LiveInterviewStage"
import "./voice.scss"

function useMockStream(ref, label, hue) {
    useEffect(() => {
        const canvas = document.createElement("canvas")
        canvas.width = 640
        canvas.height = 480
        const ctx = canvas.getContext("2d")
        let t = 0
        const id = setInterval(() => {
            t += 1
            const g = ctx.createLinearGradient(0, 0, 640, 480)
            g.addColorStop(0, `hsl(${hue}, 30%, ${18 + Math.sin(t / 10) * 3}%)`)
            g.addColorStop(1, `hsl(${hue + 30}, 35%, 30%)`)
            ctx.fillStyle = g
            ctx.fillRect(0, 0, 640, 480)
            ctx.fillStyle = "rgba(255,255,255,0.75)"
            ctx.font = "34px sans-serif"
            ctx.textAlign = "center"
            ctx.fillText(label, 320, 250)
        }, 200)
        if (ref.current) ref.current.srcObject = canvas.captureStream(5)
        return () => clearInterval(id)
    }, [ ref, label, hue ])
}

export default function StagePreview() {
    const camRef = useRef(null)
    const screenRef = useRef(null)
    useMockStream(camRef, "Candidate camera", 205)
    useMockStream(screenRef, "Shared screen", 260)

    return (
        <main className="voice-page voice-page--live">
            <header className="voice-hero voice-hero--compact">
                <p className="voice-brand">InterviewAI</p>
                <h1>Voice interview with <span>Maya</span></h1>
            </header>
            <LiveInterviewStage
                statusLabel="Listening — pause when finished (auto)"
                auraState="listening"
                auraLevel={0.42}
                startingHint=""
                isSpeaking={false}
                isListening
                isThinking={false}
                question="Walk me through the FCM push pipeline you built — what forced the move to Kafka, and which trade-off worried you most?"
                questionType="Follow-up question"
                turnCount={3}
                maxTurns={10}
                roleLabel="Full Stack Developer"
                companyLabel="Google"
                fieldLabel="Role related"
                candidateName="Sujay"
                elapsedLabel="04:10"
                cameraReady
                screenReady
                camVideoRef={camRef}
                screenVideoRef={screenRef}
                competencyCoverage={[
                    { key: "ownership", label: "Ownership & impact", covered: true },
                    { key: "system_design", label: "System design depth", covered: true },
                    { key: "tradeoffs", label: "Trade-off reasoning", covered: false },
                    { key: "communication", label: "Communication", covered: false },
                ]}
                violations={1}
                maxViolations={5}
                liveTranscript="So we started with direct FCM fan-out, but once the notification volume crossed roughly two hundred thousand a day the retries began"
                messages={[
                    { role: "interviewer", text: "Hi Sujay, thanks for joining. Tell me about the project you're proudest of." },
                    { role: "candidate", text: "Sure — I built the notification backbone for our delivery app, handling around 200k pushes a day." },
                    { role: "interviewer", text: "Walk me through the FCM push pipeline you built — what forced the move to Kafka, and which trade-off worried you most?" },
                ]}
                error=""
                thinkingStuck={false}
                delivery={{ paceWpm: 148, fillerCount: 2, avgPauseMs: 620, wordCount: 61 }}
                visual={{
                    samples: 42,
                    facePresencePct: 96,
                    eyeContactPct: 74,
                    headStability: 88,
                    confidence: 79,
                }}
                visualStatus="running"
                silentMs={1200}
                canRepeat
                onRepeatQuestion={() => {}}
                onInterrupt={() => {}}
                onSendNow={() => {}}
                onRetry={() => {}}
                onExit={() => {}}
            />
        </main>
    )
}
