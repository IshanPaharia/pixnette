import { useState, useEffect } from 'react';

const COOLDOWN_SECONDS = parseInt(import.meta.env.VITE_COOLDOWN_SECONDS, 10) || 30;

export function useCooldown() {
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  useEffect(() => {
    const checkCooldown = () => {
      const expires = localStorage.getItem('pb_cooldown_expires');
      if (expires) {
        const remaining = Math.ceil((parseInt(expires, 10) - Date.now()) / 1000);
        if (remaining > 0) {
          setCooldownRemaining(remaining);
        } else {
          setCooldownRemaining(0);
        }
      } else {
        setCooldownRemaining(0);
      }
    };
    
    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => clearInterval(interval);
  }, []);

  const triggerCooldown = () => {
    const expiresMs = Date.now() + (COOLDOWN_SECONDS * 1000);
    localStorage.setItem('pb_cooldown_expires', expiresMs.toString());
    setCooldownRemaining(COOLDOWN_SECONDS);
  };

  const syncCooldown = (seconds) => {
    if (seconds <= 0) {
      localStorage.removeItem('pb_cooldown_expires');
      setCooldownRemaining(0);
    } else {
      const expiresMs = Date.now() + (seconds * 1000);
      localStorage.setItem('pb_cooldown_expires', expiresMs.toString());
      setCooldownRemaining(seconds);
    }
  };

  return { cooldownRemaining, triggerCooldown, syncCooldown, cooldownSeconds: COOLDOWN_SECONDS };
}
