# Share / run InterviewAI for others

## What to share
- Push this GitHub repo (`.env` is gitignored — keys stay private)
- Or zip the project **without** `node_modules`, `Backend/tts/.venv`, `Backend/.tts-cache`

## Friend setup
1. Install Node 18+ and clone/unzip the repo
2. `cd Backend` → copy `.env.example` to `.env` → add your Groq + ElevenLabs + Mongo keys
3. `npm install` then `node server.js` (port 3000)
4. `cd Frontend` → `npm install` → `npm run dev` (port 5173)
5. Open http://localhost:5173

## Deploy (so people use it online)
- **Frontend:** Vercel / Netlify (build `Frontend`, set API URL to your backend)
- **Backend:** Render / Railway / Fly.io (run `Backend`, set env vars from `.env.example`)
- Point Frontend `voice.api.js` `baseURL` to the public backend URL
- MongoDB Atlas + ElevenLabs + Groq keys go only on the server env

## Save ElevenLabs credits
- Use `eleven_flash_v2_5` (already set)
- `TTS_MAX_CHARS=380` caps each spoken line
- Disk cache: same sentence replay = **0** new credits (`Backend/.tts-cache`)
- Keep Maya answers short (1–3 sentences) — already in AI prompts
- Don’t spam Replay instructions
