/* ================= SUPABASE ================= */

const supabaseClient = supabase.createClient(
  "https://ipzxppqiktomxbbcrauv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwenhwcHFpa3RvbXhiYmNyYXV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTk1NzksImV4cCI6MjA4Nzc3NTU3OX0.i2mloYWuxkoX0febaCu_HtZ00weaY514PfXFO0HD_Y4"
);

const GROQ_API_KEY = "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";

/* ================= GLOBAL STATE ================= */

let currentPatient = null;
let chartInstance = null;
let patientChats = {};

/* ================= INIT ================= */

window.onload = () => {
  loadPatients(getActiveTab());
  realtime();
  setupTabs();
};

/* ================= REALTIME ================= */

function realtime(){
  supabaseClient.channel("realtime")
    .on("postgres_changes",
      { event:"INSERT", schema:"public", table:"appointments" },
      ()=>{
        loadPatients(getActiveTab());
      }
    )
    .subscribe();
}

/* ================= TABS ================= */

function setupTabs(){
  const tabs = document.querySelectorAll(".tab");

  tabs.forEach(tab=>{
    tab.addEventListener("click",()=>{
      tabs.forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");

      if(tab.innerText.includes("Today")) loadPatients("today");
      else if(tab.innerText.includes("High")) loadPatients("high");
      else if(tab.innerText.includes("Follow")) loadPatients("follow");
      else loadPatients("all");
    });
  });
}

function getActiveTab(){
  const active = document.querySelector(".tab.active");
  if(!active) return "today";

  if(active.innerText.includes("Today")) return "today";
  if(active.innerText.includes("High")) return "high";
  if(active.innerText.includes("Follow")) return "follow";
  return "all";
}

/* ================= LOAD PATIENT LIST ================= */

async function loadPatients(filter){

  const {data,error} = await supabaseClient
    .from("appointments")
    .select("*")
    .order("id", { ascending: false });

  if(error){
    console.error(error);
    return;
  }

  let filtered = data;

  if(filter === "high"){
    filtered = data.filter(p => p.severity === "severe");
  }

  const list = document.getElementById("appointmentList");
  list.innerHTML = "";

  filtered.forEach(p => {

    const tile = document.createElement("div");
    tile.className = "patient-tile";

    /* ================= HIGHLIGHTING ================= */

    if(p.severity === "severe"){
      tile.style.borderLeft = "5px solid red";
      tile.style.background = "#ffe6e6";
    }

    if(p.severity === "moderate"){
      tile.style.borderLeft = "5px solid orange";
      tile.style.background = "#fff7e6";
    }

    tile.innerHTML = `
      <div class="patient-avatar">
        ${p.patient_name.charAt(0).toUpperCase()}
      </div>

      <div class="patient-info">
        <div class="patient-name">${p.patient_name}</div>
        <div class="patient-sub">${p.organism}</div>
      </div>

      <div class="patient-severity ${p.severity}">
        ${p.severity}
      </div>
    `;

    tile.onclick = () => loadPatient(p);

    list.appendChild(tile);
  });
}

/* ================= LOAD PATIENT ================= */

async function loadPatient(p){

  currentPatient = p;

  if(!patientChats[p.id]){
    patientChats[p.id] = [];
  }

  const chatBox = document.getElementById("chatBox");
  chatBox.innerHTML = "";

  const header = document.createElement("div");
  header.className = "chat-patient-header";
  header.innerText = "AI Session: " + p.patient_name;
  chatBox.appendChild(header);

  patientChats[p.id].forEach(msg=>{
    addMessage(msg.content, msg.role === "assistant" ? "bot" : "user");
  });

  document.getElementById("patientInfo").innerHTML =
    `<b>${p.patient_name}</b><br>
     Organism: ${p.organism}<br>
     Severity: ${p.severity}`;

  renderSeverity(p.severity);
  renderDynamicData(p);

  if(patientChats[p.id].length === 0){
    generateAutoInsight();
  }
}

/* ================= DYNAMIC EFFECTIVENESS ================= */

function renderDynamicData(p){

  const map = {
    normal: [92,78,55],
    moderate: [70,60,40],
    severe: [50,45,30]
  };

  const values = map[p.severity] || map.normal;

  const cards = document.querySelectorAll(".effect-card");

  cards[0].querySelector(".effect-percent").innerText = values[0] + "% Effective";
  cards[1].querySelector(".effect-percent").innerText = values[1] + "% Effective";
  cards[2].querySelector(".effect-percent").innerText = values[2] + "% Effective";
}

/* ================= SEVERITY BAR ================= */

function renderSeverity(s){

  const bar = document.getElementById("severityBar");

  let percent = 30;
  let color = "green";

  if(s === "severe"){ percent = 90; color = "red"; }
  else if(s === "moderate"){ percent = 60; color = "orange"; }

  bar.style.width = percent + "%";
  bar.style.background = color;

  document.getElementById("severityPercent").innerText = percent + "%";

  renderChart(percent);
}

/* ================= CHART ================= */

function renderChart(percent){

  const ctx = document.getElementById("severityChart");

  if(chartInstance) chartInstance.destroy();

  chartInstance = new Chart(ctx,{
    type:"doughnut",
    data:{
      datasets:[{
        data:[percent,100-percent],
        backgroundColor:["#ff4d4d","#e0e0e0"]
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{ legend:{ display:false } }
    }
  });
}

/* ================= AUTO AI ================= */

async function generateAutoInsight(){

  const prompt = `
Patient: ${currentPatient.patient_name}
Organism: ${currentPatient.organism}
Severity: ${currentPatient.severity}

Provide concise clinical treatment suggestion.
`;

  const res = await callGroq(prompt);

  patientChats[currentPatient.id].push({role:"assistant",content:res});
  addMessage(res,"bot");
}

/* ================= MANUAL AI ================= */

async function generateInsight(){
  if(!currentPatient) return;

  const res = await callGroq("Provide clinical management summary.");
  patientChats[currentPatient.id].push({role:"assistant",content:res});
  addMessage(res,"bot");
}

/* ================= CHAT ================= */

async function sendMessage(){

  const input = document.getElementById("chatInput");
  const text = input.value.trim();

  if(!text || !currentPatient) return;

  addMessage(text,"user");
  patientChats[currentPatient.id].push({role:"user",content:text});

  const res = await callGroq(text);

  patientChats[currentPatient.id].push({role:"assistant",content:res});
  addMessage(res,"bot");

  input.value = "";
}

function addMessage(t,role){
  const box = document.getElementById("chatBox");
  const d = document.createElement("div");
  d.className = role === "user" ? "user-msg" : "bot-msg";
  d.innerText = t;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

/* ================= GROQ ================= */

async function callGroq(msg){

  const history = patientChats[currentPatient.id] || [];

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions",{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${GROQ_API_KEY}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model:"llama-3.3-70b-versatile",
      messages:[
        {role:"system",content:"You are an infectious disease clinical AI."},
        ...history,
        {role:"user",content:msg}
      ],
      temperature:0.3
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
}