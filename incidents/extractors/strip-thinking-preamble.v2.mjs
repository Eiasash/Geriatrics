/* strip-thinking-preamble@v2

   v1 SILENTLY DELETED CONTENT. Found by the non-Claude oracle, reproduced immediately:

     stripThinkingPreamble('Finding A\nFinding B')  ->  'Finding B'
     'Opening paragraph.\n\nSecond.\n\nThird.'      ->  'Second.\n\nThird.'

   v1 walked lines looking for a repeat, and when it found none it still advanced past the
   first line. So any message WITHOUT a duplicated preamble lost its opening paragraph. And
   because the rendered source is windowed - gone within about two minutes - the omission is
   unrecoverable: persisting the extractor's OUTPUT cannot restore a finding it never emitted.
   The committed capture chat-2026-09-19T160601Z.txt is missing its opening paragraph for
   exactly this reason, and neither my digest nor the chat lane's independent read caught it,
   because both checked the text that survived rather than whether anything had been removed.

   v2 CHANGES THE DEFAULT. The preamble is dropped only when one is POSITIVELY IDENTIFIED -
   an adjacent repeat of the same line at the top of the node. Anything else is returned
   whole. Uncertain input is returned intact rather than trimmed, because the failure modes
   are not symmetric: a retained preamble is visible noise that anyone can spot, while a
   removed finding is invisible and permanent.

   It also reports what it did, so a caller can record the decision instead of inferring it. */

export const VERSION = 'strip-thinking-preamble@v2';

export function extract(nodeText) {
  const lines = nodeText.split('\n');

  /* Identify the preamble positively: consecutive non-empty lines at the very top where a
     line repeats one already seen in that run. Stop at the first line that does not. */
  const seen = new Set();
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    const k = lines[i].trim().replace(/\.$/, '');
    if (!k) continue;
    if (seen.has(k)) { end = i; seen.add(k); continue; }
    if (seen.size === 0) { seen.add(k); continue; }
    break;
  }

  if (end < 0) {
    return { text: nodeText.trim(), preambleFound: false, linesDropped: 0, version: VERSION };
  }
  return {
    text: lines.slice(end + 1).join('\n').trim(),
    preambleFound: true,
    linesDropped: end + 1,
    version: VERSION
  };
}

/* v1-compatible shape for callers that only want the string. Kept deliberately so the
   difference from v1 is a behaviour change at the same call site, not a silent swap. */
export function stripThinkingPreamble(nodeText) {
  return extract(nodeText).text;
}
