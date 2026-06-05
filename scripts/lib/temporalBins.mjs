// AUDIT-9 — temporal-bin bifurcation detector (pure, unit-testable).
//
// Pre-registered in docs/AUDIT9_PRE_REGISTERED_GATE.md. The #238 aggregate
// (3800/4309 ≈ 88%) POOLED a Phase-1 → Phase-2 bifurcation into one rate. This
// surfaces the bifurcation the aggregate hides, by binning the per-event
// reached-pick stream into fixed-width, run-start-aligned buckets and detecting
// a sustained collapse.
//
// LOCKED design (the gate; do not reshape here):
//   §A1  bucket width 5 min, RUN-START-aligned (B[0] opens at the first event
//        timestamp; B[i] at B[0]+i·5min). NOT clock-aligned (forbidden).
//   §A2  bifurcation DETECTED iff ∃ b≥1 with B[b-1].reached_pick > 0 AND
//        B[b+i].reached_pick == 0 ∀ i∈[0,K-1], K=2. First such b = onset;
//        B[b-1] = anchor (immediately preceding, strict).
//   §A2-REV2  emit ALL onset bucket indices (bifurcation_onset_buckets), in
//        order, even though the verdict is first-onset-only.
//
// Pure: no I/O. The analyzer owns event extraction + verdict routing.

export const AUDIT9_BUCKET_MS = 5 * 60 * 1000; // §A1: 5 minutes
export const AUDIT9_K = 2;                      // §A2: consecutive zero buckets

/**
 * @param {Array<{ at: string, reachedPick: boolean }>} events
 *   `at` = ISO timestamp; `reachedPick` = the event reached the pick step
 *   (NOT a pre-pick-skip). Events with an unparseable `at` are ignored — a
 *   ledger with no parseable timestamps (e.g. synthetic `at:'t'` fixtures)
 *   yields `applicable:false`, so the temporal verdict never fires there.
 * @param {{ bucketMs?: number, K?: number }} [opts]
 * @returns {{
 *   applicable: boolean, detected: boolean, bucketMs: number, K: number,
 *   nBuckets: number, anchorBucket: (number|null), firstOnsetBucket: (number|null),
 *   bifurcation_onset_buckets: number[],
 *   buckets: Array<{ index: number, reachedPick: number, total: number }>
 * }}
 */
export function temporalBifurcation(events, opts = {}) {
  const bucketMs = opts.bucketMs ?? AUDIT9_BUCKET_MS;
  const K = opts.K ?? AUDIT9_K;

  const valid = (events || [])
    .map((e) => ({ ts: Date.parse(e && e.at), reachedPick: !!(e && e.reachedPick) }))
    .filter((e) => Number.isFinite(e.ts))
    .sort((a, b) => a.ts - b.ts);

  const empty = {
    applicable: false, detected: false, bucketMs, K, nBuckets: 0,
    anchorBucket: null, firstOnsetBucket: null, bifurcation_onset_buckets: [], buckets: [],
  };
  if (valid.length === 0) return empty;

  const runStart = valid[0].ts;
  const runEnd = valid[valid.length - 1].ts;
  const nBuckets = Math.max(1, Math.floor((runEnd - runStart) / bucketMs) + 1);

  const buckets = Array.from({ length: nBuckets }, (_, i) => ({ index: i, reachedPick: 0, total: 0 }));
  for (const e of valid) {
    const b = Math.min(nBuckets - 1, Math.floor((e.ts - runStart) / bucketMs));
    buckets[b].total++;
    if (e.reachedPick) buckets[b].reachedPick++;
  }

  // §A2: onset = first index of each sustained ≥K zero-run that is immediately
  // preceded by a reached_pick>0 bucket. The strict anchor (B[b-1]>0) means
  // each sustained zero-run contributes exactly one onset (its first bucket);
  // a cold-start zero streak with no Phase-1 anchor never fires.
  const onsets = [];
  for (let b = 1; b + K - 1 < nBuckets; b++) {
    if (buckets[b - 1].reachedPick <= 0) continue;
    let allZero = true;
    for (let i = 0; i < K; i++) {
      if (buckets[b + i].reachedPick !== 0) { allZero = false; break; }
    }
    if (allZero) onsets.push(b);
  }

  return {
    // need an anchor + K buckets for the criterion to be evaluable at all
    applicable: nBuckets >= K + 1,
    detected: onsets.length > 0,
    bucketMs, K, nBuckets,
    anchorBucket: onsets.length ? onsets[0] - 1 : null,
    firstOnsetBucket: onsets.length ? onsets[0] : null,
    bifurcation_onset_buckets: onsets,
    buckets,
  };
}
