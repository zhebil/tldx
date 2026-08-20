/**
 * Real `LayoutPort` adapter on top of `elkjs`. The pure compiler core
 * (`domain/`) depends on the port; this adapter is the only place in the
 * codebase that may import `elkjs` (lint-enforced by both eslint
 * `no-restricted-imports` and dependency-cruiser).
 *
 * `layout(ir)` just runs `hybridLayout` (`domain/layout/stack.ts`), which
 * does all the tree walking, sizing, and deterministic row/col/grid/free
 * placement itself; this adapter supplies only the `AutoPlacer` that
 * `hybridLayout` calls for a container whose `layout="auto"`.
 *
 * `placeAuto` builds ONE flat ELK graph per call: a synthetic root with one
 * fixed-size leaf node per requested node (sizes come pre-computed from the
 * domain - ELK is not asked to size or route anything hierarchical) and one
 * `ElkExtendedEdge` per requested edge, purely as topology hints for node
 * placement. The routed edge geometry ELK computes is discarded; the MVP
 * emit pipeline only consumes node positions.
 *
 * Determinism: the contract requires `layout(ir)` to be deterministic on the
 * same input. ELK's layered algorithm is deterministic given the same input
 * graph and options; we never rely on insertion order for randomness.
 */

import ElkConstructor, {
  type ELK,
  type ElkExtendedEdge,
  type ElkNode,
  type LayoutOptions,
} from "elkjs";

import type { IRDoc, IRDocPositioned } from "../../domain/ir/index.js";
import { DEFAULT_DIRECTION } from "../../domain/layout/defaults.js";
import {
  hybridLayout,
  type AutoPlaceRequest,
  type AutoPlaceResult,
} from "../../domain/layout/stack.js";
import type { LayoutPort } from "../../domain/ports/layout.js";

const ROOT_ID = "__root__";

export interface ElkLayoutAdapterOptions {
  /**
   * Override the ELK constructor. Tests may use this to inject a different
   * worker setup; production code should leave it unset.
   */
  elkFactory?: () => ELK;
}

export class ElkLayoutAdapter implements LayoutPort {
  private readonly elk: ELK;

  constructor(options: ElkLayoutAdapterOptions = {}) {
    const factory = options.elkFactory ?? (() => new ElkConstructor());
    this.elk = factory();
  }

  async layout(ir: IRDoc): Promise<IRDocPositioned> {
    return hybridLayout(ir, (req) => this.placeAuto(req));
  }

  private async placeAuto(req: AutoPlaceRequest): Promise<AutoPlaceResult> {
    if (req.nodes.length === 0) {
      return {
        positions: new Map(),
        w: req.padLeft + req.padRight,
        h: req.padTop + req.padBottom,
      };
    }

    const layoutOptions: LayoutOptions = {
      "elk.algorithm": "layered",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.direction": req.direction ?? DEFAULT_DIRECTION,
      "elk.spacing.nodeNode": String(req.gap),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(Math.round(req.gap * 1.5)),
      "elk.padding": `[top=${req.padTop},left=${req.padLeft},bottom=${req.padBottom},right=${req.padRight}]`,
    };

    const children: ElkNode[] = req.nodes.map((n) => ({
      id: n.id,
      width: n.w,
      height: n.h,
    }));
    const edges: ElkExtendedEdge[] = req.edges.map((e, i) => ({
      id: `e${i}`,
      sources: [e.from],
      targets: [e.to],
    }));

    const graph: ElkNode = { id: ROOT_ID, layoutOptions, children, edges };
    const result = await this.elk.layout(graph);

    const positions = new Map<string, { x: number; y: number }>();
    for (const c of result.children ?? []) {
      positions.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });
    }

    return {
      positions,
      w: result.width ?? req.padLeft + req.padRight,
      h: result.height ?? req.padTop + req.padBottom,
    };
  }
}
