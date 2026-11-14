/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sprout, LogIn, Mail, Lock } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (token: string, user: any) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    const u = username.trim();
    const p = password;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Server error during authentication');
      }

      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || 'Verification failure. Please inspect credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="login-stage" className="min-h-screen bg-[#FBF9F4] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-premium overflow-hidden border border-[#2D6A4F]/10">
        {/* Banner */}
        <div className="bg-gradient-to-b from-[#143427] to-[#0E251B] p-10 text-center text-white relative">
          <div 
            className="absolute top-4 right-4 bg-[#D4A017] text-[#0A2619] text-[8px] uppercase font-mono font-black px-2 py-0.5 rounded-md border border-[#D4A017]/30 select-none"
          >
            SECURE PORTAL TLS
          </div>
          <div className="mx-auto w-14 h-14 bg-[#52B788]/10 border border-[#52B788]/20 rounded-2xl flex items-center justify-center mb-5 shadow-inner">
            <Sprout className="h-8 w-8 text-[#52B788]" />
          </div>
          <h1 className="font-serif font-bold text-2xl tracking-wide text-white mb-1">Adubiaro Farms</h1>
          <p className="text-[#52B788] text-[9px] font-mono uppercase tracking-widest font-bold">Estate Investor Portal</p>
        </div>

        {/* Form area */}
        <div className="p-8">
          {error && (
            <div id="login-error" className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-xl text-red-700 text-xs font-semibold">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-[#2D6A4F] uppercase mb-1.5 font-bold tracking-wider">Username</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#2D6A4F]/60">
                  <Mail className="h-4 w-4" />
                </span>
                <input
                  id="id-username"
                  type="text"
                  required
                  placeholder="Your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1B4332]/20 focus:border-[#1B4332] text-sm bg-white font-medium transition-all duration-200 outline-none shadow-sm focus:shadow-md"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 uppercase mb-1.5 font-bold tracking-wider">Password</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                  <Lock className="h-4 w-4 text-[#2D6A4F]/50" />
                </span>
                <input
                  id="id-password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-150 focus:outline-none focus:ring-2 focus:ring-[#1B4332] focus:border-transparent text-sm bg-[#FBF9F4]/40 font-medium transition duration-200"
                />
              </div>
            </div>

            <button
              id="btn-submit"
              type="submit"
              disabled={loading}
              className="w-full bg-[#1B4332] hover:bg-[#2D6A4F] text-[#FBF9F4] font-semibold py-3.5 rounded-xl transition duration-300 flex items-center justify-center gap-2 cursor-pointer text-sm shadow-md shadow-[#1B4332]/10"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#52B788] border-t-transparent" />
              ) : (
                <>
                  <LogIn className="h-4 w-4 text-[#52B788]" />
                  <span>Verify Credentials</span>
                </>
              )}
            </button>
          </form>

        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-[11px] text-gray-400 font-mono tracking-wider">
          ADUBIARO FARM ESTATE PORTAL • ENFORCED RBAC SECURITY PROTOCOL
        </p>
      </div>
    </div>
  );
}
