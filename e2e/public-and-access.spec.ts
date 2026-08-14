import { expect, test } from "@playwright/test";

/**
 * These run signed out, so they need no seeded accounts and no credentials
 * beyond the Supabase URL and publishable key the app already builds with.
 *
 * The route-protection tests are the important ones: they check the *outward*
 * behaviour of the guarantee that `supabase/tests/rls_authorization_test.sql`
 * proves at the database level.
 */

test.describe("public pages", () => {
  test("the landing page explains the product", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("book");
    await expect(page.getByRole("link", { name: /start writing|start your first book/i }).first()).toBeVisible();
  });

  test("sign in asks for an email and a password", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  });

  test("Google is offered only when it has actually been set up", async ({ page }) => {
    await page.goto("/login");

    // A button that can only answer `provider is not enabled` is worse than no
    // button, so it is hidden until `GOOGLE_AUTH_ENABLED` says otherwise. This
    // asserts the flag is obeyed either way rather than pinning one value.
    const google = page.getByRole("button", { name: /continue with google/i });
    const enabled = process.env.GOOGLE_AUTH_ENABLED === "true";
    await expect(google).toHaveCount(enabled ? 1 : 0);
  });

  test("sign up asks what to call you", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByLabel(/what should we call you/i)).toBeVisible();
  });

  test("a wrong password does not reveal whether the account exists", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("nobody-here@example.com");
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: /^sign in$/i }).click();

    // Scoped to the form: Next's route announcer is also role="alert".
    const alert = page.locator("form").getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/do not match/i);
    // Must never say "no such account" or "user not found".
    await expect(alert).not.toContainText(/not found|no account|does not exist/i);
  });
});

test.describe("private routes reject anonymous visitors", () => {
  const privatePaths = [
    "/library",
    "/books/new",
    "/settings/profile",
    // A plausible-looking book id. Guessing a URL must reveal nothing.
    "/books/cccccccc-0000-4000-8000-000000000003",
    "/books/cccccccc-0000-4000-8000-000000000003/read",
    "/books/cccccccc-0000-4000-8000-000000000003/export",
  ];

  for (const path of privatePaths) {
    test(`${path} redirects to sign in`, async ({ page }) => {
      const response = await page.goto(path);

      await expect(page).toHaveURL(/\/login/);
      // The destination is preserved so the visitor lands where they meant to.
      expect(new URL(page.url()).searchParams.get("next")).toBe(path);
      // Nothing of the book leaks into the page.
      expect(await page.content()).not.toContain("secret");
      expect(response?.status()).toBeLessThan(400);
    });
  }

  test("the export API refuses anonymous requests", async ({ request }) => {
    const response = await request.get(
      "/api/export/pdf?bookId=cccccccc-0000-4000-8000-000000000003",
    );
    expect([401, 404]).toContain(response.status());
  });

  test("the autosave API refuses anonymous requests", async ({ request }) => {
    const response = await request.post("/api/entries/autosave", {
      data: {
        bookId: "cccccccc-0000-4000-8000-000000000003",
        entryDate: "2026-08-14",
        title: null,
        content: { type: "doc" },
      },
    });
    expect(response.status()).toBe(401);
  });

  test("the proofreading API refuses anonymous requests", async ({ request }) => {
    const response = await request.post("/api/proofread", {
      data: {
        bookId: "cccccccc-0000-4000-8000-000000000003",
        mode: "gentle",
        paragraphs: ["hello"],
      },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe("layout", () => {
  test("the landing page does not scroll sideways", async ({ page }) => {
    await page.goto("/");

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });

  test("sign in is usable at a phone width", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    await page.goto("/login");

    await expect(page.getByLabel("Email")).toBeVisible();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
