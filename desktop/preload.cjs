const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("atsDesktop", {
  getDiagnostics: () => ipcRenderer.invoke("desktop:getDiagnostics"),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke("desktop:setLaunchAtLogin", enabled),
  notify: (title, body) => ipcRenderer.invoke("desktop:notify", { title, body }),
});
