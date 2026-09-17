"use strict";

const { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");

const HOST = "127.0.0.1";
let PORT = Number(process.env.DOVEE_PORT || 3100);

const PROJECT_ROOT = path.join(__dirname, "..");
const ICON_PNG = path.join(__dirname, "icon.png");
const ICON_PATH = fs.existsSync(ICON_PNG) ? ICON_PNG : path.join(PROJECT_ROOT, "public", "dovee-logo.svg");

let mainWindow = null;
let nextProcess = null;
let startedNext = false;

function appUrl() {
  return `http://${HOST}:${PORT}`;
}

function isDev() {
  if (app.isPackaged) return false;
  return !process.argv.includes("--prod") && process.env.DOVEE_PROD !== "1";
}

function standaloneRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, "standalone");
  return path.join(PROJECT_ROOT, ".next", "standalone");
}

function resourceFile(...parts) {
  if (app.isPackaged) return path.join(process.resourcesPath, ...parts);
  return path.join(PROJECT_ROOT, ...parts);
}

function ping() {
  return new Promise((resolve) => {
    const req = http.get(appUrl(), (res) => {
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

function listenPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(port, HOST, () => {
      const address = server.address();
      const assigned = typeof address === "object" && address ? address.port : port;
      server.close(() => resolve(assigned));
    });
  });
}

async function getAvailablePort(preferred) {
  try {
    return await listenPort(preferred);
  } catch {
    return listenPort(0);
  }
}

async function waitForNext(timeoutMs = 120000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await ping()) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

function packagedFlagFile() {
  return path.join(os.homedir(), ".dovee", "packaged");
}

function setPackagedFlag() {
  try {
    fs.mkdirSync(path.dirname(packagedFlagFile()), { recursive: true });
    fs.writeFileSync(packagedFlagFile(), String(process.pid));
  } catch {
    /* ignore */
  }
}

function clearPackagedFlag() {
  try {
    fs.unlinkSync(packagedFlagFile());
  } catch {
    /* ignore */
  }
}

function writeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  const files = [path.join(os.tmpdir(), "dovee.log")];
  try {
    files.unshift(path.join(app.getPath("userData"), "dovee.log"));
  } catch {
    /* app path not ready */
  }
  for (const file of files) {
    try {
      fs.appendFileSync(file, line);
    } catch {
      /* ignore */
    }
  }
}

function startStandalone() {
  const root = standaloneRoot();
  const serverJs = path.join(root, "server.js");
  const nextPkg = path.join(root, "node_modules", "next", "package.json");
  if (!fs.existsSync(serverJs)) {
    throw new Error(`Missing server: ${serverJs}`);
  }
  if (!fs.existsSync(nextPkg)) {
    throw new Error(`Missing Next.js runtime: ${nextPkg}`);
  }

  const env = {
    ...process.env,
    PORT: String(PORT),
    HOSTNAME: HOST,
    NODE_ENV: "production",
    NODE_PATH: path.join(root, "node_modules"),
  };
  if (app.isPackaged) {
    env.DOVEE_PACKAGED = "1";
    env.DOVEE_WORKSPACE = path.join(os.homedir(), "Dovee");
  }
  delete env.ELECTRON_RUN_AS_NODE;

  nextProcess = utilityProcess.fork(serverJs, [], {
    cwd: root,
    env,
    stdio: "pipe",
    serviceName: "dovee-next",
  });
  startedNext = true;
  writeLog(`Started server ${serverJs} on ${HOST}:${PORT}`);
  nextProcess.stdout?.on("data", (chunk) => writeLog(String(chunk).trimEnd()));
  nextProcess.stderr?.on("data", (chunk) => writeLog(String(chunk).trimEnd()));
  nextProcess.on("exit", (code) => {
    startedNext = false;
    writeLog(`Server exited with code ${code}`);
  });
}

function startNext() {
  const serverJs = path.join(standaloneRoot(), "server.js");
  if (!isDev() && fs.existsSync(serverJs)) {
    startStandalone();
    return;
  }

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const script = isDev() ? "dev" : "start";
  const env = { ...process.env, PORT: String(PORT) };
  delete env.ELECTRON_RUN_AS_NODE;

  nextProcess = spawn(npmCmd, ["run", script], {
    cwd: PROJECT_ROOT,
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
  startedNext = false;
  try {
    child.kill();
  } catch {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], {
        stdio: "ignore",
        windowsHide: true,
      });
    }
  }
}

function logoMarkup() {
  const candidates = [
    resourceFile("public", "dovee-logo.svg"),
    path.join(PROJECT_ROOT, "public", "dovee-logo.svg"),
  ];
  for (const file of candidates) {
    try {
      return fs.readFileSync(file, "utf8");
    } catch {
      /* try next */
    }
  }
  return "";
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
  win.show();

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(appUrl()) || url.startsWith("data:text/html")) return;
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

    writeLog(`ready packaged=${app.isPackaged} standalone=${standaloneRoot()}`);
    if (app.isPackaged) setPackagedFlag();
    const win = createWindow();
    void loadHtml(win, "Starting Dovee…");

    try {
      const serverJs = path.join(standaloneRoot(), "server.js");
      writeLog(`server.js exists=${fs.existsSync(serverJs)}`);
      if (app.isPackaged || (!isDev() && fs.existsSync(serverJs))) {
        PORT = await getAvailablePort(PORT);
        writeLog(`using port ${PORT}`);
        startNext();
      } else {
        const alreadyUp = await ping();
        if (!alreadyUp) startNext();
      }

      const ready = await waitForNext();
      if (!ready) {
        const logFile = path.join(app.getPath("userData"), "dovee.log");
        writeLog(`timeout waiting for ${appUrl()}`);
        await loadHtml(win, `Could not start Dovee on ${appUrl()}. See ${logFile}`, "#e07a7a");
        return;
      }

      writeLog(`loading ${appUrl()}`);
      await win.loadURL(appUrl());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeLog(message);
      await loadHtml(win, message, "#e07a7a");
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createWindow();
      void win.loadURL(appUrl());
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    clearPackagedFlag();
    stopNext();
  });
}
