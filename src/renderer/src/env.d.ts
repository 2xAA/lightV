/// <reference types="vite/client" />

declare global {
  interface Window {
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
    };
  }
}
