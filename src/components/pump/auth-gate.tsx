"use client";

import { useEffect, useState } from "react";
import { SessionProvider, useSession, signIn, signOut } from "next-auth/react";
import { Activity, ChevronsUpDown, Eye, LogOut, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Role } from "@/lib/pump/types";
import { Dashboard } from "./dashboard";

/**
 * AuthGate — la única ruta es /: sin sesión muestra el login (o la creación
 * del primer ADMIN), con sesión renderiza el dashboard con el rol del usuario.
 */

export function App() {
  return (
    <SessionProvider refetchOnWindowFocus={false}>
      <Gate />
    </SessionProvider>
  );
}

function Gate() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <Activity className="h-8 w-8 animate-pulse text-emerald-400" aria-hidden />
          <p className="font-mono text-xs text-zinc-500">cargando PumpSeeker…</p>
        </div>
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  const role = ((session.user as { role?: string }).role ?? "VIEWER") as Role;
  const name = session.user?.name || session.user?.email || "trader";

  return <Dashboard userName={name} userRole={role} onLogout={() => void signOut({ callbackUrl: "/" })} />;
}

/* ————————————————————————— pantalla de auth ————————————————————————— */

function AuthScreen() {
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [knownUsers, setKnownUsers] = useState<
    { email: string; name: string | null; role: string }[]
  >([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // prefill del último email (acceso rápido)
    try {
      const last = localStorage.getItem("pumpseeker:lastEmail");
      if (last) setEmail(last);
    } catch {
      /* sin localStorage */
    }
    fetch("/api/auth/register")
      .then((r) => r.json())
      .then((d: { hasUsers: boolean }) => {
        setHasUsers(d.hasUsers);
        setMode(d.hasUsers ? "login" : "register");
      })
      .catch(() => setHasUsers(true));
    // usuarios registrados para el dropdown de acceso rápido
    fetch("/api/auth/users-lite")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setKnownUsers(d.users ?? []))
      .catch(() => undefined);
  }, []);

  const initial = (u: { email: string; name?: string | null }) =>
    (u.name || u.email).charAt(0).toUpperCase();

  const roleCls = (role: string) =>
    role === "ADMIN"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : role === "TRADER"
        ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
        : "border-zinc-600 bg-zinc-800/60 text-zinc-400";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name: name || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "no se pudo crear la cuenta");
      }
      const r = await signIn("credentials", { email, password, redirect: false });
      if (r?.error) throw new Error("email o contraseña incorrectos");
      try {
        if (remember) localStorage.setItem("pumpseeker:lastEmail", email);
        else localStorage.removeItem("pumpseeker:lastEmail");
      } catch {
        /* noop */
      }
      // la sesión se refresca sola; el Gate re-renderiza
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.10]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(16,185,129,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.5) 1px, transparent 1px)",
          backgroundSize: "38px 38px",
        }}
      />
      <Card className="relative w-full max-w-sm border-zinc-800 bg-zinc-900/70 backdrop-blur">
        <CardContent className="pt-6">
          <div className="mb-6 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10">
              <Activity className="h-5 w-5 text-emerald-400" aria-hidden />
            </span>
            <div>
              <h1 className="text-lg font-black leading-none tracking-tight text-zinc-50">
                Pump<span className="text-emerald-400">Seeker</span>
              </h1>
              <p className="mt-1 text-[10px] text-zinc-500">
                bot de pump-momentum · acceso multi-usuario
              </p>
            </div>
          </div>

          {hasUsers === null ? (
            <p className="py-6 text-center font-mono text-xs text-zinc-600">verificando…</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {mode === "register" && (
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/[0.07] px-3 py-2">
                  <p className="text-[11px] leading-snug text-sky-200">
                    {hasUsers
                      ? "creando cuenta (la asigna un ADMIN)"
                      : "primer usuario: se convierte en ADMIN del sistema"}
                  </p>
                </div>
              )}

              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-[11px] text-zinc-400">Nombre (opcional)</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-9 border-zinc-800 bg-zinc-950 text-sm text-zinc-200"
                    autoComplete="name"
                  />
                </div>
              )}

              {mode === "login" && knownUsers.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-zinc-400">
                    Acceso rápido — usuario de esta instalación
                  </Label>
                  <Select value={email || undefined} onValueChange={(v) => setEmail(v)}>
                    <SelectTrigger className="h-10 border-zinc-800 bg-zinc-950 text-left">
                      <SelectValue placeholder="elige tu usuario…" />
                    </SelectTrigger>
                    <SelectContent className="border-zinc-800 bg-zinc-900">
                      {knownUsers.map((u) => (
                        <SelectItem key={u.email} value={u.email} className="py-2">
                          <span className="flex w-full items-center gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 font-mono text-xs font-bold text-zinc-300">
                              {initial(u)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-mono text-xs text-zinc-100">
                                {u.name || u.email.split("@")[0]}
                              </span>
                              <span className="block truncate font-mono text-[10px] text-zinc-500">
                                {u.email}
                              </span>
                            </span>
                            <span
                              className={`ml-auto shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold ${roleCls(u.role)}`}
                            >
                              {u.role}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="flex items-center gap-1 font-mono text-[9px] text-zinc-600">
                    <ChevronsUpDown className="h-2.5 w-2.5" aria-hidden />
                    o escribe el email manualmente abajo
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[11px] text-zinc-400">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9 border-zinc-800 bg-zinc-950 text-sm text-zinc-200"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[11px] text-zinc-400">
                  Contraseña {mode === "register" && <span className="text-zinc-600">(mín. 8)</span>}
                </Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={mode === "register" ? 8 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-9 border-zinc-800 bg-zinc-950 text-sm text-zinc-200"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                />
              </div>

              {error && (
                <p className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 font-mono text-[11px] text-rose-300">
                  {error}
                </p>
              )}

              {mode === "login" && (
                <label className="flex cursor-pointer select-none items-center gap-2 font-mono text-[10px] text-zinc-500">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-3 w-3 accent-emerald-500"
                  />
                  recordar email
                </label>
              )}

              <Button
                type="submit"
                disabled={busy}
                className="h-10 w-full bg-emerald-600 font-mono text-sm text-white hover:bg-emerald-500"
              >
                {busy
                  ? "…"
                  : mode === "login"
                    ? "Entrar"
                    : hasUsers
                      ? "Crear cuenta"
                      : "Crear cuenta ADMIN"}
              </Button>

              {hasUsers && mode === "login" && (
                <p className="text-center font-mono text-[10px] text-zinc-600">
                  pide a un ADMIN que cree tu cuenta
                </p>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ————————————————————————— gestión de usuarios (ADMIN) ————————————————————————— */

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export function UserManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    fetch("/api/auth/users")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setUsers(d.users ?? []))
      .catch(() => undefined);
  };
  useEffect(load, []);

  const create = async () => {
    setMsg(null);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: name || undefined, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "error");
      return;
    }
    setMsg(`✓ ${email} creado como ${role}`);
    setEmail("");
    setName("");
    setPassword("");
    load();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 border-zinc-700 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800"
        >
          <Users className="h-3 w-3" aria-hidden />
          Usuarios
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md border-zinc-800 bg-zinc-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm text-zinc-100">
            <Users className="h-4 w-4 text-emerald-400" aria-hidden />
            Usuarios del sistema
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <ul className="space-y-1.5">
            {users.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-2 rounded border border-zinc-800 bg-zinc-950/60 px-3 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-zinc-200">{u.email}</p>
                  {u.name && <p className="text-[10px] text-zinc-500">{u.name}</p>}
                </div>
                <span className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">
                  {u.role}
                </span>
              </li>
            ))}
          </ul>

          <div className="space-y-2 border-t border-zinc-800 pt-3">
            <p className="font-mono text-[10px] uppercase text-zinc-500">nuevo usuario</p>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 border-zinc-800 bg-zinc-950 font-mono text-xs" />
              <Input placeholder="nombre" value={name} onChange={(e) => setName(e.target.value)} className="h-8 border-zinc-800 bg-zinc-950 font-mono text-xs" />
              <Input placeholder="contraseña (mín. 8)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-8 border-zinc-800 bg-zinc-950 font-mono text-xs" />
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger className="h-8 border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-800 bg-zinc-900 text-zinc-200">
                  <SelectItem value="ADMIN" className="font-mono text-xs">ADMIN — todo</SelectItem>
                  <SelectItem value="TRADER" className="font-mono text-xs">TRADER — control</SelectItem>
                  <SelectItem value="VIEWER" className="font-mono text-xs">VIEWER — lectura</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="h-8 w-full bg-emerald-600 font-mono text-xs text-white hover:bg-emerald-500"
              disabled={!email || password.length < 8}
              onClick={() => void create()}
            >
              Crear usuario
            </Button>
            {msg && <p className="font-mono text-[10px] text-zinc-400">{msg}</p>}
            <p className="flex items-start gap-1.5 text-[10px] leading-snug text-zinc-600">
              <Eye className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              VIEWER solo ve el dashboard. TRADER controla motor y posiciones. Solo ADMIN
              toca keys live, telegram y usuarios.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const cls =
    role === "ADMIN"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : role === "TRADER"
        ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
        : "border-zinc-600 bg-zinc-800/60 text-zinc-400";
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold ${cls}`}>
      {role === "ADMIN" ? <Shield className="h-2.5 w-2.5" aria-hidden /> : role === "VIEWER" ? <Eye className="h-2.5 w-2.5" aria-hidden /> : null}
      {role}
    </span>
  );
}

export { LogOut };
