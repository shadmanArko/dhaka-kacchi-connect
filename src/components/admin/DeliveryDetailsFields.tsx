import { formatEuro } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PostalCodeCheckResult } from "@/lib/api";

/** Delivery-date + pickup/delivery + address fields, shared by the admin
 * "new order" form and the "edit order" panel. Deliberately unwrapped (no
 * Card/section chrome of its own) so each caller can lay it out to match its
 * own surface - a full-page form vs. a narrow detail sheet. */
export function DeliveryDetailsFields({
  idPrefix,
  deliveryDate,
  onDeliveryDateChange,
  dateValid,
  fulfillmentType,
  onFulfillmentTypeChange,
  street,
  onStreetChange,
  houseNumber,
  onHouseNumberChange,
  postalCode,
  onPostalCodeChange,
  city,
  onCityChange,
  quoteState,
  quote,
  quoteError,
}: {
  idPrefix: string;
  deliveryDate: string;
  onDeliveryDateChange: (value: string) => void;
  dateValid: boolean;
  fulfillmentType: "pickup" | "delivery";
  onFulfillmentTypeChange: (value: "pickup" | "delivery") => void;
  street: string;
  onStreetChange: (value: string) => void;
  houseNumber: string;
  onHouseNumberChange: (value: string) => void;
  postalCode: string;
  onPostalCodeChange: (value: string) => void;
  city: string;
  onCityChange: (value: string) => void;
  quoteState: "idle" | "checking" | "ready" | "error";
  quote: PostalCodeCheckResult | null;
  quoteError: string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-delivery-date`}>Delivery Saturday</Label>
        <Input
          id={`${idPrefix}-delivery-date`}
          type="date"
          value={deliveryDate}
          onChange={(e) => onDeliveryDateChange(e.target.value)}
        />
        {deliveryDate && !dateValid && (
          <p className="font-sans text-sm text-destructive">
            Must be a Saturday — the Friday-6pm cutoff doesn't apply here, but the date still has to
            be a real Saturday.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={fulfillmentType === "pickup" ? "default" : "outline"}
          onClick={() => onFulfillmentTypeChange("pickup")}
        >
          Pickup
        </Button>
        <Button
          type="button"
          variant={fulfillmentType === "delivery" ? "default" : "outline"}
          onClick={() => onFulfillmentTypeChange("delivery")}
        >
          Delivery
        </Button>
      </div>

      {fulfillmentType === "delivery" && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              placeholder="Street"
              value={street}
              onChange={(e) => onStreetChange(e.target.value)}
            />
            <Input
              placeholder="No."
              className="sm:w-20"
              value={houseNumber}
              onChange={(e) => onHouseNumberChange(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Postal code"
              inputMode="numeric"
              maxLength={5}
              value={postalCode}
              onChange={(e) => onPostalCodeChange(e.target.value)}
            />
            <Input placeholder="City" value={city} onChange={(e) => onCityChange(e.target.value)} />
          </div>
          {quoteState === "checking" && (
            <p className="font-sans text-sm text-muted-foreground">Checking postal code…</p>
          )}
          {quoteState === "ready" && quote?.deliverable && (
            <p className="font-sans text-sm">
              {quote.distanceKm.toFixed(1)}km — delivery fee {formatEuro(quote.feeCents)}
            </p>
          )}
          {quoteState === "error" && (
            <p className="font-sans text-sm text-destructive">{quoteError}</p>
          )}
        </div>
      )}
    </div>
  );
}
