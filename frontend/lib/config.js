// lib/config.js — the ONLY frontend file that reads process.env.
// All pages and components import from here, never from process.env directly.
// NEXT_PUBLIC_ variables are inlined at build time by Next.js.

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'KoboPay';
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
export const CURRENCY_SYMBOL = process.env.NEXT_PUBLIC_CURRENCY_SYMBOL || '₦';
