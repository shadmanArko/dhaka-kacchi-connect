import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { adminApi, ApiError, type AdminCockpitResult, type CockpitAlert } from "@/lib/api";
import { useAdminSession } from "@/hooks/useAdminSession";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/_layout/cockpit")({
  head: () => ({ meta: [{ title: "Cockpit — Dhaka Kacchi Admin" }] }),
  component: AdminCockpitPage,
});

type LoadState = "loading" | "ready" | "error" | "not_configured";

const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const PERCENT = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 });

function formatDetected(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const SEVERITY_STYLES: Record<CockpitAlert["severity"], string> = {
  critical: "border-destructive/50 bg-destructive/5",
  warn: "border-yellow-500/40 bg-yellow-500/5",
  info: "border-border",
};

/**
 * Both acknowledge/resolve routes answer 204 with an empty body (see
 * index.ts's `c.body(null, 204)`) - apiFetch<void>'s final `res.json()`
 * throws a plain (non-ApiError) SyntaxError on that empty body EVEN ON
 * SUCCESS, the same reason useAdminSession.tsx's logout() call blindly
 * swallows every error from adminApi.logout(). Unlike logout, this page
 * actually needs to know whether the call really failed (a 404/503 is a
 * real ApiError; the empty-body parse failure is not) to decide whether to
 * update local state - so it distinguishes instead of swallowing both.
 */
function wasReallyAnError(err: unknown): boolean {
  return err instanceof ApiError;
}

function AdminCockpitPage() {
  const session = useAdminSession();
  const [data, setData] = useState<AdminCockpitResult | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [retryCount, setRetryCount] = useState(0);
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);

  useEffect(() => {
    if (!session.token) return;
    let cancelled = false;
    setLoadState("loading");
    adminApi
      .getCockpit(session.token)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setLoadState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadState(err instanceof ApiError && err.status === 503 ? "not_configured" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [session.token, retryCount]);

  async function handleAcknowledge(alert: CockpitAlert) {
    if (!session.token) return;
    setBusyAlertId(alert.id);
    try {
      await adminApi.acknowledgeAlert(session.token, alert.id);
    } catch (err) {
      if (wasReallyAnError(err)) {
        toast.error(err instanceof ApiError ? err.message : "Couldn't acknowledge this alert.");
        setBusyAlertId(null);
        return;
      }
    }
    setData((prev) =>
      prev
        ? {
            ...prev,
            alerts: prev.alerts.map((a) =>
              a.id === alert.id ? { ...a, acknowledgedAt: new Date().toISOString() } : a,
            ),
          }
        : prev,
    );
    setBusyAlertId(null);
  }

  async function handleResolve(alert: CockpitAlert) {
    if (!session.token) return;
    setBusyAlertId(alert.id);
    try {
      await adminApi.resolveAlert(session.token, alert.id);
    } catch (err) {
      if (wasReallyAnError(err)) {
        toast.error(err instanceof ApiError ? err.message : "Couldn't resolve this alert.");
        setBusyAlertId(null);
        return;
      }
    }
    toast.success("Alert resolved");
    setData((prev) =>
      prev ? { ...prev, alerts: prev.alerts.filter((a) => a.id !== alert.id) } : prev,
    );
    setBusyAlertId(null);
  }

  if (loadState === "loading") {
    return <p className="font-sans text-sm text-muted-foreground">Loading…</p>;
  }

  if (loadState === "not_configured") {
    return (
      <div className="space-y-2">
        <h1 className="font-sans text-xl font-medium">Cockpit</h1>
        <p className="font-sans text-sm text-muted-foreground">
          This deployment isn&apos;t connected to the warehouse database yet (WAREHOUSE_DATABASE_URL
          isn&apos;t set).
        </p>
      </div>
    );
  }

  if (loadState === "error" || !data) {
    return (
      <div className="space-y-2">
        <p className="font-sans text-sm text-destructive">Couldn&apos;t load the cockpit.</p>
        <button className="font-sans text-sm underline" onClick={() => setRetryCount((n) => n + 1)}>
          Retry
        </button>
      </div>
    );
  }

  const { health, alerts } = data;

  return (
    <div className="space-y-8">
      <h1 className="font-sans text-xl font-medium">Cockpit</h1>

      <section className="space-y-3">
        <h2 className="font-sans text-base font-medium">Yesterday</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="font-sans text-xs text-muted-foreground">Revenue</p>
              <p className="font-sans text-lg font-medium">{EUR.format(health.revenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="font-sans text-xs text-muted-foreground">Orders</p>
              <p className="font-sans text-lg font-medium">{health.orderCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="font-sans text-xs text-muted-foreground">Avg order</p>
              <p className="font-sans text-lg font-medium">{EUR.format(health.avgOrderValue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="font-sans text-xs text-muted-foreground">Margin</p>
              <p className="font-sans text-lg font-medium">
                {health.marginRatio == null ? "—" : PERCENT.format(health.marginRatio)}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-sans text-base font-medium">Problems detected</h2>
        {alerts.length === 0 ? (
          <p className="font-sans text-sm text-muted-foreground">
            No open alerts — everything&apos;s quiet.
          </p>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <Card key={alert.id} className={cn("border", SEVERITY_STYLES[alert.severity])}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={alert.severity === "critical" ? "destructive" : "outline"}
                        className="font-sans text-xs uppercase"
                      >
                        {alert.severity}
                      </Badge>
                      <CardTitle className="font-sans text-sm font-medium">{alert.title}</CardTitle>
                    </div>
                    <p className="font-sans text-xs text-muted-foreground">
                      {alert.agent} · {formatDetected(alert.detectedAt)}
                      {alert.acknowledgedAt && " · acknowledged"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!alert.acknowledgedAt && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyAlertId === alert.id}
                        onClick={() => handleAcknowledge(alert)}
                      >
                        Acknowledge
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyAlertId === alert.id}
                      onClick={() => handleResolve(alert)}
                    >
                      Resolve
                    </Button>
                  </div>
                </CardHeader>
                {alert.detail && (
                  <CardContent className="pt-0">
                    <p className="font-sans text-sm text-muted-foreground">{alert.detail}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
