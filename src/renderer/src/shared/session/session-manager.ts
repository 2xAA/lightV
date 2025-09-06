export interface SessionData {
  [providerName: string]: any;
}

export interface SessionProvider {
  saveState(): any;
  loadState(state: any): Promise<void>;
}

export class SessionManager {
  private static readonly STORAGE_KEY = "lightV-complete-session";
  private static providers: Map<string, SessionProvider> = new Map();

  static registerProvider(name: string, provider: SessionProvider): void {
    this.providers.set(name, provider);
  }

  static unregisterProvider(name: string): void {
    this.providers.delete(name);
  }

  static async saveSession(): Promise<void> {
    try {
      const sessionData: SessionData = {};

      // Collect state from all registered providers
      for (const [name, provider] of this.providers) {
        sessionData[name] = provider.saveState();
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessionData));
    } catch (error) {
      console.warn("Failed to save complete session:", error);
    }
  }

  static async loadSession(): Promise<void> {
    try {
      const sessionDataStr = localStorage.getItem(this.STORAGE_KEY);
      if (!sessionDataStr) return;

      const sessionData: SessionData = JSON.parse(sessionDataStr);

      // Restore state for all registered providers
      for (const [name, provider] of this.providers) {
        if (sessionData[name]) {
          await provider.loadState(sessionData[name]);
        }
      }
    } catch (error) {
      console.warn("Failed to load complete session:", error);
    }
  }

  static clearSession(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }

  static exportSession(): void {
    try {
      const sessionData = localStorage.getItem(this.STORAGE_KEY);
      if (!sessionData) {
        alert("No session data to export");
        return;
      }

      const blob = new Blob([sessionData], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lightV-complete-session-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export session:", error);
      alert("Failed to export session");
    }
  }

  static async importSession(): Promise<void> {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          resolve();
          return;
        }

        try {
          const text = await file.text();
          const sessionData = JSON.parse(text);

          // Validate the session data structure
          if (typeof sessionData !== "object" || !sessionData) {
            throw new Error("Invalid session file format");
          }

          // Store the imported session data
          localStorage.setItem(this.STORAGE_KEY, text);

          // Reload the session
          await this.loadSession();

          alert("Session imported successfully!");
          resolve();
        } catch (error) {
          console.error("Failed to import session:", error);
          alert("Failed to import session. Please check the file format.");
          reject(error);
        }
      };
      input.click();
    });
  }
}
