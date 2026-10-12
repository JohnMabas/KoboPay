'use client';

// app/dashboard/page.js — main authenticated page.
// Shows balance, deposit, transfer, PIN management, and transaction history.

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { APP_NAME, CURRENCY_SYMBOL } from '../../lib/config';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Format an amount as a currency string, e.g. "₦2,500.00"
function formatAmount(amount) {
  return `${CURRENCY_SYMBOL}${parseFloat(amount).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Account Lookup sub-component ──────────────────────────────────────────────
// Used by both the Deposit and Transfer forms.
// Calls /account/lookup after 10 digits are entered and shows the name.

function AccountLookupInput({ value, onChange, onResolve }) {
  const [resolvedName, setResolvedName] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [looking, setLooking] = useState(false);

  useEffect(() => {
    // Only look up when we have exactly 10 digits.
    if (!/^\d{10}$/.test(value)) {
      setResolvedName('');
      setLookupError('');
      onResolve(''); // no valid account
      return;
    }

    let cancelled = false;
    async function lookup() {
      setLooking(true);
      setResolvedName('');
      setLookupError('');
      try {
        const res = await apiFetch(`/account/lookup/${value}`);
        if (!cancelled) {
          setResolvedName(res.data.full_name);
          onResolve(res.data.full_name);
        }
      } catch {
        if (!cancelled) {
          setLookupError('Account not found');
          onResolve('');
        }
      } finally {
        if (!cancelled) setLooking(false);
      }
    }
    lookup();
    return () => { cancelled = true; };
  }, [value, onResolve]);

  return (
    <div>
      <input
        type="text"
        maxLength={10}
        inputMode="numeric"
        pattern="\d{10}"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
        placeholder="10-digit account number"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      {looking && <p className="text-xs text-gray-400 mt-1">Looking up…</p>}
      {resolvedName && (
        <p className="text-xs text-emerald-600 font-medium mt-1">✓ {resolvedName}</p>
      )}
      {lookupError && (
        <p className="text-xs text-red-500 mt-1">✗ {lookupError}</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();

  // ── user / balance state ──────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // ── deposit form state ────────────────────────────────────────────────────
  const [depositAccount, setDepositAccount] = useState('');
  const [depositResolvedName, setDepositResolvedName] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMsg, setDepositMsg] = useState({ type: '', text: '' });
  const [depositLoading, setDepositLoading] = useState(false);

  // ── transfer form state ───────────────────────────────────────────────────
  const [transferAccount, setTransferAccount] = useState('');
  const [transferResolvedName, setTransferResolvedName] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferPin, setTransferPin] = useState('');
  const [transferMsg, setTransferMsg] = useState({ type: '', text: '' });
  const [transferLoading, setTransferLoading] = useState(false);

  // ── PIN form state ────────────────────────────────────────────────────────
  const [pinForm, setPinForm] = useState({ pin: '', current_pin: '', new_pin: '' });
  const [pinMsg, setPinMsg] = useState({ type: '', text: '' });
  const [pinLoading, setPinLoading] = useState(false);

  // ── transaction history state ─────────────────────────────────────────────
  const [transactions, setTransactions] = useState([]);
  const [txPage, setTxPage] = useState(1);
  const [txTotal, setTxTotal] = useState(0);
  const TX_LIMIT = 10;
  const [txLoading, setTxLoading] = useState(false);

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const fetchBalance = useCallback(async () => {
    try {
      const res = await apiFetch('/account/balance');
      setUser(res.data);
    } catch (err) {
      // If token is invalid or expired, redirect to login.
      if (err.status === 401) {
        localStorage.removeItem('token');
        router.push('/login');
      }
    }
  }, [router]);

  const fetchTransactions = useCallback(async (page = 1) => {
    setTxLoading(true);
    try {
      const res = await apiFetch(`/account/transactions?page=${page}&limit=${TX_LIMIT}`);
      setTransactions(res.data.transactions);
      setTxTotal(res.data.total);
    } catch {
      // silently fail — balance is still usable
    } finally {
      setTxLoading(false);
    }
  }, []);

  // ── On mount: verify auth and load data ───────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    async function init() {
      await fetchBalance();
      await fetchTransactions(1);
      setLoadingUser(false);
    }
    init();
  }, [router, fetchBalance, fetchTransactions]);

  // ── Deposit handler ────────────────────────────────────────────────────────
  async function handleDeposit(e) {
    e.preventDefault();
    setDepositMsg({ type: '', text: '' });
    setDepositLoading(true);
    try {
      const res = await apiFetch('/account/deposit', {
        method: 'POST',
        body: { account_number: depositAccount, amount: parseFloat(depositAmount) },
      });
      setDepositMsg({
        type: 'success',
        text: `Successfully deposited ${formatAmount(depositAmount)} to ${res.data.receiver_name}`,
      });
      setDepositAccount('');
      setDepositAmount('');
      setDepositResolvedName('');
      // Refresh balance and transactions after a deposit.
      await fetchBalance();
      await fetchTransactions(1);
      setTxPage(1);
    } catch (err) {
      setDepositMsg({ type: 'error', text: err.message });
    } finally {
      setDepositLoading(false);
    }
  }

  // ── Transfer handler ───────────────────────────────────────────────────────
  async function handleTransfer(e) {
    e.preventDefault();
    setTransferMsg({ type: '', text: '' });
    setTransferLoading(true);
    try {
      const res = await apiFetch('/account/transfer', {
        method: 'POST',
        body: {
          to_account_number: transferAccount,
          amount: parseFloat(transferAmount),
          pin: transferPin,
        },
      });
      setTransferMsg({
        type: 'success',
        text: `Successfully sent ${formatAmount(transferAmount)} to ${res.data.receiver_name}`,
      });
      setTransferAccount('');
      setTransferAmount('');
      setTransferPin('');
      setTransferResolvedName('');
      // Refresh balance and transactions after a transfer.
      await fetchBalance();
      await fetchTransactions(1);
      setTxPage(1);
    } catch (err) {
      setTransferMsg({ type: 'error', text: err.message });
    } finally {
      setTransferLoading(false);
    }
  }

  // ── PIN handler ────────────────────────────────────────────────────────────
  async function handlePin(e) {
    e.preventDefault();
    setPinMsg({ type: '', text: '' });
    setPinLoading(true);
    try {
      if (!user.has_pin) {
        // Creating a new PIN
        await apiFetch('/account/pin', {
          method: 'POST',
          body: { pin: pinForm.pin },
        });
        setPinMsg({ type: 'success', text: 'PIN created successfully.' });
        setPinForm({ pin: '', current_pin: '', new_pin: '' });
      } else {
        // Changing existing PIN
        await apiFetch('/account/pin', {
          method: 'PUT',
          body: { current_pin: pinForm.current_pin, new_pin: pinForm.new_pin },
        });
        setPinMsg({ type: 'success', text: 'PIN updated successfully.' });
        setPinForm({ pin: '', current_pin: '', new_pin: '' });
      }
      // Refresh to update has_pin flag.
      await fetchBalance();
    } catch (err) {
      setPinMsg({ type: 'error', text: err.message });
    } finally {
      setPinLoading(false);
    }
  }

  // ── Pagination handler ────────────────────────────────────────────────────
  async function goToPage(newPage) {
    setTxPage(newPage);
    await fetchTransactions(newPage);
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  // Colour and sign for a transaction row.
  function txStyle(direction) {
    if (direction === 'credit') return 'text-emerald-600 font-semibold';
    if (direction === 'debit') return 'text-red-500 font-semibold';
    return 'text-gray-400 font-semibold';
  }

  function txSign(direction) {
    if (direction === 'credit') return '+';
    if (direction === 'debit') return '-';
    return '';
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loadingUser) {
    return (
      <div className="min-h-[calc(100vh-60px)] flex items-center justify-center text-gray-400">
        Loading…
      </div>
    );
  }

  const totalPages = Math.ceil(txTotal / TX_LIMIT);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

      {/* ── Account summary card ────────────────────────────────────────── */}
      <div className="bg-emerald-700 text-white rounded-2xl p-6 shadow">
        <p className="text-emerald-200 text-sm">Welcome back</p>
        <h2 className="text-xl font-bold mt-0.5">{user?.full_name}</h2>
        <p className="text-emerald-300 text-sm mt-1">Account: {user?.account_number}</p>
        <p className="text-4xl font-extrabold mt-4">{formatAmount(user?.balance ?? 0)}</p>
      </div>

      {/* ── Two-column forms grid (deposit / transfer / pin) ────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* ── Deposit form ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Deposit</h3>
          <form onSubmit={handleDeposit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recipient account number
              </label>
              <AccountLookupInput
                value={depositAccount}
                onChange={setDepositAccount}
                onResolve={setDepositResolvedName}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {depositMsg.text && (
              <p className={`text-sm ${depositMsg.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                {depositMsg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={depositLoading || !depositResolvedName || !depositAmount}
              className="w-full bg-emerald-700 text-white py-2 rounded-lg font-semibold hover:bg-emerald-800 transition disabled:opacity-50"
            >
              {depositLoading ? 'Depositing…' : 'Deposit'}
            </button>
          </form>
        </div>

        {/* ── Transfer form ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Transfer</h3>
          <form onSubmit={handleTransfer} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recipient account number
              </label>
              <AccountLookupInput
                value={transferAccount}
                onChange={setTransferAccount}
                onResolve={setTransferResolvedName}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
              <input
                type="password"
                maxLength={4}
                inputMode="numeric"
                pattern="\d{4}"
                required
                value={transferPin}
                onChange={(e) => setTransferPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4-digit PIN"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            {transferMsg.text && (
              <p className={`text-sm ${transferMsg.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                {transferMsg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={transferLoading || !transferResolvedName || !transferAmount || transferPin.length !== 4}
              className="w-full bg-emerald-700 text-white py-2 rounded-lg font-semibold hover:bg-emerald-800 transition disabled:opacity-50"
            >
              {transferLoading ? 'Sending…' : 'Send money'}
            </button>
          </form>
        </div>

        {/* ── PIN form ────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow p-6 md:col-span-2">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            {user?.has_pin ? 'Change PIN' : 'Create PIN'}
          </h3>
          <form onSubmit={handlePin} className="space-y-3 max-w-sm">
            {!user?.has_pin ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New PIN</label>
                <input
                  type="password"
                  maxLength={4}
                  inputMode="numeric"
                  pattern="\d{4}"
                  required
                  value={pinForm.pin}
                  onChange={(e) =>
                    setPinForm({ ...pinForm, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })
                  }
                  placeholder="4 digits"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current PIN
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    pattern="\d{4}"
                    required
                    value={pinForm.current_pin}
                    onChange={(e) =>
                      setPinForm({
                        ...pinForm,
                        current_pin: e.target.value.replace(/\D/g, '').slice(0, 4),
                      })
                    }
                    placeholder="4 digits"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    pattern="\d{4}"
                    required
                    value={pinForm.new_pin}
                    onChange={(e) =>
                      setPinForm({
                        ...pinForm,
                        new_pin: e.target.value.replace(/\D/g, '').slice(0, 4),
                      })
                    }
                    placeholder="4 digits"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </>
            )}
            {pinMsg.text && (
              <p className={`text-sm ${pinMsg.type === 'success' ? 'text-emerald-600' : 'text-red-500'}`}>
                {pinMsg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={pinLoading}
              className="bg-emerald-700 text-white px-6 py-2 rounded-lg font-semibold hover:bg-emerald-800 transition disabled:opacity-50"
            >
              {pinLoading ? 'Saving…' : user?.has_pin ? 'Update PIN' : 'Set PIN'}
            </button>
          </form>
        </div>
      </div>

      {/* ── Transaction history ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Transaction History</h3>

        {txLoading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : transactions.length === 0 ? (
          <p className="text-gray-400 text-sm">No transactions yet.</p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Description</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleDateString('en-NG', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-2 pr-4 text-gray-700">{tx.description}</td>
                      <td className={`py-2 text-right whitespace-nowrap ${txStyle(tx.direction)}`}>
                        {txSign(tx.direction)}{formatAmount(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile list */}
            <div className="sm:hidden space-y-3">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex justify-between items-start border-b pb-3 last:border-0">
                  <div>
                    <p className="text-sm text-gray-700">{tx.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(tx.created_at).toLocaleDateString('en-NG', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <span className={`text-sm ${txStyle(tx.direction)}`}>
                    {txSign(tx.direction)}{formatAmount(tx.amount)}
                  </span>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-sm">
                <button
                  onClick={() => goToPage(txPage - 1)}
                  disabled={txPage === 1}
                  className="px-4 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-gray-500">
                  Page {txPage} of {totalPages}
                </span>
                <button
                  onClick={() => goToPage(txPage + 1)}
                  disabled={txPage === totalPages}
                  className="px-4 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="text-center text-xs text-gray-400 pb-6">
        © {new Date().getFullYear()} {APP_NAME}
      </footer>
    </div>
  );
}
