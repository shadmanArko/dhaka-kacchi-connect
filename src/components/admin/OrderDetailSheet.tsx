import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminApi, ApiError, type AdminOrder, type OrderStatus } from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function formatEuro(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

const DISCOUNT_PRESETS_CENTS = [200, 500, 1000];
const STATUS_OPTIONS: OrderStatus[] = ["received", "confirmed", "delivered", "cancelled"];

export function OrderDetailSheet({
  order,
  token,
  onClose,
  onUpdated,
}: {
  order: AdminOrder | null;
  token: string;
  onClose: () => void;
  onUpdated: (order: AdminOrder) => void;
}) {
  const [discountEuros, setDiscountEuros] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [savingDiscount, setSavingDiscount] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  // Resets the discount form to the order's current (server-confirmed)
  // discount every time a different order opens - never carries a stale
  // draft from the previously-open order into this one.
  useEffect(() => {
    if (order) {
      setDiscountEuros(order.discountCents > 0 ? (order.discountCents / 100).toFixed(2) : "");
      setDiscountReason(order.discountReason ?? "");
    }
  }, [order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!order) return null;

  const maxDiscountCents = order.subtotalCents + order.deliveryFeeCents;
  const parsedDiscountCents = Math.round((Number(discountEuros) || 0) * 100);
  const previewTotalCents = Math.max(
    0,
    order.subtotalCents + order.deliveryFeeCents - parsedDiscountCents,
  );
  const discountInvalid = parsedDiscountCents < 0 || parsedDiscountCents > maxDiscountCents;
  const isCancelled = order.status === "cancelled";

  async function saveDiscount() {
    if (discountInvalid) return;
    setSavingDiscount(true);
    try {
      const result = await adminApi.applyDiscount(token, order!.id, {
        discountCents: parsedDiscountCents,
        discountReason: discountReason.trim() || undefined,
      });
      onUpdated(result.order);
      toast.success(
        parsedDiscountCents > 0
          ? `Discount saved — new total ${formatEuro(result.order.totalCents)}`
          : "Discount cleared",
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the discount.");
    } finally {
      setSavingDiscount(false);
    }
  }

  async function changeStatus(status: OrderStatus) {
    setSavingStatus(true);
    try {
      const result = await adminApi.updateStatus(token, order!.id, status);
      onUpdated(result.order);
      toast.success(`Status set to ${status}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't update the status.");
    } finally {
      setSavingStatus(false);
    }
  }

  function onStatusSelect(next: string) {
    const status = next as OrderStatus;
    // Cancelling excludes the order from the Telegram "upcoming orders"
    // reply and can't be trivially undone the same way a routine
    // received→confirmed→delivered bump can - the only status change that
    // gets a confirmation step, per the "don't nag routine progress, do
    // confirm anything close to destructive" rule.
    if (status === "cancelled") {
      setConfirmCancelOpen(true);
      return;
    }
    changeStatus(status);
  }

  return (
    <>
      <Sheet open onOpenChange={(next) => !next && onClose()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{order.customerName}</SheetTitle>
            <SheetDescription>
              Order {order.id} · placed{" "}
              {new Date(order.createdAt).toLocaleString("en-GB", { timeZone: "Europe/Berlin" })}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            <section className="space-y-1 font-sans text-sm">
              <p>
                <span className="text-muted-foreground">Phone:</span> {order.customerPhone}
              </p>
              <p>
                <span className="text-muted-foreground">Email:</span> {order.customerEmail}
              </p>
              <p>
                <span className="text-muted-foreground">Saturday:</span>{" "}
                {formatDate(order.deliveryDate)}
              </p>
              <p className="capitalize">
                <span className="text-muted-foreground">Fulfillment:</span> {order.fulfillmentType}
                {order.fulfillmentType === "delivery" && order.address && (
                  <>
                    {" "}
                    — {order.address.street} {order.address.houseNumber}, {order.address.postalCode}{" "}
                    {order.address.city}
                    {order.distanceKm != null && ` (${order.distanceKm.toFixed(1)}km)`}
                  </>
                )}
              </p>
              {order.notes && (
                <p>
                  <span className="text-muted-foreground">Notes:</span> {order.notes}
                </p>
              )}
            </section>

            <section className="space-y-1 border-t border-border pt-4 font-sans text-sm">
              {order.items.map((item) => (
                <p key={item.sku}>
                  {item.quantity}x {item.name} ({formatEuro(item.unitPriceCents)} each)
                </p>
              ))}
              <p className="pt-2 text-muted-foreground">
                Subtotal: {formatEuro(order.subtotalCents)}
                {order.deliveryFeeCents > 0 && ` · Delivery: ${formatEuro(order.deliveryFeeCents)}`}
              </p>
            </section>

            <section className="space-y-3 border-t border-border pt-4">
              <Label htmlFor="discount-amount">
                Discount{" "}
                {order.discountCents > 0 && `(currently ${formatEuro(order.discountCents)})`}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="discount-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={discountEuros}
                  onChange={(e) => setDiscountEuros(e.target.value)}
                  disabled={isCancelled}
                  className="w-28"
                />
                <div className="flex gap-1">
                  {DISCOUNT_PRESETS_CENTS.map((cents) => (
                    <Button
                      key={cents}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isCancelled}
                      onClick={() => setDiscountEuros((cents / 100).toFixed(2))}
                    >
                      €{cents / 100}
                    </Button>
                  ))}
                </div>
              </div>
              <Input
                placeholder="Reason (optional, shown to the customer)"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                disabled={isCancelled}
              />
              <p className="font-sans text-sm">
                New total:{" "}
                <span className={discountInvalid ? "text-destructive" : "font-medium"}>
                  {discountInvalid
                    ? `Can't exceed ${formatEuro(maxDiscountCents)}`
                    : formatEuro(previewTotalCents)}
                </span>
              </p>
              <Button
                onClick={saveDiscount}
                disabled={isCancelled || discountInvalid || savingDiscount}
                className="w-full"
              >
                {savingDiscount ? "Saving…" : "Save discount"}
              </Button>
            </section>

            <section className="space-y-2 border-t border-border pt-4">
              <Label htmlFor="order-status">Status</Label>
              <Select value={order.status} onValueChange={onStatusSelect} disabled={savingStatus}>
                <SelectTrigger id="order-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status} className="capitalize">
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from the Telegram "upcoming orders" reply. This can't be undone from
              here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Never mind</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmCancelOpen(false);
                changeStatus("cancelled");
              }}
            >
              Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
