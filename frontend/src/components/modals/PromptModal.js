import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

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
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onCancel}>
            <X size={24} />
          </button>
        </div>
        {message && <p>{message}</p>}
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            className="prompt-input"
          />
          <div className="confirm-modal-actions">
            <button type="button" className="modal-btn secondary" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="modal-btn primary" disabled={!value.trim()}>
              OK
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PromptModal;