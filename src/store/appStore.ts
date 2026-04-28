import { create } from 'zustand';
import type { AppSettings, ScanResult, ToastMessage } from '../types';

interface AppState {
  // Auth
  isLoggedIn: boolean;
  setLoggedIn: (v: boolean) => void;

  // Settings
  settings: AppSettings | null;
  settingsLoaded: boolean;
  setSettings: (s: AppSettings) => void;
  setSettingsLoaded: (v: boolean) => void;

  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;

  // Scan
  scanResult: ScanResult | null;
  setScanResult: (r: ScanResult | null) => void;

  // Toasts
  toasts: ToastMessage[];
  addToast: (type: 'success' | 'error', text: string) => void;
  removeToast: (id: string) => void;

  // Help overlay
  showHelp: boolean;
  setShowHelp: (v: boolean) => void;
}

let toastCounter = 0;

export const useAppStore = create<AppState>((set) => ({
  isLoggedIn: false,
  setLoggedIn: (v) => set({ isLoggedIn: v }),

  settings: null,
  settingsLoaded: false,
  setSettings: (s) => set({ settings: s }),
  setSettingsLoaded: (v) => set({ settingsLoaded: v }),

  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

  scanResult: null,
  setScanResult: (r) => set({ scanResult: r }),

  toasts: [],
  addToast: (type, text) => {
    const id = `toast-${++toastCounter}`;
    const duration = type === 'error' ? 6000 : 3000;
    set((state) => ({ toasts: [...state.toasts, { id, type, text }] }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
      }));
    }, duration);
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration + 300);
  },
  removeToast: (id) => {
    set((s) => ({
      toasts: s.toasts.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 300);
  },

  showHelp: false,
  setShowHelp: (v) => set({ showHelp: v }),
}));
