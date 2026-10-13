// app/layout.js — root layout for all pages.
// Sets the browser tab title and wraps every page in the shared header.
//
// NOTE: Next.js metadata must be a static export from a Server Component.
// APP_NAME from config.js is a NEXT_PUBLIC_ variable inlined at build time,
// but Next.js cannot evaluate module-level imports when building the metadata
// object, so the title is defined here as a plain string.
// If you rename the app, update NEXT_PUBLIC_APP_NAME in frontend/.env AND
// update the title string here, then restart `npm run dev`.

import './globals.css';
import Header from '../components/Header';

export const metadata = {
  title: 'KoboPay',
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
