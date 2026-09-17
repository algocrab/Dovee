"use strict";

const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.DOVEE_PORT || 3100);
const HOST = "127.0.0.1";
const APP_URL = `http://${HOST}:${PORT}`;
const ROOT = path.join(__dirname, "..");
const LOGO_SVG = path.join(ROOT, "public", "dovee-logo.svg");
const ICON_PNG = path.join(__dirname, "icon.png");
const ICON_PATH = fs.existsSync(ICON_PNG) ? ICON_PNG : LOGO_SVG;

let mainWindow = null;
let nextProcess = null;
let startedNext = false;

function isDev() {
  return !process.argv.includes("--prod") && process.env.DOVEE_PROD !== "1";
}

function ping() {
  return new Promise((resolve) => {
    const req = http.get(APP_URL, (res) => {
      res.resume();
      resolve(typeof res.statusCode === "number" && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForNext(timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await ping()) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

function startNext() {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const script = isDev() ? "dev" : "start";
  const env = { ...process.env, PORT: String(PORT) };
  delete env.ELECTRON_RUN_AS_NODE;

  nextProcess = spawn(npmCmd, ["run", script], {
    cwd: ROOT,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  startedNext = true;

  nextProcess.on("error", (err) => {
    console.error("Failed to start Next.js:", err);
  });
}

function stopNext() {
  if (!nextProcess || !startedNext) return;
  const child = nextProcess;
  nextProcess = null;
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  child.kill("SIGTERM");
}

function logoMarkup() {
  try {
    return fs.readFileSync(LOGO_SVG, "utf8");
  } catch {
    return "";
  }
}

function loadHtml(win, body, color = "#9a97a3") {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Dovee</title>
    <style>
      html, body { height: 100%; margin: 0; background: #09090b; color: ${color}; font-family: Segoe UI, system-ui, sans-serif; }
      body { display: flex; align-items: center; justify-content: center; -webkit-app-region: drag; }
      .splash { display: flex; flex-direction: column; align-items: center; gap: 16px; }
      .splash svg { width: 96px; height: auto; display: block; }
    </style>
  </head>
  <body>
    <div class="splash">${logoMarkup()}<div>${body}</div></div>
  </body>
</html>`;
  return win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "Dovee",
    icon: ICON_PATH,
    backgroundColor: "#09090b",
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 12, y: 10 },
    titleBarOverlay:
      process.platform === "darwin"
        ? undefined
        : {
            color: "#101117",
            symbolColor: "#eeeae3",
            height: 36,
          },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setMenuBarVisibility(false);
  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(APP_URL) || url.startsWith("data:text/html")) return;
    event.preventDefault();
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
    }
  });

  mainWindow = win;
  return win;
}

ipcMain.on("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on("window:maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle("folder:pick", async (event, startPath) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const options = {
    title: "Open Folder",
    buttonLabel: "Select Folder",
    defaultPath: typeof startPath === "string" && startPath ? startPath : undefined,
    properties: ["openDirectory", "createDirectory"],
  };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    if (process.platform === "win32") {
      app.setAppUserModelId("com.dovee.ide");
    }
    if (process.platform === "darwin" && app.dock) {
      app.dock.setIcon(ICON_PATH);
    }

    const win = createWindow();
    await loadHtml(win, "Starting Dovee…");

    const alreadyUp = await ping();
    if (!alreadyUp) startNext();

    const ready = await waitForNext();
    if (!ready) {
      await loadHtml(win, `Could not start Dovee on ${APP_URL}.`, "#e07a7a");
      return;
    }

    await win.loadURL(APP_URL);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createWindow();
      void win.loadURL(APP_URL);
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    stopNext();
  });
}
