import { useState } from "react";
import { formatEuro } from "@/lib/format";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { adminApi, ApiError, type PublicCustomer } from "@/lib/api";
import { useAdminSession } from "@/hooks/useAdminSession";
import { useOrderItemsDeliveryForm } from "@/hooks/useOrderItemsDeliveryForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderItemQuantityList } from "@/components/admin/OrderItemQuantityList";
import { DeliveryDetailsFields } from "@/components/admin/DeliveryDetailsFields";

export const Route = createFileRoute("/admin/_layout/orders/new")({
  head: () => ({ meta: [{ title: "New order — Dhaka Kacchi Admin" }] }),
  component: AdminNewOrderPage,
});

function AdminNewOrderPage() {
  const session = useAdminSession();
  const navigate = useNavigate();

  const form = useOrderItemsDeliveryForm();

  // --- Customer resolution -------------------------------------------
  const [searchIdentifier, setSearchIdentifier] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [foundCustomer, setFoundCustomer] = useState<PublicCustomer | null>(null);
  const [useExisting, setUseExisting] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newDateOfBirth, setNewDateOfBirth] = useState("");
  const [customerName, setCustomerName] = useState("");

  const customerResolved = useExisting || creatingNew;

  async function runSearch() {
    if (!searchIdentifier.trim() || !session.token) return;
    setSearching(true);
    setUseExisting(false);
    setCreatingNew(false);
    try {
      const { customer } = await adminApi.searchCustomer(session.token, searchIdentifier.trim());
      setFoundCustomer(customer);
      setSearchedOnce(true);
      if (!customer) {
        // Nothing found - jump straight into "create new," pre-filled with
        // whatever they searched (a phone number, most likely).
        setNewPhone(searchIdentifier.trim());
        setCreatingNew(true);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't search right now.");
    } finally {
      setSearching(false);
    }
  }

  function useFoundCustomer() {
    if (!foundCustomer) return;
    setUseExisting(true);
    setCustomerName(foundCustomer.name);
  }

  function startOver() {
    setSearchedOnce(false);
    setFoundCustomer(null);
    setUseExisting(false);
    setCreatingNew(false);
    setSearchIdentifier("");
    setCustomerName("");
  }

  const canSubmit =
    // Without this a failed menu load leaves a form that looks usable but can
    // only produce an empty EUR 0 order.
    form.menuState === "ready" &&
    customerResolved &&
    form.itemCount > 0 &&
    form.dateValid &&
    form.fulfillmentReady &&
    customerName.trim().length > 0 &&
    (form.fulfillmentType === "pickup" || !!newPhone || useExisting); // phone always required for a new customer

  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !session.token) return;
    setSubmitting(true);
    try {
      const address = form.addressPayload();

      const result = await adminApi.createOrder(session.token, {
        items: form.itemsPayload(),
        deliveryDate: form.deliveryDate,
        fulfillmentType: form.fulfillmentType,
        address,
        customerName: customerName.trim(),
        notes: notes.trim() || undefined,
        existingCustomerId: useExisting ? (foundCustomer?.id ?? undefined) : undefined,
        newCustomer: creatingNew
          ? {
              phone: newPhone.trim(),
              name: customerName.trim(),
              email: newEmail.trim() || undefined,
              dateOfBirth: newDateOfBirth || undefined,
              address,
            }
          : undefined,
      });

      toast.success(`Order created — ${formatEuro(result.order.totalCents)}`);
      navigate({ to: "/admin", search: { order: result.order.id } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't create the order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-sans text-xl font-medium">Record a phone/WhatsApp order</h1>

      <Card>
        <CardHeader>
          <CardTitle className="font-sans text-base">Customer</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!searchedOnce && (
            <div className="flex gap-2">
              <Input
                placeholder="Phone (+491…) or email"
                value={searchIdentifier}
                onChange={(e) => setSearchIdentifier(e.target.value)}
              />
              <Button type="button" onClick={runSearch} disabled={searching}>
                {searching ? "Searching…" : "Search"}
              </Button>
            </div>
          )}

          {searchedOnce && foundCustomer && !useExisting && (
            <div className="space-y-2 rounded-md border border-border p-3 font-sans text-sm">
              <p>
                Found: <strong>{foundCustomer.name}</strong> · {foundCustomer.phone} ·{" "}
                {foundCustomer.email}
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={useFoundCustomer}>
                  Use this customer
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={startOver}>
                  Search again
                </Button>
              </div>
            </div>
          )}

          {useExisting && foundCustomer && (
            <div className="flex items-center justify-between rounded-md border border-border p-3 font-sans text-sm">
              <span>
                Using <strong>{foundCustomer.name}</strong> · {foundCustomer.phone}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={startOver}>
                Change
              </Button>
            </div>
          )}

          {creatingNew && (
            <div className="space-y-3">
              {searchedOnce && (
                <div className="flex items-center justify-between font-sans text-sm text-muted-foreground">
                  <span>No existing customer found — creating a new one.</span>
                  <Button type="button" size="sm" variant="outline" onClick={startOver}>
                    Search again
                  </Button>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="new-phone">Phone</Label>
                  <Input
                    id="new-phone"
                    required
                    placeholder="+491701234567"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-name">Full name</Label>
                  <Input
                    id="new-name"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-email">Email (optional)</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="new-dob">Date of birth (optional)</Label>
                  <Input
                    id="new-dob"
                    type="date"
                    value={newDateOfBirth}
                    onChange={(e) => setNewDateOfBirth(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {customerResolved && (
        <form onSubmit={onSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="font-sans text-base">Items</CardTitle>
            </CardHeader>
            <CardContent>
              <OrderItemQuantityList
                menu={form.menu}
                menuState={form.menuState}
                quantities={form.quantities}
                onQtyChange={form.setQty}
                onRetry={form.retryMenu}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <DeliveryDetailsFields
                idPrefix="new-order"
                deliveryDate={form.deliveryDate}
                onDeliveryDateChange={form.setDeliveryDate}
                dateValid={form.dateValid}
                fulfillmentType={form.fulfillmentType}
                onFulfillmentTypeChange={form.setFulfillmentType}
                street={form.street}
                onStreetChange={form.setStreet}
                houseNumber={form.houseNumber}
                onHouseNumberChange={form.setHouseNumber}
                postalCode={form.postalCode}
                onPostalCodeChange={form.setPostalCode}
                city={form.city}
                onCityChange={form.setCity}
                quoteState={form.quoteState}
                quote={form.quote}
                quoteError={form.quoteError}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <Textarea
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className="flex items-center justify-between border-t border-border pt-4">
                <span className="font-sans text-sm text-muted-foreground">
                  {form.itemCount} {form.itemCount === 1 ? "item" : "items"}
                </span>
                <strong className="font-sans text-lg">{formatEuro(form.totalCents)}</strong>
              </div>
              <Button type="submit" className="w-full" disabled={!canSubmit || submitting}>
                {submitting ? "Creating…" : "Create order"}
              </Button>
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
}
