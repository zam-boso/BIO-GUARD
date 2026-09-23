**Team:** The Vanguards · Tiya Meera N S, Aadi Krishna


# BIOGUARD AI  
### Outsmarting Antibiotic Resistance

BIOGUARD AI is an antimicrobial stewardship clinical decision support system designed to protect against rising antibiotic resistance. It integrates patient history, genetic resistance markers, and risk stratification to provide structured, resistance-aware antibiotic recommendations.

---

##  Problem

The rapid rise of multidrug-resistant (MDR) organisms and the global spread of resistant “superbugs” have increased uncertainty in empirical antibiotic prescribing, particularly in UTI management.

Delayed susceptibility results (24–48 hours in complex cases) create a critical decision gap.

---

##  Our Solution

BIOGUARD AI:

- Integrates genetic resistance markers (e.g., ESBL, NDM-1)
- Analyzes recurrence history and past resistance data
- Provides ranked antibiotic recommendations
- Flags Multidrug-Resistant (MDR) risk
- Supports post-culture therapy optimization

The system enables early risk-based intervention in high-risk cases and structured interpretation in low-risk cases.

---

##  Workflow Overview

The system follows a risk-stratified clinical decision flow:

1. Patient visit & diagnostic testing  
2. Data integration (history + genetic markers)  
3. AI risk assessment  
4. High-risk cases receive early empirical guidance  
5. Full susceptibility results update system automatically  
6. Therapy refined if required  
7. Final decision remains with the physician  

---

##  Physician-Centered Design

BIOGUARD AI does **not** replace doctors.

It functions as an intelligent assistant — enhancing decision clarity while preserving full physician authority.

Our goal is not disruption, but responsible integration of AI into clinical workflows.

---

##  Key Features

- Patient-specific risk calculations  
- Explainable AI recommendations  
- Risk-based early intervention  
- Ranked antibiotic suggestions  
- Post-culture treatment optimization  
- Privacy-first design (target: localized AI processing)

---

##  Data Ethics & Privacy

BIOGUARD AI is designed around localized processing to protect patient data.

> **Current prototype:** AI responses come from a cloud LLM (Groq, Llama 3), so chat content leaves the device. Moving inference on-premise is on the roadmap. Do not enter real patient data into this build.

---

##  Scalability

- Expand beyond UTI to other infectious diseases  
- Integrate with EHR systems  
- Incorporate regional antibiogram data  
- Continuous model refinement with emerging resistance trends  

---

##  Vision

To bridge antimicrobial resistance intelligence with real-time, explainable clinical decision support — ensuring safer and smarter antibiotic prescribing.

---

##  Repository Layout

Two Electron apps share one Supabase database:

| Folder | App | Role |
|---|---|---|
| `doctor app/` | BIOGUARD Doctor's Assistive AI | Physician dashboard: patient queue, MDR risk from ESBL / NDM-1 markers, rule-based empirical options, AI clinical assistant |
| `patient app/` | BIOGUARD Companion Agent | Patient chat: symptom triage, appointment booking, (simulated) lab markers |
| `backend/` | FastAPI AI service | Holds the Groq API key server-side; both apps call it for AI replies |

When a patient books in the Companion app, the appointment appears live in the Doctor dashboard.

##  Running Locally

Requires [Node.js](https://nodejs.org/) 20+.

```bash
cd "doctor app"      # or "patient app"
npm install
npm start
```

### AI backend

Neither app contains an API key. Both call the FastAPI service in `backend/`,
which holds the Groq key as a server environment variable:

```
Doctor / Patient app  ->  POST /ask  ->  backend  ->  Groq
                                         (GROQ_API_KEY lives here)
```

Start it before using the chat, and see [backend/README.md](backend/README.md)
for deployment:

```bash
cd backend
pip install -r requirements.txt
set GROQ_API_KEY=gsk_your_key      # macOS/Linux: export GROQ_API_KEY=gsk_...
uvicorn main:app --reload --port 8000
```

Once deployed, set `BACKEND_URL` at the top of `doctor app/doctor.js` and
`patient app/patient.js` to the service URL. The Supabase URL and anon key sit
beside it; that key is public by design and is protected by Row Level Security.

Build a Windows installer with `npm run build` (output in `dist/`).

##  Download

Prebuilt Windows apps are on the [Releases page](https://github.com/zam-boso/BIO-GUARD/releases).
Extract the ZIP and run the `.exe` — no API key or setup needed. The builds are
unsigned, so Windows may show a warning: click "More info" → "Run anyway".

An internet connection is required. The AI backend is hosted on a free tier that
sleeps when idle, so the **first reply after a quiet period can take up to a
minute** while it wakes. Opening
[the health check](https://bioguard-backend-neno.onrender.com/health) first wakes
it in advance.

##  Early Beta — What to Expect

This is an early beta built for demonstration. Known gaps:

- **Some buttons and side-panel icons are placeholders** and do nothing yet.
- **Patient names are randomly generated** each time the Companion app launches.
  They are not real people, and no real patient data is used anywhere in this build.
- Organism and ESBL / NDM-1 results in the Companion app are **simulated**,
  standing in for a real genotypic assay.
- Empirical options in the Doctor app are a **rule-based demo** derived from the
  markers and organism. They are **not clinically validated**, do not replace
  culture & susceptibility testing, and the final decision always rests with the
  physician.
- Hospitals and appointment slots are placeholders.
- The database uses a public anon key with permissive access rules, which suits a
  demo but is not suitable for real patient data.
