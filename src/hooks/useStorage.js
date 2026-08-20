export function getStorage(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}

export function setStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function removeStorage(key) {
  try { localStorage.removeItem(key); } catch {}
}

export function getFavorites() { return getStorage('chrtv_favorites', []); }
export function setFavorites(favs) { setStorage('chrtv_favorites', favs); }
export function getHistory() { return getStorage('chrtv_history', []); }
export function setHistory(h) { setStorage('chrtv_history', h); }
export function getFavoriteGroups() { return getStorage('chrtv_fav_groups', {}); }
export function setFavoriteGroups(g) { setStorage('chrtv_fav_groups', g); }
export function getCustomEpgSource() { return getStorage('chrtv_epg_source', ''); }
export function setCustomEpgSource(url) { setStorage('chrtv_epg_source', url); }
export function getCustomM3uSources() { return getStorage('chrtv_m3u_sources', []); }
export function setCustomM3uSources(arr) { setStorage('chrtv_m3u_sources', arr); }
