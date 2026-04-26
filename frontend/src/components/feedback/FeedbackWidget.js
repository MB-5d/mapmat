import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Crosshair,
  MessageSquarePlus,
  X,
} from 'lucide-react';

import * as api from '../../api';
import Button from '../ui/Button';
import CheckboxField from '../ui/CheckboxField';
import IconButton from '../ui/IconButton';
import TextareaInput from '../ui/TextareaInput';
import { trackEvent } from '../../utils/analytics';
import {
  captureFeedbackTargetContext,
  findElementFromDomHint,
  findFeedbackTargetElement,
} from '../../utils/feedback';
import { ROUTE_SURFACES } from '../../utils/appRoutes';

const INTENT_OPTIONS = [
  { value: 'broken', label: 'Broken' },
  { value: 'confusing', label: 'Confusing' },
  { value: 'idea', label: 'Idea' },
  { value: 'like', label: 'Like' },
  { value: 'dislike', label: 'Dislike' },
];

const SCOPE_OPTIONS = [
  { value: 'whole_app', label: 'Whole app' },
  { value: 'flow', label: 'This flow' },
  { value: 'specific_thing', label: 'Specific thing' },
];

function getActiveSurfaceList(activeSurfaces = {}) {
  return Object.entries(activeSurfaces)
    .filter(([, isActive]) => !!isActive)
    .map(([surface]) => surface);
}

function renderSelectedTargetLabel(selectedTarget) {
  if (!selectedTarget?.componentLabel) return 'Selected item';
  return selectedTarget.componentLabel;
}

export default function FeedbackWidget({
  currentRoute,
  currentUser,
  currentMapId = null,
  activeSurfaces = {},
  showToast,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [intent, setIntent] = useState('');
  const [scope, setScope] = useState('');
  const [rating, setRating] = useState(null);
  const [message, setMessage] = useState('');
  const [allowFollowUp, setAllowFollowUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isSelectingTarget, setIsSelectingTarget] = useState(false);
  const [hoverTarget, setHoverTarget] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const widgetRootRef = useRef(null);
  const selectedElementRef = useRef(null);
  const isVisible = currentRoute?.surface === ROUTE_SURFACES.APP && !!currentUser?.id;

  const routeContext = useMemo(() => ({
    surface: currentRoute?.surface || ROUTE_SURFACES.APP,
    routePath: currentRoute?.pathname || window.location.pathname,
    routeSection: currentRoute?.section || 'home',
    mapId: currentMapId || currentRoute?.mapId || null,
    shareId: currentRoute?.shareId || null,
  }), [currentMapId, currentRoute]);

  useEffect(() => {
    if (!isVisible) {
      setIsOpen(false);
      setIsSelectingTarget(false);
    }
  }, [isVisible]);

  useEffect(() => {
    if (!isSelectingTarget) return undefined;

    const handlePointerMove = (event) => {
      const nextTarget = findFeedbackTargetElement(event.target);
      if (!nextTarget) {
        setHoverTarget(null);
        return;
      }
      const context = captureFeedbackTargetContext(nextTarget);
      setHoverTarget(context ? { ...context, element: nextTarget } : null);
    };

    const handleClick = (event) => {
      const nextTarget = findFeedbackTargetElement(event.target);
      if (!nextTarget) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const context = captureFeedbackTargetContext(nextTarget);
      selectedElementRef.current = nextTarget;
      setSelectedTarget(context);
      setHoverTarget(context ? { ...context, element: nextTarget } : null);
      setIsSelectingTarget(false);
      setScope('specific_thing');
      setIsOpen(true);
      showToast?.(`Selected ${context?.componentLabel || 'item'} for feedback`, 'info');
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsSelectingTarget(false);
        setHoverTarget(null);
      }
    };

    document.body.classList.add('feedback-selecting-target');
    document.addEventListener('pointermove', handlePointerMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.body.classList.remove('feedback-selecting-target');
      document.removeEventListener('pointermove', handlePointerMove, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      setHoverTarget(null);
    };
  }, [isSelectingTarget, showToast]);

  if (!isVisible) return null;

  const resetForm = () => {
    setIntent('');
    setScope('');
    setRating(null);
    setMessage('');
    setAllowFollowUp(false);
    setError('');
    setSelectedTarget(null);
    selectedElementRef.current = null;
    setIsSelectingTarget(false);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setError('');
    trackEvent('feedback_opened', {
      route_section: routeContext.routeSection,
    });
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsSelectingTarget(false);
    setError('');
  };

  const handlePickSpecificThing = () => {
    setScope('specific_thing');
    setError('');
    setIsSelectingTarget(true);
    setIsOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const trimmedMessage = String(message || '').trim();
    if (!intent) {
      setError('Choose a feedback type.');
      return;
    }
    if (!scope) {
      setError('Choose a scope.');
      return;
    }
    if (!trimmedMessage) {
      setError('Tell us what happened.');
      return;
    }

    if (scope === 'specific_thing' && !selectedTarget) {
      setError('Pick the thing on screen you want to reference.');
      return;
    }

    setSubmitting(true);

    try {
      let screenshotDataUrl = null;
      if (scope === 'specific_thing' && selectedTarget?.domHint) {
        const targetElement = selectedElementRef.current?.isConnected
          ? selectedElementRef.current
          : findElementFromDomHint(selectedTarget.domHint);

        if (targetElement) {
          try {
            const { toPng } = await import('html-to-image');
            screenshotDataUrl = await toPng(targetElement, {
              cacheBust: true,
              pixelRatio: 1,
              skipFonts: true,
              backgroundColor: 'var(--color-neutral-white)',
              filter: (node) => !node.closest?.('[data-feedback-root="1"]'),
            });
          } catch (captureError) {
            console.warn('Feedback screenshot capture failed', captureError);
          }
        }
      }

      await api.submitFeedback({
        intent,
        scope,
        rating,
        message: trimmedMessage,
        allowFollowUp,
        surface: routeContext.surface,
        routePath: routeContext.routePath,
        routeSection: routeContext.routeSection,
        mapId: routeContext.mapId,
        shareId: routeContext.shareId,
        componentKey: selectedTarget?.componentKey || null,
        componentLabel: selectedTarget?.componentLabel || null,
        domHint: selectedTarget?.domHint || null,
        context: {
          activeSurfaces: getActiveSurfaceList(activeSurfaces),
          pageUrl: `${window.location.pathname}${window.location.search}`,
        },
        screenshotDataUrl,
      });

      trackEvent('feedback_submitted', {
        intent,
        scope,
        has_rating: rating ? 'yes' : 'no',
        route_section: routeContext.routeSection,
        has_target: selectedTarget ? 'yes' : 'no',
      });

      showToast?.('Thanks. Feedback captured.', 'success');
      resetForm();
      setIsOpen(false);
    } catch (submitError) {
      setError(submitError.message || 'Failed to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {isSelectingTarget && hoverTarget?.domHint?.bounds ? (
        <div
          className="feedback-target-highlight"
          style={{
            left: hoverTarget.domHint.bounds.left,
            top: hoverTarget.domHint.bounds.top,
            width: hoverTarget.domHint.bounds.width,
            height: hoverTarget.domHint.bounds.height,
          }}
        >
          <div className="feedback-target-tooltip">
            <Crosshair size={14} />
            <span>{renderSelectedTargetLabel(hoverTarget)}</span>
          </div>
        </div>
      ) : null}

      <div className="feedback-widget" ref={widgetRootRef} data-feedback-root="1">
        {!isOpen ? (
          <button
            type="button"
            className="feedback-widget-tab"
            onClick={handleOpen}
            aria-label="Open feedback drawer"
          >
            <span className="feedback-widget-tab-label">Feedback</span>
            <span className="feedback-widget-tab-icon" aria-hidden="true">
              <MessageSquarePlus size={14} />
            </span>
          </button>
        ) : null}

        {isOpen ? (
          <aside className="feedback-drawer" role="dialog" aria-label="Feedback drawer">
            <div className="feedback-drawer-header">
              <div>
                <div className="feedback-drawer-title">Feedback</div>
                <div className="feedback-drawer-subtitle">Share what felt good, off, or broken.</div>
              </div>
              <IconButton
                className="feedback-drawer-close"
                size="lg"
                variant="ghost"
                icon={<X />}
                label="Close feedback drawer"
                onClick={handleClose}
              />
            </div>

            <form className="feedback-drawer-body" onSubmit={handleSubmit}>
              <section className="feedback-field-group">
                <div className="feedback-label">Type</div>
                <div className="feedback-chip-grid">
                  {INTENT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`feedback-chip ${intent === option.value ? 'is-active' : ''}`}
                      onClick={() => setIntent(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="feedback-field-group">
                <div className="feedback-label">Scope</div>
                <div className="feedback-chip-grid">
                  {SCOPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`feedback-chip ${scope === option.value ? 'is-active' : ''}`}
                      onClick={() => {
                        setScope(option.value);
                        if (option.value === 'specific_thing') {
                          setError('');
                        }
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {scope === 'specific_thing' ? (
                  <div className="feedback-target-row">
                    <button
                      type="button"
                      className="feedback-target-picker"
                      onClick={handlePickSpecificThing}
                    >
                      <Crosshair size={16} />
                      <span>{selectedTarget ? 'Change selected thing' : 'Pick something on screen'}</span>
                    </button>
                    {selectedTarget ? (
                      <div className="feedback-target-selected">
                        <CheckCircle2 size={14} />
                        <span>{renderSelectedTargetLabel(selectedTarget)}</span>
                      </div>
                    ) : (
                      <div className="feedback-target-hint">Pick the specific control, node, or panel you mean.</div>
                    )}
                  </div>
                ) : null}
              </section>

              <section className="feedback-field-group">
                <div className="feedback-label">Satisfaction</div>
                <div className="feedback-rating-row" role="radiogroup" aria-label="Optional satisfaction rating">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`feedback-rating-pill ${rating === value ? 'is-active' : ''}`}
                      onClick={() => setRating((current) => (current === value ? null : value))}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </section>

              <section className="feedback-field-group">
                <label className="feedback-label" htmlFor="feedback-message">Tell us more</label>
                <TextareaInput
                  id="feedback-message"
                  className="feedback-textarea"
                  size="lg"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="What happened, what you expected, or what felt unclear."
                  rows={6}
                  maxLength={4000}
                />
              </section>

              <CheckboxField
                className="feedback-checkbox-row"
                checked={allowFollowUp}
                onChange={(event) => setAllowFollowUp(event.target.checked)}
                label="Okay to follow up with me"
              />

              {error ? (
                <div className="feedback-inline-error">
                  <AlertCircle size={14} />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="feedback-drawer-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleClose}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting}
                >
                  <span>{submitting ? 'Sending' : 'Send feedback'}</span>
                </Button>
              </div>
            </form>
          </aside>
        ) : null}
      </div>
    </>
  );
}
