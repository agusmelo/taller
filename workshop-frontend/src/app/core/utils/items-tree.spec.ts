import { JobItem } from '../models';
import { buildItemsTree, computeLineTotal } from './items-tree';

function item(partial: Partial<JobItem>): JobItem {
  return {
    id: '',
    job_id: 'job-1',
    description: '',
    quantity: 1,
    unit_price: 0,
    item_type: 'mano_de_obra',
    pricing_mode: null,
    supplier: null,
    parent_id: null,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

describe('buildItemsTree', () => {
  test('returns [] for empty input', () => {
    expect(buildItemsTree([])).toEqual([]);
  });

  test('flat-only list (no children) preserves order by sort_order', () => {
    const flat = [
      item({ id: 'b', sort_order: 2 }),
      item({ id: 'a', sort_order: 1 }),
    ];
    const tree = buildItemsTree(flat);
    expect(tree.map(n => n.id)).toEqual(['a', 'b']);
    expect(tree.every(n => n.children.length === 0)).toBe(true);
  });

  test('groups children under their parent, sorted by sort_order', () => {
    const flat = [
      item({ id: 'p1', sort_order: 0 }),
      item({ id: 'c2', parent_id: 'p1', sort_order: 1, unit_price: 800 }),
      item({ id: 'c1', parent_id: 'p1', sort_order: 0, unit_price: 1500 }),
    ];
    const tree = buildItemsTree(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map(c => c.id)).toEqual(['c1', 'c2']);
  });

  test('orphan children (parent missing from flat list) are dropped, not crashing', () => {
    const flat = [
      item({ id: 'p1', sort_order: 0 }),
      item({ id: 'orphan', parent_id: 'does-not-exist', unit_price: 99 }),
    ];
    const tree = buildItemsTree(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('p1');
    expect(tree[0].children).toEqual([]);
  });

  test('multiple parents with their own children', () => {
    const flat = [
      item({ id: 'p1', sort_order: 0 }),
      item({ id: 'p2', sort_order: 1 }),
      item({ id: 'c1', parent_id: 'p1', sort_order: 0 }),
      item({ id: 'c2', parent_id: 'p2', sort_order: 0 }),
    ];
    const tree = buildItemsTree(flat);
    expect(tree.map(n => n.id)).toEqual(['p1', 'p2']);
    expect(tree[0].children.map(c => c.id)).toEqual(['c1']);
    expect(tree[1].children.map(c => c.id)).toEqual(['c2']);
  });
});

describe('computeLineTotal', () => {
  test('parent without children: quantity * unit_price', () => {
    const node = { ...item({ quantity: 3, unit_price: 100 }), children: [] };
    expect(computeLineTotal(node)).toBe(300);
  });

  test('parent with children: sum of children unit_prices', () => {
    const node = {
      ...item({ quantity: 99, unit_price: 999 }),
      children: [
        item({ unit_price: 1500 }),
        item({ unit_price: 800 }),
      ],
    };
    expect(computeLineTotal(node)).toBe(2300);
  });

  test('handles string numerics safely', () => {
    const node = {
      ...item({ quantity: '2' as any, unit_price: '500.5' as any }),
      children: [],
    };
    expect(computeLineTotal(node)).toBe(1001);
  });
});
