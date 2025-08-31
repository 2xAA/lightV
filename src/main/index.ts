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

// Cache the latest frame for pull-based IPC
let latestFrame: { buffer: ArrayBuffer; width: number; height: number } | null =
  null;

function deriveServerName(server: any): string {
  const app = server?.appName ?? server?.applicationName ?? null;
  const srv = server?.serverName ?? server?.name ?? null;
  const parts = [app, srv].filter(Boolean);
  return parts.length > 0 ? String(parts.join(" - ")) : "";
}

function broadcastServers(): void {
  if (!focusedWindow || !directory) return;
  const list = directory.servers.map((s: any, i: number) => ({
    index: i,
    name: deriveServerName(s) || `Server ${i}`,
  }));
  focusedWindow.webContents.send("syphon:servers", list);
}

function startSyphon(): void {
  if (directory) return;
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
      client.off("frame", currentFrameHandler);
    } else if (typeof client.removeListener === "function") {
      client.removeListener("frame", currentFrameHandler);
    } else if (typeof client.removeAllListeners === "function") {
      client.removeAllListeners("frame");
    }
  } else if (typeof client.removeAllListeners === "function") {
    client.removeAllListeners("frame");
  }
  currentFrameHandler = null;
  client = null;
}

function stopSyphon(): void {
  if (client) {
    detachClient();
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
    // Copy to ArrayBuffer to cross the IPC boundary efficiently on demand
    const ab = new ArrayBuffer(buf.byteLength);
    const view = new Uint8Array(ab);
    view.set(buf);
    latestFrame = { buffer: ab, width, height };
  };
  if (typeof client.on === "function") {
    client.on("frame", currentFrameHandler);
  } else if (typeof client.addListener === "function") {
    client.addListener("frame", currentFrameHandler);
  }
}

function selectServer(index: number): void {
  if (!directory) return;
  const server = directory.servers[index];
  if (!server) return;
  attachClientForServer(server);
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
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
  // Pull latest frame (if any)
  ipcMain.handle("syphon/pullFrame", () => {
    return latestFrame;
  });

  // IPC test
  ipcMain.on("ping", () => console.log("pong"));

  createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
