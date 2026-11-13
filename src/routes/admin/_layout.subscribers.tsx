import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { adminApi, ApiError, type AdminSubscribersResult } from "@/lib/api";
import { useAdminSession } from "@/hooks/useAdminSession";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/_layout/subscribers")({
  head: () => ({ meta: [{ title: "Subscribers — Dhaka Kacchi Admin" }] }),
  component: AdminSubscribersPage,
});

type Filter = "all" | "confirmed" | "pending" | "unsubscribed";

const STATUS_LABEL = {
  confirmed: "Confirmed",
  pending: "Waiting to confirm",
  unsubscribed: "Unsubscribed",
};

function formatDay(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";
}

/** One cell of a CSV row: quoted, with quotes doubled; and a leading = + - @
 * neutralised so opening the file in Excel can't run a formula from an email. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function AdminSubscribersPage() {
  const { token } = useAdminSession();
  const [data, setData] = useState<AdminSubscribersResult | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    adminApi
      .listSubscribers(token)
      .then((res) => !cancelled && setData(res))
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : "Couldn't load subscribers.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.subscribers ?? []).filter(
      (s) => (filter === "all" || s.status === filter) && (!q || s.email.includes(q)),
    );
  }, [data, filter, query]);

  function downloadConfirmed() {
    const confirmed = (data?.subscribers ?? []).filter((s) => s.status === "confirmed");
    if (confirmed.length === 0) {
      toast.error("No confirmed subscribers yet.");
      return;
    }
    const lines = [
      ["email", "language", "confirmed_at"].map(csvCell).join(","),
      ...confirmed.map((s) => [s.email, s.locale, s.confirmedAt ?? ""].map(csvCell).join(",")),
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscribers-confirmed-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <p className="font-sans text-sm text-destructive">{error}</p>;
  if (!data) return <p className="font-sans text-sm text-muted-foreground">Loading…</p>;

  const total = data.counts.confirmed + data.counts.pending + data.counts.unsubscribed;
  const FILTERS: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "All", n: total },
    { key: "confirmed", label: STATUS_LABEL.confirmed, n: data.counts.confirmed },
    { key: "pending", label: STATUS_LABEL.pending, n: data.counts.pending },
    { key: "unsubscribed", label: STATUS_LABEL.unsubscribed, n: data.counts.unsubscribed },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-sans text-xl font-medium">Subscribers</h1>
          <p className="font-sans text-sm text-muted-foreground">
            Only people who clicked the confirmation link (&ldquo;Confirmed&rdquo;) should be
            emailed.
          </p>
        </div>
        <Button variant="outline" onClick={downloadConfirmed}>
          Download confirmed (CSV)
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className="text-left"
          >
            <Card
              className={`px-4 py-3 transition-colors ${filter === f.key ? "border-foreground" : "hover:border-foreground/40"}`}
            >
              <div className="font-sans text-2xl font-medium">{f.n}</div>
              <div className="font-sans text-xs text-muted-foreground">{f.label}</div>
            </Card>
          </button>
        ))}
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by email"
        aria-label="Search by email"
        className="max-w-sm"
      />

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Signed up</TableHead>
              <TableHead>Confirmed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {total === 0 ? "No sign-ups yet." : "Nothing matches."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.email}</TableCell>
                <TableCell>{STATUS_LABEL[s.status]}</TableCell>
                <TableCell className="uppercase">{s.locale}</TableCell>
                <TableCell>{formatDay(s.createdAt)}</TableCell>
                <TableCell>{formatDay(s.confirmedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
