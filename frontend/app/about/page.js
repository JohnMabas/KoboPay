// app/about/page.js — public About page, no login required.
// Describes what KoboPay is and what users can do.

import Link from 'next/link';
import { APP_NAME } from '../../lib/config';

export default function AboutPage() {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-[calc(100vh-60px)] flex flex-col">
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-12">
        {/* Heading */}
        <h1 className="text-3xl font-bold text-emerald-700 mb-2">About {APP_NAME}</h1>
        <p className="text-gray-500 text-lg mb-8">Simple, secure banking.</p>

        {/* Description */}
        <p className="text-gray-700 mb-8 leading-relaxed">
          KoboPay is a simple, secure banking app. Create an account in seconds and get your own
          10-digit account number. Deposit money, set a 4-digit PIN, and send money to anyone by
          account number. You see the recipient&apos;s name before you confirm, and every
          transaction is recorded in your history.
        </p>

        {/* What you can do */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">What you can do</h2>
          <ul className="space-y-2 text-gray-700">
            {[
              'Register and log in',
              'Check your balance',
              'Deposit by account number',
              'Create and update your PIN',
              'Transfer to another user',
              'View your transaction history',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* Built with */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Built with</h2>
          <p className="text-gray-600 text-sm">
            Next.js, Tailwind CSS, Node.js, Express, PostgreSQL (Aiven), Sequelize
          </p>
        </section>

        {/* CTA buttons */}
        <div className="flex items-center gap-4">
          <Link
            href="/register"
            className="bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-emerald-800 transition"
          >
            Get started
          </Link>
          <Link href="/login" className="text-emerald-700 font-medium hover:underline">
            Log in
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-gray-400 text-sm py-6">
        © {year} {APP_NAME}
      </footer>
    </div>
  );
}
