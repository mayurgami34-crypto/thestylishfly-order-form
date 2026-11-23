import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { toast } from "sonner";

// Master access key. Change this to any secret string you like — every device
// that types it once will stay authorized until localStorage is cleared.
export const MASTER_ACCESS_KEY = "stylishfly-boss-2026";
const STORAGE_KEY = "tsf_admin_master_key";

function isAuthorized() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === MASTER_ACCESS_KEY;
  } catch {
    return false;
  }
}

export function clearAdminKey() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** The master key stored on this device (sent to the server to authorize writes). */
export function getAdminKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function AdminGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [ok, setOk] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    setOk(isAuthorized());
    setReady(true);
  }, []);

  if (!ready) return null;

  if (ok) return <>{children}</>;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() === MASTER_ACCESS_KEY) {
      try {
        window.localStorage.setItem(STORAGE_KEY, MASTER_ACCESS_KEY);
      } catch {}
      setOk(true);
      toast.success("Device authorized");
    } else {
      toast.error("Incorrect access key");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-2 p-6">
        <div className="mb-4 flex items-center gap-2">
          <div className="rounded-full bg-foreground p-2 text-white">
            <Lock className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Admin</div>
            <div className="text-lg font-black">Enter Master Key</div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="mkey">Access Key</Label>
            <Input
              id="mkey"
              type="password"
              autoFocus
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.currentTarget.value)}
              placeholder="Enter your secret key"
            />
          </div>
          <Button type="submit" className="w-full font-bold">Unlock Dashboard</Button>
          <p className="text-[11px] text-muted-foreground">
            This device will stay unlocked until you clear browser storage.
          </p>
        </form>
      </Card>
    </div>
  );
}