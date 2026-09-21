const { app, BrowserWindow, Tray, Menu, shell } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      // Page JS gets no Node access. Anything injected via patient data
      // (XSS) can no longer run code on the doctor's machine.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, "doctor.html"));

  // Links in AI answers open in the real browser, never inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (e) => e.preventDefault());

  mainWindow.on("closed", () => (mainWindow = null));
}

function createTray() {
  const iconPath = path.join(__dirname, "icon.ico");
  if (!fs.existsSync(iconPath)) return;

  try {
    tray = new Tray(iconPath);
  } catch (e) {
    console.warn("Tray unavailable:", e.message);
    return;
  }

  tray.setToolTip("BIOGUARD Doctor Dashboard");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Open Dashboard",
        click: () => (mainWindow ? mainWindow.show() : createWindow())
      },
      { label: "Quit", click: () => app.quit() }
    ])
  );
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
