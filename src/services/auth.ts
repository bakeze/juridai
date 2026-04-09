export interface User {
  id: string;
  username: string;
  role: 'admin' | 'compliance_officer' | 'legal_analyst';
  name: string;
  email: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
}

const TOKEN_KEY = 'jurisvoice_token';
const USER_KEY = 'jurisvoice_user';

// ─── Storage ──────────────────────────────────────────────────────────────────

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeAuth(token: string, user: User): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ─── API Calls ────────────────────────────────────────────────────────────────

export async function login(username: string, password: string): Promise<{ user: User; token: string }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Identifiants incorrects');
  }

  const data = await res.json();
  storeAuth(data.token, data.user);
  return data;
}

export async function verifyToken(): Promise<User | null> {
  const token = getStoredToken();
  if (!token) return null;

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      clearAuth();
      return null;
    }
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

export function logout(): void {
  clearAuth();
}

// ─── Permissions ──────────────────────────────────────────────────────────────

export function canAccessAudit(user: User | null): boolean {
  return user?.role === 'admin' || user?.role === 'compliance_officer';
}

export function canRebuildIndex(user: User | null): boolean {
  return user?.role === 'admin';
}

export function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Administrateur',
    compliance_officer: 'Responsable Conformité',
    legal_analyst: 'Analyste Juridique',
  };
  return labels[role] || role;
}

export function getRoleBadgeColor(role: string): string {
  const colors: Record<string, string> = {
    admin: 'bg-red-100 text-red-700 border-red-200',
    compliance_officer: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    legal_analyst: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  return colors[role] || 'bg-zinc-100 text-zinc-700';
}
