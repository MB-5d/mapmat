import React, { useEffect, useMemo, useState } from 'react';
import { Check, Mail } from 'lucide-react';

import * as api from '../../api';
import AccountDrawer from './AccountDrawer';
import Button from '../ui/Button';
import SupportContactForm from '../support/SupportContactForm';
import {
  CONTACT_SUBMIT_STATUS,
  CONTACT_TARGETS,
  createContactFormState,
  validateContactForm,
} from '../support/supportContactConfig';

const SUPPORT_FORM_ID = 'app-support-contact-form';

const SupportDrawer = ({
  isOpen,
  onClose,
  user,
  showToast,
}) => {
  const target = CONTACT_TARGETS.support;
  const initialForm = useMemo(() => createContactFormState(target, user), [target, user]);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [submitStatus, setSubmitStatus] = useState(CONTACT_SUBMIT_STATUS.IDLE);
  const [submitError, setSubmitError] = useState('');

  const isSubmitting = submitStatus === CONTACT_SUBMIT_STATUS.SUBMITTING;
  const isSubmitted = submitStatus === CONTACT_SUBMIT_STATUS.SUCCESS;

  useEffect(() => {
    if (!isOpen) return;
    setForm(createContactFormState(target, user));
    setErrors({});
    setSubmitStatus(CONTACT_SUBMIT_STATUS.IDLE);
    setSubmitError('');
  }, [isOpen, target, user]);

  const handleChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    if (submitStatus !== CONTACT_SUBMIT_STATUS.IDLE) {
      setSubmitStatus(CONTACT_SUBMIT_STATUS.IDLE);
      setSubmitError('');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const { errors: nextErrors, values } = validateContactForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setSubmitStatus(CONTACT_SUBMIT_STATUS.IDLE);
      setSubmitError('');
      return;
    }

    setErrors({});
    setSubmitStatus(CONTACT_SUBMIT_STATUS.SUBMITTING);
    setSubmitError('');

    try {
      await api.submitMarketingContact({
        targetKey: target.key,
        ...values,
        sourceUrl: typeof window !== 'undefined' ? window.location.href : '',
      });
      setSubmitStatus(CONTACT_SUBMIT_STATUS.SUCCESS);
      showToast?.('Support message sent', 'success');
    } catch (error) {
      setSubmitStatus(CONTACT_SUBMIT_STATUS.ERROR);
      setSubmitError(error?.message || 'Could not send your message. Try again or email us directly.');
    }
  };

  const handleSendAnother = () => {
    setForm(createContactFormState(target, user));
    setErrors({});
    setSubmitStatus(CONTACT_SUBMIT_STATUS.IDLE);
    setSubmitError('');
  };

  return (
    <AccountDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Support"
      subtitle={`Sends to ${target.email}.`}
      className="support-drawer"
    >
      {isSubmitted ? (
        <section className="drawer-card support-drawer-confirmation" role="status">
          <span className="support-drawer-confirmation__icon" aria-hidden="true">
            <Check size={20} strokeWidth={2.4} />
          </span>
          <div>
            <div className="drawer-card-title">Message sent</div>
            <div className="drawer-card-subtitle">We will follow up soon.</div>
          </div>
          <div className="drawer-card-actions support-drawer-actions">
            <Button variant="secondary" type="secondary" buttonStyle="mono" onClick={onClose}>
              Close
            </Button>
            <Button type="button" startIcon={<Mail />} onClick={handleSendAnother}>
              Send another
            </Button>
          </div>
        </section>
      ) : (
        <section className="drawer-card support-drawer-card">
          <SupportContactForm
            formId={SUPPORT_FORM_ID}
            idPrefix="app-support-contact"
            form={form}
            errors={errors}
            submitError={submitError}
            isSubmitting={isSubmitting}
            reasonOptions={target.reasonOptions}
            stacked
            textareaRows={5}
            onChange={handleChange}
            onSubmit={handleSubmit}
          />
          <div className="drawer-card-actions support-drawer-actions">
            <Button variant="secondary" type="secondary" buttonStyle="mono" onClick={onClose} disabled={isSubmitting}>
              Close
            </Button>
            <Button htmlType="submit" form={SUPPORT_FORM_ID} startIcon={<Mail />} loading={isSubmitting}>
              {isSubmitting ? 'Sending' : 'Send message'}
            </Button>
          </div>
        </section>
      )}
    </AccountDrawer>
  );
};

export default SupportDrawer;
