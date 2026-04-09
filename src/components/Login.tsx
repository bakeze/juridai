import React, { useState } from 'react';
import { Scale, Lock, User, Eye, EyeOff, AlertCircle, Loader2, Shield } from 'lucide-react';
import { login, User as UserType, getRoleLabel } from '../services/auth';

interface LoginProps {
  onLogin: (user: UserType, token: string) => void;
}

const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'admin', role: 'admin' },
  { username: 'alice', password: 'alice123', role: 'compliance_officer' },
  { username: 'bob', password: 'bob123', role: 'legal_analyst' },
];

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setIsLoading(true);
    setError(null);

    try {
      const { user, token } = await login(username, password);
      onLogin(user, token);
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (account: typeof DEMO_ACCOUNTS[0]) => {
    setUsername(account.username);
    setPassword(account.password);
    setIsLoading(true);
    setError(null);
    try {
      const { user, token } = await login(account.username, account.password);
      onLogin(user, token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-zinc-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200">
            <Scale className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">JurisVoice AI</h1>
            <p className="text-sm text-zinc-500 font-medium">Assistant Juridique Intelligent</p>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Connexion</h2>
            <p className="text-sm text-zinc-500 mt-1">Accès sécurisé réservé aux utilisateurs autorisés</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                Identifiant
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="nom d'utilisateur"
                  autoComplete="username"
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !username || !password}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {isLoading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>

          {/* Demo Accounts */}
          <div className="border-t border-zinc-100 pt-5 space-y-3">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-3 h-3" />
              Comptes de démonstration
            </p>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map(account => (
                <button
                  key={account.username}
                  onClick={() => handleDemoLogin(account)}
                  disabled={isLoading}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-zinc-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all text-sm disabled:opacity-50 group"
                >
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-zinc-400 group-hover:text-indigo-500" />
                    <span className="font-medium text-zinc-700">{account.username}</span>
                  </div>
                  <span className="text-xs text-zinc-400 font-medium">{getRoleLabel(account.role)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-400">
          JurisVoice AI — Outil d'aide à la décision juridique. Ne remplace pas un avocat.
        </p>
      </div>
    </div>
  );
};
