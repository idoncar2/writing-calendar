import { type Extension, Transaction } from "@codemirror/state";
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

export function createActivityTrackingExtension(listener: ActivityListener): Extension {
  return ViewPlugin.fromClass(
    class implements PluginValue {
      private compositionStart?: string;
      private compositionTimer?: number;
      private readonly onCompositionEnd: () => void;

      constructor(private readonly view: EditorView) {
        this.onCompositionEnd = () => {
          if (this.compositionTimer !== undefined) window.clearTimeout(this.compositionTimer);
          this.compositionTimer = window.setTimeout(() => {
            this.compositionTimer = undefined;
            this.flushComposition(this.view.state.doc.toString());
          }, 0);
        };
        this.view.contentDOM.addEventListener("compositionend", this.onCompositionEnd);
      }

      update(update: ViewUpdate): void {
        for (const transaction of update.transactions) {
          const facts = extractTransactionActivity(transaction);
          const classification = classifyEditorActivity(facts);
          if (!classification.recordsActivity) continue;
          if (classification.source === "ime") {
            this.compositionStart ??= transaction.startState.doc.toString();
            continue;
          }
          if (this.compositionStart !== undefined) {
            this.flushComposition(transaction.startState.doc.toString());
          }
          listener({ ...facts, ...classification }, update.view);
        }
        if (this.compositionStart !== undefined && !update.view.composing) {
          this.flushComposition(update.view.state.doc.toString());
        }
      }

      destroy(): void {
        this.view.contentDOM.removeEventListener("compositionend", this.onCompositionEnd);
        if (this.compositionTimer !== undefined) window.clearTimeout(this.compositionTimer);
        this.flushComposition(this.view.state.doc.toString());
      }

      private flushComposition(after: string): void {
        if (this.compositionStart === undefined) return;
        const before = this.compositionStart;
        this.compositionStart = undefined;
        const change = diffTextChange(before, after);
        const facts: EditorActivityFacts = {
          docChanged: before !== after,
          ...change,
          userEvents: ["input.type.compose"],
        };
        const classification = classifyEditorActivity(facts);
        if (classification.recordsActivity) listener({ ...facts, ...classification }, this.view);
      }
    },
  );
}
