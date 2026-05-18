import { useEffect, useState } from 'react';

function formatUTC() {
  const n = new Date();
  return [n.getUTCHours(), n.getUTCMinutes(), n.getUTCSeconds()]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}

export function useClock() {
  const [t, setT] = useState(formatUTC);
  useEffect(() => {
    const id = setInterval(() => setT(formatUTC()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

export function usePollCountdown() {
  const [secs, setSecs] = useState(60);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          setPulse(true);
          setTimeout(() => setPulse(false), 800);
          return 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return { secs, pulse };
}
