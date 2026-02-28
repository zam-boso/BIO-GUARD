/* ================================
   SUPABASE SETUP
================================ */

const { createClient } = supabase;

const supabaseClient = createClient(
  "https://ipzxppqiktomxbbcrauv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwenhwcHFpa3RvbXhiYmNyYXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTk1NzksImV4cCI6MjA4Nzc3NTU3OX0.i2mloYWuxkoX0febaCu_HtZ00weaY514PfXFO0HD_Y4"
);

/* ================================
   GROQ CONFIG
================================ */

const GROQ_API_KEY = "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";
const GROQ_MODEL = "llama3-8b-8192";

/* ================================
   DOM ELEMENTS
================================ */

const chatMessages = document.getElementById("chatMessages");
const input = document.getElementById("chatInput");
const patientIdEl = document.getElementById("patientId");

const organismEl = document.querySelector(".raw-item:nth-child(1) span:last-child");
const esblEl = document.querySelector(".raw-item:nth-child(2) span:last-child");
const ndmEl = document.querySelector(".raw-item:nth-child(3) span:last-child");

/* ================================
   STATE
================================ */

let state = {
  selectedHospital: null,
  selectedSpecialist: "Infectious Disease",
  awaitingBookingConfirmation: false
};

/* ================================
   RANDOM PATIENT GENERATOR
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

let currentPatientName = generateRandomPatient();

/* ================================
   INITIALIZE APP
================================ */

window.onload = () => {

  // Set patient ID to randomized name
  patientIdEl.innerText = currentPatientName;

  addMessage(
    `Hi 👋 ${currentPatientName}, I'm your BIOGUARD AI Assistant. Tell me how you're feeling 😊`,
    "bot"
  );
};

/* ================================
   MESSAGE UI
================================ */

function addMessage(text, sender = "bot") {
  const msg = document.createElement("div");
  msg.classList.add("message", sender);
  msg.innerText = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* ================================
   YES / NO BUTTONS
================================ */

function addYesNoButtons() {

  const container = document.createElement("div");
  container.classList.add("prompt-buttons");

  const yesBtn = document.createElement("button");
  yesBtn.innerText = "Yes";
  yesBtn.classList.add("prompt-btn", "yes-btn");

  const noBtn = document.createElement("button");
  noBtn.innerText = "No";
  noBtn.classList.add("prompt-btn", "no-btn");

  yesBtn.onclick = () => {
    container.remove();
    handleBookingDecision(true);
  };

  noBtn.onclick = () => {
    container.remove();
    handleBookingDecision(false);
  };

  container.appendChild(yesBtn);
  container.appendChild(noBtn);
  chatMessages.appendChild(container);
}

/* ================================
   SLOT BUTTONS
================================ */

function addSlotButtons() {

  const container = document.createElement("div");
  container.classList.add("prompt-buttons");

  const slots = [
    "Tomorrow – 10:30 AM",
    "Tomorrow – 3:00 PM",
    "Friday – 11:15 AM"
  ];

  slots.forEach(slot => {

    const btn = document.createElement("button");
    btn.innerText = slot;
    btn.classList.add("prompt-btn", "yes-btn");

    btn.onclick = () => {
      container.remove();
      bookAppointment(slot);
    };

    container.appendChild(btn);
  });

  chatMessages.appendChild(container);
}

/* ================================
   SEND MESSAGE
================================ */

function sendMessage() {
  const userText = input.value.trim();
  if (!userText) return;

  addMessage(userText, "user");
  input.value = "";

  handleGroqAI(userText);
}

/* ================================
   GROQ AI
================================ */

async function handleGroqAI(userText) {

  addMessage("Thinking... 🤖", "bot");

  try {

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content: `
You are a friendly medical assistant.
If doctor consultation is recommended, clearly suggest seeing a physician.
`
          },
          { role: "user", content: userText }
        ]
      })
    });

    const data = await response.json();
    const aiReply = data.choices?.[0]?.message?.content || "Please consult a physician.";

    addMessage(aiReply, "bot");

    if (
      aiReply.toLowerCase().includes("consult") ||
      aiReply.toLowerCase().includes("physician") ||
      aiReply.toLowerCase().includes("doctor")
    ) {
      state.awaitingBookingConfirmation = true;
      addMessage("Would you like me to book an appointment for you?", "bot");
      addYesNoButtons();
    }

  } catch (error) {
    console.error(error);
    addMessage("⚠️ AI unavailable.", "bot");
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

  addMessage(
    `I recommend visiting ${hospitalData.name}, ${hospitalData.city}.`,
    "bot"
  );

  addMessage("Please select a preferred time:", "bot");

  addSlotButtons();
}

/* ================================
   RANDOM HOSPITAL
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
   RANDOM INFECTION DATA
================================ */

function generateRandomInfection() {

  const options = [
    { name: "E. coli", esbl: "Detected", ndm1: "Not Detected" },
    { name: "Klebsiella pneumoniae", esbl: "Detected", ndm1: "Detected" },
    { name: "Proteus mirabilis", esbl: "Not Detected", ndm1: "Not Detected" }
  ];

  return options[Math.floor(Math.random() * options.length)];
}

/* ================================
   BOOK APPOINTMENT
================================ */

async function bookAppointment(selectedSlot) {

  addMessage("Booking your appointment... ⏳", "bot");

  const infection = generateRandomInfection();

  /* Update RAW DATA PANEL */
  organismEl.innerText = infection.name;
  esblEl.innerText = infection.esbl;
  ndmEl.innerText = infection.ndm1;

  /* Dynamic color */
  esblEl.style.color = infection.esbl === "Detected" ? "red" : "green";
  ndmEl.style.color = infection.ndm1 === "Detected" ? "red" : "green";

  const { error } = await supabaseClient
    .from("appointments")
    .insert([
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

  if (error) {
    addMessage("❌ Booking failed.", "bot");
  } else {
    addMessage("✅ Appointment booked successfully.", "bot");
  }
}