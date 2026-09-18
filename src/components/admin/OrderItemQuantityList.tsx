import { formatEuro } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { MenuItem } from "@/lib/api";
import type { LoadState } from "@/hooks/useOrderItemsDeliveryForm";

/** Per-SKU quantity stepper list, shared by the admin "new order" form and
 * the "edit order" panel - the whole menu is always shown (not just
 * currently-nonzero lines) so either screen can add a brand new item to an
 * order, not just adjust ones already on it. */
export function OrderItemQuantityList({
  menu,
  menuState,
  quantities,
  onQtyChange,
  onRetry,
}: {
  menu: MenuItem[];
  menuState: LoadState;
  quantities: Record<string, number>;
  onQtyChange: (sku: string, qty: number) => void;
  onRetry: () => void;
}) {
  if (menuState === "loading") {
    return <p className="font-sans text-sm text-muted-foreground">Loading menu…</p>;
  }

  if (menuState === "error") {
    return (
      <div className="py-4 text-center">
        <p className="mb-3 font-sans text-sm text-muted-foreground">Couldn't load the menu.</p>
        <Button type="button" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {menu.map((item) => (
        <div key={item.sku} className="flex items-center justify-between gap-4">
          <div>
            <p className="font-sans text-sm font-medium">{item.name}</p>
            <p className="font-sans text-xs text-muted-foreground">{formatEuro(item.priceCents)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => onQtyChange(item.sku, (quantities[item.sku] ?? 0) - 1)}
            >
              −
            </Button>
            <span className="w-6 text-center">{quantities[item.sku] ?? 0}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => onQtyChange(item.sku, (quantities[item.sku] ?? 0) + 1)}
            >
              +
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
