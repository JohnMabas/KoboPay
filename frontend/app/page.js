'use client';

// app/page.js — home route ("/").
// Redirects to /dashboard if a token exists, otherwise to /login.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    router.replace(token ? '/dashboard' : '/login');
  }, [router]);

  // Render nothing while redirecting.
  return null;
}
