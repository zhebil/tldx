/**
 * Synthetic ids for non-addressable IR elements: `<content-hash>-<n>`, where
 * the hash is FNV-1a 32-bit over `kind + ":" + key fields` and `n` is the
 * 0-based occurrence index among elements with the same hash, in document
 * order. Reordering siblings of differing content never changes an id.
 */

export function contentHash(kind: string, fields: readonly string[]): string {
  return fnv1a32(`${kind}:${fields.join(" ")}`);
}

export class SyntheticIdAllocator {
  private readonly counts = new Map<string, number>();

  allocate(hash: string): string {
    const next = this.counts.get(hash) ?? 0;
    this.counts.set(hash, next + 1);
    return `${hash}-${next}`;
  }
}

function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
