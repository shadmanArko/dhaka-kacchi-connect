import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { PageHero } from "@/components/sections/PageHero";
import { Reveal } from "@/components/ui/Reveal";
import { api, ApiError } from "@/lib/api";

const searchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Reset password — Dhaka Kacchi Berlin" }],
  }),
  component: ResetPasswordPage,
});

const inputClass =
  "w-full px-4 py-4 bg-gold/[0.06] border border-line text-cream placeholder:text-muted-warm font-sans text-[0.88rem] outline-none focus:border-gold/50 transition-colors";

type SubmitState = "idle" | "submitting" | "success" | "error";

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const [newPassword, setNewPassword] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitState("submitting");
    setError("");
    try {
      await api.confirmPasswordReset(token, newPassword);
      setSubmitState("success");
    } catch (err) {
      setSubmitState("error");
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't reset your password right now. Please try again.",
      );
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Account"
        title={<>Reset your password</>}
        body="Set a new password to get back into your account."
      />
      <section className="bg-deep border-t border-line py-20 md:py-28 px-6 md:px-14">
        <Reveal className="max-w-[480px] mx-auto">
          {!token && (
            <p className="text-center font-sans text-muted-warm">
              This link is missing its reset token. Please use the link from your email.
            </p>
          )}

          {token && submitState === "success" && (
            <div className="text-center space-y-6">
              <p className="font-sans text-[0.96rem] text-muted-warm">
                Your password has been updated. You can now log in with your new password.
              </p>
              <Link
                to="/order"
                className="inline-flex items-center gap-4 font-sans text-[0.8rem] tracking-[0.25em] uppercase font-normal transition-all duration-300 no-underline border border-gold/40 text-cream px-9 py-[18px] hover:border-gold hover:text-gold hover:-translate-y-0.5"
              >
                <span>Go to order page</span>
              </Link>
            </div>
          )}

          {token && submitState !== "success" && (
            <form onSubmit={onSubmit} className="space-y-5">
              <input
                type="password"
                required
                minLength={8}
                placeholder="New password (min. 8 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
              />
              {submitState === "error" && <p className="font-sans text-sm text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={submitState === "submitting"}
                className="w-full bg-gold text-black-ink px-9 py-5 font-sans text-[0.8rem] uppercase tracking-[0.25em] hover:bg-gold-2 transition-colors disabled:opacity-50"
              >
                {submitState === "submitting" ? "Updating…" : "Set new password"}
              </button>
            </form>
          )}
        </Reveal>
      </section>
    </>
  );
}
