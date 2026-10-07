const STORAGE_KEY = 'cfl_otp_session';

export function saveOtpSession(session) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function getOtpSession() {
  const data = sessionStorage.getItem(STORAGE_KEY);

  if (!data) return null;

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function clearOtpSession() {
  sessionStorage.removeItem(STORAGE_KEY);
}
