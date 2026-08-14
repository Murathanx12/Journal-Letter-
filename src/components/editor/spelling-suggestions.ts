import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import type { WordSuggestion } from "@/lib/proofread/suggestions";

/**
 * Spelling suggestions, shown in place.
 *
 * Nothing is applied on your behalf and nothing is blocked. A suspected typo is
 * underlined where it sits in the sentence; clicking it swaps in the correction.
 *
 * The swap is an ordinary editor transaction, which is the whole point: it goes
 * into TipTap's history like any other edit, so Ctrl/⌘+Z undoes it exactly as
 * it would undo your own typing. Applying corrections through a side channel —
 * rewriting the document wholesale, or saving straight to the server — is what
 * would break undo.
 */

export type ResolvedSuggestion = {
  id: string;
  from: number;
  to: number;
  before: string;
  replacement: string;
  note: string;
};

type PluginState = {
  suggestions: ResolvedSuggestion[];
  decorations: DecorationSet;
};

export const spellingSuggestionsKey = new PluginKey<PluginState>("spellingSuggestions");

/**
 * Map character offsets inside a block's plain text onto document positions.
 *
 * Restricted to paragraphs and headings — blocks whose content is purely
 * inline. In a list or a multi-paragraph quote the flattened text contains
 * newlines that have no single corresponding node, so offsets would drift.
 * Those blocks simply get no highlights rather than wrong ones.
 */
function resolve(doc: ProseMirrorNode, suggestions: readonly WordSuggestion[]): ResolvedSuggestion[] {
  const blocks: { node: ProseMirrorNode; pos: number }[] = [];
  doc.forEach((node, offset) => blocks.push({ node, pos: offset }));

  const resolved: ResolvedSuggestion[] = [];

  suggestions.forEach((suggestion, index) => {
    // A pure insertion has nothing to underline; spelling-only mode does not
    // produce them anyway.
    if (suggestion.end <= suggestion.start) return;

    const block = blocks[suggestion.blockIndex];
    if (!block) return;

    const typeName = block.node.type.name;
    if (typeName !== "paragraph" && typeName !== "heading") return;

    const base = block.pos + 1;
    let charOffset = 0;
    let from = -1;
    let to = -1;

    block.node.forEach((child, childOffset) => {
      const length = child.isText ? (child.text?.length ?? 0) : 1;
      const start = charOffset;
      const end = charOffset + length;

      if (child.isText) {
        if (from === -1 && suggestion.start >= start && suggestion.start < end) {
          from = base + childOffset + (suggestion.start - start);
        }
        if (to === -1 && suggestion.end > start && suggestion.end <= end) {
          to = base + childOffset + (suggestion.end - start);
        }
      }

      charOffset = end;
    });

    // Only accept a suggestion that lands cleanly inside the text. A word split
    // across marks (half bold) is skipped rather than mangled.
    if (from === -1 || to === -1 || to <= from) return;

    resolved.push({
      id: `s${index}-${from}-${to}`,
      from,
      to,
      before: suggestion.before,
      replacement: suggestion.replacement,
      note: suggestion.note,
    });
  });

  return resolved;
}

function decorate(suggestions: readonly ResolvedSuggestion[], doc: ProseMirrorNode): DecorationSet {
  return DecorationSet.create(
    doc,
    suggestions.map((suggestion) =>
      Decoration.inline(suggestion.from, suggestion.to, {
        class: "spelling-suggestion",
        title: suggestion.note
          ? `${suggestion.note} — click to fix`
          : `Suggested: ${suggestion.replacement} — click to fix`,
      }),
    ),
  );
}

export type SpellingSuggestionsOptions = {
  /** Called after a suggestion is applied, with how many remain. */
  onApply?: (remaining: number) => void;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    spellingSuggestions: {
      setSpellingSuggestions: (suggestions: WordSuggestion[]) => ReturnType;
      clearSpellingSuggestions: () => ReturnType;
    };
  }
}

export const SpellingSuggestions = Extension.create<SpellingSuggestionsOptions>({
  name: "spellingSuggestions",

  addOptions() {
    return { onApply: undefined };
  },

  addCommands() {
    return {
      setSpellingSuggestions:
        (suggestions) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(spellingSuggestionsKey, { type: "set", suggestions }));
          return true;
        },
      clearSpellingSuggestions:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(spellingSuggestionsKey, { type: "clear" }));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin<PluginState>({
        key: spellingSuggestionsKey,

        state: {
          init: (_config, state) => ({
            suggestions: [],
            decorations: DecorationSet.empty.map(state.tr.mapping, state.doc),
          }),

          apply(tr, previous, _oldState, newState) {
            const meta = tr.getMeta(spellingSuggestionsKey) as
              | { type: "set"; suggestions: WordSuggestion[] }
              | { type: "clear" }
              | { type: "applied"; id: string }
              | undefined;

            if (meta?.type === "clear") {
              return { suggestions: [], decorations: DecorationSet.empty };
            }

            if (meta?.type === "set") {
              const resolved = resolve(newState.doc, meta.suggestions);
              return { suggestions: resolved, decorations: decorate(resolved, newState.doc) };
            }

            if (meta?.type === "applied") {
              const remaining = previous.suggestions
                .filter((suggestion) => suggestion.id !== meta.id)
                .map((suggestion) => ({
                  ...suggestion,
                  from: tr.mapping.map(suggestion.from),
                  to: tr.mapping.map(suggestion.to, -1),
                }))
                .filter((suggestion) => suggestion.to > suggestion.from);

              return { suggestions: remaining, decorations: decorate(remaining, newState.doc) };
            }

            if (!tr.docChanged) return previous;

            // Ordinary typing: move the highlights along with the text, and drop
            // any whose word has been edited away.
            const moved = previous.suggestions
              .map((suggestion) => ({
                ...suggestion,
                from: tr.mapping.map(suggestion.from),
                to: tr.mapping.map(suggestion.to, -1),
              }))
              .filter((suggestion) => suggestion.to > suggestion.from);

            return { suggestions: moved, decorations: decorate(moved, newState.doc) };
          },
        },

        props: {
          decorations(state) {
            return spellingSuggestionsKey.getState(state)?.decorations ?? DecorationSet.empty;
          },

          handleClick(view, pos) {
            const state = spellingSuggestionsKey.getState(view.state);
            const hit = state?.suggestions.find(
              (suggestion) => pos >= suggestion.from && pos <= suggestion.to,
            );
            if (!hit) return false;

            // A plain transaction, so this lands in the undo history.
            const tr = view.state.tr.insertText(hit.replacement, hit.from, hit.to);
            tr.setMeta(spellingSuggestionsKey, { type: "applied", id: hit.id });
            view.dispatch(tr);

            // Read after dispatching: the applied suggestion has already been
            // removed from plugin state, so this is the number still showing.
            options.onApply?.(spellingSuggestionsKey.getState(view.state)?.suggestions.length ?? 0);
            return true;
          },
        },
      }),
    ];
  },
});
