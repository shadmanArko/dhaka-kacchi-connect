import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { adminApi, ApiError, type TrackedLink } from "@/lib/api";
import { useAdminSession } from "@/hooks/useAdminSession";
import { SITE_URL } from "@/lib/seo";
import {
  berlinToday,
  DESTINATIONS,
  MEDIUM_CHOICES,
  nextBatchCampaign,
  previewUrl,
  slugify,
  SOURCE_CHOICES,
  sourceValue,
} from "@/lib/trackedLinks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/_layout/links")({
  head: () => ({ meta: [{ title: "Link builder — Dhaka Kacchi Admin" }] }),
  component: AdminLinksPage,
});

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Link copied");
  } catch {
    // Clipboard can be blocked (insecure context, permissions): say so rather than
    // pretend, and the link stays visible on screen to copy by hand.
    toast.error("Couldn't copy automatically — select the link and copy it.");
  }
}

function formatCreated(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** True when a link does not point at the real site - e.g. a server missing its site URL. */
function pointsElsewhere(url: string): boolean {
  try {
    return new URL(url).host !== new URL(SITE_URL).host;
  } catch {
    return true;
  }
}

function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="font-sans text-sm">
        {label}
      </Label>
      {children}
      {hint && <p className="font-sans text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AdminLinksPage() {
  const session = useAdminSession();
  const [links, setLinks] = useState<TrackedLink[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [sourceKey, setSourceKey] = useState("instagram");
  const [name, setName] = useState("");
  const [medium, setMedium] = useState<string>("organic_social");
  const [label, setLabel] = useState("");
  const [campaign, setCampaign] = useState(() => nextBatchCampaign(berlinToday()));
  const [content, setContent] = useState("");
  const [contentEdited, setContentEdited] = useState(false);
  const [destination, setDestination] = useState("/");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ link: TrackedLink; isNew: boolean } | null>(null);

  const choice = SOURCE_CHOICES.find((c) => c.value === sourceKey) ?? SOURCE_CHOICES[0]!;
  const source = sourceValue(choice, name);
  const effectiveContent = contentEdited ? content : slugify(label);

  const preview = useMemo(
    () =>
      previewUrl(
        SITE_URL,
        { source, medium, campaign: slugify(campaign), content: slugify(effectiveContent) },
        destination,
      ),
    [source, medium, campaign, effectiveContent, destination],
  );

  const loadLinks = useCallback(() => {
    if (!session.token) return;
    adminApi
      .listLinks(session.token)
      .then((res) => {
        setLinks(res.links);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [session.token]);

  useEffect(loadLinks, [loadLinks]);

  function chooseSource(value: string) {
    setSourceKey(value);
    const next = SOURCE_CHOICES.find((c) => c.value === value);
    if (next) setMedium(next.defaultMedium);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!session.token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await adminApi.createLink(session.token, {
        label: label.trim(),
        source,
        medium,
        campaign: slugify(campaign),
        content: slugify(effectiveContent),
        destinationPath: destination,
      });
      setCreated({ link: res.link, isNew: res.created });
      loadLinks();
      if (res.created) {
        // Ready for the next one; keep source/medium/campaign - a batch of posts shares them.
        setLabel("");
        setContent("");
        setContentEdited(false);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the link.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    label.trim().length >= 2 &&
    slugify(effectiveContent).length >= 2 &&
    slugify(campaign).length >= 2 &&
    (!choice.named || slugify(name).length >= 2);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-sans text-xl font-medium">Link builder</h1>
        <p className="font-sans text-sm text-muted-foreground">
          Make a tagged link for every post, story, message and creator, so each visit can be traced
          back to what caused it. Use a new link each time; don&apos;t reuse one.
        </p>
      </div>

      <Card className="p-4 sm:p-6">
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Field label="Where will you put it?" htmlFor="link-source">
            <select
              id="link-source"
              className={SELECT}
              value={sourceKey}
              onChange={(e) => chooseSource(e.target.value)}
            >
              {SOURCE_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          {choice.named ? (
            <Field
              label="Their name"
              htmlFor="link-name"
              hint={`Becomes “${source || `${choice.value}-…`}”. Use the same name every time.`}
            >
              <Input
                id="link-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={choice.value === "qr" ? "menu card" : "ayesha"}
              />
            </Field>
          ) : (
            <Field label="What kind?" htmlFor="link-medium">
              <select
                id="link-medium"
                className={SELECT}
                value={medium}
                onChange={(e) => setMedium(e.target.value)}
              >
                {MEDIUM_CHOICES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {choice.named && (
            <Field label="What kind?" htmlFor="link-medium">
              <select
                id="link-medium"
                className={SELECT}
                value={medium}
                onChange={(e) => setMedium(e.target.value)}
              >
                {MEDIUM_CHOICES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field
            label="What is it? (for you)"
            htmlFor="link-label"
            hint="Plain words, e.g. “Reel – kacchi pot” or “Friday last-call story”."
          >
            <Input
              id="link-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={100}
              placeholder="Reel – kacchi pot"
            />
          </Field>

          <Field
            label="Name in the data"
            htmlFor="link-content"
            hint="Filled in for you from the line above; it must be new for this place."
          >
            <Input
              id="link-content"
              value={effectiveContent}
              onChange={(e) => {
                setContent(e.target.value);
                setContentEdited(true);
              }}
              className="font-mono text-sm"
              placeholder="reel-kacchi-pot"
            />
          </Field>

          <Field
            label="Which batch?"
            htmlFor="link-campaign"
            hint="Pre-filled with the next Saturday's batch."
          >
            <Input
              id="link-campaign"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              className="font-mono text-sm"
            />
          </Field>

          <Field label="Where should it open?" htmlFor="link-destination">
            <select
              id="link-destination"
              className={SELECT}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              {DESTINATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="space-y-2 sm:col-span-2">
            <p className="font-sans text-xs text-muted-foreground">Preview</p>
            <p className="break-all rounded-md border border-dashed p-3 font-mono text-xs text-muted-foreground">
              {preview}
            </p>
          </div>

          {error && (
            <p role="alert" className="font-sans text-sm text-destructive sm:col-span-2">
              {error}
            </p>
          )}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? "Creating…" : "Create link"}
            </Button>
          </div>
        </form>
      </Card>

      {created && (
        <Card className="space-y-3 border-primary/50 p-4 sm:p-6" aria-live="polite">
          <p className="font-sans text-sm font-medium">
            {created.isNew ? "Link created" : "You already had this exact link"} —{" "}
            {created.link.label}
          </p>
          <p className="break-all rounded-md bg-muted p-3 font-mono text-xs">{created.link.url}</p>
          {pointsElsewhere(created.link.url) && (
            <p role="alert" className="font-sans text-sm text-destructive">
              This link does not point to dhakakacchi.com. Don&apos;t share it — the server&apos;s
              site address is set wrongly.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void copyText(created.link.url)}>
              Copy link
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCreated(null)}>
              Done
            </Button>
          </div>
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-sans text-base font-medium">Your links</h2>
          <p className="font-sans text-xs text-muted-foreground">
            After you publish a post, paste its address here so its visits and orders show next to
            it.
          </p>
        </div>
        {loadError && (
          <p className="font-sans text-sm text-destructive">
            Couldn&apos;t load your links.{" "}
            <button className="underline" onClick={loadLinks}>
              Retry
            </button>
          </p>
        )}
        <LinksTable links={links} onChanged={loadLinks} />
      </section>
    </div>
  );
}

function LinksTable({ links, onChanged }: { links: TrackedLink[] | null; onChanged: () => void }) {
  if (links === null) return <p className="font-sans text-sm text-muted-foreground">Loading…</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Link</TableHead>
          <TableHead>Where</TableHead>
          <TableHead>Batch</TableHead>
          <TableHead>Post</TableHead>
          <TableHead className="text-right">Copy</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {links.map((l) => (
          <LinkRow key={l.id} link={l} onChanged={onChanged} />
        ))}
        {links.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              No links yet. Make your first one above.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function LinkRow({ link, onChanged }: { link: TrackedLink; onChanged: () => void }) {
  const session = useAdminSession();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string | null) {
    if (!session.token) return;
    setSaving(true);
    setError(null);
    try {
      await adminApi.setLinkPost(session.token, link.id, next);
      setEditing(false);
      setValue("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="max-w-[16rem]">
        <p className="truncate font-medium" title={link.label}>
          {link.label}
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground" title={link.content}>
          {link.content} · {formatCreated(link.createdAt)}
        </p>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {link.source}
        <span className="block text-xs text-muted-foreground">{link.medium}</span>
      </TableCell>
      <TableCell className="whitespace-nowrap font-mono text-xs">{link.campaign}</TableCell>
      <TableCell className="min-w-[14rem]">
        {editing ? (
          <div className="space-y-1">
            <div className="flex gap-1">
              <Input
                aria-label={`Post address for ${link.label}`}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="https://www.instagram.com/p/…"
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                disabled={saving || value.trim() === ""}
                onClick={() => void save(value)}
              >
                Save
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
            {error && (
              <p role="alert" className="font-sans text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        ) : link.postUrl ? (
          <span className="flex items-center gap-2">
            <a
              href={link.postUrl}
              target="_blank"
              rel="noreferrer"
              className="max-w-[12rem] truncate text-xs underline underline-offset-2"
              title={link.postUrl}
            >
              {link.postUrl.replace(/^https:\/\//, "")}
            </a>
            <button
              className="text-xs text-muted-foreground underline"
              onClick={() => void save(null)}
              disabled={saving}
            >
              Remove
            </button>
          </span>
        ) : (
          <button
            className={cn("text-xs text-muted-foreground underline underline-offset-2")}
            onClick={() => setEditing(true)}
          >
            Add post address
          </button>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant="outline" onClick={() => void copyText(link.url)}>
          Copy
        </Button>
      </TableCell>
    </TableRow>
  );
}
