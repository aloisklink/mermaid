/**
 * The statement-level stop sentinel every hand-written diagram parser repeats.
 */

/**
 * Thrown inside a parser after a diagnostic is recorded; caught at statement level. One
 * instance, so its stack is captured once.
 */
export class Stop extends Error {}
export const STOP: Stop = /* @__PURE__ */ new Stop();
