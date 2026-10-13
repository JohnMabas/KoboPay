'use client';

// components/Header.js — shared header rendered on every page.
// Shows the app name (wordmark) on the left and an About link on every page.
// On the dashboard, shows a Logout button on the right.
// On login/register pages, shows a link to the other auth page.

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { APP_NAME } from '../lib/config';

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();

  function handleLogout() {
    localStorage.removeItem('token');
    router.push('/login');
  }

  const isDashboard = pathname === '/dashboard';
  const isLogin = pathname === '/login';
  const isRegister = pathname === '/register';

  // Hide the navbar on auth pages and dashboard — they have their own layout.
  if (isLogin || isRegister || isDashboard) return null;

  return (
    <header className="bg-emerald-700 text-white shadow-md">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Wordmark — reads name from config, never hardcoded */}
        <Link href="/" className="text-2xl font-bold tracking-tight text-white hover:opacity-90">
          {APP_NAME}
        </Link>

        <nav className="flex items-center gap-4 text-sm font-medium">
          {/* About link is visible on remaining pages (home, about, etc.) */}
          <Link
            href="/about"
            className="text-emerald-100 hover:text-white transition"
          >
            About
          </Link>
        </nav>
      </div>
    </header>
  );
}
