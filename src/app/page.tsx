import { BookOpen, CalendarDays, FileDown, Lock, PenLine, Users } from "lucide-react";

import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";

const FEATURES = [
  {
    icon: PenLine,
    title: "Write on any date",
    body: "Today's entry, or a letter from three years ago. The date it belongs to and the date you typed it are kept apart, so old writing can be brought in without pretending it is new.",
  },
  {
    icon: BookOpen,
    title: "It compiles itself",
    body: "Entries gather under their day, in the order they were written. Two people writing on the same morning appear in the order they arrived — like a book, not a chat.",
  },
  {
    icon: Users,
    title: "Shared by invitation",
    body: "A shared book is opened to the people you invite and nobody else. There is no public link, and no way to stumble into someone's writing.",
  },
  {
    icon: CalendarDays,
    title: "Look back easily",
    body: "A calendar of everything written, full-text search across years, and a quiet reminder of what you wrote on this day in other years.",
  },
  {
    icon: FileDown,
    title: "Made to be printed",
    body: "Export a properly typeset PDF or a real .docx, with a title page, dates as chapters and page numbers. Choose your original words or the corrected ones.",
  },
  {
    icon: Lock,
    title: "Private by construction",
    body: "Access is enforced inside the database itself, not just in the interface. Guessing a web address gets you nothing at all.",
  },
];

export default async function LandingPage() {
  const user = await getSessionUser();

  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-serif text-lg tracking-tight text-ink">
          Journal <span className="text-ink-muted">&amp;</span> Letter
        </span>
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <ButtonLink href="/library" size="sm">
              Your library
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink href="/signup" size="sm">
                Start writing
              </ButtonLink>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-3xl px-6 pt-16 pb-20 text-center sm:pt-24">
          <p className="text-sm tracking-[0.2em] text-ink-muted uppercase">
            Letters · Journals · Books
          </p>
          <h1 className="mt-6 font-serif text-4xl leading-[1.15] text-balance text-ink sm:text-5xl">
            The letters you write every day, quietly becoming a book.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-pretty text-ink-soft">
            Write to yourself, or to someone far away. Every entry is filed under the day it
            belongs to, with its author and its date, until years of writing can be read — and
            printed — as one continuous book.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href={user ? "/library" : "/signup"} size="lg">
              {user ? "Open your library" : "Start your first book"}
            </ButtonLink>
            {!user ? (
              <ButtonLink href="/login" variant="secondary" size="lg">
                I already have an account
              </ButtonLink>
            ) : null}
          </div>
        </section>

        {/*
          A diagram of how a compiled day is laid out — a date, then each writer
          in the order they wrote.

          Deliberately abstract: this page is public, so it shows the *shape* of
          a book rather than anything resembling somebody's letters. The lines
          are decorative rules, not redacted text, and the names are labels.
        */}
        <section className="mx-auto max-w-3xl px-6 pb-24">
          <figure className="rounded-card border border-rule bg-surface p-8 shadow-sm sm:p-12">
            <figcaption className="sr-only">
              How a single day appears in a compiled book: a date heading, then each
              contributor&rsquo;s entry in the order it was written.
            </figcaption>

            <p className="text-center font-serif text-sm tracking-[0.25em] text-ink-muted uppercase">
              A day in the book
            </p>

            <div className="mx-auto mt-8 max-w-md space-y-8" aria-hidden="true">
              {[
                { label: "First writer", widths: [96, 88, 72] },
                { label: "Second writer", widths: [92, 80, 60] },
              ].map((writer) => (
                <div key={writer.label}>
                  <div className="flex items-baseline gap-2.5">
                    <span className="inline-block h-px w-6 bg-brand/60" />
                    <span className="font-serif text-xs tracking-wide text-ink-muted">
                      {writer.label}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2.5">
                    {writer.widths.map((width, index) => (
                      <span
                        key={index}
                        className="block h-[3px] rounded-full bg-ink/10"
                        style={{ width: `${width}%` }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-10 text-center text-sm text-ink-muted">
              Everything you write stays private to you and the people you invite.
            </p>
          </figure>
        </section>

        <section className="border-t border-rule bg-surface-sunk/40">
          <div className="mx-auto max-w-5xl px-6 py-20">
            <h2 className="font-serif text-2xl text-ink">What it does</h2>
            <ul className="mt-10 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <li key={title}>
                  <Icon className="h-5 w-5 text-brand" aria-hidden="true" />
                  <h3 className="mt-3 font-serif text-lg text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-2xl px-6 py-24 text-center">
          <h2 className="font-serif text-3xl text-balance text-ink">
            One person can keep a journal. Two people can keep a correspondence.
          </h2>
          <p className="mt-5 text-ink-soft">
            The same book, either way. Start one and see how it reads in a year.
          </p>
          <ButtonLink href={user ? "/library" : "/signup"} size="lg" className="mt-8">
            {user ? "Open your library" : "Create your account"}
          </ButtonLink>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-sm text-ink-muted">
          <span>Journal &amp; Letter</span>
          <span>Your writing stays yours. Export it whenever you like.</span>
        </div>
      </footer>
    </div>
  );
}
