import { useState, type FormEvent } from "react";
import { PageHeader } from "../components/ui/PageHeader";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../context/AuthContext";
import { ApiRequestError } from "../services/api";
import * as authService from "../services/auth.service";
import { setCsrfToken } from "../services/api";
import { formatDateTime } from "../utils/format";

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changing, setChanging] = useState(false);

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await authService.updateProfile({ name: name.trim(), email: email.trim().toLowerCase() });
      setUser(updated);
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setChanging(true);
    try {
      const result = await authService.changePassword({ currentPassword, newPassword });
      setCsrfToken(result.csrfToken);
      setUser(result.user);
      setCurrentPassword("");
      setNewPassword("");
      toast.success(result.message || "Password updated.");
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "Unable to change password.");
    } finally {
      setChanging(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" subtitle="Manage your account information and password." />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="card-title">Account Details</h2>
          <p className="card-subtitle">Update your display name and email address.</p>
          <form onSubmit={onSaveProfile} className="mt-5 space-y-4">
            <Input label="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <p><span className="font-medium text-slate-700">Role:</span> {user?.role}</p>
              <p className="mt-1"><span className="font-medium text-slate-700">Member since:</span> {formatDateTime(user?.createdAt)}</p>
              <p className="mt-1"><span className="font-medium text-slate-700">Last login:</span> {formatDateTime(user?.lastLoginAt)}</p>
            </div>
            <Button type="submit" loading={saving}>Save Profile</Button>
          </form>
        </div>

        <div className="card p-6">
          <h2 className="card-title">Change Password</h2>
          <p className="card-subtitle">Changing your password signs out other sessions for security.</p>
          <form onSubmit={onChangePassword} className="mt-5 space-y-4">
            <Input label="Current password" type="password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
            <Input label="New password" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" hint="Min 8 chars with upper, lower, number, and special character." />
            <Button type="submit" loading={changing}>Update Password</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
