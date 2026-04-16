import React, { useEffect, useRef, useState } from 'react';

import Button from '../ui/Button';
import Modal from '../ui/Modal';
import TextInput from '../ui/TextInput';

const PromptModal = ({ title, message, placeholder, defaultValue, onConfirm, onCancel }) => {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  return (
    <Modal
      show
      onClose={onCancel}
      title={title}
      size="sm"
      className="confirm-modal"
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" form="prompt-modal-form" variant="primary" disabled={!value.trim()}>
            OK
          </Button>
        </>
      )}
    >
      <form id="prompt-modal-form" onSubmit={handleSubmit}>
        {message && <p>{message}</p>}
        <TextInput
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="prompt-input"
        />
      </form>
    </Modal>
  );
};

export default PromptModal;
