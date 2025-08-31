import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

// Custom APIs for renderer
const frameListeners: Array<
  (data: { buffer: Uint8Array; width: number; height: number }) => void
> = [];
const serverListeners: Array<
  (servers: Array<{ index: number; name: string }>) => void
> = [];
let lastServers: Array<{ index: number; name: string }> = [];

let isListeningIpc = false;

function ensureIpcSubscriptions(): void {
  if (isListeningIpc) return;
  isListeningIpc = true;

  ipcRenderer.on(
    "syphon:frame",
    (_e, payload: { buffer: ArrayBuffer; width: number; height: number }) => {
      const uint8 = new Uint8Array(payload.buffer);
      for (const listener of frameListeners)
        listener({
          buffer: uint8,
          width: payload.width,
          height: payload.height,
        });
    },
  );

  ipcRenderer.on(
    "syphon:servers",
    (_e, payload: Array<{ index: number; name: string }>) => {
      lastServers = payload;
      for (const listener of serverListeners) listener(payload);
    },
  );
}

const api = {
  syphon: {
    start: (): void => {
      ensureIpcSubscriptions();
      ipcRenderer.invoke("syphon/start");
    },
    stop: (): void => {
      ipcRenderer.invoke("syphon/stop");
    },
    onFrame: (
      listener: (data: {
        buffer: Uint8Array;
        width: number;
        height: number;
      }) => void,
    ): (() => void) => {
      frameListeners.push(listener);
      return () => {
        const idx = frameListeners.indexOf(listener);
        if (idx >= 0) frameListeners.splice(idx, 1);
      };
    },
    getServers: (): Array<{ index: number; name: string }> => {
      return lastServers;
    },
    onServersChanged: (
      listener: (servers: Array<{ index: number; name: string }>) => void,
    ): (() => void) => {
      ensureIpcSubscriptions();
      serverListeners.push(listener);
      return () => {
        const idx = serverListeners.indexOf(listener);
        if (idx >= 0) serverListeners.splice(idx, 1);
      };
    },
    selectServer: (index: number): void => {
      ipcRenderer.invoke("syphon/selectServer", { index });
    },
    pullFrame: async (): Promise<{
      buffer: ArrayBuffer;
      width: number;
      height: number;
    } | null> => {
      return ipcRenderer.invoke("syphon/pullFrame");
    },
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
    contextBridge.exposeInMainWorld("syphon", api.syphon);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
  // @ts-ignore (define in dts)
  window.syphon = api.syphon;
}
