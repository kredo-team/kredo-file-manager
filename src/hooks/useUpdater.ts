import { useState, useCallback, useRef } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error' | 'up-to-date';

interface UpdateInfo {
  version: string;
  date: string;
  body: string;
}

interface UseUpdaterReturn {
  status: UpdateStatus;
  progress: number; // 0-100
  info: UpdateInfo | null;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
}

export function useUpdater(): UseUpdaterReturn {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateRef = useRef<any>(null);

  const checkForUpdates = useCallback(async () => {
    setStatus('checking');
    setError(null);
    setInfo(null);
    setProgress(0);

    try {
      const update = await check();

      if (update) {
        updateRef.current = update;
        setInfo({
          version: update.version,
          date: update.date ?? '',
          body: update.body ?? '',
        });
        setStatus('available');
      } else {
        setStatus('up-to-date');
      }
    } catch (err) {
      setError(String(err));
      setStatus('error');
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;

    setStatus('downloading');
    setProgress(0);

    try {
      let totalLength = 0;
      let downloaded = 0;

      await update.downloadAndInstall((event: any) => {
        switch (event.event) {
          case 'Started':
            totalLength = event.data.contentLength ?? 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength ?? 0;
            if (totalLength > 0) {
              setProgress(Math.round((downloaded / totalLength) * 100));
            }
            break;
          case 'Finished':
            setProgress(100);
            break;
        }
      });

      setStatus('ready');

      // Auto-relaunch after short delay
      setTimeout(async () => {
        try {
          await relaunch();
        } catch {
          // relaunch might not be available in dev mode
        }
      }, 1500);
    } catch (err) {
      setError(String(err));
      setStatus('error');
    }
  }, []);

  return { status, progress, info, error, checkForUpdates, downloadAndInstall };
}
