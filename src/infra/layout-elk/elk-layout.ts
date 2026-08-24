/**
 * Real `LayoutPort` adapter on `elkjs`, and the only place in the codebase
 * allowed to import it (lint-enforced).
 *
 * `hybridLayout` does the tree walking, sizing and row/col/grid/free
 * placement; this adapter supplies only the `AutoPlacer` it calls for a
 * container with `layout="auto"`. `placeAuto` builds one flat ELK graph of
 * pre-sized leaf nodes per call, using edges purely as placement hints - the
 * routed edge geometry ELK returns is discarded.
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
      "elk.spacing.componentComponent": String(req.gap),
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
