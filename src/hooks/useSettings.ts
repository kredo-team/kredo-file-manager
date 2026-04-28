import { useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store/appStore';
import type { AppSettings } from '../types';

export function useSettings() {
  const { settings, settingsLoaded, setSettings, setSettingsLoaded, addToast } = useAppStore();

  const loadSettings = useCallback(async () => {
    try {
      const loaded = await invoke<AppSettings>('load_settings');
      setSettings(loaded);
      setSettingsLoaded(true);
    } catch (err) {
      console.error('Failed to load settings:', err);
      addToast('error', 'Failed to load settings');
    }
  }, [setSettings, setSettingsLoaded, addToast]);

  const saveSettings = useCallback(
    async (updated: AppSettings) => {
      try {
        await invoke('save_settings', { settings: updated });
        setSettings(updated);
        addToast('success', 'Settings saved');
        return true;
      } catch (err) {
        console.error('Failed to save settings:', err);
        addToast('error', 'Failed to save settings');
        return false;
      }
    },
    [setSettings, addToast]
  );

  useEffect(() => {
    if (!settingsLoaded) loadSettings();
  }, [settingsLoaded, loadSettings]);

  return { settings, settingsLoaded, loadSettings, saveSettings };
}
