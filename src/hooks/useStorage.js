export function getFavorites() { try { return JSON.parse(localStorage.getItem('chrtv_favorites')||'[]'); } catch { return []; } }
export function setFavorites(f) { try { localStorage.setItem('chrtv_favorites',JSON.stringify(f)); } catch {} }
export function getHistory() { try { return JSON.parse(localStorage.getItem('chrtv_history')||'[]'); } catch { return []; } }
export function setHistory(h) { try { localStorage.setItem('chrtv_history',JSON.stringify(h)); } catch {} }