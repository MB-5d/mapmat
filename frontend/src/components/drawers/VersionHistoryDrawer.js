import React from 'react';
import { Plus } from 'lucide-react';

import AccountDrawer from './AccountDrawer';

const VersionHistoryDrawer = ({
  isOpen,
  onClose,
  versions,
  onRestoreVersion,
  activeVersionId,
  latestVersionId,
  isLoading,
  onAddVersion,
}) => (
  <AccountDrawer
    isOpen={isOpen}
    onClose={onClose}
    title="Version History"
    actions={(
      <button
        type="button"
        className="version-history-add"
        onClick={onAddVersion}
        aria-label="Add version"
        title="Add Version"
      >
        <Plus size={18} />
      </button>
    )}
    className="version-history-drawer"
  >
    <section className="drawer-card version-history-card">
      {isLoading ? (
        <div className="version-history-empty">Loading versions…</div>
      ) : versions.length === 0 ? (
        <div className="version-history-empty">No versions saved yet.</div>
      ) : (
        <div className="version-history-list">
          {versions.map((version) => {
            const isActive = version.id === activeVersionId;
            const currentId = activeVersionId || latestVersionId;
            const isCurrent = version.id === currentId;
            const isNamed = (version.name || '').trim().length > 0 && version.name !== 'Updated';
            return (
              <button
                key={version.id}
                type="button"
                className={`version-history-item${isActive ? ' active' : ''}`}
                onClick={() => onRestoreVersion(version)}
              >
                <span className={`version-history-marker${isNamed ? ' named' : ''}${isCurrent ? ' current' : ''}`} />
                <div className="version-history-main">
                  <div className="version-history-title-row">
                    <span className="version-history-title">{version.name || 'Updated'}</span>
                    {isCurrent ? (
                      <span className="version-history-badge">Current</span>
                    ) : null}
                  </div>
                  {version.notes ? (
                    <div className="version-history-notes">{version.notes}</div>
                  ) : null}
                </div>
                <div className="version-history-meta">
                  <div className="version-history-number">v{version.version_number}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  </AccountDrawer>
);

export default VersionHistoryDrawer;
