import React from 'react';
import { Check, Copy, Edit2, Eye, Mail, MessageSquare, X } from 'lucide-react';

const ShareModal = ({
  show,
  onClose,
  accessLevels,
  sharePermission,
  onChangePermission,
  linkCopied,
  onCopyLink,
  shareEmails,
  onShareEmailsChange,
  onSendEmail,
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-sm share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Share Sitemap</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="share-section">
          <div className="modal-section-label">Permission Level</div>
          <div className="modal-options">
            <label className={`modal-option-card ${sharePermission === accessLevels.VIEW ? 'selected' : ''}`}>
              <input
                type="radio"
                name="sharePermission"
                checked={sharePermission === accessLevels.VIEW}
                onChange={() => onChangePermission(accessLevels.VIEW)}
                style={{ display: 'none' }}
              />
              <Eye size={20} className="modal-option-icon" />
              <div className="modal-option-content">
                <span className="modal-option-title">View only</span>
                <span className="modal-option-desc">Can view the sitemap</span>
              </div>
            </label>
            <label className={`modal-option-card ${sharePermission === accessLevels.COMMENT ? 'selected' : ''}`}>
              <input
                type="radio"
                name="sharePermission"
                checked={sharePermission === accessLevels.COMMENT}
                onChange={() => onChangePermission(accessLevels.COMMENT)}
                style={{ display: 'none' }}
              />
              <MessageSquare size={20} className="modal-option-icon" />
              <div className="modal-option-content">
                <span className="modal-option-title">Can comment</span>
                <span className="modal-option-desc">View and add comments</span>
              </div>
            </label>
            <label className={`modal-option-card ${sharePermission === accessLevels.EDIT ? 'selected' : ''}`}>
              <input
                type="radio"
                name="sharePermission"
                checked={sharePermission === accessLevels.EDIT}
                onChange={() => onChangePermission(accessLevels.EDIT)}
                style={{ display: 'none' }}
              />
              <Edit2 size={20} className="modal-option-icon" />
              <div className="modal-option-content">
                <span className="modal-option-title">Can edit</span>
                <span className="modal-option-desc">Full editing access</span>
              </div>
            </label>
          </div>
        </div>

        <div className="share-section">
          <button className={`share-link-btn ${linkCopied ? 'copied' : ''}`} onClick={onCopyLink}>
            {linkCopied ? <Check size={18} /> : <Copy size={18} />}
            <span>{linkCopied ? 'Link Copied!' : 'Copy Share Link'}</span>
          </button>
        </div>

        <div className="share-section">
          <div className="modal-section-label">Send via Email</div>
          <div className="share-email-section">
            <div className="share-email-input">
              <Mail size={18} />
              <input
                type="text"
                placeholder="Enter email addresses..."
                value={shareEmails}
                onChange={(e) => onShareEmailsChange(e.target.value)}
              />
            </div>
            <button className="share-email-btn" onClick={onSendEmail}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
