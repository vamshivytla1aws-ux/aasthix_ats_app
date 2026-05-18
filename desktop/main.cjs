const path = require("path");
const { app, BrowserWindow, Menu, shell, Tray, nativeImage, ipcMain, Notification } = require("electron");
const { autoUpdater } = require("electron-updater");

const APP_NAME = "AASTHIX ATS";
const TARGET_URL = process.env.ATS_DESKTOP_TARGET_URL || "https://app.aasthix.com";
const ENTRY_PATH = process.env.ATS_DESKTOP_ENTRY_PATH || "/chat-app";
const CHAT_ENTRY_URL = `${TARGET_URL.replace(/\/+$/, "")}${ENTRY_PATH.startsWith("/") ? ENTRY_PATH : `/${ENTRY_PATH}`}`;
const CHANNEL = process.env.ATS_DESKTOP_CHANNEL || "stable";
const WINDOW_STATE_KEY = "window-state";
const SETTINGS_KEY = "desktop-settings";
const HEALTH_PATH = "/api/desktop/health";
const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 30;
const IN_APP_PATH_PREFIXES = ["/chat-app", "/login", "/signup", "/invite/accept", "/api", "/_next", "/uploads", "/favicon.ico"];

function isAllowedInAppUrl(url) {
  try {
    const safeOrigin = new URL(TARGET_URL).origin;
    const parsed = new URL(url);
    if (parsed.origin !== safeOrigin) return false;
    return IN_APP_PATH_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix));
  } catch {
    return false;
  }
}

let tray = null;
let mainWindow = null;
let didQuit = false;
let updateCheckTimer = null;
let healthRetryTimer = null;
let store = null;

function safeStore() {
  if (store) return store;
  const fs = require("fs");
  const storePath = path.join(app.getPath("userData"), "desktop-config.json");
  const defaults = {
    [WINDOW_STATE_KEY]: { width: 1320, height: 860, isMaximized: true },
    [SETTINGS_KEY]: { launchAtLogin: false, minimizeToTray: true },
  };

  function readAll() {
    try {
      if (!fs.existsSync(storePath)) return defaults;
      const raw = fs.readFileSync(storePath, "utf8");
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return defaults;
    }
  }

  function writeAll(next) {
    try {
      fs.writeFileSync(storePath, JSON.stringify(next, null, 2), "utf8");
    } catch (error) {
      console.error("desktop store write failed", error);
    }
  }

  store = {
    get(key) {
      return readAll()[key];
    },
    set(key, value) {
      const current = readAll();
      current[key] = value;
      writeAll(current);
    },
  };

  return store;
}

function getSettings() {
  const s = safeStore().get(SETTINGS_KEY) || {};
  return {
    launchAtLogin: !!s.launchAtLogin,
    minimizeToTray: s.minimizeToTray !== false,
  };
}

function applyLaunchAtLogin() {
  const settings = getSettings();
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin });
}

function iconPath() {
  const pngPath = path.join(__dirname, "..", "public", "brand-logo.png");
  return pngPath;
}

function createTray() {
  const icon = nativeImage.createFromPath(iconPath());
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip(APP_NAME);
  const contextMenu = Menu.buildFromTemplate([
    { label: "Open ATS", click: () => showMainWindow() },
    { type: "separator" },
    {
      label: "Launch at login",
      type: "checkbox",
      checked: getSettings().launchAtLogin,
      click: (item) => {
        const settings = getSettings();
        safeStore().set(SETTINGS_KEY, { ...settings, launchAtLogin: item.checked });
        applyLaunchAtLogin();
      },
    },
    {
      label: "Minimize to tray",
      type: "checkbox",
      checked: getSettings().minimizeToTray,
      click: (item) => {
        const settings = getSettings();
        safeStore().set(SETTINGS_KEY, { ...settings, minimizeToTray: item.checked });
      },
    },
    { type: "separator" },
    { label: "Quit", click: () => quitApp() },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => showMainWindow());
}

function loadFallbackPage(reason) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const fallbackPath = path.join(__dirname, "offline.html");
  mainWindow.loadFile(fallbackPath, { query: { target: CHAT_ENTRY_URL, reason } }).catch((err) => {
    console.error("fallback load failed", err);
  });
}

async function validateHealth() {
  const url = `${TARGET_URL.replace(/\/+$/, "")}${HEALTH_PATH}`;
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 7000);
    const resp = await fetch(url, { method: "GET", signal: ctrl.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error(`Health check returned ${resp.status}`);
    if (mainWindow && mainWindow.webContents.getURL().includes("offline.html")) {
      mainWindow.loadURL(CHAT_ENTRY_URL);
    }
  } catch (error) {
    console.error("health check failed", error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      loadFallbackPage("ATS service unreachable");
    }
  }
}

function startHealthChecks() {
  if (healthRetryTimer) clearInterval(healthRetryTimer);
  healthRetryTimer = setInterval(validateHealth, 1000 * 30);
}

function rememberWindowBounds(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMaximized()) {
    const current = safeStore().get(WINDOW_STATE_KEY) || {};
    safeStore().set(WINDOW_STATE_KEY, { ...current, isMaximized: true });
    return;
  }
  const bounds = win.getBounds();
  safeStore().set(WINDOW_STATE_KEY, {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized: false,
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function configureUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.channel = CHANNEL;

  autoUpdater.on("update-available", () => {
    new Notification({ title: APP_NAME, body: "Update available. Downloading in background." }).show();
  });
  autoUpdater.on("update-downloaded", () => {
    new Notification({ title: APP_NAME, body: "Update ready. It will install on next restart." }).show();
  });
  autoUpdater.on("error", (err) => {
    console.error("auto update error", err);
  });

  autoUpdater.checkForUpdates().catch((err) => console.error("check updates failed", err));
  updateCheckTimer = setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => console.error("scheduled update check failed", err));
  }, UPDATE_CHECK_INTERVAL_MS);
}

function createMainWindow() {
  const saved = safeStore().get(WINDOW_STATE_KEY) || {};
  const preload = path.join(__dirname, "preload.cjs");
  const icon = iconPath();
  mainWindow = new BrowserWindow({
    width: saved.width || 1320,
    height: saved.height || 860,
    x: saved.x,
    y: saved.y,
    minWidth: 1080,
    minHeight: 700,
    title: APP_NAME,
    icon,
    show: false,
    backgroundColor: "#0f172a",
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true,
      spellcheck: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow) return;
    const state = safeStore().get(WINDOW_STATE_KEY) || {};
    if (state.isMaximized || (!state.x && !state.y)) {
      mainWindow.maximize();
    }
    mainWindow.show();
  });
  mainWindow.on("resize", () => rememberWindowBounds(mainWindow));
  mainWindow.on("move", () => rememberWindowBounds(mainWindow));
  mainWindow.on("maximize", () => rememberWindowBounds(mainWindow));
  mainWindow.on("unmaximize", () => rememberWindowBounds(mainWindow));

  mainWindow.on("close", (event) => {
    if (didQuit) return;
    const settings = getSettings();
    if (settings.minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedInAppUrl(url)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedInAppUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on("did-fail-load", () => loadFallbackPage("Unable to load ATS"));
  mainWindow.loadURL(CHAT_ENTRY_URL).catch((err) => {
    console.error("initial load failed", err);
    loadFallbackPage("Initial connection failed");
  });
}

function quitApp() {
  didQuit = true;
  if (updateCheckTimer) clearInterval(updateCheckTimer);
  if (healthRetryTimer) clearInterval(healthRetryTimer);
  app.quit();
}

function createAppMenu() {
  const template = [
    {
      label: "ATS",
      submenu: [
        { label: "Open ATS", click: () => showMainWindow() },
        { label: "Reload", click: () => mainWindow && mainWindow.webContents.reload() },
        {
          label: "Check for updates",
          click: () => autoUpdater.checkForUpdates().catch((err) => console.error(err)),
        },
        { type: "separator" },
        { label: "Quit", click: () => quitApp() },
      ],
    },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "toggledevtools" }, { role: "resetzoom" }, { role: "zoomIn" }, { role: "zoomOut" }],
    },
    {
      label: "Window",
      submenu: [{ role: "togglefullscreen" }, { role: "minimize" }, { role: "close" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

ipcMain.handle("desktop:getDiagnostics", () => {
  const settings = getSettings();
  return {
    appVersion: app.getVersion(),
    channel: CHANNEL,
    targetUrl: CHAT_ENTRY_URL,
    launchAtLogin: settings.launchAtLogin,
    minimizeToTray: settings.minimizeToTray,
    platform: process.platform,
  };
});

ipcMain.handle("desktop:setLaunchAtLogin", (_evt, enabled) => {
  const settings = getSettings();
  safeStore().set(SETTINGS_KEY, { ...settings, launchAtLogin: !!enabled });
  applyLaunchAtLogin();
  return { ok: true };
});

ipcMain.handle("desktop:notify", (_evt, payload) => {
  if (!payload || !payload.title) return { ok: false };
  new Notification({ title: payload.title, body: payload.body || "" }).show();
  return { ok: true };
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showMainWindow());
  app.whenReady().then(() => {
    applyLaunchAtLogin();
    createTray();
    createAppMenu();
    createMainWindow();
    configureUpdater();
    validateHealth();
    startHealthChecks();
  });
}

app.on("before-quit", () => {
  didQuit = true;
});

app.on("activate", () => showMainWindow());

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Keep running in tray on Windows unless quit is explicit.
  }
});
