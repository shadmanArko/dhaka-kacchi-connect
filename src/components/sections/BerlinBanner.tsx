import { MapPin, Check, Clock, Utensils } from "lucide-react";

const items = [
  { Icon: MapPin, label: "Berlin, Germany" },
  { Icon: Check, label: "100% Halal & Fresh" },
  { Icon: Clock, label: "Cooked Every Saturday" },
  { Icon: Utensils, label: "Made to Order" },
];

export function BerlinBanner() {
  return (
    <div className="border-y border-line bg-deep py-7 px-6 md:px-14">
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
        {items.map(({ Icon, label }, i) => (
          <div key={label} className="flex items-center gap-2.5">
            <Icon className="text-gold" size={14} strokeWidth={1.5} />
            <span className="font-sans text-[0.68rem] uppercase tracking-[0.25em] text-muted-warm">
              {label}
            </span>
            {i < items.length - 1 && <span className="hidden md:inline text-line ml-6">·</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
