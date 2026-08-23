import React, { createContext, useContext, useState } from 'react';
const ProfileContext = createContext({ currentProfile: null, setCurrentProfile: () => {} });
export function ProfileProvider({ children }) {
  const [currentProfile, setCurrentProfile] = useState({ id:1, name:'Default', avatar_url:'' });
  return <ProfileContext.Provider value={{ currentProfile, setCurrentProfile }}>{children}</ProfileContext.Provider>;
}
export const useProfile = () => useContext(ProfileContext);