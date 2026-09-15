import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { adminApi, type AdminOrder, type OrderStatus } from "@/lib/api";
import { useAdminSession } from "@/hooks/useAdminSession";
import { OrderTable } from "@/components/admin/OrderTable";
import { OrderDetailSheet } from "@/components/admin/OrderDetailSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/_layout/")({
  validateSearch: (search: Record<string, unknown>) => ({
    order: typeof search.order === "string" ? search.order : undefined,
  }),
  head: () => ({ meta: [{ title: "Orders — Dhaka Kacchi Admin" }] }),
  component: AdminDashboardPage,
});

type LoadState = "loading" | "ready" | "error";

/** This app's own local-time equivalent of the backend's Berlin-aware
 * nextSaturday() (worker/src/lib/dates.ts) - close enough for a UI
 * default filter (staff can always change it), not something any pricing
 * or business-rule decision depends on. */
function nextSaturdayLocal(): string {
  const now = new Date();
  const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
  const saturday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSaturday);
  const y = saturday.getFullYear();
  const m = String(saturday.getMonth() + 1).padStart(2, "0");
  const d = String(saturday.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function AdminDashboardPage() {
  const session = useAdminSession();
  const { order: selectedOrderId } = Route.useSearch();
  const navigate = useNavigate();

  const [deliveryDate, setDeliveryDate] = useState(nextSaturdayLocal());
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);

  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!session.token) return;
    let cancelled = false;
    setLoadState("loading");
    adminApi
      .listOrders(session.token, {
        deliveryDate: deliveryDate || undefined,
        status: status === "all" ? undefined : status,
        search: search.trim() || undefined,
      })
      .then((res) => {
        if (cancelled) return;
        setOrders(res.orders);
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [session.token, deliveryDate, status, search, retryCount]);

  // The detail panel always fetches its own order directly, keyed off the
  // ?order= search param - never by searching the list above. A deep link
  // to an order outside the currently-filtered week/search would otherwise
  // silently open nothing.
  useEffect(() => {
    if (!session.token || !selectedOrderId) {
      setSelectedOrder(null);
      return;
    }
    let cancelled = false;
    adminApi
      .getOrder(session.token, selectedOrderId)
      .then((res) => {
        if (!cancelled) setSelectedOrder(res.order);
      })
      .catch(() => {
        if (!cancelled) setSelectedOrder(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session.token, selectedOrderId]);

  function openOrder(order: AdminOrder) {
    navigate({ to: "/admin", search: { order: order.id } });
  }

  function closeOrder() {
    navigate({ to: "/admin", search: { order: undefined } });
  }

  function handleUpdated(updated: AdminOrder) {
    setSelectedOrder(updated);
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-sans text-xl font-medium">Orders</h1>
        <Button asChild>
          <Link to="/admin/orders/new">+ New order</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="filter-date" className="font-sans text-xs text-muted-foreground">
            Saturday
          </label>
          <Input
            id="filter-date"
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            className="w-40"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setDeliveryDate("")}>
          All dates
        </Button>
        <div className="space-y-1">
          <label htmlFor="filter-status" className="font-sans text-xs text-muted-foreground">
            Status
          </label>
          <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus | "all")}>
            <SelectTrigger id="filter-status" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-48 flex-1 space-y-1">
          <label htmlFor="filter-search" className="font-sans text-xs text-muted-foreground">
            Search name or phone
          </label>
          <Input
            id="filter-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="e.g. Fatima or +4917…"
          />
        </div>
      </div>

      {loadState === "loading" && (
        <p className="py-12 text-center font-sans text-sm text-muted-foreground">Loading orders…</p>
      )}
      {loadState === "error" && (
        <div className="py-12 text-center">
          <p className="mb-4 font-sans text-sm text-muted-foreground">Couldn't load orders.</p>
          <Button variant="outline" onClick={() => setRetryCount((n) => n + 1)}>
            Retry
          </Button>
        </div>
      )}
      {loadState === "ready" && <OrderTable orders={orders} onSelect={openOrder} />}

      {session.token && (
        <OrderDetailSheet
          order={selectedOrder}
          token={session.token}
          onClose={closeOrder}
          onUpdated={handleUpdated}
        />
      )}
    </div>
  );
}
