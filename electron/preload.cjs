"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("doveeDesktop", {
  isDesktop: true,
  platform: process.platform,
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  pickFolder: (startPath) => ipcRenderer.invoke("folder:pick", startPath),
});
