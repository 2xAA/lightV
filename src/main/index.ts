import { app, shell, BrowserWindow, ipcMain } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";

// Lazy-load node-syphon in main process
let SyphonOpenGLClient: any;
let SyphonServerDirectory: any;
let SyphonServerDirectoryListenerChannel: any;

function loadSyphon(): void {
  if (!SyphonOpenGLClient) {
    const mod = require("node-syphon");
    SyphonOpenGLClient = mod.SyphonOpenGLClient;
    SyphonServerDirectory = mod.SyphonServerDirectory;
    SyphonServerDirectoryListenerChannel =
      mod.SyphonServerDirectoryListenerChannel;
  }
}

let directory: any | null = null;
let client: any | null = null;
let currentFrameHandler: ((frame: any) => void) | null = null;
let focusedWindow: BrowserWindow | null = null;

// Cache the latest frame for pull-based IPC (legacy single-client path)
let latestFrame: { buffer: ArrayBuffer; width: number; height: number } | null =
  null;

// Multi-client support
type Frame = { buffer: ArrayBuffer; width: number; height: number };

const clientMap = new Map<
  number,
  { client: any; handler: (frame: any) => void; latest: Frame | null }
>();
let nextClientId = 1;

function deriveServerName(server: any): string {
  const app = server?.appName ?? server?.applicationName ?? null;
  const srv = server?.serverName ?? server?.name ?? null;
  const parts = [app, srv].filter(Boolean);
  return parts.length > 0 ? String(parts.join(" - ")) : "";
}

function currentServers(): Array<{ index: number; name: string }> {
  if (!directory || !Array.isArray(directory.servers)) return [];
  return directory.servers.map((s: any, i: number) => ({
    index: i,
    name: deriveServerName(s) || `Server ${i}`,
  }));
}

function broadcastServers(): void {
  if (!focusedWindow || !directory) return;
  const list = currentServers();
  focusedWindow.webContents.send("syphon:servers", list);
}

function startSyphon(): void {
  if (directory) {
    // Already listening: just broadcast current list to refresh renderer after reload
    broadcastServers();
    return;
  }
  loadSyphon();
  directory = new SyphonServerDirectory();

  directory.on(
    SyphonServerDirectoryListenerChannel.SyphonServerAnnounceNotification,
    (_server: any) => {
      if (directory && directory.servers.length > 0 && !client) {
        attachClientForServer(directory.servers[directory.servers.length - 1]);
      }
      broadcastServers();
    },
  );

  directory.on(
    SyphonServerDirectoryListenerChannel.SyphonServerRetireNotification,
    (_server: any) => {
      broadcastServers();
    },
  );

  directory.listen();
  broadcastServers();
}

function detachClient(): void {
  if (!client) return;
  if (currentFrameHandler) {
    if (typeof client.off === "function") {
      client.off("data", currentFrameHandler);
    } else if (typeof client.removeListener === "function") {
      client.removeListener("data", currentFrameHandler);
    } else if (typeof client.removeAllListeners === "function") {
      client.removeAllListeners("data");
    }
  } else if (typeof client.removeAllListeners === "function") {
    client.removeAllListeners("data");
  }
  currentFrameHandler = null;
  client = null;
}

function stopSyphon(): void {
  if (client) {
    detachClient();
  }
  // dispose multi-clients
  for (const [id, entry] of clientMap) {
    try {
      if (entry.client && entry.handler) {
        if (typeof entry.client.off === "function")
          entry.client.off("data", entry.handler);
        else if (typeof entry.client.removeListener === "function")
          entry.client.removeListener("data", entry.handler);
        else if (typeof entry.client.removeAllListeners === "function")
          entry.client.removeAllListeners("data");
      }
    } catch {}
    clientMap.delete(id);
  }
  if (directory) {
    if (typeof directory.removeAllListeners === "function") {
      directory.removeAllListeners();
    }
    directory = null;
  }
}

function attachClientForServer(server: any): void {
  if (!server) return;
  if (client) {
    detachClient();
  }
  client = new SyphonOpenGLClient(server);
  currentFrameHandler = (frame: any) => {
    if (!focusedWindow) return;
    const width: number = frame.width;
    const height: number = frame.height;
    const buf: Buffer = frame.buffer;
    const ab = new ArrayBuffer(buf.byteLength);
    const view = new Uint8Array(ab);
    view.set(buf);
    latestFrame = { buffer: ab, width, height };
  };
  if (typeof client.on === "function") {
    client.on("data", currentFrameHandler);
  } else if (typeof client.addListener === "function") {
    client.addListener("data", currentFrameHandler);
  }
}

function selectServer(index: number): void {
  if (!directory) return;
  const server = directory.servers[index];
  if (!server) return;
  attachClientForServer(server);
}

// Multi-client helpers
function createClientForServerIndex(index: number): number | null {
  if (!directory) return null;
  const server = directory.servers[index];
  if (!server) return null;
  const c = new SyphonOpenGLClient(server);
  const id = nextClientId++;
  const entry = {
    client: c,
    handler: (frame: any) => {
      const width: number = frame.width;
      const height: number = frame.height;
      const buf: Buffer = frame.buffer;
      const ab = new ArrayBuffer(buf.byteLength);
      const view = new Uint8Array(ab);
      view.set(buf);
      const f: Frame = { buffer: ab, width, height };
      const e = clientMap.get(id);
      if (e) e.latest = f;
    },
    latest: null as Frame | null,
  };
  if (typeof c.on === "function") c.on("data", entry.handler);
  else if (typeof c.addListener === "function")
    c.addListener("data", entry.handler);
  clientMap.set(id, entry);
  return id;
}

function destroyClient(clientId: number): void {
  const entry = clientMap.get(clientId);
  if (!entry) return;
  try {
    if (typeof entry.client.off === "function")
      entry.client.off("data", entry.handler);
    else if (typeof entry.client.removeListener === "function")
      entry.client.removeListener("data", entry.handler);
    else if (typeof entry.client.removeAllListeners === "function")
      entry.client.removeAllListeners("data");
  } catch {}
  clientMap.delete(clientId);
}

function pullFrameForClient(clientId: number): Frame | null {
  return clientMap.get(clientId)?.latest ?? null;
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    title: "lightV",
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  focusedWindow = mainWindow;

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("focus", () => {
    focusedWindow = mainWindow;
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId("com.electron");

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC: Syphon control
  ipcMain.handle("syphon/start", () => startSyphon());
  ipcMain.handle("syphon/stop", () => stopSyphon());
  ipcMain.handle("syphon/selectServer", (_evt, { index }) =>
    selectServer(Number(index)),
  );
  ipcMain.handle("syphon/pullFrame", () => {
    return latestFrame;
  });

  // Multi-client IPC
  ipcMain.handle("syphon/createClient", (_evt, { serverIndex }) => {
    startSyphon();
    return createClientForServerIndex(Number(serverIndex));
  });
  ipcMain.handle("syphon/destroyClient", (_evt, { clientId }) => {
    destroyClient(Number(clientId));
  });
  ipcMain.handle("syphon/pullFrameForClient", (_evt, { clientId }) => {
    return pullFrameForClient(Number(clientId));
  });
  // Direct servers query
  ipcMain.handle("syphon/getServers", () => {
    startSyphon();
    return currentServers();
  });

  // IPC test
  ipcMain.on("ping", () => console.log("pong"));

  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
