import React, { createContext, useContext } from 'react';
const DeviceContext = createContext({ isMobile: false, isTV: false });
export function DeviceProvider({ children }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const isTV = typeof window !== 'undefined' && window.innerWidth >= 1920;
  return <DeviceContext.Provider value={{ isMobile, isTV }}>{children}</DeviceContext.Provider>;
}
export const useDevice = () => useContext(DeviceContext);