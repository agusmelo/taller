import { JobItem, JobItemNode } from '../models';

/**
 * Reassemble a flat list of job items (parents + children mixed) into the
 * client-side tree shape expected by the items table UI. Children whose
 * parent_id does not match any visible root row are dropped.
 */
export function buildItemsTree(flat: JobItem[]): JobItemNode[] {
  const parents = flat
    .filter(i => !i.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(p => ({ ...p, children: [] as JobItem[] }));
  const byId = new Map(parents.map(p => [p.id, p]));
  for (const item of flat) {
    if (item.parent_id && byId.has(item.parent_id)) {
      byId.get(item.parent_id)!.children.push(item);
    }
  }
  for (const p of parents) {
    p.children.sort((a, b) => a.sort_order - b.sort_order);
  }
  return parents;
}

/**
 * Per-row total, mirroring groupLineTotal in the backend's jobsController:
 *
 *  - 'detallado' group with children: sum of the children's unit prices (the
 *    parent's own unit_price is ignored).
 *  - 'agregado' group: the parent's own quantity * unit_price — the shop only
 *    knows the group total, so children carry descriptions and no prices.
 *  - no children: a single priced line, quantity * unit_price, either way.
 */
export function computeLineTotal(node: JobItemNode): number {
  const detailed = node.pricing_mode !== 'agregado';
  if (detailed && node.children.length > 0) {
    return node.children.reduce((s, c) => s + Number(c.unit_price), 0);
  }
  return Number(node.quantity) * Number(node.unit_price);
}
