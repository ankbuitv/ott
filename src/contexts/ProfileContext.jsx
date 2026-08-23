import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getStorage, setStorage } from '../hooks/useStorage';
import { API_BASE } from '../services/config';

const ProfileContext = createContext(null);
const BASE = API_BASE;

export function ProfileProvider({ children }) {
  const [currentProfile, setCurrentProfile] = useState(() => getStorage('chrtv_profile', null));
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);

  // Sync current profile to localStorage
  useEffect(() => {
    if (currentProfile) {
      setStorage('chrtv_profile', currentProfile);
    } else {
      localStorage.removeItem('chrtv_profile');
    }
  }, [currentProfile]);

  const fetchProfiles = useCallback(async (token) => {
    if (!token) return [];
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/user/profiles`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setProfiles(data.profiles || []);
      return data.profiles || [];
    } catch (e) {
      console.error('fetchProfiles error:', e);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const createProfile = useCallback(async (token, data) => {
    const res = await fetch(`${BASE}/user/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    const r = await res.json();
    if (r.success) await fetchProfiles(token);
    return r;
  }, [fetchProfiles]);

  const updateProfile = useCallback(async (token, data) => {
    const res = await fetch(`${BASE}/user/profiles/update`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    const r = await res.json();
    if (r.success) await fetchProfiles(token);
    return r;
  }, [fetchProfiles]);

  const deleteProfile = useCallback(async (token, id) => {
    const res = await fetch(`${BASE}/user/profiles/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id })
    });
    const r = await res.json();
    if (r.success) {
      await fetchProfiles(token);
      if (currentProfile?.id === id) setCurrentProfile(null);
    }
    return r;
  }, [fetchProfiles, currentProfile]);

  const verifyPin = useCallback(async (token, id, pin) => {
    const res = await fetch(`${BASE}/user/profiles/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id, pin })
    });
    return res.json();
  }, []);

  const selectProfile = useCallback((profile) => {
    setCurrentProfile(profile);
  }, []);

  const logoutProfile = useCallback(() => {
    setCurrentProfile(null);
  }, []);

  return (
    <ProfileContext.Provider value={{
      currentProfile, profiles, loading,
      fetchProfiles, createProfile, updateProfile, deleteProfile, verifyPin,
      selectProfile, logoutProfile
    }}>
      {children}
    </ProfileContext.Provider>
  );
}

export const useProfile = () => useContext(ProfileContext);

// Predefined avatar set (Netflix-style)
export const AVATAR_OPTIONS = [
  { id: 'red', color: 'from-red-500 to-red-700', emoji: '🦁', label: 'Sư tử' },
  { id: 'blue', color: 'from-blue-500 to-blue-700', emoji: '🐋', label: 'Cá voi' },
  { id: 'green', color: 'from-emerald-500 to-emerald-700', emoji: '🐉', label: 'Rồng' },
  { id: 'yellow', color: 'from-amber-500 to-orange-600', emoji: '🦊', label: 'Cáo' },
  { id: 'purple', color: 'from-purple-500 to-purple-700', emoji: '🦄', label: 'Kỳ lân' },
  { id: 'pink', color: 'from-pink-500 to-rose-700', emoji: '🌸', label: 'Hoa' },
  { id: 'cyan', color: 'from-cyan-500 to-blue-600', emoji: '🐬', label: 'Cá heo' },
  { id: 'orange', color: 'from-orange-500 to-red-600', emoji: '🦁', label: 'Hổ' },
  { id: 'teal', color: 'from-teal-500 to-emerald-700', emoji: '🐢', label: 'Rùa' },
  { id: 'indigo', color: 'from-indigo-500 to-purple-700', emoji: '🦉', label: 'Cú' },
];

export const getAvatar = (id) => AVATAR_OPTIONS.find(a => a.id === id) || AVATAR_OPTIONS[0];
