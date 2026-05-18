import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT_PX = 768;

function detect() {
  if (typeof window === 'undefined') return 'pc';
  return window.innerWidth <= MOBILE_BREAKPOINT_PX ? 'mobile' : 'pc';
}

export function usePlatform() {
  const [platform, setPlatform] = useState(detect);
  useEffect(() => {
    const onResize = () => setPlatform(detect());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return platform;
}
