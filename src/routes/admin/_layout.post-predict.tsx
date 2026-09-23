import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { adminApi, ApiError, type PredictPostResult } from "@/lib/api";
import { useAdminSession } from "@/hooks/useAdminSession";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/_layout/post-predict")({
  head: () => ({ meta: [{ title: "Post predictor — Dhaka Kacchi Admin" }] }),
  component: AdminPostPredictPage,
});

const PLATFORMS = ["facebook", "instagram"] as const;
const CONTENT_TYPES_BY_PLATFORM: Record<(typeof PLATFORMS)[number], string[]> = {
  // Facebook and Instagram genuinely use different vocabulary for the same
  // medium (video vs. reel) - see ml/01-data/report.md's decision on this.
  // Not a UI bug: the model was trained on each platform's own real values.
  facebook: ["video", "image", "carousel"],
  instagram: ["reel", "image", "carousel"],
};

const PERCENT = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 });

function toLocalDatetimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function humanizeFeature(name: string): string {
  // e.g. "nominal__day_of_week_Saturday" -> "day of week: Saturday"
  const withoutPrefix = name.replace(/^(nominal|numeric)__/, "");
  return withoutPrefix.replace(/_/g, " ");
}

function AdminPostPredictPage() {
  const session = useAdminSession();
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("facebook");
  const [contentType, setContentType] = useState<string>("video");
  const [caption, setCaption] = useState("");
  const [plannedAt, setPlannedAt] = useState(() => {
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
    return toLocalDatetimeInputValue(inOneHour);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictPostResult | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session.token) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const plannedPostedAt = new Date(plannedAt).toISOString();
      const res = await adminApi.predictPost(session.token, {
        platform,
        contentType,
        caption,
        plannedPostedAt,
      });
      setResult(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setNotConfigured(true);
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn't reach the predictor.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (notConfigured) {
    return (
      <div className="space-y-2">
        <h1 className="font-sans text-xl font-medium">Post predictor</h1>
        <p className="font-sans text-sm text-muted-foreground">
          This deployment isn&apos;t connected to the predictor service yet (PREDICTOR_URL
          isn&apos;t set).
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="space-y-1">
        <h1 className="font-sans text-xl font-medium">Post predictor</h1>
        <p className="font-sans text-sm text-muted-foreground">
          Check a draft post before you publish it. This is a rough, advisory signal from a small
          model trained on {"<"}400 of our own past posts — not a guarantee. See
          ml/03-modeling/report.md in the warehouse repo for exactly how confident to be in it.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="platform">Platform</Label>
            <Select
              value={platform}
              onValueChange={(v) => {
                const next = v as (typeof PLATFORMS)[number];
                setPlatform(next);
                setContentType(CONTENT_TYPES_BY_PLATFORM[next][0]!);
              }}
            >
              <SelectTrigger id="platform">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p === "facebook" ? "Facebook" : "Instagram"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content-type">Content type</Label>
            <Select value={contentType} onValueChange={setContentType}>
              <SelectTrigger id="content-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_TYPES_BY_PLATFORM[platform].map((ct) => (
                  <SelectItem key={ct} value={ct}>
                    {ct}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="planned-at">Planned posting time</Label>
          <Input
            id="planned-at"
            type="datetime-local"
            value={plannedAt}
            onChange={(e) => setPlannedAt(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="caption">Caption</Label>
          <Textarea
            id="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={5}
            maxLength={5000}
            placeholder="Delicious mutton kacchi biryani, pre-order now! #kacchi #biryani #berlin"
          />
        </div>

        <Button type="submit" disabled={busy}>
          {busy ? "Checking…" : "Check this post"}
        </Button>
      </form>

      {error && <p className="font-sans text-sm text-destructive">{error}</p>}

      {result && (
        <Card
          className={
            result.label === "likely_at_or_above_typical"
              ? "border-green-500/40 bg-green-500/5"
              : "border-yellow-500/40 bg-yellow-500/5"
          }
        >
          <CardHeader className="pb-2">
            <CardTitle className="font-sans text-base font-medium">
              {result.label === "likely_at_or_above_typical"
                ? "Likely at or above typical engagement"
                : "Likely below typical engagement"}
            </CardTitle>
            <p className="font-sans text-xs text-muted-foreground">
              {PERCENT.format(result.probability)} confidence · model {result.modelVersion}
            </p>
          </CardHeader>
          {result.topReasons.length > 0 && (
            <CardContent className="space-y-1 pt-0">
              <p className="font-sans text-xs font-medium text-muted-foreground">Why</p>
              <ul className="space-y-0.5 font-sans text-sm">
                {result.topReasons.map((r) => (
                  <li key={r.feature} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{humanizeFeature(r.feature)}</span>
                    <span className={r.contribution >= 0 ? "text-green-600" : "text-destructive"}>
                      {r.contribution >= 0 ? "+" : ""}
                      {r.contribution.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
