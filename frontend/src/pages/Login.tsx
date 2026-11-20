import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Wrench, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { ApiRequestError } from "../services/api";

export default function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.success("Welcome back.");
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : "Unable to sign in.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-between bg-ink-950 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 shadow-lg shadow-brand-600/30">
            <Wrench className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold">Motor Shop</p>
            <p className="text-xs text-slate-400">Management System</p>
          </div>
        </div>
        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">
            Secure, AI-powered operations for your motorcycle shop.
          </h1>
          <p className="mt-4 max-w-md text-slate-400">
            Manage products, inventory, customers, and sales with real-time analytics and business intelligence backed by the CIA Triad.
          </p>
        </div>
        <p className="text-xs text-slate-500">Confidentiality • Integrity • Availability</p>
      </div>

      <div className="flex w-full items-center justify-center bg-slate-100 px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Wrench className="h-5 w-5" />
            </div>
            <span className="font-semibold text-slate-900">Motor Shop</span>
          </div>

          <div className="card p-8">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
            <p className="card-subtitle">Use your staff or administrator account.</p>

            {error && (
              <div className="error-state mt-5" role="alert">
                {error}
              </div>
            )}

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <Input
                label="Email"
                type="email"
                name="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                left={<Mail className="h-4 w-4" />}
                placeholder="you@motorshop.local"
              />

              <Input
                label="Password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                left={<Lock className="h-4 w-4" />}
                right={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="rounded p-1.5 text-slate-400 transition hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
                placeholder="••••••••"
              />

              <Button type="submit" className="w-full" loading={loading}>
                Sign in
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Don&apos;t have an account?{" "}
              <Link to="/register" className="font-medium text-brand-700 hover:text-brand-800">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
