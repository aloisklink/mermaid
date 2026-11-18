import { walk } from './layout/env.js';
import type { SequenceModel } from './model.js';

/**
 * Every text the layout lays out as a label (`DiagramPlugin.labels`, D178): the title,
 * participants, boxes, messages, notes and fragment labels, as written. Links are not labels.
 */
export function sequenceLabels(model: SequenceModel): readonly string[] {
  const out: string[] = [
    ...(model.title === undefined ? [] : [model.title]),
    ...model.participants.map((p) => p.label),
    ...model.boxes.map((b) => b.label),
  ];
  for (const s of walk(model.statements)) {
    if (s.kind === 'message' || s.kind === 'note') out.push(s.text);
    else if (s.kind === 'fragment') for (const section of s.sections) out.push(section.label);
  }
  return out;
}
