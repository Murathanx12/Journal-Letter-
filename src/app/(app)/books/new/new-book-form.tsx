"use client";

import { BookHeart, Check, Copy, NotebookPen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BookCover } from "@/components/book/book-cover";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { Card } from "@/components/ui/surface";
import { createBook } from "@/lib/books/actions";
import { COMMON_TIMEZONES, guessTimezone } from "@/lib/date/calendar-date";
import {
  COVER_PRESETS,
  COVER_PRESET_IDS,
  PRESETS,
  PRESET_IDS,
  type CoverPresetId,
  type PresetId,
} from "@/lib/design/theme";
import { cn } from "@/lib/utils/cn";
import { useHydrated } from "@/lib/utils/use-hydrated";

type BookType = "personal_journal" | "shared_letter_book";

const TYPES: { id: BookType; icon: typeof NotebookPen; title: string; body: string }[] = [
  {
    id: "personal_journal",
    icon: NotebookPen,
    title: "Personal journal",
    body: "Only you. Nobody else can open it unless you invite them later.",
  },
  {
    id: "shared_letter_book",
    icon: BookHeart,
    title: "Shared letter book",
    body: "You and the people you invite, writing to each other day by day.",
  },
];

export function NewBookForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState(0);
  const [type, setType] = useState<BookType>("shared_letter_book");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [coverPreset, setCoverPreset] = useState<CoverPresetId>("paper");
  const [designPreset, setDesignPreset] = useState<PresetId>("classic-novel");
  const [inviteEmail, setInviteEmail] = useState("");

  // The reader's timezone only exists in the browser, so it is read after
  // hydration and used as the default until they choose something else. Doing
  // this as a derived value rather than an effect avoids a second render pass
  // and a flash of "UTC" in the picker.
  const hydrated = useHydrated();
  const [timezoneChoice, setTimezoneChoice] = useState<string | null>(null);
  const timezone = timezoneChoice ?? (hydrated ? guessTimezone() : "UTC");
  const setTimezone = setTimezoneChoice;

  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [createdBookId, setCreatedBookId] = useState<string | null>(null);

  const lastStep = type === "shared_letter_book" ? 2 : 1;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createBook({
        type,
        title,
        subtitle: subtitle.trim() ? subtitle.trim() : null,
        description: null,
        timezone,
        coverPreset,
        designPreset,
        inviteEmail: inviteEmail.trim(),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      // An invite link is shown exactly once, so we stop here rather than
      // navigating away and losing it.
      if (result.data.inviteUrl) {
        setInviteUrl(result.data.inviteUrl);
        setCreatedBookId(result.data.bookId);
        return;
      }

      router.push(`/books/${result.data.bookId}`);
    });
  }

  if (inviteUrl && createdBookId) {
    return <InviteHandoff url={inviteUrl} bookId={createdBookId} email={inviteEmail.trim()} />;
  }

  return (
    <div className="space-y-6">
      <ol className="flex items-center gap-2 text-xs text-ink-muted" aria-label="Progress">
        {["Type", "Details", ...(type === "shared_letter_book" ? ["Invite"] : [])].map(
          (label, index) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-[11px]",
                  index <= step
                    ? "border-ink bg-ink text-paper"
                    : "border-rule-strong text-ink-muted",
                )}
                aria-current={index === step ? "step" : undefined}
              >
                {index + 1}
              </span>
              {label}
              {index < lastStep ? <span className="mx-1 h-px w-6 bg-rule" /> : null}
            </li>
          ),
        )}
      </ol>

      {step === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {TYPES.map(({ id, icon: Icon, title: label, body }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setType(id);
                setStep(1);
              }}
              aria-pressed={type === id}
              className={cn(
                "rounded-card border p-5 text-left transition-colors",
                type === id
                  ? "border-ink bg-surface"
                  : "border-rule bg-surface hover:border-rule-strong",
              )}
            >
              <Icon className="h-5 w-5 text-brand" aria-hidden="true" />
              <h2 className="mt-3 font-serif text-lg text-ink">{label}</h2>
              <p className="mt-1.5 text-sm text-ink-muted">{body}</p>
            </button>
          ))}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="grid gap-6 sm:grid-cols-[1fr_10rem]">
          <div className="space-y-5">
            <Field label="Title" htmlFor="title" hint="What is written on the cover.">
              <Input
                id="title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                placeholder={type === "shared_letter_book" ? "Our Letters" : "My 2026 Journal"}
                autoFocus
              />
            </Field>

            <Field label="Subtitle" htmlFor="subtitle" hint="Optional.">
              <Input
                id="subtitle"
                value={subtitle}
                onChange={(event) => setSubtitle(event.target.value)}
                maxLength={160}
                placeholder="Hong Kong and London, 2026—"
              />
            </Field>

            <Field label="Cover" htmlFor="cover">
              <div id="cover" className="flex flex-wrap gap-2">
                {COVER_PRESET_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setCoverPreset(id)}
                    aria-pressed={coverPreset === id}
                    title={COVER_PRESETS[id].label}
                    className={cn(
                      "h-9 w-9 rounded-full border-2 transition-transform",
                      coverPreset === id ? "border-ink scale-110" : "border-rule",
                    )}
                    style={{ background: COVER_PRESETS[id].background }}
                  >
                    <span className="sr-only">{COVER_PRESETS[id].label}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Typography"
              htmlFor="design"
              hint={PRESETS[designPreset].description}
            >
              <Select
                id="design"
                value={designPreset}
                onChange={(event) => setDesignPreset(event.target.value as PresetId)}
              >
                {PRESET_IDS.map((id) => (
                  <option key={id} value={id}>
                    {PRESETS[id].label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Timezone"
              htmlFor="timezone"
              hint="Decides what counts as “today” for everyone writing in this book."
            >
              <Select
                id="timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              >
                {/* Keep the detected zone selectable even if it is not on the list. */}
                {!COMMON_TIMEZONES.includes(timezone as (typeof COMMON_TIMEZONES)[number]) ? (
                  <option value={timezone}>{timezone}</option>
                ) : null}
                {COMMON_TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="order-first sm:order-last">
            <BookCover
              title={title || "Untitled"}
              subtitle={subtitle}
              cover={{ preset: coverPreset, imagePath: null }}
              designPreset={designPreset}
              size="sm"
              className="shadow-sm"
            />
            <p className="mt-2 text-center text-xs text-ink-muted">Preview</p>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <Card className="space-y-5">
          <div>
            <h2 className="font-serif text-lg text-ink">Invite someone</h2>
            <p className="mt-1 text-sm text-ink-muted">
              They will get a private link to accept. Only the account with this email address
              can use it. You can skip this and invite people later.
            </p>
          </div>

          <Field label="Their email" htmlFor="inviteEmail" hint="Optional.">
            <Input
              id="inviteEmail"
              type="email"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="them@example.com"
            />
          </Field>
        </Card>
      ) : null}

      {error ? <FormError>{error}</FormError> : null}

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          disabled={step === 0 || pending}
        >
          Back
        </Button>

        {step < lastStep ? (
          <Button
            type="button"
            onClick={() => setStep((value) => value + 1)}
            disabled={step === 1 && title.trim().length === 0}
          >
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            onClick={submit}
            disabled={pending || title.trim().length === 0}
          >
            {pending ? "Creating…" : "Create book"}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The invite link is generated from a token that is never stored in readable
 * form, so this screen is the only chance to copy it. Losing it is not fatal —
 * the owner can revoke and reissue — but it is worth making obvious.
 */
function InviteHandoff({ url, bookId, email }: { url: string; bookId: string; email: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied; the input below is selectable as a fallback.
    }
  }

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="font-serif text-lg text-ink">Your book is ready</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Send this link to {email || "them"}. It works once, expires in 14 days, and only their
          account can accept it. This is the only time it will be shown.
        </p>
      </div>

      <div className="flex gap-2">
        <Input readOnly value={url} onFocus={(event) => event.target.select()} className="font-mono text-xs" />
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <Button type="button" onClick={() => router.push(`/books/${bookId}`)}>
        Open the book
      </Button>
    </Card>
  );
}
