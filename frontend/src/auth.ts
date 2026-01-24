const KEY = "token";
export function setToken(token: string) {
  localStorage.setItem(KEY, token);
}
export function getToken() {
  return localStorage.getItem(KEY);
}
export function clearTheToken() {
  localStorage.removeItem(KEY);
}
export function isAuthenticated() {
  return Boolean(getToken());
}
