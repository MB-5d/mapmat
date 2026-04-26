import React, { useRef, useState } from 'react';
import {
  ArrowUp,
  BookmarkPlus,
  MessageSquare,
  PencilLine,
  Plus,
  Users,
} from 'lucide-react';

import AccountDrawer from './AccountDrawer';
import Badge from '../ui/Badge';
import SegmentedControl from '../ui/SegmentedControl';

const VIEW_TABS = Object.freeze({
  VERSIONS: 'versions',
  ACTIVITY: 'activity',
});

function formatTimestamp(dateString) {
  const timestamp = new Date(dateString);
  if (Number.isNaN(timestamp.getTime())) return '';
  return timestamp.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatActorLabel(actor) {
  const name = String(actor?.name || '').trim();
  if (name) return name;
  const email = String(actor?.email || '').trim();
  if (email) return email.split('@')[0];
  const role = String(actor?.role || '').trim();
  if (role) return role.charAt(0).toUpperCase() + role.slice(1);
  return 'Someone';
}

function getActivityIcon(eventScope) {
  switch (eventScope) {
    case 'comment':
      return <MessageSquare size={14} />;
    case 'version':
      return <BookmarkPlus size={14} />;
    case 'collaboration':
      return <Users size={14} />;
    default:
      return <PencilLine size={14} />;
  }
}

function getActivityScopeLabel(eventScope) {
  switch (eventScope) {
    case 'comment':
      return 'Comment';
    case 'version':
      return 'Version';
    case 'collaboration':
      return 'Access';
    default:
      return 'Edit';
  }
}

const VersionHistoryDrawer = ({
  isOpen,
  onClose,
  versions,
  onRestoreVersion,
  onSelectActivity,
  activeVersionId,
  latestVersionId,
  isLoading,
  onAddVersion,
  canAddVersion = false,
  canViewActivity = false,
  activity = [],
  isActivityLoading = false,
}) => {
  const bodyRef = useRef(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [activeView, setActiveView] = useState(VIEW_TABS.VERSIONS);
  const viewOptions = [
    { value: VIEW_TABS.VERSIONS, label: 'Versions' },
    { value: VIEW_TABS.ACTIVITY, label: 'Activity' },
  ];

  React.useEffect(() => {
    if (!isOpen) {
      setShowBackToTop(false);
      return;
    }
    if (!canViewActivity && activeView !== VIEW_TABS.VERSIONS) {
      setActiveView(VIEW_TABS.VERSIONS);
    }
  }, [activeView, canViewActivity, isOpen]);

  const handleScroll = (event) => {
    const top = event.currentTarget.scrollTop;
    setShowBackToTop(top > 240);
  };

  const scrollToTop = () => {
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderVersions = () => {
    if (isLoading) {
      return <div className="version-history-empty">Loading versions…</div>;
    }
    if (versions.length === 0) {
      return <div className="version-history-empty">No versions saved yet.</div>;
    }
    return (
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
                    <Badge className="version-history-badge" label="Current" />
                  ) : null}
                </div>
                {version.notes ? (
                  <div className="version-history-notes">{version.notes}</div>
                ) : null}
              </div>
              <div className="version-history-meta">
                <div className="version-history-number">v{version.version_number}</div>
                <div>{formatTimestamp(version.created_at)}</div>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const renderActivity = () => {
    if (isActivityLoading) {
      return <div className="version-history-empty">Loading activity…</div>;
    }
    if (activity.length === 0) {
      return <div className="version-history-empty">No recent activity yet.</div>;
    }
    return (
      <div className="version-history-list activity-history-list">
        {activity.map((event) => {
          const hasAction = !!onSelectActivity && (
            !!event?.payload?.versionId
            || !!event?.payload?.nodeId
            || event?.entityType === 'node'
            || event?.entityType === 'version'
          );
          const ItemTag = hasAction ? 'button' : 'div';
          return (
            <ItemTag
              key={event.id}
              type={hasAction ? 'button' : undefined}
              className={`version-history-item activity-history-item${hasAction ? ' clickable' : ''}`}
              onClick={hasAction ? () => onSelectActivity(event) : undefined}
              title={hasAction ? 'Open related item' : undefined}
            >
              <span className={`version-history-marker activity-history-marker scope-${event.eventScope || 'content'}`}>
                {getActivityIcon(event.eventScope)}
              </span>
              <div className="version-history-main">
                <div className="version-history-title-row">
                  <span className="version-history-title">{event.summary || 'Updated the map'}</span>
                  <span className={`activity-history-scope scope-${event.eventScope || 'content'}`}>
                    {getActivityScopeLabel(event.eventScope)}
                  </span>
                </div>
                <div className="version-history-notes activity-history-notes">
                  <span className="activity-history-actor">{formatActorLabel(event.actor)}</span>
                  <span className="activity-history-separator">•</span>
                  <span>{formatTimestamp(event.createdAt)}</span>
                </div>
              </div>
              <div className="version-history-meta activity-history-meta">
                {event.payload?.versionNumber ? (
                  <div className="version-history-number">v{event.payload.versionNumber}</div>
                ) : null}
              </div>
            </ItemTag>
          );
        })}
      </div>
    );
  };

  return (
    <AccountDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Map Timeline"
      subtitle={canViewActivity ? 'Versions and recent activity' : 'Version history'}
      actions={canAddVersion ? (
        <button
          type="button"
          className="version-history-add"
          onClick={onAddVersion}
          aria-label="Add version"
          title="Add Version"
        >
          <Plus size={18} />
        </button>
      ) : null}
      className="version-history-drawer"
      bodyRef={bodyRef}
      onBodyScroll={handleScroll}
    >
      {canViewActivity ? (
        <SegmentedControl
          className="version-history-tabs"
          variant="pill"
          size="sm"
          ariaLabel="Map timeline views"
          value={activeView}
          onChange={setActiveView}
          options={viewOptions}
          optionRole="tab"
        />
      ) : null}

      <section className="drawer-card version-history-card">
        {activeView === VIEW_TABS.ACTIVITY && canViewActivity
          ? renderActivity()
          : renderVersions()}
        {showBackToTop ? (
          <button type="button" className="drawer-back-to-top" onClick={scrollToTop}>
            <ArrowUp size={16} />
            Back to top
          </button>
        ) : null}
      </section>
    </AccountDrawer>
  );
};

export default VersionHistoryDrawer;
