# InterviewAI

A voice-based AI mock-interview app. You upload a resume, pick a target role or
company, and then hold a spoken interview with **Maya**, an AI interviewer who
listens to your answers, asks adaptive follow-up questions, and grades you at
the end with a downloadable PDF report.

## What it does

- **Live voice interview.** Maya speaks each question out loud and you answer by
  talking. Speech-to-text runs in the browser, text-to-speech is served by the
  backend.
- **Resume-aware questions.** The uploaded PDF/DOCX is parsed into a compact
  "resume digest" so questions reference your real experience without sending the
  whole document to the LLM on every turn.
- **Company-specific playbooks.** Interview playbooks tailor the round structure
  and question mix to a target company or role.
- **Adaptive follow-ups.** Weak or vague answers get probed further instead of
  moving straight to the next topic.
- **Live voice and video analysis.** Speech quality (pace, filler words, pauses)
  and face signals (eye contact, head stability, composure) are measured while
  you speak. Camera frames never leave the browser - MediaPipe runs locally on
  wasm and only numeric samples are sent.
- **Scored PDF report.** A per-question scored summary is rendered server-side
  with Puppeteer and downloaded as a PDF.

## Stack

| Layer | Tech |
| --- | --- |
| Backend | Node.js + Express 5, MongoDB (Mongoose), WebSocket (`ws`), port `3000` |
| Frontend | React 19 + Vite, SCSS, React Router, port `5173` |
| Question generation | Groq `llama-3.3-70b-versatile` |
| Text-to-speech | ElevenLabs (`eleven_flash_v2_5`) with on-disk caching |
| Speech-to-text | Browser Web Speech API |
| Face analysis | MediaPipe Tasks Vision (Face Landmarker), self-hosted wasm |
| Report export | Puppeteer (HTML -> PDF) |
| Hardening | helmet, compression, express-rate-limit |

## Prerequisites

- Node.js 18+ and npm
- A MongoDB database (local `mongod` or a MongoDB Atlas connection string)
- A [Groq](https://console.groq.com/) API key
- An [ElevenLabs](https://elevenlabs.io/) API key
- A Chromium-capable machine (Puppeteer downloads its own browser on install)
- A browser with Web Speech API support for speech-to-text (Chrome or Edge)

## Setup

### 1. Backend

```bash
cd Backend
npm install
cp .env.example .env    # Windows PowerShell: Copy-Item .env.example .env
```

Fill in the real values in `Backend/.env` (see the table below), then start it:

```bash
node server.js       # or: npm run dev   (nodemon)
```

The API listens on `http://localhost:3000` and the voice WebSocket on
`ws://localhost:3000/ws/voice`.

### 2. Frontend

```bash
cd Frontend
npm install
npm run dev
```

Open http://localhost:5173.

The frontend talks to the backend at the hardcoded `baseURL` in
`Frontend/src/features/voice/services/voice.api.js` (and the sibling
`*.api.js` files). Change that if your backend is not on `localhost:3000`.

### 3. MediaPipe assets (required for face analysis)

**These files are gitignored, so a fresh clone will not have them.** Without
them face analysis silently disables itself - the interview still works, but the
report loses its eye contact / head stability / composure numbers.

`Frontend/src/features/voice/lib/faceAnalysis.js` loads them from fixed paths:

- wasm runtime from `/mediapipe/wasm`  -> `Frontend/public/mediapipe/wasm/`
- model from `/mediapipe/face_landmarker.task` -> `Frontend/public/mediapipe/face_landmarker.task`

The wasm runtime ships inside the `@mediapipe/tasks-vision` npm package, so copy
it out of `node_modules` (this guarantees the runtime matches the installed
version, currently `^1.0.1`). The model is a separate download from Google.

PowerShell (Windows), run from the repo root after `npm install` in `Frontend`:

```powershell
cd Frontend
New-Item -ItemType Directory -Force -Path public\mediapipe\wasm | Out-Null
Copy-Item node_modules\@mediapipe\tasks-vision\wasm\* public\mediapipe\wasm\ -Force
Invoke-WebRequest -Uri "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" -OutFile public\mediapipe\face_landmarker.task
```

bash (macOS / Linux):

```bash
cd Frontend
mkdir -p public/mediapipe/wasm
cp node_modules/@mediapipe/tasks-vision/wasm/* public/mediapipe/wasm/
curl -L -o public/mediapipe/face_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
```

You should end up with at least:

```
Frontend/public/mediapipe/face_landmarker.task            (~3.6 MB)
Frontend/public/mediapipe/wasm/vision_wasm_internal.js    (~0.3 MB)
Frontend/public/mediapipe/wasm/vision_wasm_internal.wasm  (~11.2 MB)
```

Restart `npm run dev` afterwards so Vite picks up the new static files.

## Environment variables

All of these live in `Backend/.env`. `Backend/.env.example` is the source of
truth - copy it and fill in the blanks. Never commit `.env`.

### Required

| Variable | Description |
| --- | --- |
| `GROQ_API_KEY` | Groq API key, used for question generation and scoring |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign auth tokens (change from the default) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key for text-to-speech |

### Optional (defaults shown)

| Variable | Default | Description |
| --- | --- | --- |
| `ELEVENLABS_VOICE_ID` | `EXAVITQu4vr4xnSDxMaL` | Voice used for Maya |
| `ELEVENLABS_MODEL_ID` | `eleven_flash_v2_5` | Cheapest/fastest TTS model |
| `TTS_PROVIDER` | `elevenlabs` | TTS backend to use |
| `TTS_MAX_CHARS` | `380` | Caps characters per spoken line |
| `PORT` | `3000` | Backend HTTP port |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Override the Groq model |

### Abuse protection / rate limiting (optional)

| Variable | Default | Description |
| --- | --- | --- |
| `TRUST_PROXY_HOPS` | `0` | Reverse-proxy hops to trust for the client IP. Keep `0` for local dev and direct deploys; set `1` only when nginx / Render / Railway sits in front, otherwise `X-Forwarded-For` can be spoofed to bypass the limits |
| `RATE_LIMIT_SKIP_LOCALHOST` | `0` | Set `1` to exempt `127.0.0.1` / `::1` from every limit (load tests, demos) |
| `RATE_LIMIT_WINDOW_MINUTES` | `15` | General limiter window across `/api/` |
| `RATE_LIMIT_MAX` | `600` | Requests per window (~10 full interviews per IP) |
| `SESSION_RATE_LIMIT_WINDOW_MINUTES` | `60` | Window for `POST /api/voice/sessions` |
| `SESSION_RATE_LIMIT_MAX` | `10` | Limit for the priciest endpoint (resume parse + 2 Groq calls) |
| `TTS_RATE_LIMIT_WINDOW_MINUTES` | `15` | Window for `POST /api/voice/tts` |
| `TTS_RATE_LIMIT_MAX` | `200` | Requests per window; cache misses spend ElevenLabs credits |
| `TTS_DAILY_CHAR_BUDGET` | `60000` | Per-IP daily TTS character budget, bounding real spend. `0` disables it |

## Keeping ElevenLabs costs down

- `eleven_flash_v2_5` is already the configured model - it is the cheapest one.
- `TTS_MAX_CHARS=380` caps each spoken line.
- Audio is cached on disk in `Backend/.tts-cache`, so replaying the same sentence
  costs zero new credits.
- Maya's answers are prompted to stay 1-3 sentences.
- `TTS_DAILY_CHAR_BUDGET` is the hard ceiling if you expose this publicly.

## Deploying

- **Frontend:** Vercel / Netlify - build the `Frontend` directory and point the
  API `baseURL` at your public backend URL.
- **Backend:** Render / Railway / Fly.io - run `Backend` and set every variable
  from `.env.example` as a real env var. Set `TRUST_PROXY_HOPS=1` when a
  platform proxy is in front.
- MongoDB Atlas, ElevenLabs, and Groq keys belong only in the server
  environment, never in the frontend bundle.

## Project layout

```
Backend/
  server.js               HTTP + WebSocket entry point
  src/app.js              Express app, helmet / compression / rate limits
  src/controllers/        interview + voice request handlers
  src/services/           Groq calls, playbooks, question bank, TTS cache, report HTML
  src/realtime/           voice WebSocket
  src/models/             Mongoose schemas (voice sessions, playbooks)
  tts/                    optional local Chatterbox TTS server (Python)
Frontend/
  src/features/voice/     live interview stage, visualizer, face + speech analysis
  src/features/interview/ text interview flow and report views
  public/mediapipe/       MediaPipe wasm + model (gitignored, see setup above)
```

## Notes

- Camera and microphone permissions are requested by the browser; raw video is
  processed locally and never uploaded.
- `Backend/tts/` contains an optional self-hosted Chatterbox TTS server if you
  would rather not spend ElevenLabs credits. It needs Python and its own venv.
- See `SHARE.md` for a shorter "get a friend running this" checklist.