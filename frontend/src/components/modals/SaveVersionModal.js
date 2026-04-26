import React, { useEffect, useState } from 'react';
import { BookmarkPlus } from 'lucide-react';

import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Modal from '../ui/Modal';
import TextInput from '../ui/TextInput';
import TextareaInput from '../ui/TextareaInput';

const SaveVersionModal = ({
  show,
  onClose,
  onSave,
  versionNumber,
  timestamp,
  defaultName = 'Updated',
}) => {
  const [name, setName] = useState(defaultName);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!show) return;
    setName(defaultName);
    setNotes('');
    setError('');
  }, [show, defaultName]);

  if (!show) return null;

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Title is required');
      return;
    }
    onSave(trimmedName, notes.trim());
  };

  return (
    <Modal
      show={show}
      onClose={onClose}
      title="Save Version"
      className="save-version-modal"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save Version
          </Button>
        </>
      )}
    >
      <div className="version-meta-row">
        <Badge
          className="version-meta-pill"
          icon={<BookmarkPlus size={14} />}
          label={`v${versionNumber}`}
        />
        <div className="version-meta-date">{timestamp}</div>
      </div>

      <Field label="Title" required error={error}>
        <TextInput
          type="text"
          value={name}
          invalid={!!error}
          onChange={(e) => {
            setName(e.target.value);
            if (error && e.target.value.trim()) setError('');
          }}
          placeholder="Updated"
          autoFocus
        />
      </Field>

      <Field label="Notes (optional)">
        <TextareaInput
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add context or details…"
          rows={4}
        />
      </Field>
    </Modal>
  );
};

export default SaveVersionModal;
