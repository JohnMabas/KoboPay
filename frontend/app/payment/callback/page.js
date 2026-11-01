'use client';

// app/payment/callback/page.js — Paystack return URL handler.
// Paystack redirects here with ?reference=...&trxref=.... The page asks the
// backend to verify the reference; it never trusts the query string as proof
// of payment and never updates the wallet locally.

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api';
import { CURRENCY_SYMBOL, APP_NAME } from '../../../lib/config';

function formatAmount(amount) {
  return `${CURRENCY_SYMBOL}${parseFloat(amount).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function PaymentCallbackPage() {
  const [state, setState] = useState({
    status: 'verifying', // verifying | success | pending | failed | error
    message: 'Confirming your payment with Paystack…',
    payment: null,
  });
  const [reference, setReference] = useState('');

  const verify = useCallback(async (ref) => {
    if (!ref) {
      setState({
        status: 'error',
        message: 'No payment reference was returned. If you were charged, contact support.',
        payment: null,
      });
      return;
    }

    setState({ status: 'verifying', message: 'Confirming your payment with Paystack…', payment: null });

    try {
      const res = await apiFetch(`/payments/paystack/verify/${encodeURIComponent(ref)}`);
      const payment = res.data;

      if (payment.status === 'success' && payment.credited) {
        localStorage.removeItem('kobopay_pending_payment');
        setState({ status: 'success', message: 'Payment confirmed. Your wallet has been funded.', payment });
      } else if (payment.status === 'success') {
        localStorage.removeItem('kobopay_pending_payment');
        setState({ status: 'success', message: 'Payment already confirmed.', payment });
      } else if (payment.status === 'pending') {
        setState({
          status: 'pending',
          message: 'Paystack has not confirmed this payment yet. If you completed checkout, check again in a moment.',
          payment,
        });
      } else {
        setState({
          status: 'failed',
          message: 'This payment was not completed. No money was added to your wallet.',
          payment,
        });
      }
    } catch (err) {
      setState({
        status: 'error',
        message:
          err.status === 404
            ? 'We could not find this payment under your account.'
            : err.message,
        payment: null,
      });
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref =
      params.get('reference') ||
      params.get('trxref') ||
      localStorage.getItem('kobopay_pending_payment') ||
      '';

    setReference(ref);
    verify(ref);
  }, [verify]);

  const isBusy = state.status === 'verifying';

  return (
    <div className="min-h-[calc(100vh-60px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8 text-center">
        <h1 className="text-2xl font-bold text-emerald-700 mb-2">Payment status</h1>

        {isBusy && (
          <div className="py-8">
            <p className="text-gray-500 text-sm">{state.message}</p>
          </div>
        )}

        {!isBusy && (
          <>
            <div
              className={`mt-4 mb-5 rounded-xl px-4 py-3 text-sm ${
                state.status === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : state.status === 'pending'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-red-50 text-red-600 border border-red-200'
              }`}
            >
              {state.message}
            </div>

            {state.payment && (
              <dl className="text-left text-sm space-y-2 mb-6">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Reference</dt>
                  <dd className="text-gray-800 font-medium break-all text-right">
                    {state.payment.reference}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Amount</dt>
                  <dd className="text-gray-800 font-medium">
                    {formatAmount(state.payment.amount)}
                  </dd>
                </div>
                {state.payment.balance !== undefined && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Wallet balance</dt>
                    <dd className="text-gray-800 font-medium">
                      {formatAmount(state.payment.balance)}
                    </dd>
                  </div>
                )}
              </dl>
            )}

            <div className="space-y-2">
              {(state.status === 'pending' || state.status === 'error') && reference && (
                <button
                  type="button"
                  onClick={() => verify(reference)}
                  className="w-full bg-emerald-700 text-white py-2 rounded-lg font-semibold hover:bg-emerald-800 transition"
                >
                  Check payment again
                </button>
              )}
              <Link
                href="/dashboard"
                className="block w-full border border-emerald-700 text-emerald-700 py-2 rounded-lg font-semibold hover:bg-emerald-50 transition"
              >
                Back to dashboard
              </Link>
            </div>
          </>
        )}

        <p className="text-xs text-gray-400 mt-6">© {new Date().getFullYear()} {APP_NAME}</p>
      </div>
    </div>
  );
}
