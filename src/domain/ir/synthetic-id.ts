/**
 * Synthetic id scheme for non-addressable IR elements (ADR-12).
 *
 * Form: `<content-hash>-<n>` where:
 * - `content-hash` is FNV-1a 32-bit (8 hex chars) over `kind + ":" + key fields`.
 * - `n` is the 0-based occurrence index among elements with the same hash,
 *   computed in document order.
 *
 * Reordering siblings of differing content does not change any synthetic id.
 * The only ids that shift are those of identical anonymous elements when
 * they're reordered relative to each other - which is semantically a no-op.
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
