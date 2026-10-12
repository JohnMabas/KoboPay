'use client';

// components/Header.js — shared header rendered on every page.
// Shows the app name on the left.
// On the dashboard, shows a Logout button on the right.
// On login/register, shows a link to the other auth page.

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

  return (
    <header className="bg-emerald-700 text-white shadow-md">
      <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Wordmark — no hardcoded name */}
        <Link href="/" className="text-2xl font-bold tracking-tight text-white hover:opacity-90">
          {APP_NAME}
        </Link>

        <nav className="flex items-center gap-4 text-sm font-medium">
          {isDashboard && (
            <button
              onClick={handleLogout}
              className="bg-white text-emerald-700 px-4 py-1.5 rounded-full hover:bg-emerald-50 transition"
            >
              Logout
            </button>
          )}
          {isLogin && (
            <Link
              href="/register"
              className="bg-white text-emerald-700 px-4 py-1.5 rounded-full hover:bg-emerald-50 transition"
            >
              Register
            </Link>
          )}
          {isRegister && (
            <Link
              href="/login"
              className="bg-white text-emerald-700 px-4 py-1.5 rounded-full hover:bg-emerald-50 transition"
            >
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
