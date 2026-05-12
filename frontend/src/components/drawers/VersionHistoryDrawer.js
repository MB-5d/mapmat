import React, { useRef, useState } from 'react';
import {
  ArrowUpToLine,
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Plus,
  Users,
} from 'lucide-react';

import AccountDrawer from './AccountDrawer';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import { EditIcon } from '../ui/icons';
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

function getTimelineDateParts(dateString) {
  const timestamp = new Date(dateString);
  if (Number.isNaN(timestamp.getTime())) return null;
  const year = timestamp.getFullYear();
  const month = String(timestamp.getMonth() + 1).padStart(2, '0');
  const day = String(timestamp.getDate()).padStart(2, '0');
  return {
    timestamp,
    monthKey: `${year}-${month}`,
    dateKey: `${year}-${month}-${day}`,
    monthLabel: timestamp.toLocaleString([], { month: 'long', year: 'numeric' }),
    dateLabel: timestamp.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
  };
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function groupTimelineItems(items = [], getDateValue) {
  const monthMap = new Map();
  (items || []).forEach((item) => {
    const parts = getTimelineDateParts(getDateValue(item));
    if (!parts) return;

    if (!monthMap.has(parts.monthKey)) {
      monthMap.set(parts.monthKey, {
        key: parts.monthKey,
        label: parts.monthLabel,
        timestamp: parts.timestamp.getTime(),
        count: 0,
        dates: new Map(),
      });
    }

    const monthGroup = monthMap.get(parts.monthKey);
    monthGroup.count += 1;

    if (!monthGroup.dates.has(parts.dateKey)) {
      monthGroup.dates.set(parts.dateKey, {
        key: parts.dateKey,
        label: parts.dateLabel,
        timestamp: parts.timestamp.getTime(),
        items: [],
      });
    }

    monthGroup.dates.get(parts.dateKey).items.push(item);
  });

  return Array.from(monthMap.values())
    .sort((left, right) => right.timestamp - left.timestamp)
    .map((monthGroup) => ({
      ...monthGroup,
      dates: Array.from(monthGroup.dates.values())
        .sort((left, right) => right.timestamp - left.timestamp),
    }));
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
      return <EditIcon size={14} />;
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

function getVersionBadges(version, isCurrent) {
  const normalizedName = String(version?.name || '').trim().toLowerCase();
  const badges = [];
  if (isCurrent) badges.push({ label: 'Current', style: 'brand' });
  if (normalizedName === 'initial' || Number(version?.version_number) === 1) {
    badges.push({ label: 'Initial', style: 'neutral' });
  } else if (normalizedName === 'autosaved') {
    badges.push({ label: 'Autosaved', style: 'info' });
  } else if (normalizedName && normalizedName !== 'updated') {
    badges.push({ label: 'Manual', style: 'success' });
  }
  return badges;
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
  const [expandedMonths, setExpandedMonths] = useState(() => ({ [getCurrentMonthKey()]: true }));
  const [expandedDates, setExpandedDates] = useState({});
  const viewOptions = [
    { value: VIEW_TABS.VERSIONS, label: 'Versions' },
    { value: VIEW_TABS.ACTIVITY, label: 'Activity' },
  ];
  const groupedVersions = React.useMemo(
    () => groupTimelineItems(versions, (version) => version.created_at),
    [versions]
  );
  const groupedActivity = React.useMemo(
    () => groupTimelineItems(activity, (event) => event.createdAt),
    [activity]
  );

  React.useEffect(() => {
    if (!isOpen) {
      setShowBackToTop(false);
      return;
    }
    if (!canViewActivity && activeView !== VIEW_TABS.VERSIONS) {
      setActiveView(VIEW_TABS.VERSIONS);
    }
  }, [activeView, canViewActivity, isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const currentMonthKey = getCurrentMonthKey();
    setExpandedMonths((current) => (
      current[currentMonthKey] ? current : { ...current, [currentMonthKey]: true }
    ));
  }, [isOpen]);

  const toggleMonth = (monthKey) => {
    setExpandedMonths((current) => ({
      ...current,
      [monthKey]: !current[monthKey],
    }));
  };

  const toggleDate = (dateKey) => {
    setExpandedDates((current) => ({
      ...current,
      [dateKey]: !current[dateKey],
    }));
  };

  const handleScroll = (event) => {
    const top = event.currentTarget.scrollTop;
    setShowBackToTop(top > 240);
  };

  const scrollToTop = () => {
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderGroupedTimeline = (groups, renderItem, emptyLabel) => {
    if (groups.length === 0) {
      return <div className="version-history-empty">{emptyLabel}</div>;
    }

    return (
      <div className="timeline-group-list">
        {groups.map((monthGroup) => {
          const monthExpanded = !!expandedMonths[monthGroup.key];
          return (
            <section className="timeline-month-group" key={monthGroup.key}>
              <button
                type="button"
                className="timeline-group-header timeline-month-header"
                onClick={() => toggleMonth(monthGroup.key)}
                aria-expanded={monthExpanded}
              >
                {monthExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span>{monthGroup.label}</span>
                <span className="timeline-group-count">{monthGroup.count}</span>
              </button>
              {monthExpanded ? (
                <div className="timeline-date-group-list">
                  {monthGroup.dates.map((dateGroup) => {
                    const dateExpanded = !!expandedDates[dateGroup.key];
                    return (
                      <section className="timeline-date-group" key={dateGroup.key}>
                        <button
                          type="button"
                          className="timeline-group-header timeline-date-header"
                          onClick={() => toggleDate(dateGroup.key)}
                          aria-expanded={dateExpanded}
                        >
                          {dateExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          <span>{dateGroup.label}</span>
                          <span className="timeline-group-count">{dateGroup.items.length}</span>
                        </button>
                        {dateExpanded ? (
                          <div className="version-history-list">
                            {dateGroup.items.map(renderItem)}
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    );
  };

  const renderVersionItem = (version) => {
    const isActive = version.id === activeVersionId;
    const currentId = activeVersionId || latestVersionId;
    const isCurrent = version.id === currentId;
    const badges = getVersionBadges(version, isCurrent);
    const isNamed = badges.some((badge) => badge.label === 'Manual');

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
            {badges.map((badge) => (
              <Badge
                key={badge.label}
                className="version-history-badge"
                label={badge.label}
                badgeStyle={badge.style}
                size="sm"
              />
            ))}
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
  };

  const renderVersions = () => {
    if (isLoading) {
      return <div className="version-history-empty">Loading versions…</div>;
    }
    return renderGroupedTimeline(groupedVersions, renderVersionItem, 'No versions saved yet.');
  };

  const renderActivityItem = (event) => {
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
  };

  const renderActivity = () => {
    if (isActivityLoading) {
      return <div className="version-history-empty">Loading activity…</div>;
    }
    return (
      <div className="activity-history-list">
        {renderGroupedTimeline(groupedActivity, renderActivityItem, 'No recent activity yet.')}
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
        <IconButton
          type="secondary"
          buttonStyle="brand"
          size="sm"
          className="version-history-add"
          icon={<Plus />}
          onClick={onAddVersion}
          aria-label="Add version"
          title="Add Version"
        />
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
          <Button
            type="primary"
            buttonStyle="mono"
            size="sm"
            className="drawer-back-to-top"
            onClick={scrollToTop}
            startIcon={<ArrowUpToLine />}
          >
            Back to top
          </Button>
        ) : null}
      </section>
    </AccountDrawer>
  );
};

export default VersionHistoryDrawer;
