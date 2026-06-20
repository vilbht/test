// storage.js — session history persisted in the browser via localStorage.

const KEY = 'velofit.sessions.v1';

export function loadSessions() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSession(session) {
  const sessions = loadSessions();
  sessions.unshift(session); // newest first
  localStorage.setItem(KEY, JSON.stringify(sessions));
  return sessions;
}

export function deleteSession(id) {
  const sessions = loadSessions().filter((s) => s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(sessions));
  return sessions;
}

export function clearSessions() {
  localStorage.removeItem(KEY);
}

export function newId() {
  return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
