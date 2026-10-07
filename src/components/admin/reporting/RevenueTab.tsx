import type { AdminReportingResult } from "@/lib/api";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHead } from "./sortable";
import { useSort } from "./useSort";

const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function RevenueTab({ reporting }: { reporting: AdminReportingResult }) {
  const revenue = useSort(reporting.channelRevenue);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="font-sans text-base font-medium">Revenue by channel</h2>
        <p className="font-sans text-xs text-muted-foreground">
          Best-effort: matches an attributed purchase event to its real order by id. Not full
          multi-touch attribution — a channel only shows here once a real order has been placed
          after clicking through from it.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                label="Channel"
                column="channel"
                sortKey={revenue.sortKey}
                direction={revenue.direction}
                onSort={revenue.requestSort}
              />
              <SortableHead
                label="Campaign"
                column="campaign"
                sortKey={revenue.sortKey}
                direction={revenue.direction}
                onSort={revenue.requestSort}
              />
              <SortableHead
                label="Purchase events"
                column="purchaseEvents"
                sortKey={revenue.sortKey}
                direction={revenue.direction}
                onSort={revenue.requestSort}
                align="right"
              />
              <SortableHead
                label="Matched orders"
                column="matchedOrders"
                sortKey={revenue.sortKey}
                direction={revenue.direction}
                onSort={revenue.requestSort}
                align="right"
              />
              <SortableHead
                label="Gross revenue"
                column="grossRevenue"
                sortKey={revenue.sortKey}
                direction={revenue.direction}
                onSort={revenue.requestSort}
                align="right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {revenue.sorted.map((row) => (
              <TableRow key={`${row.channel}-${row.campaign}`}>
                <TableCell>{row.channel}</TableCell>
                <TableCell>{row.campaign}</TableCell>
                <TableCell className="text-right">{row.purchaseEvents}</TableCell>
                <TableCell className="text-right">{row.matchedOrders}</TableCell>
                <TableCell className="text-right">{EUR.format(row.grossRevenue)}</TableCell>
              </TableRow>
            ))}
            {revenue.sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No attributed purchases yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
