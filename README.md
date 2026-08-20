# Journal &amp; Letter

A private place to write letters and journals that quietly compile themselves
into a book.

Write to yourself, or to someone far away. Every entry is filed under the day it
belongs to, with its author and its date, until years of writing can be read —
and printed — as one continuous book.

The application works equally as:

1. A private personal journal.
2. A shared letter book between two people.
3. A shared journal between several invited people.
4. Several independent books belonging to the same account.
5. A source for a properly typeset, printable PDF or Word document.

The central metaphor is a **book**, not a messaging app. There are no chat
bubbles anywhere in it.

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Security model](#security-model)
- [Local setup](#local-setup)
- [Supabase setup](#supabase-setup)
- [Google sign-in setup](#google-sign-in-setup)
- [Google Docs export setup](#google-docs-export-setup)
- [Spell checking](#spell-checking)
- [Environment variables](#environment-variables)
- [Running the tests](#running-the-tests)
- [Deploying to Vercel](#deploying-to-vercel)
- [Export architecture](#export-architecture)
- [Design decisions worth knowing](#design-decisions-worth-knowing)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## What it does

**Books.** After signing in you see your Library: a shelf of book covers. A book
is either a *personal journal* (only you) or a *shared letter book* (you and the
people you invite). You can have as many as you like.

**Entries on any date.** Every piece of writing has an `entry_date` — the day it
belongs to — kept strictly separate from `created_at`, the moment it was typed.
That is what makes it possible to paste in a letter from June while it is
August, and have it appear in June where it belongs.

**Daily compilation.** The book is ordered by date. Within a day, whoever
submitted first appears first. If Murathan writes on the morning of 14 August
and Rossi writes that afternoon, the book shows Murathan then Rossi, under one
date heading, like a page of a printed book.

**Author identity.** Each writer picks a typeface, an optional handwritten
signature and a restrained accent colour. Their name and the date are shown
automatically, whether or not they typed them.

**A book with pages.** Reading and writing both happen on two facing pages with
a fold down the middle. The pagination is real: the writing fills the left page,
then the right, then the next spread — so while a letter is being written you
can see where its pages will actually fall. Every entry opens on a fresh page, so
one person's letter never runs into the next person's half way down. A phone
shows one page at a time; a printout uses the paper's own pages. There is a
plain single-column view for anyone who would rather scroll.

**Calendar and search.** A calendar showing which days have writing, where
picking any day — written on or not — shows it beside the calendar with a way to
read it, add to it, or start it. Full-text search across everything you are
allowed to read, which also reports how many times a word appears in the whole
book, not just in the results on screen.

**Pictures in the writing.** Paste a photograph, drop one on the page, or press
**Ctrl/⌘ + P**, and it lands in the sentence you are writing — exactly where the
caret is, the way it does in any word processor. Select it and you get the rest:
drag a corner to resize, **crop** it by dragging the corners of the kept area,
ask the writing to run down its left or right, describe it for a screen reader,
or send it **behind the writing**, where it becomes a photograph pinned to the
page and can be dragged anywhere. Cropping never touches the uploaded file, so it
can always be widened again. Every picture is shrunk and re-encoded in the browser
before it is uploaded, with its EXIF rotation baked in, so a four-megabyte
photograph straight off a phone does not cost four megabytes of data, of storage,
or of somebody else's download — and does not arrive sideways.

**Photographs stuck to a page.** The other half of pictures, and a different job:
a photograph pinned to a *place* on a *page*, in the Photos tab. Drag it
anywhere, drag it across the fold to move it to the next page, resize and rotate
it, cut it into a shape (circle, arch, heart, hexagon, star, torn-edge cut-out),
and choose whether it sits **behind** the writing, **in front** of it, or **in**
it with the text flowing around the cut-out silhouette. Everything works by
touch, so a page can be arranged on a phone. Positions are stored as fractions of
a page, so a layout made on a phone looks the same on a laptop.

**Drawing on the pages.** A pen, a rubber, any colour, and a nib from a hairline
to a broad marker. Everything drawn without putting the pen down becomes *one
drawing* — an object with a box round it, which the arrow tool picks up, moves,
resizes, turns, fades, sends behind or in front of the writing, or throws away,
exactly like a photograph. Strokes go either **under** the writing — a wash of
colour, a circle round a paragraph — or **over** it, for crossing something out
or adding a note in the margin. It is built on pointer events with
`touch-action: none`, so a finger, a stylus, a trackpad and a mouse all take the
same path and drawing on a phone works properly. Every point is a fraction of its
drawing, and every drawing a fraction of its page, so what you draw around a
sentence stays around that sentence at any screen size — and resizing a drawing
scales its line weight with it.

**Printing the book with its pages.** "Print with the pages", in the reading
view, prints one sheet per page of the book — so a photograph pinned a third of
the way down page four is a third of the way down the fourth sheet, and a circle
drawn round a paragraph is round that paragraph on paper. It works by asking the
browser to lay the entry out once at the size of the paper and making each sheet
a *window* onto one column of that single layout, so the print cannot drift out
of step with what is on screen. Every entry starts on a fresh page, so a short
letter leaves the rest of its sheet blank — which is how a printed book of
letters should look. Ctrl/⌘ + P still gives the plain flowing version.

**Choosing the order of a day.** Within a day the person who wrote first comes
first, which is right until it isn't — two people writing the same evening, or a
batch of old letters imported in whatever order the export listed them. Move a
letter up or down and the order is stored, rather than derived by rewriting a
timestamp into a lie about when it was typed. Only the author of a letter may
move it, which the database enforces rather than the interface.

**Copy for WhatsApp.** These letters started in a WhatsApp thread and often go
back to one, so a letter can be copied in WhatsApp's own markup — `*bold*`,
`_italic_`, `~struck through~` — and pasted straight into a chat with its
emphasis intact.

**Preservation.** Optional proofreading fixes obvious mistakes without touching
slang, pet names, mixed languages or repeated letters — and never replaces the
original, which stays recoverable and separately exportable forever. It suggests
only, never applies, and every correction is undoable with Ctrl/⌘+Z: see
[Spell checking](#spell-checking).

**Export.** A typeset PDF, a real `.docx`, or a Google Doc, for the whole book or
any date range, printed from either the original writing or the corrected text.

---

## Architecture

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 16, App Router | Server Components keep private data on the server; `proxy.ts` refreshes sessions |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` | This code handles other people's private writing |
| UI | React 19, Tailwind CSS v4 | CSS-first theming; book typography is data, not class names |
| Database | Supabase Postgres | Row Level Security is the actual authorization layer |
| Auth | Supabase Auth | Email/password and Google, with sessions in httpOnly cookies |
| Editor | TipTap 3 (ProseMirror) | Structured JSON that survives export to print |
| PDF | `@react-pdf/renderer` | Real typesetting, base-14 fonts, no webfont fetch at export time |
| DOCX | `docx` | A genuine Word file that Google Docs imports cleanly |
| Tests | Vitest, Playwright, SQL | Pure logic, browser flows, and the policies themselves |

```
src/
  proxy.ts                  Session refresh + route gate (Next 16 renamed middleware.ts)
  app/
    (auth)/                 Sign in, sign up, password reset
    (app)/                  Everything behind authentication
      library/              The shelf
      books/[bookId]/       home · write · read · calendar · search · members · settings · export
      invitations/[token]/  Accepting an invitation
      settings/profile/     Writing identity, data export
    api/
      entries/autosave/     Frequent saves, no version history
      proofread/            Server-side AI boundary
      export/[format]/      PDF and DOCX
      google/               Docs export OAuth handshake
    auth/callback/          Turns a sign-in link into a session
  components/
    book/                   Cover, day heading, entry block, renderer, paged spread
    editor/                 TipTap editor, toolbar, autosave, spelling, copy
    export/                 Export options and print preview
    members/ settings/ ui/  Invitations, forms, primitives
  lib/
    supabase/               Browser, server and generated types
    books/ entries/         Queries and server actions
    proofread/              Provider abstraction, prompts, guard rails
    export/                 One document model, three renderers
    design/                 Fonts, presets, accents, covers
    date/                   Calendar-date handling
    text/                   Rich text, diff, applying corrections
supabase/
  migrations/               Schema, RLS, functions, storage, grants
  tests/                    The release-blocking authorization test
tests/                      Vitest unit and integration tests
e2e/                        Playwright
```

---

## Data model

```mermaid
erDiagram
    profiles ||--o{ books : owns
    profiles ||--o{ book_members : "is"
    books ||--o{ book_members : has
    books ||--o{ book_invitations : issues
    books ||--o{ entries : contains
    books ||--o{ milestones : marks
    entries ||--o{ entry_versions : "history of"
    entries ||--o{ attachments : has
    entries ||--o{ favorites : "marked by"
    entries ||--o{ entry_reactions : "reacted to"

    profiles {
        uuid id PK "= auth.users.id"
        text display_name
        text preferred_font
        text signature
        text accent
    }
    books {
        uuid id PK
        uuid owner_id FK
        enum type "personal_journal | shared_letter_book"
        text title
        text timezone "the book's own calendar"
        jsonb cover
        jsonb design
        timestamptz archived_at
    }
    book_members {
        uuid book_id PK,FK
        uuid user_id PK,FK
        enum role "owner | editor | viewer"
    }
    book_invitations {
        uuid id PK
        uuid book_id FK
        text invited_email "optional; must match on accept"
        text token_hash "SHA-256 only, never the token"
        timestamptz expires_at
        timestamptz accepted_at
    }
    entries {
        uuid id PK
        uuid book_id FK
        uuid author_id FK
        date entry_date "the day it belongs to"
        int within_day_order "who wrote first"
        timestamptz created_at "when it was typed"
        jsonb content "current text"
        text plain_text "derived, for search and export"
        jsonb original_content "the author's untouched words"
        enum correction_state "original | gentle | polish"
        date sealed_until "enforced in RLS"
        enum status "draft | published"
        tsvector search_vector
    }
    entry_versions {
        uuid id PK
        uuid entry_id FK
        enum kind "original | edit | proofread"
        jsonb content "append-only"
    }
    attachments {
        uuid id PK
        uuid book_id FK
        text storage_path "starts with <book_id>/"
    }
```

Two column pairs carry most of the product's meaning:

- **`entry_date` vs `created_at`** — the day the writing belongs to, versus the
  moment it was typed. Keeping them apart is what makes historical imports
  first-class rather than a hack.
- **`content` vs `original_content`** — what the book currently shows, versus
  what the author actually wrote. The second is captured before any machine
  correction and is never overwritten.

---

## Security model

The rule the whole design serves:

> Nothing in a book is readable unless you are an accepted member of that book.
> Guessing an id or a URL gets you an empty result set, not content.

**Authorization lives in Postgres, not in the interface.** Every table has Row
Level Security enabled, and every policy is scoped to book membership. If the
entire `src/` directory were deleted and someone queried the database directly
with the publishable key, they would still get nothing.

**There is no service-role key anywhere in this application.** Not in the code,
not in `.env.example`, not on Vercel. Every read and write runs as the signed-in
user, which means RLS is always in force and there is no privileged path that
could accidentally bypass it. This is a deliberate constraint, and it is why
`accept_invitation` is a `SECURITY DEFINER` function rather than a server route
holding an admin key.

**Policy recursion is avoided with definer helpers.** `book_members` is consulted
by almost every policy, including its own, so `is_book_member()`,
`can_write_book()` and `book_role()` are `SECURITY DEFINER` functions with
`search_path` pinned to empty and every name fully qualified. `EXECUTE` on them
is revoked from `PUBLIC` and `anon` and granted only to `authenticated`
(see `20260814090400_function_grants.sql`) — RLS policy expressions are evaluated
as the calling role, so those grants are required for the policies to work at
all.

**Invitations are hashed.** The raw token exists only inside the invite URL. The
database stores nothing but its SHA-256 hash, and `accept_invitation(p_token)`
re-hashes the raw token inside Postgres. A leaked database dump therefore
contains no usable invitations. Invitations expire, are single-use, and — when
they name an email — can only be accepted by an account with that address.

**Sealed letters are enforced in the database.** An entry with a future
`sealed_until` is withheld by the `entries` SELECT policy from everyone except
its author. The reading view shows "a sealed letter, opens on…" using
`sealed_entry_previews()`, a function that structurally cannot return the text.

**Drafts are private.** An unpublished entry is visible only to its author, by
policy, not by a filter in a query.

**Storage is private.** `book-media` is not a public bucket. Object paths begin
with the owning book's id and `storage.objects` policies authorize from that
first path segment, so a signed URL is required and only members can obtain one.

**Other measures.** Private routes send `X-Robots-Tag: noindex` and carry
`noindex` metadata; book titles never appear in page metadata; the `next=`
redirect parameter is validated against open redirects; sign-out is POST-only;
rich text is rendered as React elements rather than `dangerouslySetInnerHTML`;
link URLs are protocol-checked in both the editor and the renderer; failed
sign-in and password reset answer identically whether or not the account exists;
database errors are mapped to generic messages so an RLS denial never confirms
that a row exists.

### The release-blocking test

`supabase/tests/rls_authorization_test.sql` becomes the `authenticated` role and
sets the same JWT claims PostgREST sets, then plays out the scenario: User A
keeps a private book, User B goes looking for it. It asserts that User B cannot
read the book, its entries, its attachments, its membership or its invitations;
cannot write, edit or delete anything in it; cannot add themselves as a member;
and that after legitimately joining a *different* shared book they still cannot
reach the private one, and still cannot read a sealed letter. Anonymous access
is checked too.

Run it against any environment — it rolls back, so nothing is left behind:

```bash
psql "$DATABASE_URL" -f supabase/tests/rls_authorization_test.sql
```

Every row of the final result must show `passed = true`.

---

## Local setup

Requires Node 20 or newer (developed on Node 24).

```bash
git clone https://github.com/Murathanx12/Journal-Letter-.git
cd Journal-Letter-
npm install
cp .env.example .env.local   # then fill it in — see below
npm run dev
```

Open <http://localhost:3000>.

> **A note on `npm install`.** This project ships an `.npmrc` setting
> `legacy-peer-deps=true`. npm's peer resolver backtracks pathologically on this
> dependency set (Next 16 + ESLint 9 + TipTap 3 + the Vitest toolchain) and does
> not terminate. Every peer actually relied upon — notably `@tiptap/pm` — is
> listed explicitly in `package.json`, so nothing is silently missing.

> **A note on the folder name.** Do not put this project in a path containing an
> `&` character. npm on Windows builds a `PATH` that `cmd.exe` splits at the
> ampersand, and every `npm run` script fails with
> `'…\node_modules\.bin\' is not recognized`.

---

## Supabase setup

1. Create a project at <https://supabase.com>.
2. Apply the migrations in `supabase/migrations/`, in filename order. Either:
   - **Supabase CLI:** `supabase link --project-ref <ref> && supabase db push`
   - **Studio:** paste each file into the SQL Editor and run them in order.
3. Copy **Project URL** and the **publishable key** from
   *Project Settings → API* into `.env.local`.
4. Set the redirect URLs in *Authentication → URL Configuration*:
   - Site URL: your production URL
   - Additional redirect URLs: `http://localhost:3000/auth/callback` and
     `https://<your-domain>/auth/callback`

The migrations create the schema, all RLS policies, the authorization helpers,
the invitation functions, the private `book-media` storage bucket and its
policies, and the least-privilege `EXECUTE` grants.

To regenerate the TypeScript types after a schema change:

```bash
supabase gen types typescript --project-id <ref> --schema public \
  > src/lib/supabase/database.types.ts
```

---

## Google sign-in setup

**"Continue with Google" is hidden by default.** Until the provider is actually
enabled, Supabase answers every attempt with `provider is not enabled`, and a
button that can only fail is worse than no button. Turn it on in three steps:

1. Google Cloud Console → *APIs & Services* → *Credentials* → *Create OAuth
   client ID* → **Web application**. Authorised redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
2. In Supabase → *Authentication → Providers → Google*, paste the client ID and
   secret and enable it.
3. Set `GOOGLE_AUTH_ENABLED=true` and redeploy.

Sign-in requests only `email profile`; it never asks for Drive access. The
Drive scope is requested separately and only when somebody exports to Google
Docs.

---

## Google Docs export setup

This uses a **separate** OAuth client from sign-in, on purpose: signing in should
not ask anybody for access to their Google Drive. Drive permission is requested
only when someone chooses "Create a Google Doc".

1. Enable the **Google Drive API** on your Google Cloud project.
2. Create a second OAuth client ID (Web application).
3. Authorised redirect URI: `<NEXT_PUBLIC_SITE_URL>/api/google/callback`
4. Set `GOOGLE_DOCS_CLIENT_ID` and `GOOGLE_DOCS_CLIENT_SECRET`.

Requested scope: `drive.file` only — access to files this application creates,
and nothing else. It cannot read an existing Drive. The token is requested with
`access_type=online`, used once, and never stored; there is no refresh token.

If these are not configured, the export screen says so plainly and points at the
`.docx` download, which Google Docs imports cleanly.

---

## Spell checking

**No configuration, no API key, no cost, no external service.** It runs inside
this application, so the text never leaves the trust boundary that already holds
it.

Two layers, deliberately:

1. **The browser's own spell checker** is switched on in the editor. It
   underlines mistakes in whatever languages the reader has installed —
   including Turkish — with right-click suggestions. This is the multilingual
   safety net, it is free, and it works offline.
2. **A list of known English misspellings**, which powers the click-to-fix
   highlights, plus an accidentally repeated word and a lower-case pronoun "I".

### Why a list of mistakes rather than a dictionary of words

A spelling dictionary was tried first and had to be removed. An English
dictionary does not know Turkish either, so it treated every Turkish word as a
mistake and offered the nearest English one — it turned **`askim` into `skim`**.
Tightening the edit-distance threshold does not rescue it, because short words in
one language sit one edit away from real words in another: `cok` → `cook`,
`benim` → `benin`.

There is no threshold that separates "a word in another language" from "an
English typo", because the difference is not in the spelling. So the question is
inverted. Rather than asking *"is this word unknown?"* — which mistrusts every
unfamiliar word — it asks *"is this a specific, known misspelling?"*, which
mistrusts nothing it has not been told about.

The trade is deliberate: it catches fewer typos than a dictionary would, and in
exchange it will never touch another language, a pet name, an invented spelling
or a name. Given the instruction was *"if you are not sure, do not even change
the spelling"*, that is the right way round — and the browser is still
underlining everything else.

Adding entries to `src/lib/proofread/common-typos.ts` is safe and welcome: every
one is a spelling that is simply never correct in English.
`tests/dictionary.test.ts` pins both what it corrects and what it refuses to
touch.

**How it behaves.** Nothing is applied for you and nothing is blocked. A
suspected typo is underlined where it sits in the sentence; clicking it swaps in
the correction. That swap is an ordinary editor transaction, so **Ctrl/⌘+Z undoes
it exactly like it undoes your own typing**, and redo re-applies it. Highlights
follow the text as you keep writing, and vanish if you edit that word yourself.

Because corrections are ordinary edits, the pre-correction document is captured
once, the first time a suggestion is accepted, so "Restore my original words" and
"Export original writing" still work. On save the corrected/original label is
recomputed by comparison, so undoing every suggestion correctly reports the entry
as original again.

**The guard rails decide what is even suggested, and matter more than the
prompt.** The prompt asks the model to preserve slang, pet names, mixed languages
and repeated letters. `spelling-guard.ts` assumes it sometimes will not.

In the default **spelling only** mode, every individual change must be provably
typographical before a human is even shown it:

| Allowed | Rejected |
| --- | --- |
| the same word respelled within one or two edits (`recieve` → `receive`, `teh` → `the`) | a word swapped for a *different* word |
| case or surrounding punctuation (`i` → `I`, `askim` → `askim,`) | a word inserted that was never written |
| a doubled word removed (`the the` → `the`) | a word removed that was not a duplicate |
| a word split or joined (`goodmorning` → `good morning`) | anything reordered |

One disallowed change rejects the whole paragraph. So

```
"I love you sooo much askim"  →  "I love you very much, my darling."
```

never reaches the review screen.

**This is also how the multilingual promise is kept.** The rule is about the
*shape* of the change, not a dictionary. A word the model does not recognise
cannot be translated or substituted, because the replacement would never be a
near-neighbour of the original — `seni cok seviyorum` cannot become `I love you`.
Turkish, invented spellings and pet names survive untouched, while a genuine
typo inside them (`gunaydni` → `gunaydin`) is still fixable. Distance is
Damerau–Levenshtein over code points, so a transposition costs one edit and
accented or non-Latin characters count as one character each.

**Polish** is the separate, explicitly-chosen mode that may reword. It is bounded
too, but far more loosely. All of this is pinned by tests in
`tests/preservation.test.ts`.

---

## Environment variables

See `.env.example`. Names only, never values.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Publishable key; powerless without a session |
| `NEXT_PUBLIC_SITE_URL` | production | Builds email, OAuth and invitation links |
| `GOOGLE_AUTH_ENABLED` | optional | Shows "Continue with Google" once the provider is enabled in Supabase |
| `GOOGLE_DOCS_CLIENT_ID` | optional | Enables Google Docs export |
| `GOOGLE_DOCS_CLIENT_SECRET` | optional | Enables Google Docs export |

There is deliberately **no** `SUPABASE_SERVICE_ROLE_KEY`. Nothing in this
application needs one.

---

## Running the tests

```bash
npm run lint        # ESLint, including the React Compiler rules
npm run typecheck   # tsc --noEmit
npm test            # Vitest
npm run test:e2e    # Playwright (needs: npx playwright install chromium)
npm run verify      # lint + typecheck + test + production build
```

`npm test` covers:

- **`compile.test.ts`** — daily compilation and ordering: whoever submits first
  appears first; ties fall back to creation time then to a stable key;
  backdated imports file under their own date; manual reordering renumbers a
  day; sealed letters open on the right day.
- **`calendar-date.test.ts`** — timezone correctness, including that Hong Kong
  and London get different calendar days at the same instant, and that
  formatting never shifts a date backwards.
- **`preservation.test.ts`** — proofreading guard rails, word-level diffing, and
  that applying a correction refuses to overwrite a paragraph edited since the
  check ran.
- **`rich-text.test.ts`** — plain-text derivation, pasted-letter import, and the
  export block model.
- **`export.test.ts`** — actually renders a PDF and a DOCX and checks the file
  signatures, across all four page sizes.
- **`security.test.ts`** — open-redirect protection, invitation token entropy
  and hash agreement with Postgres, and settings parsing against malformed data.
- **`whatsapp.test.ts`** — copying a letter for WhatsApp: that the markers touch
  the words they wrap (WhatsApp shows them literally otherwise), that adjacent
  runs sharing a mark are merged, and that paragraphs keep their gaps.
- **`placement.test.ts`** — reading a photograph's placement back out of jsonb: a
  hand-edited or older row must render as a slightly odd page, never as a blank
  one or a photograph a mile off the paper.
- **`dictionary.test.ts`** — the offline spell checker, half of it asserting what
  it *declines* to touch.

`npm run test:e2e` adds browser tests, including
**`shared-book.spec.ts`** — two real accounts, one shared book, both people
opening it. It exists because of a bug nothing else could see: `getBook` asked
for *the memberships of this book* rather than *my membership of this book*, and
since a member may see everyone in the book, that returned one row while a book
was solo and two the moment somebody joined. `maybeSingle()` answers a multi-row
result with `null`, so the book 404'd for **both** people at once, the instant it
stopped being private. Unit tests are pure logic, the SQL test proves the
database says yes, and every other browser test is signed out or alone — it took
two people in one book.

That spec signs in against the configured Supabase project, so it creates four
accounts (`e2e-author-*` and `e2e-friend-*` at `@journal-letter.test`). The
addresses are fixed rather than random, one pair per Playwright project, so they
are made once and reused instead of accumulating on every run; the book is
created fresh and deleted at the end. Delete those four accounts freely — the
next run recreates them.

The database authorization tests live in
`supabase/tests/rls_authorization_test.sql` — see
[the release-blocking test](#the-release-blocking-test).

---

## Deploying to Vercel

```bash
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
vercel env add NEXT_PUBLIC_SITE_URL production
# optional
vercel env add GOOGLE_DOCS_CLIENT_ID production
vercel env add GOOGLE_DOCS_CLIENT_SECRET production

vercel deploy          # preview
vercel deploy --prod   # production
```

After the first production deploy, set `NEXT_PUBLIC_SITE_URL` to the real domain
and add `https://<domain>/auth/callback` to the Supabase redirect allow-list, or
sign-in emails will point at the wrong host.

Export routes run on the Node runtime with `maxDuration = 60`, which is enough
to typeset a large book.

---

## Export architecture

The book is compiled **once** into a neutral document model
(`src/lib/export/document.ts`), and PDF, DOCX and Google Docs are dumb renderers
over it. If the PDF and the Word file ever disagreed about what the book says,
the bug would be in one place rather than three.

```
entries (rich text JSON)
        │
        ▼
compileBookForExport()      ← applies the date range and original/current choice
        │
        ▼
ExportDocument              ← days → entries → blocks → runs
        ├──────────────► renderBookPdf()   → typeset PDF
        ├──────────────► renderBookDocx()  → real .docx
        └──────────────► Drive upload of the .docx, converted to a Google Doc
```

The PDF uses only the PDF base-14 fonts (Times, Helvetica, Courier), mapped from
each book's chosen typeface. That is a deliberate trade: nothing is embedded, so
exports are small and fast and a ten-year book never fails to generate because a
webfont could not be fetched. Layout — margins, leading, dates as chapter
headings, indented paragraphs, page numbers, a title page stating whether the
original or corrected text was printed — is what actually makes it read as a
book.

Google Docs export uploads the generated `.docx` and asks Drive to convert it,
rather than assembling hundreds of `documents.batchUpdate` requests. Google's own
importer reproduces the layout far better, and there is one document pipeline to
keep correct instead of two.

This is also the seam for "Order Printed Book" later: a print provider needs a
trim size and a press-ready PDF, both of which come out of `ExportDocument` and
`books.design.pageSize` without touching how entries are stored.

---

## Design decisions worth knowing

**Pages are real, and the browser paginates them.** `src/components/book/book-pages.tsx`
is a multi-column box with a definite height and `column-fill: auto`. When the
writing no longer fits, the browser lays the rest out in further columns *beside*
the visible ones and the box becomes horizontally scrollable; turning a page is a
scroll of exactly one spread — `clientWidth + column-gap`. Three consequences
shaped everything around it:

- `column-fill: auto` is essential. The default, `balance`, would share a short
  letter evenly across both pages instead of filling the left one first.
- `break-before: column` starts an element on a fresh page, which is the whole
  of how each entry gets its own opening page.
- The columns box carries **no padding**. All the margins belong to the wrapper,
  because padding would put that page-turn arithmetic out by a few pixels on
  every single turn.

`overflow: hidden` still makes it a scroll container, so page turns are driven
entirely from the controls and a stray trackpad swipe can never leave you looking
at half of one page and half of another. While writing, the browser scrolls the
box just far enough to reveal the caret — which lands mid-spread — so the editor
watches the caret and turns the page properly instead.

**A page has a height, so a photograph can be half way down it.** This is the
real payoff of paginating. In a continuously scrolling entry a page has no
height — it depends on how much has been written — so a photograph could only be
positioned against the column *width*, and anything placed low would move every
time a sentence was added. A page in a book is a fixed rectangle.

Stickers are therefore positioned in pure CSS, with no measurement anywhere:

```css
left: calc((100% + var(--page-gap)) * var(--page) + 100% * var(--x));
top:  calc(var(--page-height) * var(--y));
```

`--page` steps across by one whole page — column plus gutter — from an anchor
that sits at the top-left of the page an entry opens on. Because the anchor lives
inside the same column flow as the writing, "page four of this letter" lands on
page four whatever size the page turns out to be, and turning the page carries
the photographs with it. Outside a paginated book — a side panel, a printout —
there is no page four, so the same stickers fall back to joining the writing in
the flow rather than being placed somewhere meaningless.

**Dates are strings, not instants.** `YYYY-MM-DD` everywhere, with every
conversion to `Date` pinned to UTC. The recurring bug in software like this is
`new Date("2026-08-14")` parsed as UTC midnight and then formatted in a timezone
behind UTC, moving the letter to the 13th. Books carry their own timezone so two
people in different countries agree on which day they are writing.

**`plain_text` is always derived on the server.** A client cannot claim an entry
says something it does not, which matters because `plain_text` is what search
and export read.

**Autosave has two layers.** `localStorage` is written on every change and
survives a crashed tab; the debounced server save is what makes the entry exist
for everybody else. The local copy is cleared only after the server confirms the
same text, so a failed save always leaves something to recover.

**Version history is append-only.** `entry_versions` has no UPDATE or DELETE
policy at all, so history cannot be rewritten with an anon or authenticated key.
Autosave deliberately does not write history — otherwise one letter would
generate hundreds of rows.

**A page anchor must come before the writing.** Photographs and drawings are
positioned against an invisible anchor that takes no height — but it still has a
*place* in the column flow, and everything on the entry is measured from it. An
anchor written after the writing therefore lands in whichever column the writing
happened to end in, taking every photograph and drawing with it onto the wrong
page. Every anchor is emitted before the text, and what covers what is decided by
`z-index` alone.

**Publishing adopts the entry it created.** `saveEntry` returns the new entry's
id, and autosave has to be told: otherwise the debounced save already in flight
still believes there is no entry and *inserts a second one*, leaving a draft copy
of the letter that was just published. The buttons also stay down until the page
has actually navigated, because an action resolving is not the same as having
left.

**A document is made plain before it leaves the editor.** ProseMirror builds
every node's `attrs` with `Object.create(null)`, and `toJSON` hands that same
object out. React's Server Action serializer will not treat a null-prototype
object as *data* — it encodes it as an opaque temporary reference, which the
server may pass back to the client but must never read. So a document sent
straight to a Server Action arrives with every attribute missing: a paragraph's
alignment, a poem's typeface, and a photograph's storage path. Autosave was
never affected, because it goes through `fetch` and `JSON.stringify`. `onChange`
therefore runs `toPlainDoc`, and everything downstream gets a document that can
actually be saved.

**Reading is paginated by day, not by row.** A page boundary must never fall in
the middle of 14 August.

**Author accent is never the only signal.** Names are always spelled out. Colour
and typeface reinforce; they do not carry the information. The same rule governs
the calendar, where contributor dots are accompanied by a screen-reader-only
count.

**404, not 403.** A non-member asking for a book gets `notFound()`, which reveals
nothing about whether that book exists.

---

## Known limitations

- **Images are not embedded in exports.** Photographs upload, store privately,
  and are placed and rendered on the page in the app, but the PDF and DOCX
  render text only. Embedding them requires fetching every signed URL during
  export; the document model already carries the structure for it.
- **Ctrl/⌘ + P still prints the flowing version.** The browser's own print
  command linearises the book and returns photographs to the writing they belong
  to, in order, at a readable size; drawings are left out. "Print with the pages"
  is the one that keeps the pages.
- **Drawings are shown only where there are pages.** A drawing is anchored to a
  page of the book — a circle round the third paragraph of page two — so it
  appears in the reading view, in the composer, and in "Print with the pages".
  The book's home screen and the "read as one column" view have no page four to
  draw on, and unlike a photograph a scribble cannot be sensibly "returned to the
  flow", so it is left out there rather than drawn somewhere it does not belong.
- **The PDF and DOCX exports are still text only.** Printing from the reading
  view now carries photographs and drawings onto their real pages; the
  server-rendered exports do not, because they paginate with their own engine
  and cannot know where the browser broke a page.
- **Text follows a photograph's outline, not a curve.** `shape-outside` makes
  the writing flow around a cut-out silhouette, and a placed picture can be set
  at any angle — but text itself cannot yet be set along a curved path, which
  needs SVG `textPath` and a different editor model.
- **Bulk WhatsApp import is server-side only.** `bulkImportEntries` accepts a
  reviewed list of dated entries, and "Add Past Entry" is fully built, but the
  screen that parses a raw WhatsApp export and lets you correct the detected
  dates before importing is not built yet.
- **No simultaneous editing.** Two people editing the *same* entry at once is not
  supported; only the author can edit their own entry, which makes the collision
  rare. Realtime updates for a shared book are not wired up yet.
- **Milestones and reactions exist in the schema** with full policies, but have
  no UI yet.
- **Account deletion is documented, not automated.** Books are deleted
  individually. Deleting an account in a product holding *shared* writing needs a
  deliberate decision about what happens to letters other people are still
  reading.
- **`legacy-peer-deps`** is required; see [Local setup](#local-setup).

---

## Roadmap

**Next**

- Bulk WhatsApp export parser with a review screen before import
- Photographs embedded in PDF and DOCX exports, and placed on their real page
  when printing
- Photographs and drawings in the PDF and DOCX exports, not only in print
- Text set along a curve
- Supabase Realtime, so a shared book updates when the other person posts

**Later**

- "Order Printed Book": trim size, paper, cover, press-ready PDF
- Milestones and gentle reactions in the reading view
- Memory map from optional per-entry location
- Favourites collection — "Our Favourite Letters"

---

## Product principles

1. This is a book, not chat.
2. Writing is the centrepiece.
3. Preserve the author's authentic words.
4. AI assists; it does not replace the writer.
5. The original text must remain recoverable.
6. Dates and authors are preserved automatically.
7. Historical entries are first-class.
8. Private really means private.
9. Sharing is invitation-based, not public-link publishing.
10. Export must eventually produce something worth keeping for decades.
