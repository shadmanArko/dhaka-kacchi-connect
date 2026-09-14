import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { giveConsent, hasRespondedToConsent, withdrawConsent } from "@/lib/analytics";

/**
 * GDPR cookie-consent banner. Shown once, the first time a visitor with no
 * recorded choice loads the site - see analytics.ts for exactly what
 * "Accept" vs. "Reject" each actually do (both still give real, if
 * different, analytics value; neither is a dark pattern - same-weight
 * buttons, no pre-ticked box, Reject exactly as easy to find as Accept).
 */
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!hasRespondedToConsent());
  }, []);

  if (!visible) return null;

  function accept() {
    giveConsent();
    setVisible(false);
  }

  function reject() {
    withdrawConsent();
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-line bg-black-ink/97 backdrop-blur-sm px-6 py-6 md:px-10"
    >
      <div className="mx-auto flex max-w-[900px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-sans text-[0.82rem] leading-[1.7] text-muted-warm">
          We use privacy-friendly, EU-hosted analytics to see how the site is used and improve it.{" "}
          <Link to="/privacy" className="text-gold underline underline-offset-4 hover:text-gold-2">
            Learn more
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={reject}
            className="flex-1 border border-line px-6 py-3 font-sans text-[0.72rem] uppercase tracking-[0.2em] text-cream transition-colors hover:border-gold/50 sm:flex-none"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={accept}
            className="flex-1 bg-gold px-6 py-3 font-sans text-[0.72rem] uppercase tracking-[0.2em] text-black-ink transition-colors hover:bg-gold-2 sm:flex-none"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
