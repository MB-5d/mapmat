import React, { useEffect, useRef } from 'react';
import { Loader2, X } from 'lucide-react';

const ImageOverlay = ({ imageUrl, loading, onClose, onLoad, onError }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  if (!imageUrl) return null;

  return (
    <div
      className="modal-overlay image-overlay"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      tabIndex={0}
      ref={containerRef}
    >
      <button className="image-overlay-close" onClick={onClose}>
        <X size={18} />
      </button>
      <div className="image-modal" onClick={(e) => e.stopPropagation()}>
        {loading && (
          <div className="image-loading-overlay">
            <Loader2 size={48} className="image-spinner" />
            <span>Loading screenshot...</span>
          </div>
        )}
        <img
          key={imageUrl}
          src={imageUrl}
          alt="Full page view"
          onLoad={onLoad}
          onError={onError}
          style={{ opacity: loading ? 0 : 1 }}
        />
      </div>
    </div>
  );
};

export default ImageOverlay;
