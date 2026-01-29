import { LAYOUT } from '../utils/constants';
import { shouldStackChildren, getMaxDepth, countNodes } from '../utils/treeUtils';

// Get node height based on display mode
export const getNodeH = (showThumbnails) => showThumbnails ? LAYOUT.NODE_H_THUMB : LAYOUT.NODE_H_COLLAPSED;

/**
 * Compute layout positions for all nodes
 * Returns: { nodes: Map<id, {x, y, w, h, depth, number}>, connectors: [], bounds: {w, h} }
 *
 * Orphan behavior is controlled via options:
 * - orphanMode: 'after-root' | 'after-tree'
 * - orphanStyle: 'root' | 'level1'
 * - renderOrphanChildren: boolean (kept false by default; see note inside)
 */
export const computeLayout = (
  root,
  orphans,
  showThumbnails,
  expandedStacks = {},
  options = {}
) => {
  const NODE_H = getNodeH(showThumbnails);
  const {
    NODE_W,
    GAP_L1_X,
    GAP_STACK_Y,
    INDENT_X,
    BUS_Y_GAP,
    ORPHAN_GROUP_GAP,
    STROKE_PAD_X,
    ROOT_Y,
  } = LAYOUT;

  const {
    orphanMode = "after-root",     // 'after-root' or 'after-tree'
    orphanStyle = "root",          // 'root' or 'level1'
    renderOrphanChildren = false,  // leave false until you explicitly want mini-trees
  } = options;

  const nodes = new Map();
  const connectors = [];

  if (!root) return { nodes, connectors, bounds: { w: 0, h: 0 } };

  // Bus line position: midpoint between root bottom and Level 1 top
  // This gives equal visual space above and below the horizontal bus
  const BUS_MIDPOINT_RATIO = 0.5; // bus at 50% of the gap

  // ------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------

  const setNode = (node, x, y, depth, number, extra = {}) => {
    nodes.set(node.id, {
      x,
      y,
      w: NODE_W,
      h: NODE_H,
      depth,
      number,
      node,
      ...extra,
    });
  };

  // Calculate subtree width (how far right the deepest child extends from parent's x)
  // This is used to prevent horizontal overlap between Level 1 siblings
  const getSubtreeWidth = (node, depth) => {
    if (!node.children?.length) {
      return NODE_W; // Just the node itself
    }

    // Find the maximum width among all children's subtrees
    let maxChildWidth = 0;
    node.children.forEach(child => {
      const childSubtreeWidth = getSubtreeWidth(child, depth + 1);
      maxChildWidth = Math.max(maxChildWidth, childSubtreeWidth);
    });

    // Total width = parent width OR (indent + max child subtree width)
    return Math.max(NODE_W, INDENT_X + maxChildWidth);
  };

  const getRootTreeWidth = (node) => {
    if (!node?.children?.length) return NODE_W;
    const totalChildWidth = node.children.reduce((sum, child) => (
      sum + getSubtreeWidth(child, 1)
    ), 0);
    const gaps = GAP_L1_X * Math.max(node.children.length - 1, 0);
    return Math.max(NODE_W, totalChildWidth + gaps);
  };

  // Layout children vertically under a parent node
  // Returns total height consumed by this subtree.
  const layoutVertical = (parentNode, parentDepth, numberPrefix, context = {}) => {
    const parentLayout = nodes.get(parentNode.id);
    if (!parentLayout) return NODE_H;

  const shouldStack = shouldStackChildren(parentNode.children, parentDepth);
    const isExpanded = !!expandedStacks[parentNode.id];

    // If no children: subtree is just the parent card
    if (!parentNode.children?.length) {
      return NODE_H;
    }

    const parentX = parentLayout.x;
    const parentY = parentLayout.y;
    const childX = parentX + INDENT_X;
    let cursorY = parentY + NODE_H + GAP_STACK_Y;

    if (shouldStack && !isExpanded) {
      const stackChild = parentNode.children[0];
      if (!stackChild) return NODE_H;
      const childNumber = `${numberPrefix}.1`;
      setNode(stackChild, childX, cursorY, parentDepth + 1, childNumber, {
        ...context,
        stackInfo: {
          parentId: parentNode.id,
          totalCount: parentNode.children.length,
          collapsed: true,
        },
      });

      const spineX = parentX + STROKE_PAD_X;
      const tickY = cursorY + NODE_H / 2;
      connectors.push({
        type: "vertical-spine",
        x1: spineX,
        y1: parentY + NODE_H,
        x2: spineX,
        y2: tickY,
      });
      connectors.push({
        type: "horizontal-tick",
        x1: spineX,
        y1: tickY,
        x2: childX,
        y2: tickY,
      });

      cursorY += NODE_H + GAP_STACK_Y;
      const total = cursorY - parentY - GAP_STACK_Y;
      return Math.max(NODE_H, total);
    }

    const childIdsInOrder = [];

    parentNode.children.forEach((child, idx) => {
      const childNumber = `${numberPrefix}.${idx + 1}`;
      const stackInfo = shouldStack
        ? {
            parentId: parentNode.id,
            totalCount: parentNode.children.length,
            expanded: true,
            showCollapse: idx === 0 || idx === parentNode.children.length - 1,
          }
        : null;
      setNode(child, childX, cursorY, parentDepth + 1, childNumber, stackInfo ? { ...context, stackInfo } : { ...context });

      childIdsInOrder.push(child.id);

      const childSubtreeH = layoutVertical(child, parentDepth + 1, childNumber, context);
      cursorY += childSubtreeH + GAP_STACK_Y;
    });

    // Connectors: vertical spine + horizontal ticks
    if (childIdsInOrder.length) {
      const spineX = parentX + STROKE_PAD_X;
      const spineStartY = parentY + NODE_H;
      const lastChild = nodes.get(childIdsInOrder[childIdsInOrder.length - 1]);
      const spineEndY = lastChild.y + NODE_H / 2;

      connectors.push({
        type: "vertical-spine",
        x1: spineX,
        y1: spineStartY,
        x2: spineX,
        y2: spineEndY,
      });

      childIdsInOrder.forEach((cid) => {
        const c = nodes.get(cid);
        const tickY = c.y + NODE_H / 2;
        connectors.push({
          type: "horizontal-tick",
          x1: spineX,
          y1: tickY,
          x2: c.x, // end at child left edge
          y2: tickY,
        });
      });
    }

    // total height is from parentY to end of last child subtree (minus last GAP_STACK_Y)
    const total = cursorY - parentY - GAP_STACK_Y;
    return Math.max(NODE_H, total);
  };

  const allOrphans = Array.isArray(orphans) ? orphans.filter(Boolean) : [];
  const subdomainOrphans = allOrphans.filter((o) => o.subdomainRoot);
  const regularOrphans = allOrphans.filter((o) => !o.subdomainRoot);

  const layoutRootTree = (rootNode, startX, startY, rootNumber, extra = {}) => {
    const context = {
      isSubdomainTree: extra.orphanType === 'subdomain' || extra.isSubdomainTree || false,
      orphanType: extra.orphanType || null,
    };
    setNode(rootNode, startX, startY, 0, rootNumber, { ...extra, ...context });

    const rootBottomY = startY + NODE_H;
    const level1Y = rootBottomY + BUS_Y_GAP;
    const level1Positions = [];
    let level1X = startX;

    if (rootNode.children?.length) {
      rootNode.children.forEach((child, idx) => {
        const childNumber = `${rootNumber}.${idx + 1}`;
        setNode(child, level1X, level1Y, 1, childNumber, context);

        level1Positions.push({
          centerX: level1X + NODE_W / 2,
          y: level1Y,
          id: child.id,
        });

        layoutVertical(child, 1, childNumber, context);

        const subtreeWidth = getSubtreeWidth(child, 1);
        level1X += subtreeWidth + GAP_L1_X;
      });

      if (level1Positions.length > 0) {
        const rootCenterX = startX + NODE_W / 2;
        const busY = rootBottomY + BUS_Y_GAP * BUS_MIDPOINT_RATIO;

        connectors.push({
          type: "root-drop",
          x1: rootCenterX,
          y1: rootBottomY,
          x2: rootCenterX,
          y2: busY,
        });

        const leftX = Math.min(rootCenterX, level1Positions[0].centerX);
        const rightX = Math.max(rootCenterX, level1Positions[level1Positions.length - 1].centerX);

        connectors.push({
          type: "horizontal-bus",
          x1: leftX,
          y1: busY,
          x2: rightX,
          y2: busY,
        });

        level1Positions.forEach((pos) => {
          connectors.push({
            type: "bus-drop",
            x1: pos.centerX,
            y1: busY,
            x2: pos.centerX,
            y2: level1Y,
          });
        });
      }
    }

    return getRootTreeWidth(rootNode);
  };

  // ------------------------------------------------------------
  // 1) Root (Home)
  // ------------------------------------------------------------
  const subdomainWidths = subdomainOrphans.map((orphan) => getRootTreeWidth(orphan));
  const subdomainTotalWidth = subdomainWidths.length
    ? subdomainWidths.reduce((sum, width) => sum + width, 0)
      + GAP_L1_X * Math.max(subdomainWidths.length - 1, 0)
    : 0;
  const orphanWidths = regularOrphans.map((orphan) => getRootTreeWidth(orphan));
  const orphanTotalWidth = orphanWidths.length
    ? orphanWidths.reduce((sum, width) => sum + width, 0)
      + GAP_L1_X * Math.max(orphanWidths.length - 1, 0)
    : 0;
  const leftGroupCount = (subdomainTotalWidth > 0 ? 1 : 0) + (orphanTotalWidth > 0 ? 1 : 0);
  const gapsBetweenLeftGroups = GAP_L1_X * Math.max(leftGroupCount - 1, 0);
  const rootGap = (subdomainTotalWidth > 0 || orphanTotalWidth > 0) ? GAP_L1_X : 0;
  const rootX = subdomainTotalWidth + orphanTotalWidth + gapsBetweenLeftGroups + rootGap;
  const rootY = ROOT_Y;

  // Root = "0" (Home)
  setNode(root, rootX, rootY, 0, "0", { isOrphan: false });

  // ------------------------------------------------------------
  // 2) Level 1 row (children of root) — horizontal only
  // ------------------------------------------------------------
  const rootBottomY = rootY + NODE_H;
  const level1Y = rootBottomY + BUS_Y_GAP;

  const level1Positions = [];
  let level1X = rootX;
  let maxTreeHeight = NODE_H;

  if (root.children?.length) {
    root.children.forEach((child, idx) => {
      const childNumber = `${idx + 1}`; // Level 1 = 1, 2, 3, etc.
      setNode(child, level1X, level1Y, 1, childNumber);

      level1Positions.push({
        centerX: level1X + NODE_W / 2,
        y: level1Y,
        id: child.id,
      });

      // Vertical subtree under each Level 1 node
      const branchH = layoutVertical(child, 1, childNumber);
      maxTreeHeight = Math.max(maxTreeHeight, (level1Y - rootY) + branchH);

      // Use subtree width to prevent horizontal overlap
      const subtreeWidth = getSubtreeWidth(child, 1);
      level1X += subtreeWidth + GAP_L1_X;
    });

    // Root-to-Level1 connectors (vertical drop + horizontal bus + drops)
    if (level1Positions.length > 0) {
      const rootCenterX = rootX + NODE_W / 2;
      const busY = rootBottomY + BUS_Y_GAP * BUS_MIDPOINT_RATIO;

      connectors.push({
        type: "root-drop",
        x1: rootCenterX,
        y1: rootBottomY,
        x2: rootCenterX,
        y2: busY,
      });

      const leftX = Math.min(rootCenterX, level1Positions[0].centerX);
      const rightX = Math.max(rootCenterX, level1Positions[level1Positions.length - 1].centerX);

      connectors.push({
        type: "horizontal-bus",
        x1: leftX,
        y1: busY,
        x2: rightX,
        y2: busY,
      });

      level1Positions.forEach((pos) => {
        connectors.push({
          type: "bus-drop",
          x1: pos.centerX,
          y1: busY,
          x2: pos.centerX,
          y2: level1Y,
        });
      });
    }
  }

  // ------------------------------------------------------------
  // 3) Orphans (left of root)
  // ------------------------------------------------------------

  // Main tree right edge (based on actual L1 width; if no children, it's just root)
  const mainTreeRightEdge =
    root.children?.length
      ? (level1X - GAP_L1_X + NODE_W)  // last L1 node right edge
      : (rootX + NODE_W);

  // Where do orphans start?
  // - after-root: start on root row, *one full node-slot* to the right of root
  //              (so 0.1 doesn't feel glued to 0.0)
  // - after-tree: start after the main tree right edge with ORPHAN_GROUP_GAP
  let orphanY = rootY;
  const orphanGroupStartX = 0;
  let orphanX = orphanGroupStartX;

  const orderedOrphans = [...regularOrphans].reverse();
  const orphanCount = orderedOrphans.length;
  orderedOrphans.forEach((orphan, idx) => {
    const depth = orphanStyle === "level1" ? 1 : 0;
    const count = orphanCount - idx;
    const num = orphanStyle === "level1" ? `1.o${count}` : `0.${count}`;
    const treeWidth = layoutRootTree(orphan, orphanX, orphanY, num, {
      isOrphan: true,
      orphanStyle,
      orphanType: orphan.orphanType || 'orphan',
    });
    orphanX += treeWidth + GAP_L1_X;
  });

  // ------------------------------------------------------------
  // 4) Subdomains (left of root, closer to main tree)
  // ------------------------------------------------------------
  if (subdomainOrphans.length > 0) {
    let subdomainX = orphanTotalWidth > 0 ? orphanTotalWidth + GAP_L1_X : 0;
    const orderedSubdomains = [...subdomainOrphans].reverse();
    const subdomainCount = orderedSubdomains.length;
    orderedSubdomains.forEach((orphan, idx) => {
      const num = `s${subdomainCount - idx}`;
      const treeWidth = layoutRootTree(orphan, subdomainX, rootY, num, {
        isOrphan: true,
        orphanStyle: 'subdomain',
        orphanType: 'subdomain',
      });
      subdomainX += treeWidth + GAP_L1_X;
    });
  }

  // ------------------------------------------------------------
  // Bounds
  // ------------------------------------------------------------
  const all = Array.from(nodes.values());
  const maxX = Math.max(...all.map((n) => n.x + n.w), NODE_W);
  const maxY = Math.max(...all.map((n) => n.y + n.h), NODE_H);

  return {
    nodes,
    connectors,
    bounds: { w: maxX + 50, h: maxY + 50 }, // light padding
  };
};
