/**
 * @license
 *
 * Originally developed for Unicorn Studio — https://unicorn.studio
 * Licensed under the Polyform Non-Resale License 1.0.0
 * © 2026 UNCRN LLC
 *
 * Adapted from LiveKit Agents UI AgentAudioVisualizerAura for Vite + React
 * (no LiveKit room / next-themes / shadcn required).
 */

import React, { useMemo, forwardRef } from "react"
import { ReactShaderToy } from "./ReactShaderToy"
import { AURA_SHADER_SOURCE } from "./auraShaderSource"
import { useAgentAudioVisualizerAura, mapToAgentState } from "./useAgentAudioVisualizerAura"
import "./AgentAudioVisualizerAura.scss"

const DEFAULT_COLOR = "#1FD5F9"

const SIZE_PX = {
    icon: 24,
    sm: 56,
    md: 112,
    lg: 224,
    xl: 448,
}

function hexToRgb(hexColor) {
    try {
        const rgbColor = hexColor.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/)
        if (rgbColor) {
            const [ , r, g, b ] = rgbColor
            return [ r, g, b ].map((c = "00") => parseInt(c, 16) / 255)
        }
    } catch {
        console.error(`Invalid hex color '${hexColor}'. Falling back to '${DEFAULT_COLOR}'.`)
    }
    return hexToRgb(DEFAULT_COLOR)
}

function AuraShader({
    shape = 1.0,
    speed = 1.0,
    amplitude = 0.5,
    frequency = 0.5,
    scale = 0.2,
    blur = 1.0,
    color = DEFAULT_COLOR,
    colorShift = 1.0,
    brightness = 1.0,
    themeMode = "dark",
    className,
    style,
    ...props
}, ref) {
    const rgbColor = useMemo(() => hexToRgb(color), [ color ])

    return (
        <div ref={ref} className={className} style={style} {...props}>
            <ReactShaderToy
                fs={AURA_SHADER_SOURCE}
                devicePixelRatio={typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1}
                clearColor={[ 0, 0, 0, 0 ]}
                contextAttributes={{ alpha: true, premultipliedAlpha: true, antialias: false }}
                uniforms={{
                    uSpeed: { type: "1f", value: speed },
                    uBlur: { type: "1f", value: blur },
                    uScale: { type: "1f", value: scale },
                    uShape: { type: "1f", value: shape },
                    uFrequency: { type: "1f", value: frequency },
                    uAmplitude: { type: "1f", value: amplitude },
                    uBloom: { type: "1f", value: 0.0 },
                    uMix: { type: "1f", value: brightness },
                    uSpacing: { type: "1f", value: 0.5 },
                    uColorShift: { type: "1f", value: colorShift },
                    uVariance: { type: "1f", value: 0.1 },
                    uSmoothing: { type: "1f", value: 1.0 },
                    uMode: { type: "1f", value: themeMode === "light" ? 1.0 : 0.0 },
                    uColor: { type: "3fv", value: rgbColor ?? [ 0, 0.7, 1 ] },
                }}
                onError={(error) => {
                    console.error("Shader error:", error)
                }}
                onWarning={(warning) => {
                    console.warn("Shader warning:", warning)
                }}
                style={{ width: "100%", height: "100%" }}
            />
        </div>
    )
}

const AuraShaderForward = forwardRef(AuraShader)
AuraShaderForward.displayName = "AuraShader"

/**
 * LiveKit Agents UI Aura visualizer (Unicorn Studio WebGL shader).
 * Accepts our voice `state` + `audioLevel` without a LiveKit room.
 */
const AgentAudioVisualizerAura = forwardRef(function AgentAudioVisualizerAura({
    size = "xl",
    state = "idle",
    color = DEFAULT_COLOR,
    colorShift = 0.3,
    themeMode = "dark",
    audioLevel = 0,
    volume,
    className = "",
    ...props
}, ref) {
    const vol = volume ?? audioLevel
    const {
        speed,
        scale,
        amplitude,
        frequency,
        brightness,
        agentState,
    } = useAgentAudioVisualizerAura(state, vol)

    const cssSize = typeof size === "number" ? size : (SIZE_PX[size] || SIZE_PX.xl)

    return (
        <AuraShaderForward
            ref={ref}
            data-lk-state={agentState}
            data-state={state}
            blur={0.2}
            color={color}
            colorShift={colorShift}
            speed={speed}
            scale={scale}
            themeMode={themeMode}
            amplitude={amplitude}
            frequency={frequency}
            brightness={brightness}
            className={`aura-viz aura-viz--${mapToAgentState(state)} ${className}`.trim()}
            style={{
                width: cssSize,
                height: cssSize,
                ["--aura-size"]: `${cssSize}px`,
            }}
            {...props}
        />
    )
})

export default AgentAudioVisualizerAura
