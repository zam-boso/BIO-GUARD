# BIOGUARD AI backend

Holds the Groq API key so the desktop apps never see it.

```
Doctor / Patient app  ->  POST /ask  ->  this service  ->  Groq
                                         (GROQ_API_KEY lives here)
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Deploy check. Reports whether a key is configured, never the key. |
| POST | `/ask` | `{role, messages, patient?}` → `{reply, book}` |

`role` is `"patient"` or `"doctor"`. The system prompt and model are chosen
server-side, so the apps cannot swap them.

## Run locally

```bash
cd backend
pip install -r requirements.txt
set GROQ_API_KEY=gsk_your_key      # macOS/Linux: export GROQ_API_KEY=gsk_...
uvicorn main:app --reload --port 8000
```

Check http://localhost:8000/health — `groq_key_configured` should be `true`.

## Deploy (Render)

1. Push this repo to GitHub.
2. Render → **New → Web Service** → connect the repo.
3. Root directory `backend`, build `pip install -r requirements.txt`,
   start `uvicorn main:app --host 0.0.0.0 --port $PORT`.
4. **Environment → Add Environment Variable**: `GROQ_API_KEY` = your real key.
   This is the one place the key ever goes.
5. Deploy, then open `https://your-service.onrender.com/health`.
6. Set `BACKEND_URL` at the top of `doctor app/doctor.js` and
   `patient app/patient.js` to that service URL.

Render's free tier sleeps when idle, so the first request after a pause takes
~30 seconds. Wake it before a demo by opening `/health`.

## Abuse protection

Per-IP rate limit (default 12/min, 120/hour), a 2000-character cap per
message, and at most 12 messages of history. Tune with `RATE_LIMIT_PER_MIN`
and `RATE_LIMIT_PER_HOUR`. Limits are per instance and reset on restart.
