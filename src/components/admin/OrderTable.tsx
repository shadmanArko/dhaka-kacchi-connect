import type { AdminOrder, OrderStatus } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatEuro(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

const STATUS_VARIANT: Record<OrderStatus, "secondary" | "default" | "outline" | "destructive"> = {
  received: "secondary",
  confirmed: "default",
  delivered: "outline",
  cancelled: "destructive",
};

/** The dashboard's order list. Deliberately no separate mobile "card" view -
 * a handful of less-essential columns just hide below `sm:` (Tailwind's CSS
 * media query, not a JS viewport check) so the same component renders
 * correctly in the Node prerender pass with no hydration mismatch risk,
 * while the table itself stays horizontally scrollable as a fallback. */
export function OrderTable({
  orders,
  onSelect,
}: {
  orders: AdminOrder[];
  onSelect: (order: AdminOrder) => void;
}) {
  if (orders.length === 0) {
    return (
      <p className="py-12 text-center font-sans text-sm text-muted-foreground">
        No orders match these filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead className="hidden sm:table-cell">Phone</TableHead>
            <TableHead className="hidden md:table-cell">Saturday</TableHead>
            <TableHead className="hidden md:table-cell">Fulfillment</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} onClick={() => onSelect(order)} className="cursor-pointer">
              <TableCell className="font-medium">
                {order.customerName}
                {order.createdBy === "staff" && (
                  <Badge variant="outline" className="ml-2 align-middle text-[0.65rem]">
                    staff
                  </Badge>
                )}
              </TableCell>
              <TableCell className="hidden sm:table-cell">{order.customerPhone}</TableCell>
              <TableCell className="hidden md:table-cell">
                {formatDate(order.deliveryDate)}
              </TableCell>
              <TableCell className="hidden md:table-cell capitalize">
                {order.fulfillmentType}
              </TableCell>
              <TableCell>{formatEuro(order.totalCents)}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[order.status]} className="capitalize">
                  {order.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
