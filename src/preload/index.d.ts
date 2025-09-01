import { ElectronAPI } from "@electron-toolkit/preload";

declare global {
  interface Window {
    electron: ElectronAPI;
    api: unknown;
    syphon: {
      start: () => void;
      stop: () => void;
      onFrame: (
        listener: (data: {
          buffer: Uint8Array;
          width: number;
          height: number;
        }) => void,
      ) => () => void;
      getServers: () => Array<{ index: number; name: string }>;
      onServersChanged: (
        listener: (servers: Array<{ index: number; name: string }>) => void,
      ) => () => void;
      selectServer: (index: number) => void;
      pullFrame: () => Promise<{
        buffer: ArrayBuffer;
        width: number;
        height: number;
      } | null>;
      // multi-client
      createClient: (serverIndex: number) => Promise<number | null>;
      destroyClient: (clientId: number) => Promise<void>;
      pullFrameForClient: (
        clientId: number,
      ) => Promise<{
        buffer: ArrayBuffer;
        width: number;
        height: number;
      } | null>;
    };
  }
}
