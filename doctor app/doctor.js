/* ================= CONFIG =================
 * No API keys here. The Groq key lives on the backend (see /backend).
 * BACKEND_URL is the deployed FastAPI service; localhost for development.
 */

const BACKEND_URL = "https://bioguard-backend-neno.onrender.com";

const SUPABASE_URL = "https://ipzxppqiktomxbbcrauv.supabase.co";
// Supabase anon key is public by design; protect data with Row Level Security.
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwenhwcHFpa3RvbXhiYmNyYXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTk1NzksImV4cCI6MjA4Nzc3NTU3OX0.i2mloYWuxkoX0febaCu_HtZ00weaY514PfXFO0HD_Y4";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ================= GLOBAL STATE ================= */

let currentPatient = null;
let chartInstance = null;
let allPatients = [];
const patientChats = {};
const notifications = [];

/* ================= INIT ================= */

window.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupControls();
  loadPatients();
  realtime();
});

function setupControls() {
  document.getElementById("summaryBtn").addEventListener("click", generateInsight);
  document.getElementById("sendBtn").addEventListener("click", sendMessage);
  document.getElementById("chatInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
  });
  document.getElementById("notifBell").addEventListener("click", toggleTray);
  document.getElementById("patientSearch").addEventListener("input", renderPatientList);
}

/* ================= HELPERS ================= */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function isDetected(v) {
  return String(v || "").trim().toLowerCase() === "detected";
}

/* ================= RESISTANCE RISK =================
 * Derived from the markers the patient app actually records.
 * NDM-1 (carbapenemase) > ESBL > none.
 * If the row already has a severity value, use the higher of the two.
 */

const RISK_ORDER = { normal: 0, moderate: 1, severe: 2 };

function getRisk(p) {
  let risk = "normal";
  if (isDetected(p.ndm1)) risk = "severe";
  else if (isDetected(p.esbl)) risk = "moderate";

  const stored = String(p.severity || "").toLowerCase();
  if (stored in RISK_ORDER && RISK_ORDER[stored] > RISK_ORDER[risk]) risk = stored;
  return risk;
}

const RISK_LABEL = { normal: "Low", moderate: "Moderate", severe: "High" };
const RISK_SCORE = { normal: 25, moderate: 60, severe: 90 };

/* ================= EMPIRICAL OPTIONS (rule-based demo) =================
 * tier: "likely"  -> likely active
 *       "uncertain" -> depends on local antibiogram / site of infection
 *       "reserve" -> active but broader than needed (stewardship)
 *       "unlikely"  -> likely inactive
 * Ordered so narrower-spectrum active options appear first.
 */

function getEmpiricalOptions(p) {
  const esbl = isDetected(p.esbl);
  const ndm = isDetected(p.ndm1);
  const organism = String(p.organism || "").toLowerCase();
  const isProteus = organism.includes("proteus");

  const opts = [];

  // Nitrofurantoin (lower UTI only)
  if (isProteus) {
    opts.push({ drug: "Nitrofurantoin", tier: "unlikely", note: "Proteus is intrinsically resistant." });
  } else {
    opts.push({
      drug: "Nitrofurantoin",
      tier: ndm ? "uncertain" : "likely",
      note: "Uncomplicated cystitis only; not for pyelonephritis or bacteraemia."
    });
  }

  // Fosfomycin (lower UTI)
  opts.push({
    drug: "Fosfomycin",
    tier: ndm ? "uncertain" : "likely",
    note: "Oral option for uncomplicated cystitis."
  });

  // Ciprofloxacin
  opts.push({
    drug: "Ciprofloxacin",
    tier: esbl || ndm ? "unlikely" : "uncertain",
    note: esbl || ndm
      ? "Frequent co-resistance with ESBL / carbapenemase producers."
      : "High regional fluoroquinolone resistance; check local antibiogram."
  });

  // Ceftriaxone
  opts.push({
    drug: "Ceftriaxone",
    tier: esbl || ndm ? "unlikely" : "likely",
    note: esbl || ndm ? "Hydrolysed by ESBL / NDM enzymes." : "Standard option for pyelonephritis."
  });

  // Piperacillin-tazobactam
  opts.push({
    drug: "Piperacillin-tazobactam",
    tier: ndm ? "unlikely" : esbl ? "uncertain" : "likely",
    note: esbl && !ndm ? "Inferior to carbapenems for serious ESBL infections." : ""
  });

  // Meropenem
  opts.push({
    drug: "Meropenem",
    // No markers: it works, but it's a carbapenem; don't nudge toward it.
    tier: ndm ? "unlikely" : esbl ? "likely" : "reserve",
    note: ndm
      ? "NDM-1 is a carbapenemase."
      : esbl
        ? "Preferred for serious ESBL infections. Reserve-use: stewardship review."
        : "Not needed without resistance markers; avoid to preserve carbapenems."
  });

  if (ndm) {
    opts.push({
      drug: "Ceftazidime-avibactam + Aztreonam",
      tier: "likely",
      note: "Combination used for metallo-β-lactamase producers. ID consult advised."
    });
    opts.push({
      drug: "Colistin",
      tier: isProteus ? "unlikely" : "uncertain",
      note: isProteus
        ? "Proteus is intrinsically resistant."
        : "Last-resort; nephrotoxic. ID consult advised."
    });
  }

  const rank = { likely: 0, uncertain: 1, reserve: 2, unlikely: 3 };
  return opts.sort((a, b) => rank[a.tier] - rank[b.tier]);
}

const TIER_STYLE = {
  likely: { cls: "green", label: "Likely active" },
  uncertain: { cls: "yellow", label: "Uncertain" },
  reserve: { cls: "grey", label: "Active, but reserve" },
  unlikely: { cls: "red", label: "Likely inactive" }
};

/* ================= REALTIME ================= */

function realtime() {
  supabaseClient
    .channel("realtime")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "appointments" },
      (payload) => {
        if (payload && payload.new) addNotification(payload.new);
        loadPatients();
      }
    )
    .subscribe();
}

/* ================= NOTIFICATIONS ================= */

function addNotification(p) {
  notifications.unshift(p);
  document.getElementById("notifCount").textContent = String(notifications.length);
  renderTray();
}

function renderTray() {
  const tray = document.getElementById("notifTray");
  tray.replaceChildren();

  if (notifications.length === 0) {
    tray.appendChild(el("div", "notif-item", "No new appointments."));
    return;
  }

  notifications.forEach((p) => {
    const risk = getRisk(p);
    const item = el("div", "notif-item " + (risk === "severe" ? "severe" : "pending"));
    item.appendChild(el("b", null, p.patient_name || "Unknown patient"));
    item.appendChild(el("div", null, `${p.organism || "Organism pending"} · ${RISK_LABEL[risk]} MDR risk`));
    if (p.slot) item.appendChild(el("div", null, p.slot));

    const btn = el("button", null, "Open");
    btn.addEventListener("click", () => {
      toggleTray(false);
      loadPatient(p);
    });
    item.appendChild(btn);
    tray.appendChild(item);
  });
}

function toggleTray(force) {
  const tray = document.getElementById("notifTray");
  const show = typeof force === "boolean" ? force : tray.style.display !== "block";
  if (show) renderTray();
  tray.style.display = show ? "block" : "none";
  if (show) {
    notifications.length = 0;
    document.getElementById("notifCount").textContent = "0";
  }
}

/* ================= TABS ================= */

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      renderPatientList();
    });
  });
}

function getActiveTab() {
  const active = document.querySelector(".tab.active");
  return (active && active.dataset.filter) || "today";
}

function isToday(ts) {
  if (!ts) return false;
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/* ================= LOAD PATIENT LIST ================= */

async function loadPatients() {
  const list = document.getElementById("appointmentList");

  const { data, error } = await supabaseClient
    .from("appointments")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    console.error(error);
    list.replaceChildren(
      el("div", "empty-note", "Could not load patients: " + (error.message || "database unreachable"))
    );
    return;
  }

  allPatients = data || [];
  renderPatientList();
}

function filterPatients(filter) {
  const hasTimestamps = allPatients.some((p) => p.created_at);

  switch (filter) {
    case "high":
      return allPatients.filter((p) => getRisk(p) === "severe");
    case "follow":
      return allPatients.filter((p) => {
        const s = String(p.status || "").toLowerCase();
        return s.includes("follow");
      });
    case "today":
      // Fall back to everything if the table has no created_at column.
      return hasTimestamps ? allPatients.filter((p) => isToday(p.created_at)) : allPatients;
    default:
      return allPatients;
  }
}

function renderPatientList() {
  const list = document.getElementById("appointmentList");
  const query = document.getElementById("patientSearch").value.trim().toLowerCase();

  let filtered = filterPatients(getActiveTab());
  if (query) {
    filtered = filtered.filter((p) =>
      String(p.patient_name || "").toLowerCase().includes(query)
    );
  }

  list.replaceChildren();

  if (filtered.length === 0) {
    list.appendChild(el("div", "empty-note", "No patients in this view."));
    return;
  }

  filtered.forEach((p) => {
    const risk = getRisk(p);
    const name = p.patient_name || "Unknown";

    const tile = el("div", "patient-tile");
    if (risk === "severe") {
      tile.style.borderLeft = "5px solid red";
      tile.style.background = "#ffe6e6";
    } else if (risk === "moderate") {
      tile.style.borderLeft = "5px solid orange";
      tile.style.background = "#fff7e6";
    }

    tile.appendChild(el("div", "patient-avatar", name.charAt(0).toUpperCase()));

    const info = el("div", "patient-info");
    info.appendChild(el("div", "patient-name", name));
    info.appendChild(el("div", "patient-sub", p.organism || "Organism pending"));
    tile.appendChild(info);

    tile.appendChild(el("div", "patient-severity " + risk, RISK_LABEL[risk]));

    tile.addEventListener("click", () => loadPatient(p));
    list.appendChild(tile);
  });
}

/* ================= LOAD PATIENT ================= */

function loadPatient(p) {
  currentPatient = p;
  if (!patientChats[p.id]) patientChats[p.id] = [];

  const risk = getRisk(p);

  // Patient card
  const card = document.getElementById("patientInfo");
  card.replaceChildren();
  card.appendChild(el("b", null, p.patient_name || "Unknown"));
  card.appendChild(el("div", null, "Organism: " + (p.organism || "pending")));
  [["ESBL", p.esbl], ["NDM-1", p.ndm1]].forEach(([label, val]) => {
    const row = el("div", "marker-row", label + ": ");
    const detected = isDetected(val);
    row.appendChild(
      el("span", "marker " + (detected ? "detected" : "not-detected"), val || "Not tested")
    );
    card.appendChild(row);
  });
  if (p.slot) card.appendChild(el("div", null, "Slot: " + p.slot));

  // Chat history
  const chatBox = document.getElementById("chatBox");
  chatBox.replaceChildren(el("div", "chat-patient-header", "AI Session: " + (p.patient_name || "")));
  patientChats[p.id].forEach((msg) =>
    addMessage(msg.content, msg.role === "assistant" ? "bot" : "user")
  );

  renderRisk(risk);
  renderOptions(p);
  renderMdr(risk);

  if (patientChats[p.id].length === 0) generateAutoInsight();
}

/* ================= RISK SCORE ================= */

function renderRisk(risk) {
  const percent = RISK_SCORE[risk];
  const color = risk === "severe" ? "#e74c3c" : risk === "moderate" ? "#f39c12" : "#2ecc71";

  const bar = document.getElementById("severityBar");
  bar.style.width = percent + "%";
  bar.style.background = color;
  document.getElementById("severityPercent").textContent = percent + "%";

  renderChart(percent, color);
}

function renderChart(percent, color) {
  const ctx = document.getElementById("severityChart");
  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Risk", ""],
      datasets: [{ data: [percent, 100 - percent], backgroundColor: [color, "#e0e0e0"] }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    }
  });
}

/* ================= OPTIONS + MDR ================= */

function renderOptions(p) {
  const panel = document.getElementById("effectivenessPanel");
  panel.replaceChildren();

  getEmpiricalOptions(p).forEach((o) => {
    const style = TIER_STYLE[o.tier];
    const card = el("div", "effect-card " + style.cls);
    card.appendChild(el("div", "drug-name", o.drug));
    card.appendChild(el("div", "effect-percent", style.label));
    if (o.note) card.appendChild(el("div", "effect-note", o.note));
    panel.appendChild(card);
  });
}

function renderMdr(risk) {
  const map = { normal: "mdrLow", moderate: "mdrModerate", severe: "mdrHigh" };
  ["mdrLow", "mdrModerate", "mdrHigh"].forEach((id) =>
    document.getElementById(id).classList.toggle("active", id === map[risk])
  );
}

/* ================= AI ================= */

function patientContext(p) {
  return {
    name: p.patient_name || "Unknown",
    organism: p.organism || "",
    esbl: p.esbl || "",
    ndm1: p.ndm1 || "",
    risk: RISK_LABEL[getRisk(p)],
    options: getEmpiricalOptions(p).map(
      (o) => `${o.drug}: ${TIER_STYLE[o.tier].label}${o.note ? " (" + o.note + ")" : ""}`
    )
  };
}

/* The backend adds the system prompt and holds the API key. */
async function askBackend(patient, userMsg) {
  const history = (patientChats[patient.id] || []).slice(-12);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${BACKEND_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "doctor",
        patient: patientContext(patient),
        messages: [...history, { role: "user", content: userMsg }]
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.detail || `Backend returned HTTP ${response.status}`);
    }
    if (!data.reply) throw new Error("The backend returned an empty reply.");
    return data.reply;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("The request timed out.");
    if (e instanceof TypeError) {
      throw new Error(`Cannot reach the backend at ${BACKEND_URL}. Is it running?`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Runs one AI turn and handles UI state + errors in one place.
async function runAi(userMsg, { showUser = false, record = true } = {}) {
  const patient = currentPatient;
  if (!patient) return;

  if (showUser) addMessage(userMsg, "user");

  const pending = addMessage("Thinking…", "bot pending");
  setBusy(true);

  try {
    const reply = await askBackend(patient, userMsg);
    if (record) {
      patientChats[patient.id].push({ role: "user", content: userMsg });
      patientChats[patient.id].push({ role: "assistant", content: reply });
    }
    // Only paint the reply if the doctor is still on the same patient.
    if (currentPatient && currentPatient.id === patient.id) {
      pending.remove();
      addMessage(reply, "bot");
    }
  } catch (e) {
    console.error(e);
    if (currentPatient && currentPatient.id === patient.id) {
      pending.remove();
      addMessage("⚠️ " + e.message, "bot error");
    }
  } finally {
    setBusy(false);
  }
}

function setBusy(busy) {
  document.getElementById("sendBtn").disabled = busy;
  document.getElementById("summaryBtn").disabled = busy;
}

function generateAutoInsight() {
  runAi("Give a concise initial empirical treatment suggestion for this patient.");
}

function generateInsight() {
  if (!currentPatient) return;
  runAi("Provide a structured clinical management summary for this patient.", { showUser: true });
}

function sendMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text || !currentPatient) return;
  input.value = "";
  runAi(text, { showUser: true });
}

function addMessage(text, role) {
  const box = document.getElementById("chatBox");
  const isUser = role.startsWith("user");
  const cls = isUser ? "user-msg" : "bot-msg" + role.slice(3);

  const d = el("div", cls);
  if (isUser || role.includes("pending") || role.includes("error")) {
    d.textContent = text;
  } else {
    // AI replies come back as Markdown; render headings, lists and tables.
    d.appendChild(renderMarkdown(text));
  }

  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
  return d;
}
