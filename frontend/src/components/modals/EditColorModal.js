import React from 'react';

const EditColorModal = ({ depth, color, onChange, onClose }) => {
  if (depth === null || depth === undefined) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>Edit Level {depth} Color</h3>
        <input
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', height: 60, border: 'none', cursor: 'pointer' }}
        />
        <button className="modal-btn" onClick={onClose}>Done</button>
      </div>
    </div>
  );
};

export default EditColorModal;
