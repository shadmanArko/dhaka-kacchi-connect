import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LinksAnalytics } from "@/lib/api";
import { num } from "./format";

const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/** Each tagged link's visits and the orders that followed - "which post worked". */
export function LinksTable({ data }: { data: LinksAnalytics }) {
  if (data.totalLinks === 0) {
    return (
      <Card className="border-dashed p-4 shadow-none">
        <p className="font-sans text-sm text-muted-foreground">
          No tagged links yet.{" "}
          <Link to="/admin/links" className="underline underline-offset-2">
            Make your first one
          </Link>{" "}
          and its visits and orders will show up here.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Link</TableHead>
            <TableHead>Where</TableHead>
            <TableHead className="text-right">Visits</TableHead>
            <TableHead className="text-right">Orders</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.links.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="max-w-[16rem]">
                {l.postUrl ? (
                  <a
                    href={l.postUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate font-medium underline underline-offset-2"
                    title={l.label}
                  >
                    {l.label}
                  </a>
                ) : (
                  <span className="block truncate font-medium" title={l.label}>
                    {l.label}
                  </span>
                )}
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {l.content}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {l.source}
                <span className="block text-xs text-muted-foreground">{l.campaign}</span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{num(l.sessions)}</TableCell>
              <TableCell className="text-right tabular-nums">{num(l.orders)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {l.orders > 0 ? EUR.format(l.revenue) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="font-sans text-xs text-muted-foreground">
        Visits are sessions that arrived through the link; orders are purchases traced back to it by
        order id. Most-visited first
        {data.totalLinks > data.links.length
          ? `, showing ${data.links.length} of ${data.totalLinks} links`
          : ""}
        . A link nobody used is listed too.
      </p>
    </div>
  );
}
