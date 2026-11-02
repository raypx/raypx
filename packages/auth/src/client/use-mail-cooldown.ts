import { useEffect, useRef, useState } from "react";

export function useMailCooldown() {
  const retryAt = useRef(0);
  const [remaining, setRemaining] = useState(0);
  const active = remaining > 0;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((retryAt.current - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [active]);
  return {
    remaining,
    isActive: () => retryAt.current > Date.now(),
    start(seconds = 60) {
      retryAt.current = Date.now() + seconds * 1000;
      setRemaining(seconds);
    },
  };
}
