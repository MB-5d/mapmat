import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Crosshair,
  MessageSquarePlus,
} from 'lucide-react';

import * as api from '../../api';
import classNames from '../../utils/classNames';
import Button from '../ui/Button';
import CheckboxField from '../ui/CheckboxField';
import Field from '../ui/Field';
import Modal from '../ui/Modal';
import StatusAlert from '../ui/StatusAlert';
import TextInput from '../ui/TextInput';
import TextareaInput from '../ui/TextareaInput';
import { trackEvent } from '../../utils/analytics';
import {
  captureFeedbackTargetContext,
  findElementFromDomHint,
  findFeedbackTargetElement,
} from '../../utils/feedback';
import { ROUTE_SURFACES } from '../../utils/appRoutes';

const FIGMA_CAPTURE_TOOLS_ENABLED = process.env.NODE_ENV !== 'production';

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

const FEEDBACK_FORM_ID = 'feedback-form';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [contactEmail, setContactEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isSelectingTarget, setIsSelectingTarget] = useState(false);
  const [hoverTarget, setHoverTarget] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const widgetRootRef = useRef(null);
  const selectedElementRef = useRef(null);
  const isVisible = currentRoute?.surface === ROUTE_SURFACES.APP;
  const figmaFeedbackAppliedRef = useRef('');
  const isLocalFigmaCaptureHost = FIGMA_CAPTURE_TOOLS_ENABLED && typeof window !== 'undefined' && (
    window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
    || window.location.hostname === '0.0.0.0'
    || window.location.hostname === '[::1]'
    || window.location.hostname === '::1'
  );
  const figmaState = isLocalFigmaCaptureHost
    ? String(new URLSearchParams(window.location.search || '').get('figmaState') || '').trim().toLowerCase()
    : '';
  const figmaCaptureKey = isLocalFigmaCaptureHost
    ? `${window.location.pathname}|${window.location.search}|${figmaState}`
    : '';

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
    if (!isVisible || !isLocalFigmaCaptureHost || figmaState !== 'feedback-modal') return;
    if (figmaFeedbackAppliedRef.current === figmaCaptureKey) return;
    figmaFeedbackAppliedRef.current = figmaCaptureKey;
    setIntent('idea');
    setScope('whole_app');
    setRating(4);
    setMessage('Feedback capture state');
    setAllowFollowUp(Boolean(currentUser?.id));
    setIsSelectingTarget(false);
    setIsOpen(true);
  }, [currentUser?.id, figmaCaptureKey, figmaState, isLocalFigmaCaptureHost, isVisible]);

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
        setIsOpen(true);
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
    setContactEmail('');
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
    const trimmedContactEmail = String(contactEmail || '').trim();
    const needsContactEmail = allowFollowUp && !currentUser?.id;
    if (!intent) {
      setError('Choose a feedback type.');
      return;
    }
    if (!scope) {
      setError('Choose a scope.');
      return;
    }
    if (scope === 'specific_thing' && !selectedTarget) {
      setError('Pick the thing on screen you want to reference.');
      return;
    }
    if (needsContactEmail && !trimmedContactEmail) {
      setError('Enter an email address for follow-up.');
      return;
    }
    if (needsContactEmail && !EMAIL_REGEX.test(trimmedContactEmail)) {
      setError('Enter a valid email address.');
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
        contactEmail: needsContactEmail ? trimmedContactEmail : null,
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

      <div
        className={classNames('feedback-widget', isSelectingTarget && 'is-selecting-target')}
        ref={widgetRootRef}
        data-feedback-root="1"
      >
        {!isOpen && !isSelectingTarget ? (
          <button
            type="button"
            className="feedback-widget-tab"
            onClick={handleOpen}
            aria-label="Open feedback form"
          >
            <span className="feedback-widget-tab-label">Feedback</span>
            <span className="feedback-widget-tab-icon" aria-hidden="true">
              <MessageSquarePlus size={14} />
            </span>
          </button>
        ) : null}

        <Modal
          show={isOpen}
          onClose={handleClose}
          title="Feedback"
          subtitle="Share what felt good, off, or broken."
          size="sm"
          scrollable
          className="feedback-modal"
          bodyClassName="feedback-modal-body"
          closeLabel="Close feedback form"
          footer={(
            <div className="feedback-footer">
              {error ? (
                <StatusAlert tone="danger" className="feedback-inline-error feedback-footer-error">
                  {error}
                </StatusAlert>
              ) : null}
              <div className="feedback-footer-actions">
                <Button
                  htmlType="button"
                  type="ghost"
                  buttonStyle="mono"
                  size="sm"
                  onClick={handleClose}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  htmlType="submit"
                  form={FEEDBACK_FORM_ID}
                  type="secondary"
                  buttonStyle="mono"
                  size="sm"
                  loading={submitting}
                >
                  {submitting ? 'Sending' : 'Send feedback'}
                </Button>
              </div>
            </div>
          )}
        >
          <form id={FEEDBACK_FORM_ID} className="feedback-form" onSubmit={handleSubmit}>
            <section className="field feedback-field-group">
              <div className="field-label">Type</div>
              <div className="feedback-choice-grid">
                {INTENT_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    htmlType="button"
                    type="secondary"
                    buttonStyle="mono"
                    size="sm"
                    className={classNames('feedback-choice-button', intent === option.value && 'is-active')}
                    onClick={() => setIntent(option.value)}
                    aria-pressed={intent === option.value}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </section>

            <section className="field feedback-field-group">
              <div className="field-label">Scope</div>
              <div className="feedback-choice-grid">
                {SCOPE_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    htmlType="button"
                    type="secondary"
                    buttonStyle="mono"
                    size="sm"
                    className={classNames('feedback-choice-button', scope === option.value && 'is-active')}
                    onClick={() => {
                      setScope(option.value);
                      if (option.value === 'specific_thing') {
                        setError('');
                      }
                    }}
                    aria-pressed={scope === option.value}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              {scope === 'specific_thing' ? (
                <div className="feedback-target-row">
                  <Button
                    htmlType="button"
                    type="secondary"
                    buttonStyle="mono"
                    size="sm"
                    className="feedback-target-picker"
                    onClick={handlePickSpecificThing}
                    startIcon={<Crosshair />}
                  >
                    {selectedTarget ? 'Change selected thing' : 'Pick something on screen'}
                  </Button>
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

            <section className="field feedback-field-group">
              <div className="field-label">Satisfaction</div>
              <div className="feedback-rating-row" role="radiogroup" aria-label="Optional satisfaction rating">
                {[1, 2, 3, 4, 5].map((value) => (
                  <Button
                    key={value}
                    htmlType="button"
                    type="secondary"
                    buttonStyle="mono"
                    size="sm"
                    className={classNames('feedback-rating-button', rating === value && 'is-active')}
                    onClick={() => setRating((current) => (current === value ? null : value))}
                    role="radio"
                    aria-checked={rating === value}
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </section>

            <Field label="Tell us more (optional)" htmlFor="feedback-message" className="feedback-field-group">
              <TextareaInput
                id="feedback-message"
                className="feedback-textarea"
                size="lg"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="What happened, what you expected, or what felt unclear."
                rows={4}
                maxLength={4000}
              />
            </Field>

            <CheckboxField
              className="feedback-checkbox-row"
              checked={allowFollowUp}
              onChange={(event) => {
                const checked = event.target.checked;
                setAllowFollowUp(checked);
                if (!checked) setContactEmail('');
              }}
              label="Okay to follow up with me"
            />

            {allowFollowUp && !currentUser?.id ? (
              <TextInput
                id="feedback-contact-email"
                name="feedback-contact-email"
                type="email"
                size="md"
                label="Email"
                fieldClassName="feedback-contact-email feedback-field-group"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={submitting}
              />
            ) : null}
          </form>
        </Modal>
      </div>
    </>
  );
}
