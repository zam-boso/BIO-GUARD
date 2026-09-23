/* ================================
   CONFIG
   No API keys here. The Groq key lives on the backend (see /backend).
   BACKEND_URL is the deployed FastAPI service; localhost for development.
================================ */

const BACKEND_URL = "https://bioguard-backend-neno.onrender.com";

const SUPABASE_URL = "https://ipzxppqiktomxbbcrauv.supabase.co";
// Supabase anon key is public by design; protect data with Row Level Security.
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwenhwcHFpa3RvbXhiYmNyYXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTk1NzksImV4cCI6MjA4Nzc3NTU3OX0.i2mloYWuxkoX0febaCu_HtZ00weaY514PfXFO0HD_Y4";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ================================
   DOM ELEMENTS
================================ */

const chatMessages = document.getElementById("chatMessages");
const input = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const patientIdEl = document.getElementById("patientId");

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
    `Hi 👋 ${currentPatientName}, I'm your BIOGUARD AI Assistant. Tell me how you're feeling 😊`,
    "bot"
  );
});

/* ================================
   MESSAGE UI
================================ */

function addMessage(text, sender = "bot", markdown = false) {
  const msg = document.createElement("div");
  msg.classList.add("message", sender);
  if (markdown) msg.appendChild(renderMarkdown(text));
  else msg.textContent = text;
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
  handleAI(text);
}

/* ================================
   GROQ AI
================================ */

async function handleAI(userText) {
  const thinking = addMessage("Thinking... \u{1F916}", "bot");
  setBusy(true);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${BACKEND_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "patient",
        messages: [...state.history.slice(-12), { role: "user", content: userText }]
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.detail || `Backend returned HTTP ${response.status}`);
    }
    if (!data.reply) throw new Error("The backend returned an empty reply.");

    state.history.push({ role: "user", content: userText });
    state.history.push({ role: "assistant", content: data.reply });

    thinking.remove();
    addMessage(data.reply, "bot", true);

    if (data.book && !state.booked && !state.awaitingBookingConfirmation) {
      state.awaitingBookingConfirmation = true;
      addMessage("Would you like me to book an appointment for you?", "bot");
      addButtons(["Yes", "No"], (label) => handleBookingDecision(label === "Yes"));
    }
  } catch (error) {
    console.error(error);
    thinking.remove();

    let message = error.message;
    if (error.name === "AbortError") message = "The AI took too long to respond. Please try again.";
    else if (error instanceof TypeError) message = `Cannot reach the backend at ${BACKEND_URL}. Is it running?`;

    addMessage("\u26A0\uFE0F " + message, "bot");
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
    addMessage("Alright 😊 I'm here if you need anything else.", "bot");
    return;
  }

  const hospitalData = generateRandomHospital();
  state.selectedHospital = hospitalData;

  addMessage(`I recommend visiting ${hospitalData.name}, ${hospitalData.city}.`, "bot");
  addMessage("Please select a preferred time:", "bot");

  addButtons(["Tomorrow – 10:30 AM", "Tomorrow – 3:00 PM", "Friday – 11:15 AM"], bookAppointment);
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

  const status = addMessage("Booking your appointment... ⏳", "bot");
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
    addMessage("❌ Booking failed: " + (error.message || "database unreachable"), "bot");
    addButtons(["Try again"], () => bookAppointment(selectedSlot));
    return;
  }

  state.booked = true;

  addMessage(
    `✅ Appointment booked: ${selectedSlot} at ${state.selectedHospital.name}. Your doctor can now see your results.`,
    "bot"
  );
}
