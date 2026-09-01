export type ActivitySource =
  | "none"
  | "typing"
  | "ime"
  | "paste"
  | "drop"
  | "delete"
  | "cut"
  | "undo"
  | "redo"
  | "completion"
  | "programmatic";

export interface EditorActivityFacts {
  docChanged: boolean;
  insertedText: string;
  deletedText: string;
  userEvents: readonly string[];
}

export interface ClassifiedEditorActivity {
  source: ActivitySource;
  countsAsManual: boolean;
  recordsActivity: boolean;
  hasInsertion: boolean;
  hasDeletion: boolean;
}

function hasEvent(events: readonly string[], prefix: string): boolean {
  return events.some((event) => event === prefix || event.startsWith(`${prefix}.`));
}

export function classifyEditorActivity(facts: EditorActivityFacts): ClassifiedEditorActivity {
  const hasInsertion = facts.insertedText.length > 0;
  const hasDeletion = facts.deletedText.length > 0;
  const recordsActivity = facts.docChanged && (hasInsertion || hasDeletion);

  if (!recordsActivity) {
    return {
      source: "none",
      countsAsManual: false,
      recordsActivity: false,
      hasInsertion,
      hasDeletion,
    };
  }

  const events = facts.userEvents;
  let source: ActivitySource;
  if (hasEvent(events, "undo")) source = "undo";
  else if (hasEvent(events, "redo")) source = "redo";
  else if (hasEvent(events, "input.paste")) source = "paste";
  else if (hasEvent(events, "input.drop")) source = "drop";
  else if (hasEvent(events, "input.type.compose")) source = "ime";
  else if (hasEvent(events, "input.type")) source = "typing";
  else if (hasEvent(events, "input.complete")) source = "completion";
  else if (hasEvent(events, "delete.cut")) source = "cut";
  else if (hasEvent(events, "delete")) source = "delete";
  else source = "programmatic";

  return {
    source,
    countsAsManual: source === "typing" || source === "ime",
    recordsActivity,
    hasInsertion,
    hasDeletion,
  };
}
