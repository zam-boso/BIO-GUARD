const { app, BrowserWindow, Tray, Menu, Notification } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "doctor.html"));
}

function createTray() {
  const iconPath = path.join(__dirname, "icon.png");

  if (!fs.existsSync(iconPath)) {
    console.log("icon.png missing — tray disabled");
    return;
  }

  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    { label: "Open Dashboard", click: () => mainWindow.show() },
    { label: "Quit", click: () => app.quit() }
  ]);

  tray.setToolTip("BIOGUARD Doctor Dashboard");
  tray.setContextMenu(contextMenu);
}

function showNotification(title, body) {
  new Notification({
    title,
    body
  }).show();
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});