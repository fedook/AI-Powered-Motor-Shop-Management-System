import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Wrench, Mail, Lock, User, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { ApiRequestError } from "../services/api";

export default function RegisterPage() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState("");
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
      await register(name.trim(), email.trim(), password);
      toast.success("Account created. Welcome!");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError && err.details && typeof err.details === "object") {
        const details = err.details as { fieldErrors?: Record<string, string[]> };
        const first = details.fieldErrors ? Object.values(details.fieldErrors).flat()[0] : null;
        setError(first || err.message);
      } else {
        setError(err instanceof ApiRequestError ? err.message : "Unable to create account.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Wrench className="h-5 w-5" />
          </div>
          <span className="font-semibold text-slate-900">Motor Shop</span>
        </div>

        <div className="card p-8">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Create account</h2>
          <p className="card-subtitle">Register a staff account to get started.</p>

          {error && (
            <div className="error-state mt-5" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Input
              label="Full name"
              name="name"
              type="text"
              required
              minLength={2}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              left={<User className="h-4 w-4" />}
              placeholder="Juan Dela Cruz"
            />

            <Input
              label="Email"
              name="email"
              type="email"
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
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              left={<Lock className="h-4 w-4" />}
              hint="Use upper & lower case letters, a number, and a special character."
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
              placeholder="At least 8 characters"
            />

            <Button type="submit" className="w-full" loading={loading}>
              Create account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-brand-700 hover:text-brand-800">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
