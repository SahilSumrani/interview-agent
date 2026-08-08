"""
Local Chatterbox TTS microservice for InterviewAI / Maya.
CPU by default (no NVIDIA required). Uses English ChatterboxTTS base model.
"""
from __future__ import annotations

import io
import os
import traceback
from contextlib import asynccontextmanager

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

PORT = int(os.environ.get("CHATTERBOX_PORT", "7861"))
DEVICE = os.environ.get("CHATTERBOX_DEVICE", "cpu").lower()
# base (recommended, no ref wav) | nano | turbo (need CHATTERBOX_VOICE_REF)
MODEL_KIND = os.environ.get("CHATTERBOX_MODEL", "base").lower()
VOICE_REF = os.environ.get("CHATTERBOX_VOICE_REF", "").strip()

model = None
sample_rate = 24000
model_label = "base"


def pick_device() -> str:
    if DEVICE in ("cuda", "gpu") and torch.cuda.is_available():
        return "cuda"
    if DEVICE == "mps" and getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_model():
    global model, sample_rate, model_label
    device = pick_device()
    kind = MODEL_KIND
    print(f"[chatterbox] loading model={kind} device={device}")

    if kind in ("nano", "turbo"):
        from chatterbox.tts_turbo import ChatterboxTurboTTS

        nano = kind == "nano"
        model = ChatterboxTurboTTS.from_pretrained(device=device, nano=nano)
        sample_rate = int(getattr(model, "sr", 24000))
        model_label = "nano" if nano else "turbo"
        print(f"[chatterbox] loaded {model_label} sr={sample_rate}")
        if not (VOICE_REF and os.path.isfile(VOICE_REF)):
            print("[chatterbox] WARN: nano/turbo usually need CHATTERBOX_VOICE_REF=.wav")
        return

    from chatterbox.tts import ChatterboxTTS

    model = ChatterboxTTS.from_pretrained(device=device)
    sample_rate = int(getattr(model, "sr", 24000))
    model_label = "base"
    print(f"[chatterbox] loaded base English TTS sr={sample_rate}")


def wav_to_bytes(wav_tensor) -> bytes:
    if hasattr(wav_tensor, "detach"):
        arr = wav_tensor.detach().cpu().numpy()
    else:
        arr = np.asarray(wav_tensor)
    arr = np.squeeze(arr)
    if arr.ndim > 1:
        arr = arr[0]
    arr = arr.astype(np.float32, copy=False)
    peak = float(np.max(np.abs(arr))) if arr.size else 0.0
    if peak > 1.0:
        arr = arr / peak
    buf = io.BytesIO()
    sf.write(buf, arr, sample_rate, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def synthesize(text: str) -> bytes:
    if model is None:
        raise RuntimeError("Model not loaded")

    text = (text or "").strip()
    if not text:
        raise ValueError("empty text")

    kwargs = {}
    if VOICE_REF and os.path.isfile(VOICE_REF):
        kwargs["audio_prompt_path"] = VOICE_REF

    try:
        wav = model.generate(text, **kwargs) if kwargs else model.generate(text)
    except TypeError as err:
        if model_label in ("nano", "turbo"):
            raise RuntimeError(
                "Chatterbox nano/turbo needs a reference voice wav. "
                "Set CHATTERBOX_VOICE_REF, or use CHATTERBOX_MODEL=base"
            ) from err
        wav = model.generate(text)

    return wav_to_bytes(wav)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_model()
    yield


app = FastAPI(title="InterviewAI Chatterbox TTS", lifespan=lifespan)


class TtsRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2500)


@app.get("/health")
def health():
    return {
        "ok": model is not None,
        "model": model_label,
        "device": pick_device(),
        "sample_rate": sample_rate,
        "voice_ref": bool(VOICE_REF and os.path.isfile(VOICE_REF)),
    }


@app.post("/tts")
def tts(req: TtsRequest):
    try:
        audio = synthesize(req.text)
        return Response(
            content=audio,
            media_type="audio/wav",
            headers={
                "Cache-Control": "no-store",
                "X-TTS-Engine": "chatterbox",
                "X-TTS-Model": model_label,
            },
        )
    except Exception as err:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(err)) from err


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=PORT, reload=False)
