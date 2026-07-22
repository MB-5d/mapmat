import React from 'react';

import Field from '../ui/Field';
import SelectInput from '../ui/SelectInput';
import TextareaInput from '../ui/TextareaInput';
import TextInput from '../ui/TextInput';
import classNames from '../../utils/classNames';
import { GENERAL_INQUIRY_REASON } from './supportContactConfig';

const SupportContactForm = ({
  className = '',
  errors = {},
  form,
  formId = 'support-contact-form',
  idPrefix = 'support-contact',
  isSubmitting = false,
  reasonOptions = [GENERAL_INQUIRY_REASON, 'Other'],
  stacked = false,
  submitError = '',
  textareaRows = 5,
  translateText = (source) => source,
  onChange,
  onSubmit,
}) => {
  const t = translateText;
  const resolvedReasonOptions = reasonOptions?.length ? reasonOptions : [GENERAL_INQUIRY_REASON, 'Other'];

  return (
    <form
      id={formId}
      className={classNames('support-contact-form', stacked && 'support-contact-form--stacked', className)}
      onSubmit={onSubmit}
    >
      <div className="support-contact-form__row">
        <TextInput
          id={`${idPrefix}-name`}
          label={t('Name')}
          value={form.name}
          onChange={(event) => onChange('name', event.target.value)}
          placeholder={t('Your name')}
          autoComplete="name"
          required
          error={errors.name}
          disabled={isSubmitting}
        />
        <TextInput
          id={`${idPrefix}-email`}
          type="email"
          label={t('Email')}
          value={form.email}
          onChange={(event) => onChange('email', event.target.value)}
          placeholder={t('you@example.com')}
          autoComplete="email"
          required
          error={errors.email}
          disabled={isSubmitting}
        />
      </div>
      <div className="support-contact-form__row">
        <SelectInput
          id={`${idPrefix}-reason`}
          label={t('Reason')}
          value={form.reason || resolvedReasonOptions[0]}
          onChange={(event) => onChange('reason', event.target.value)}
          disabled={isSubmitting}
        >
          {resolvedReasonOptions.map((option) => (
            <option key={option} value={option}>{t(option)}</option>
          ))}
        </SelectInput>
        <TextInput
          id={`${idPrefix}-reason-detail`}
          label={t('Reason details')}
          value={form.reasonDetail}
          onChange={(event) => onChange('reasonDetail', event.target.value)}
          placeholder={t('Optional detail')}
          disabled={isSubmitting}
        />
      </div>
      <Field label={t('Message')} htmlFor={`${idPrefix}-message`} required error={errors.message}>
        <TextareaInput
          id={`${idPrefix}-message`}
          value={form.message}
          onChange={(event) => onChange('message', event.target.value)}
          placeholder={t('What should we know?')}
          rows={textareaRows}
          invalid={Boolean(errors.message)}
          required
          disabled={isSubmitting}
        />
      </Field>
      {submitError ? (
        <p className="support-contact-form__error" role="alert">
          {submitError}
        </p>
      ) : null}
    </form>
  );
};

export default SupportContactForm;
