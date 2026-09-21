/* ================================
   CONFIG
   Paste your keys below (Groq console / Supabase > Project Settings > API).
================================ */

const SUPABASE_URL = "https://ipzxppqiktomxbbcrauv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwenhwcHFpa3RvbXhiYmNyYXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTk1NzksImV4cCI6MjA4Nzc3NTU3OX0.i2mloYWuxkoX0febaCu_HtZ00weaY514PfXFO0HD_Y4";

const GROQ_API_KEY = "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";
// llama3-8b-8192 was retired by Groq; this is its replacement.
const GROQ_MODEL = "llama-3.1-8b-instant";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// The model appends this tag when it thinks the patient should see a doctor.
const BOOK_TAG = "[BOOK]";

/* ================================
   DOM ELEMENTS
================================ */

const chatMessages = document.getElementById("chatMessages");
const input = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const patientIdEl = document.getElementById("patientId");

const organismEl = document.getElementById("rawOrganism");
const esblEl = document.getElementById("rawEsbl");
const ndmEl = document.getElementById("rawNdm");

/* ================================
   STATE
================================ */

const state = {
  selectedHospital: null,
  selectedSpecialist: "Infectious Disease",
  awaitingBookingConfirmation: false,
  booked: false,
  busy: false,
  history: []
};

/* ================================
   RANDOM PATIENT (demo)
================================ */

function generateRandomPatient() {
  const names = [
    "Arjun Nair",
    "Meera Joseph",
    "Rahul Menon",
    "Ananya Pillai",
    "Kiran Varma",
    "Sneha Thomas",
    "Vishnu Raj",
    "Diya Krishnan"
  ];
  return names[Math.floor(Math.random() * names.length)];
}

const currentPatientName = generateRandomPatient();

/* ================================
   INITIALIZE APP
================================ */

window.addEventListener("DOMContentLoaded", () => {
  patientIdEl.textContent = currentPatientName;

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  document.querySelectorAll(".option-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const option = btn.dataset.option;
      const prompts = {
        "Current Infection": "I think I have a urinary tract infection. Can you help me understand my symptoms?",
        "General Pathogen Check": "I'd like a general check on what kind of infection I might have.",
        "Resistance Analysis": "I've had UTIs before and I'm worried antibiotics might not work. What should I do?"
      };
      sendText(prompts[option] || option);
    });
  });

  addMessage(
    `Hi ðŸ‘‹ ${currentPatientName}, I'm your BIOGUARD AI Assistant. Tell me how you're feeling ðŸ˜Š`,
    "bot"
  );
});

/* ================================
   MESSAGE UI
================================ */

function addMessage(text, sender = "bot") {
  const msg = document.createElement("div");
  msg.classList.add("message", sender);
  msg.textContent = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return msg;
}

function addButtons(labels, onPick) {
  const container = document.createElement("div");
  container.classList.add("prompt-buttons");

  labels.forEach((label, i) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.classList.add("prompt-btn", i === 1 && labels.length === 2 ? "no-btn" : "yes-btn");
    btn.addEventListener("click", () => {
      container.remove();
      onPick(label);
    });
    container.appendChild(btn);
  });

  chatMessages.appendChild(container);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function setBusy(busy) {
  state.busy = busy;
  sendBtn.disabled = busy;
  document.querySelectorAll(".option-btn").forEach((b) => (b.disabled = busy));
}

/* ================================
   SEND MESSAGE
================================ */

function sendMessage() {
  const userText = input.value.trim();
  if (!userText) return;
  input.value = "";
  sendText(userText);
}

function sendText(text) {
  if (state.busy) return;
  addMessage(text, "user");
  handleGroqAI(text);
}

/* ================================
   GROQ AI
================================ */

async function handleGroqAI(userText) {
  if (!GROQ_API_KEY || GROQ_API_KEY.startsWith("PASTE_")) {
    addMessage("âš ï¸ AI not configured: add your Groq API key at the top of patient.js.", "bot");
    return;
  }

  const thinking = addMessage("Thinking... ðŸ¤–", "bot");
  setBusy(true);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: `You are a friendly patient-facing health assistant for urinary tract infection concerns.
Keep replies short and plain-language. Do not diagnose or prescribe antibiotics.
If the symptoms warrant seeing a doctor, say so clearly and end your reply with the exact tag ${BOOK_TAG}.
If symptoms sound urgent (high fever, flank pain, vomiting, blood in urine, confusion, pregnancy), tell them to seek care promptly and end with ${BOOK_TAG}.`
          },
          ...state.history.slice(-12),
          { role: "user", content: userText }
        ]
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message || `HTTP ${response.status}`);
    }

    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) throw new Error("Empty response");

    const wantsBooking = raw.includes(BOOK_TAG);
    const aiReply = raw.split(BOOK_TAG).join("").trim();

    state.history.push({ role: "user", content: userText });
    state.history.push({ role: "assistant", content: aiReply });

    thinking.remove();
    addMessage(aiReply, "bot");

    if (wantsBooking && !state.booked && !state.awaitingBookingConfirmation) {
      state.awaitingBookingConfirmation = true;
      addMessage("Would you like me to book an appointment for you?", "bot");
      addButtons(["Yes", "No"], (label) => handleBookingDecision(label === "Yes"));
    }
  } catch (error) {
    console.error(error);
    thinking.remove();
    addMessage(
      error.name === "AbortError"
        ? "âš ï¸ The AI took too long to respond. Please try again."
        : "âš ï¸ AI unavailable: " + error.message,
      "bot"
    );
  } finally {
    clearTimeout(timer);
    setBusy(false);
  }
}

/* ================================
   HANDLE YES / NO
================================ */

function handleBookingDecision(isYes) {
  state.awaitingBookingConfirmation = false;

  if (!isYes) {
    addMessage("Alright ðŸ˜Š I'm here if you need anything else.", "bot");
    return;
  }

  const hospitalData = generateRandomHospital();
  state.selectedHospital = hospitalData;

  addMessage(`I recommend visiting ${hospitalData.name}, ${hospitalData.city}.`, "bot");
  addMessage("Please select a preferred time:", "bot");

  addButtons(["Tomorrow â€“ 10:30 AM", "Tomorrow â€“ 3:00 PM", "Friday â€“ 11:15 AM"], bookAppointment);
}

/* ================================
   RANDOM HOSPITAL (demo)
================================ */

function generateRandomHospital() {
  const hospitals = [
    { name: "Aster Medcity", city: "Kochi" },
    { name: "Amrita Institute of Medical Sciences", city: "Kochi" },
    { name: "KIMS Hospital", city: "Trivandrum" }
  ];
  return hospitals[Math.floor(Math.random() * hospitals.length)];
}

/* ================================
   SIMULATED LAB RESULT (demo)
   Stands in for the genotypic test until real lab data is wired in.
================================ */

function generateRandomInfection() {
  const options = [
    { name: "E. coli", esbl: "Detected", ndm1: "Not Detected" },
    { name: "E. coli", esbl: "Not Detected", ndm1: "Not Detected" },
    { name: "Klebsiella pneumoniae", esbl: "Detected", ndm1: "Detected" },
    { name: "Proteus mirabilis", esbl: "Not Detected", ndm1: "Not Detected" }
  ];
  return options[Math.floor(Math.random() * options.length)];
}

/* ================================
   BOOK APPOINTMENT
================================ */

async function bookAppointment(selectedSlot) {
  if (state.booked) return;

  const status = addMessage("Booking your appointment... â³", "bot");
  const infection = generateRandomInfection();

  const { error } = await supabaseClient.from("appointments").insert([
    {
      patient_name: currentPatientName,
      organism: infection.name,
      esbl: infection.esbl,
      ndm1: infection.ndm1,
      hospital: `${state.selectedHospital.name}, ${state.selectedHospital.city}`,
      specialist: state.selectedSpecialist,
      slot: selectedSlot,
      status: "pending"
    }
  ]);

  status.remove();

  if (error) {
    console.error(error);
    addMessage("âŒ Booking failed: " + (error.message || "database unreachable"), "bot");
    addButtons(["Try again"], () => bookAppointment(selectedSlot));
    return;
  }

  state.booked = true;

  // Only show lab data once it has actually been saved.
  organismEl.textContent = infection.name;
  esblEl.textContent = infection.esbl;
  ndmEl.textContent = infection.ndm1;
  esblEl.style.color = infection.esbl === "Detected" ? "red" : "green";
  ndmEl.style.color = infection.ndm1 === "Detected" ? "red" : "green";

  addMessage(
    `âœ… Appointment booked: ${selectedSlot} at ${state.selectedHospital.name}. Your doctor can now see your results.`,
    "bot"
  );
}
