// app/layout.js — root layout for all pages.
// Sets the browser tab title and wraps every page in the shared header.

import './globals.css';
import { APP_NAME } from '../lib/config';
import Header from '../components/Header';

// Next.js App Router metadata — title comes from config, never hardcoded.
export const metadata = {
  title: APP_NAME,
  description: 'KoboPay: simple, secure banking.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <Header />
        <main>{children}</main>
      </body>
    </html>
  );
}
