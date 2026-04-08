function normalizeText(value, maxLength = 160) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.slice(0, maxLength);
}

function slugify(value) {
  return normalizeText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveExplicitFeedbackElement(startElement) {
  if (!startElement || typeof startElement.closest !== 'function') return null;
  return startElement.closest('[data-feedback-id]');
}

function resolveStableNodeElement(startElement) {
  if (!startElement || typeof startElement.closest !== 'function') return null;
  return startElement.closest('[data-node-card="1"], [data-node-id]');
}

function resolveInteractiveElement(startElement) {
  if (!startElement || typeof startElement.closest !== 'function') return null;
  return startElement.closest('button, [role="button"], a, input, textarea, select, label');
}

function getElementText(element) {
  if (!element) return '';
  const explicit = normalizeText(
    element.getAttribute?.('data-feedback-label')
    || element.getAttribute?.('aria-label')
    || element.getAttribute?.('title')
  );
  if (explicit) return explicit;

  const titleEl = element.querySelector?.('.card-title');
  if (titleEl) {
    const titleText = normalizeText(titleEl.textContent);
    if (titleText) return titleText;
  }

  return normalizeText(element.textContent, 200);
}

function buildSelectorHint(element) {
  if (!element) return '';
  const feedbackId = element.getAttribute?.('data-feedback-id');
  if (feedbackId) return `[data-feedback-id="${feedbackId}"]`;
  const nodeId = element.getAttribute?.('data-node-id');
  if (nodeId) return `[data-node-id="${nodeId}"]`;
  const tagName = String(element.tagName || '').toLowerCase();
  if (!tagName) return '';
  const ariaLabel = normalizeText(element.getAttribute?.('aria-label'));
  if (ariaLabel) {
    return `${tagName}[aria-label="${ariaLabel}"]`;
  }
  return tagName;
}

function escapeSelectorValue(value) {
  const raw = String(value || '');
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(raw);
  }
  return raw.replace(/["\\]/g, '\\$&');
}

export function findFeedbackTargetElement(startElement) {
  if (!(startElement instanceof Element)) return null;
  if (startElement.closest('[data-feedback-root="1"]')) return null;
  return (
    resolveExplicitFeedbackElement(startElement)
    || resolveStableNodeElement(startElement)
    || resolveInteractiveElement(startElement)
    || null
  );
}

export function captureFeedbackTargetContext(targetElement) {
  if (!(targetElement instanceof Element)) return null;

  const feedbackId = targetElement.getAttribute('data-feedback-id') || '';
  const nodeId = targetElement.getAttribute('data-node-id') || '';
  const text = getElementText(targetElement);
  const componentKey = feedbackId
    || (nodeId ? `node:${nodeId}` : `${String(targetElement.tagName || 'element').toLowerCase()}:${slugify(text || 'target')}`);
  const componentLabel = text
    || (feedbackId ? feedbackId.replace(/[-_]+/g, ' ') : (nodeId ? `Node ${nodeId}` : 'Selected item'));
  const rect = targetElement.getBoundingClientRect();

  return {
    componentKey,
    componentLabel,
    domHint: {
      feedbackId: feedbackId || null,
      nodeId: nodeId || null,
      selectorHint: buildSelectorHint(targetElement),
      tagName: String(targetElement.tagName || '').toLowerCase(),
      role: targetElement.getAttribute('role') || null,
      ariaLabel: targetElement.getAttribute('aria-label') || null,
      title: targetElement.getAttribute('title') || null,
      text: text || null,
      className: normalizeText(targetElement.className || '', 240) || null,
      bounds: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    },
  };
}

export function findElementFromDomHint(domHint = {}) {
  if (typeof document === 'undefined' || !domHint) return null;
  if (domHint.feedbackId) {
    const byFeedbackId = document.querySelector(`[data-feedback-id="${escapeSelectorValue(domHint.feedbackId)}"]`);
    if (byFeedbackId) return byFeedbackId;
  }
  if (domHint.nodeId) {
    const byNodeId = document.querySelector(`[data-node-id="${escapeSelectorValue(domHint.nodeId)}"]`);
    if (byNodeId) return byNodeId;
  }
  if (domHint.selectorHint) {
    try {
      return document.querySelector(domHint.selectorHint);
    } catch {
      return null;
    }
  }
  return null;
}
