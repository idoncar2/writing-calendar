import { type ChangeSet, type Text, type Extension, Transaction } from "@codemirror/state";
import { type EditorView, type PluginValue, ViewPlugin, type ViewUpdate } from "@codemirror/view";

import {
  classifyEditorActivity,
  type ClassifiedEditorActivity,
  type EditorActivityFacts,
} from "./classifier";

export interface TrackedEditorActivity extends EditorActivityFacts, ClassifiedEditorActivity {}

export type ActivityListener = (activity: TrackedEditorActivity, view: EditorView) => void;

export function diffTextChange(before: string, after: string): Pick<EditorActivityFacts, "insertedText" | "deletedText"> {
  const left = Array.from(before);
  const right = Array.from(after);
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let leftSuffix = left.length;
  let rightSuffix = right.length;
  while (
    leftSuffix > prefix &&
    rightSuffix > prefix &&
    left[leftSuffix - 1] === right[rightSuffix - 1]
  ) {
    leftSuffix -= 1;
    rightSuffix -= 1;
  }
  return {
    insertedText: right.slice(prefix, rightSuffix).join(""),
    deletedText: left.slice(prefix, leftSuffix).join(""),
  };
}

export function extractTransactionActivity(transaction: Transaction): EditorActivityFacts {
  if (!transaction.docChanged) {
    return { docChanged: false, insertedText: "", deletedText: "", userEvents: [] };
  }

  const inserted: string[] = [];
  const deleted: string[] = [];
  transaction.changes.iterChanges((fromA, toA, _fromB, _toB, insertedText) => {
    if (toA > fromA) deleted.push(transaction.startState.sliceDoc(fromA, toA));
    if (insertedText.length > 0) inserted.push(insertedText.toString());
  });
  const userEvent = transaction.annotation(Transaction.userEvent);

  return {
    docChanged: true,
    insertedText: inserted.join(""),
    deletedText: deleted.join(""),
    userEvents: userEvent ? [userEvent] : [],
  };
}

export function createActivityTrackingExtension(listener: ActivityListener, onDocumentChange?: () => void): Extension {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      private readonly composition = new CompositionActivity();
      private compositionTimer?: number;
      private readonly onCompositionEnd: () => void;

      constructor(private readonly view: EditorView) {
        this.onCompositionEnd = () => {
          if (this.compositionTimer !== undefined) window.clearTimeout(this.compositionTimer);
          this.compositionTimer = window.setTimeout(() => {
            this.compositionTimer = undefined;
            this.flushComposition();
          }, 0);
        };
        this.view.contentDOM.addEventListener("compositionend", this.onCompositionEnd);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged) onDocumentChange?.();
        for (const transaction of update.transactions) {
          const facts = extractTransactionActivity(transaction);
          const classification = classifyEditorActivity(facts);
          if (classification.recordsActivity && classification.source === "ime") {
            this.composition.add(transaction);
            continue;
          }
          // Finish composition before unrelated edits so remote/plugin changes
          // cannot be counted as user IME input.
          if (transaction.docChanged) this.flushComposition();
          if (classification.recordsActivity) listener({ ...facts, ...classification }, update.view);
        }
        if (!update.view.composing) this.flushComposition();
      }

      destroy(): void {
        this.view.contentDOM.removeEventListener("compositionend", this.onCompositionEnd);
        if (this.compositionTimer !== undefined) window.clearTimeout(this.compositionTimer);
        this.flushComposition();
      }

      private flushComposition(): void {
        const change = this.composition.flush();
        if (!change) return;
        const facts: EditorActivityFacts = {
          docChanged: !!(change.insertedText || change.deletedText),
          ...change,
          userEvents: ["input.type.compose"],
        };
        const classification = classifyEditorActivity(facts);
        if (classification.recordsActivity) listener({ ...facts, ...classification }, this.view);
      }
    },
  );
}

/** Keep immutable ropes and compose edits; never copy a whole note per IME word. */
export class CompositionActivity {
  private before?: Text;
  private after?: Text;
  private changes?: ChangeSet;

  add(transaction: Transaction): void {
    this.before ??= transaction.startState.doc;
    this.after = transaction.newDoc;
    this.changes = this.changes ? this.changes.compose(transaction.changes) : transaction.changes;
  }

  flush(): Pick<EditorActivityFacts, "insertedText" | "deletedText"> | undefined {
    const { before, after, changes } = this;
    this.before = this.after = this.changes = undefined;
    if (!before || !after || !changes) return undefined;
    let fromA = before.length, toA = 0, fromB = after.length, toB = 0;
    changes.iterChangedRanges((a, b, c, d) => {
      fromA = Math.min(fromA, a); toA = Math.max(toA, b);
      fromB = Math.min(fromB, c); toB = Math.max(toB, d);
    });
    if (changes.empty) return { insertedText: "", deletedText: "" };
    // Include a neighbouring UTF-16 unit on each side so surrogate-pair edits
    // are reduced by the same Unicode-aware diff as ordinary replacements.
    return diffTextChange(
      before.sliceString(Math.max(0, fromA - 1), Math.min(before.length, toA + 1)),
      after.sliceString(Math.max(0, fromB - 1), Math.min(after.length, toB + 1)),
    );
  }
}
