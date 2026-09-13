'use client';

import { useEffect, useState } from 'react';

interface CooldownTimerProps {
  retryAt: string; // ISO datetime
  onExpire?: () => void;
}

/**
 * Countdown timer for active field-change cooldowns.
 * Disables the associated field input during cooldown.
 */
export function CooldownTimer({ retryAt, onExpire }: CooldownTimerProps) {
  const calculateRemaining = () => {
    const retryTime = new Date(retryAt).getTime();
    const now = Date.now();
    return Math.max(0, Math.ceil((retryTime - now) / 1000));
  };

  const [remaining, setRemaining] = useState<number>(calculateRemaining);

    useEffect(() => {
    const updateRemaining = () => {
      const diff = calculateRemaining();
      setRemaining(diff);
      if (diff === 0) {
        onExpire?.();
      }
    };

    updateRemaining();

    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryAt, onExpire]);

  if (remaining <= 0) return null;

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  const formatTime = (n: number) => n.toString().padStart(2, '0');

  return (
    <p className="text-xs text-amber-400">
      Cooldown active. Try again in {formatTime(hours)}:{formatTime(minutes)}:
      {formatTime(seconds)}
    </p>
  );
}
