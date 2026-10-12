// lib/api.js — thin fetch wrapper used by all pages.
// Reads API_URL from config.js (never hardcoded).
// Attaches the JWT from localStorage on authenticated calls.

import { API_URL } from './config';

/**
 * Make an authenticated or unauthenticated API call.
 *
 * @param {string} path   - Path relative to API_URL, e.g. "/account/balance"
 * @param {object} options - Fetch options (method, body, etc.)
 * @returns {Promise<object>} Parsed JSON body
 */
export async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  // Attach the JWT if one is stored (may be null on unauthenticated routes).
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    // Ensure the body is serialised when provided as a plain object.
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // Parse JSON even for error responses so we can read the message field.
  const data = await res.json();

  if (!res.ok) {
    // Normalise errors into a thrown object so callers can catch uniformly.
    const message = data?.message || `Request failed with status ${res.status}`;
    throw Object.assign(new Error(message), { status: res.status, data });
  }

  return data;
}
