import { MapPin, Check, Clock, Utensils } from "lucide-react";
import { useTranslation } from "react-i18next";

export function BerlinBanner() {
  const { t } = useTranslation();
  const items = [
    { Icon: MapPin, label: t("banner.berlin") },
    { Icon: Check, label: t("banner.halal") },
    { Icon: Clock, label: t("banner.cooked") },
    { Icon: Utensils, label: t("banner.madeToOrder") },
  ];
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
