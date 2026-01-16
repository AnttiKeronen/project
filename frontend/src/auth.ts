const KEY = "token";

export function setToken(token: string) {
  localStorage.setItem(KEY, token);
}
export function getToken() {
  return localStorage.getItem(KEY);
}
export function clearToken() {
  localStorage.removeItem(KEY);
}
export function isAuthed() {
  return Boolean(getToken());
}
