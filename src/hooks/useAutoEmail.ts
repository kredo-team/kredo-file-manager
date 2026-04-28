import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store/appStore';
import { useSettings } from './useSettings';
import type { SmtpConfig } from '../types';

/**
 * Auto-email scheduler hook.
 * 
 * Runs a 60-second interval that checks if it's time to send.
 * Uses refs to avoid stale closures and dependency-array restarts.
 * 
 * The interval is only created/destroyed when the SCHEDULE CONFIG changes
 * (enabled, schedule type, time, day). Sending an email does NOT restart
 * the interval — it just updates last_sent via a ref.
 */

function shouldSendNow(
  schedule: string,
  time: string,
  dayOfWeek: number,
  dayOfMonth: number,
  lastSentMs: number,
): boolean {
  const now = new Date();
  const nowMs = now.getTime();

  // Testing mode — send if > 55 seconds since last send
  if (schedule === 'every_minute') {
    return (nowMs - lastSentMs) >= 55000;
  }

  // Parse configured time "HH:MM"
  const [h, m] = (time || '09:00').split(':').map(Number);
  const nowH = now.getHours();
  const nowM = now.getMinutes();

  // Must match the configured minute
  if (nowH !== h || nowM !== m) return false;

  // Don't send if already sent within last 3 minutes (prevents double-fire)
  if ((nowMs - lastSentMs) < 180000) return false;

  if (schedule === 'daily') return true;

  if (schedule === 'weekly') {
    // JS: 0=Sun..6=Sat → config: 0=Mon..6=Sun
    const jsDay = now.getDay();
    const ourDay = jsDay === 0 ? 6 : jsDay - 1;
    return ourDay === dayOfWeek;
  }

  if (schedule === 'monthly') {
    return now.getDate() === dayOfMonth;
  }

  return false;
}

export function useAutoEmail() {
  const { settings, saveSettings } = useSettings();
  const addToast = useAppStore((s) => s.addToast);

  // Refs to hold latest values — read inside interval without causing restarts
  const settingsRef = useRef(settings);
  const saveRef = useRef(saveSettings);
  const toastRef = useRef(addToast);
  const sendingRef = useRef(false);
  const lastSentMsRef = useRef(0);

  // Keep refs in sync
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { saveRef.current = saveSettings; }, [saveSettings]);
  useEffect(() => { toastRef.current = addToast; }, [addToast]);

  // Track last_sent as a millisecond timestamp
  useEffect(() => {
    if (settings?.auto_email?.last_sent) {
      const ms = new Date(settings.auto_email.last_sent).getTime();
      if (!isNaN(ms)) lastSentMsRef.current = ms;
    }
  }, [settings?.auto_email?.last_sent]);

  // Extract stable config values for the dependency array
  const enabled = settings?.auto_email?.enabled || false;
  const schedule = settings?.auto_email?.schedule || 'daily';
  const time = settings?.auto_email?.time || '09:00';
  const dayOfWeek = settings?.auto_email?.day_of_week ?? 0;
  const dayOfMonth = settings?.auto_email?.day_of_month || 1;
  const hasSmtp = !!settings?.smtp?.host;
  const hasRoot = !!settings?.root_path;
  const hasRecipients = (settings?.auto_email?.to?.length || 0) > 0;

  useEffect(() => {
    // Don't start scheduler if prerequisites aren't met
    if (!enabled || !hasSmtp || !hasRoot || !hasRecipients) return;

    const interval = setInterval(async () => {
      // Guard: don't overlap sends
      if (sendingRef.current) return;

      const s = settingsRef.current;
      if (!s?.auto_email?.enabled) return;

      const ae = s.auto_email;
      const should = shouldSendNow(
        ae.schedule, ae.time, ae.day_of_week, ae.day_of_month,
        lastSentMsRef.current,
      );
      if (!should) return;

      sendingRef.current = true;
      const now = new Date();

      try {
        const smtp: SmtpConfig = {
          host: s.smtp.host, port: s.smtp.port,
          username: s.smtp.username, password: s.smtp.password,
          from_name: s.smtp.from_name, from_email: s.smtp.from_email,
        };

        const result = await invoke<{ success: boolean; message: string; timestamp: string }>('send_auto_email', {
          rootPath: s.root_path,
          smtpConfig: smtp,
          to: ae.to,
          cc: ae.cc,
          subject: ae.subject || 'Kredo — Automated Status Report',
        });

        const ts = result.timestamp || now.toISOString();
        lastSentMsRef.current = new Date(ts).getTime();

        // Only update last_sent + last_status — don't touch config fields
        await saveRef.current({
          ...settingsRef.current!,
          auto_email: { ...settingsRef.current!.auto_email, last_sent: ts, last_status: 'success' },
        });

        toastRef.current('success', 'Auto email sent');
      } catch (err) {
        lastSentMsRef.current = now.getTime();

        await saveRef.current({
          ...settingsRef.current!,
          auto_email: { ...settingsRef.current!.auto_email, last_sent: now.toISOString(), last_status: String(err) },
        });

        toastRef.current('error', `Auto email failed: ${err}`);
      } finally {
        sendingRef.current = false;
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [enabled, schedule, time, dayOfWeek, dayOfMonth, hasSmtp, hasRoot, hasRecipients]);
}
