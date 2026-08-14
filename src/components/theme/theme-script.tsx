/**
 * Applies the saved theme before the first paint.
 *
 * This has to be a blocking inline script: if the class were added in an effect,
 * a dark-mode reader would get a white flash on every navigation. Reading a
 * whole book that way is genuinely unpleasant.
 */
const script = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (stored === "dark" || (stored !== "light" && prefersDark)) {
      document.documentElement.classList.add("dark");
    }
  } catch (e) {
    // Private browsing can throw on localStorage. The system preference in
    // globals.css is a fine fallback.
  }
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />;
}
