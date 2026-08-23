import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const DeviceContext = createContext({
  isMobile: false,
  isTablet: false,
  isDesktop: false,
  isTV: false,
  isTouch: false,
  isPortrait: true,
  isLandscape: false,
  screenW: 0,
  screenH: 0,
  os: 'unknown',
});

export function DeviceProvider({ children }) {
  const detect = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ua = navigator.userAgent || '';
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isPortrait = h >= w;

    const isTV = /Android TV|SmartTV|AmazonFire|GoogleTV|webOS|Tizen|Roku|Chromecast|MI TV|Xiaomi TV/i.test(ua)
      || (w >= 960 && h >= 540 && isTouch && !('ontouchstart' in window) === false && /Android/i.test(ua));
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) && w < 768;
    const isTablet = (/(iPad|Tablet|(Android(?!.*Mobile))|(Windows(?!.*Phone)(.*Touch)))/i.test(ua)) || (isTouch && w >= 768 && w < 1024);
    const isDesktop = !isMobile && !isTablet && !isTV;

    let os = 'unknown';
    if (/android/i.test(ua)) os = 'android';
    else if (/iphone|ipad|ipod/i.test(ua)) os = 'ios';
    else if (/windows/i.test(ua)) os = 'windows';
    else if (/macintosh|mac os x/i.test(ua)) os = 'macos';
    else if (/linux/i.test(ua)) os = 'linux';

    return { isMobile: !!isMobile, isTablet: !!isTablet, isDesktop: !!isDesktop, isTV: !!isTV, isTouch: !!isTouch, isPortrait, isLandscape: !isPortrait, screenW: w, screenH: h, os };
  }, []);

  const [device, setDevice] = useState(detect);

  useEffect(() => {
    const onResize = () => setDevice(detect());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [detect]);

  return (
    <DeviceContext.Provider value={device}>
      {children}
    </DeviceContext.Provider>
  );
}

export const useDevice = () => useContext(DeviceContext);
