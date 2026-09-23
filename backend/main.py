"""
BIOGUARD AI backend.

The Groq API key lives here, on the server, and never reaches the apps.
The apps POST a conversation to /ask; this service adds the system prompt,
calls Groq and returns only the reply text.

Run locally:
    pip install -r requirements.txt
    export GROQ_API_KEY=gsk_...        # Windows: set GROQ_API_KEY=gsk_...
    uvicorn main:app --reload --port 8000
"""

import os
import re
import time
from collections import defaultdict, deque
from typing import Dict, List, Literal, Optional

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# --------------------------------------------------------------------------
# Config (everything secret comes from the environment, never from the code)
# --------------------------------------------------------------------------

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")

# Groq retired the Llama models for free-tier accounts in Aug 2026.
PATIENT_MODEL = os.getenv("PATIENT_MODEL", "openai/gpt-oss-20b")
DOCTOR_MODEL = os.getenv("DOCTOR_MODEL", "openai/gpt-oss-120b")

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

RATE_PER_MIN = int(os.getenv("RATE_LIMIT_PER_MIN", "12"))
RATE_PER_HOUR = int(os.getenv("RATE_LIMIT_PER_HOUR", "120"))

MAX_MESSAGE_CHARS = 2000
MAX_HISTORY = 12
REQUEST_TIMEOUT = 30.0

BOOK_TAG = "[BOOK]"

app = FastAPI(title="BIOGUARD AI backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)

# --------------------------------------------------------------------------
# Rate limiting: per-IP sliding window, in memory.
# Enough for a demo. A multi-instance deployment would need Redis.
# --------------------------------------------------------------------------

_hits: Dict[str, deque] = defaultdict(deque)


def rate_limited(ip: str) -> Optional[int]:
    """Return seconds to wait if the caller is over a limit, else None."""
    now = time.time()
    hits = _hits[ip]

    while hits and now - hits[0] > 3600:
        hits.popleft()

    last_minute = sum(1 for t in hits if now - t < 60)
    if last_minute >= RATE_PER_MIN:
        return 60
    if len(hits) >= RATE_PER_HOUR:
        return 3600

    hits.append(now)

    if len(_hits) > 5000:  # crude cleanup so the dict can't grow forever
        for key in [k for k, v in _hits.items() if not v or now - v[-1] > 3600]:
            _hits.pop(key, None)

    return None


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# --------------------------------------------------------------------------
# Request models
# --------------------------------------------------------------------------


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=MAX_MESSAGE_CHARS)


class PatientContext(BaseModel):
    """Doctor-app context. Free text is length-capped and stripped below."""

    name: str = Field(default="", max_length=120)
    organism: str = Field(default="", max_length=120)
    esbl: str = Field(default="", max_length=40)
    ndm1: str = Field(default="", max_length=40)
    risk: str = Field(default="", max_length=40)
    options: List[str] = Field(default_factory=list, max_length=12)


class AskRequest(BaseModel):
    role: Literal["patient", "doctor"]
    messages: List[Message] = Field(min_length=1, max_length=MAX_HISTORY + 1)
    patient: Optional[PatientContext] = None


class AskResponse(BaseModel):
    reply: str
    book: bool = False


# --------------------------------------------------------------------------
# Prompts live on the server so the apps can't be talked into replacing them
# --------------------------------------------------------------------------

PATIENT_SYSTEM = f"""You are a friendly patient-facing health assistant for urinary tract infection concerns.
Keep replies short and in plain language. Do not diagnose, and do not name or recommend antibiotics.
If the symptoms warrant seeing a doctor, say so clearly and end your reply with the exact tag {BOOK_TAG}.
If symptoms sound urgent (high fever, flank pain, vomiting, blood in urine, confusion, pregnancy), tell them to seek care promptly and end with {BOOK_TAG}."""

DOCTOR_SYSTEM = """You are an infectious disease clinical decision-support assistant for a physician.
Be concise and structured. Base suggestions on the resistance markers provided.
Note when susceptibility testing, local antibiogram, renal function, allergies or pregnancy status would change the choice.
Never present a suggestion as final; the physician decides."""


def clean(text: str) -> str:
    """Collapse whitespace and drop control characters from model-bound text."""
    return re.sub(r"[\x00-\x1f\x7f]", " ", text).strip()


def build_system_prompt(req: AskRequest) -> str:
    if req.role == "patient":
        return PATIENT_SYSTEM

    prompt = DOCTOR_SYSTEM
    p = req.patient
    if p:
        options = "\n".join(f"- {clean(o)[:200]}" for o in p.options[:12])
        prompt += f"""

Current patient (UTI work-up):
Name: {clean(p.name) or 'Unknown'}
Organism: {clean(p.organism) or 'pending'}
ESBL: {clean(p.esbl) or 'not tested'}
NDM-1: {clean(p.ndm1) or 'not tested'}
Derived MDR risk: {clean(p.risk) or 'unknown'}"""
        if options:
            prompt += f"\n\nRule-based empirical tiers shown to the physician:\n{options}"
    return prompt


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------


@app.get("/health")
async def health():
    """Deploy check. Says whether the key is configured, never what it is."""
    return {
        "status": "ok",
        "groq_key_configured": bool(GROQ_API_KEY),
        "patient_model": PATIENT_MODEL,
        "doctor_model": DOCTOR_MODEL,
    }


@app.post("/ask", response_model=AskResponse)
async def ask(req: AskRequest, request: Request):
    if not GROQ_API_KEY:
        return JSONResponse(
            status_code=503,
            content={"detail": "Server is missing GROQ_API_KEY. Set it in the hosting platform's environment variables."},
        )

    wait = rate_limited(client_ip(request))
    if wait:
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Please wait a moment and try again."},
            headers={"Retry-After": str(wait)},
        )

    messages = [{"role": "system", "content": build_system_prompt(req)}]
    messages += [{"role": m.role, "content": clean(m.content)} for m in req.messages[-(MAX_HISTORY + 1):]]

    model = PATIENT_MODEL if req.role == "patient" else DOCTOR_MODEL

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as http:
            response = await http.post(
                f"{GROQ_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": 0.4 if req.role == "patient" else 0.3,
                },
            )
    except httpx.TimeoutException:
        return JSONResponse(status_code=504, content={"detail": "The AI took too long to respond. Please try again."})
    except httpx.HTTPError as exc:
        return JSONResponse(status_code=502, content={"detail": f"Could not reach the AI service: {exc.__class__.__name__}"})

    if response.status_code != 200:
        # Pass along the reason, never the upstream body verbatim (it can echo request details).
        try:
            reason = response.json().get("error", {}).get("message", "")
        except Exception:
            reason = ""
        detail = f"AI service error ({response.status_code})"
        if reason:
            detail += f": {reason[:200]}"
        return JSONResponse(status_code=502, content={"detail": detail})

    try:
        content = response.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError):
        return JSONResponse(status_code=502, content={"detail": "The AI returned an unexpected response."})

    if not content or not content.strip():
        return JSONResponse(status_code=502, content={"detail": "The AI returned an empty response."})

    book = BOOK_TAG in content
    reply = content.replace(BOOK_TAG, "").strip()

    return AskResponse(reply=reply, book=book)
