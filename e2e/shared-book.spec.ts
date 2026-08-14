import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * A book with two people in it.
 *
 * This exists because of a bug that every other test was blind to. `getBook`
 * asked for "the memberships of this book" instead of "my membership of this
 * book". A member may see everyone in the book, so that query returned one row
 * while a book was solo and two rows the moment somebody joined — and
 * `maybeSingle()` answers a multi-row result with `null`. The book became a 404
 * for *both* people at once, the instant it stopped being private.
 *
 * Nothing caught it: the unit tests are pure logic, the SQL test proves the
 * database says yes, and every other browser test is signed out or alone. It
 * needed two real people in one real book.
 *
 * These tests sign in against the configured Supabase project, so they create
 * accounts. The addresses are fixed rather than random — one pair per Playwright
 * project — so they are made once and reused forever instead of accumulating on
 * every run. The book is created fresh and deleted at the end.
 */

const PASSWORD = "e2e-correct-horse-battery-staple";

async function ensureAccount(page: Page, email: string, displayName: string) {
  await page.goto("/signup");
  await page.locator("#displayName").fill(displayName);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /create account/i }).click();

  // Either the account is new and we land in the library, or it already exists
  // from a previous run and we sign in instead.
  await page.waitForLoadState("networkidle");
  if (page.url().includes("/library")) return;

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/library/, { timeout: 30_000 });
}

async function signedInPage(browser: Browser, email: string, name: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await ensureAccount(page, email, name);
  return page;
}

/** Asserts a page loaded rather than 404ing, and says which one when it fails. */
async function expectOpens(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), `${path} returned ${response?.status()}`).toBe(200);
  await expect(page.locator("body"), `${path} rendered the not-found page`).not.toContainText(
    "could not be found",
  );
}

test.describe("a book shared between two people", () => {
  // Signing up, inviting, accepting and writing is a lot of round trips.
  test.setTimeout(180_000);

  test("both people can open the book and its letters", async ({ browser }, testInfo) => {
    const suffix = testInfo.project.name;
    const authorEmail = `e2e-author-${suffix}@journal-letter.test`;
    const friendEmail = `e2e-friend-${suffix}@journal-letter.test`;
    const title = `Shared book ${Date.now()}`;

    const author = await signedInPage(browser, authorEmail, "Author");

    // --- create a shared book, inviting the other person -----------------
    await author.goto("/books/new");
    await author.getByRole("button", { name: /shared letter book/i }).click();
    await author.locator("#title").fill(title);
    await author.getByRole("button", { name: /^continue$/i }).click();
    await author.locator("#inviteEmail").fill(friendEmail);
    await author.getByRole("button", { name: /^create book$/i }).click();

    // The invite link is shown exactly once, before the book opens.
    const inviteField = author.locator("input[readonly]");
    await expect(inviteField).toBeVisible({ timeout: 30_000 });
    const inviteUrl = await inviteField.inputValue();
    await author.getByRole("button", { name: /open the book/i }).click();
    await author.waitForURL(/\/books\/[0-9a-f-]{36}/, { timeout: 30_000 });

    const bookId = author.url().match(/books\/([0-9a-f-]{36})/)![1];

    // --- write one letter -------------------------------------------------
    await author.goto(`/books/${bookId}/write`);
    const editor = author.locator(".tiptap");
    await editor.click();
    await editor.pressSequentially("A letter we should both be able to open.");
    await author.getByRole("button", { name: /add to the book/i }).click();
    await author.waitForURL(new RegExp(`/books/${bookId}$`), { timeout: 30_000 });

    await author.goto(`/books/${bookId}/read`);
    const entryId = (await author.locator("article[id^='entry-']").first().getAttribute("id"))!
      .replace("entry-", "");

    // --- the other person accepts ----------------------------------------
    const friend = await signedInPage(browser, friendEmail, "Friend");
    // Only the path: the link is built from `NEXT_PUBLIC_SITE_URL`, which points
    // at the deployed site, not at the server these tests are running against.
    await friend.goto(new URL(inviteUrl).pathname);
    await friend.getByRole("button", { name: /accept and open the book/i }).click();
    await friend.waitForURL(new RegExp(`/books/${bookId}`), { timeout: 30_000 });

    // --- the actual assertions -------------------------------------------
    for (const path of [
      `/books/${bookId}`,
      `/books/${bookId}/read`,
      `/books/${bookId}/entries/${entryId}`,
    ]) {
      await expectOpens(friend, path);
      // And the author, now that the book is no longer solo — this is the half
      // that used to break for the person who created the book.
      await expectOpens(author, path);
    }

    // The library must still show the author as the owner, not pick up the
    // other member's role.
    await author.goto("/library");
    await expect(author.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible();

    // --- clean up ---------------------------------------------------------
    await author.goto(`/books/${bookId}/settings`);
    await author.getByRole("button", { name: /delete permanently/i }).click();
    await author.locator("#confirmTitle").fill(title);
    await author.getByRole("button", { name: /i understand, delete it/i }).click();
    await author.waitForURL(/\/library/, { timeout: 30_000 });

    await author.context().close();
    await friend.context().close();
  });
});
