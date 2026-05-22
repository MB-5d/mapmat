import React, { useRef, useState } from 'react';
import {
  ArrowUpToLine,
  Bookmark,
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MessageSquare,
  Pencil,
  Users,
} from 'lucide-react';

import AccountDrawer from './AccountDrawer';
import Button from '../ui/Button';
import Field from '../ui/Field';
import IconButton from '../ui/IconButton';
import { EditIcon } from '../ui/icons';
import SegmentedControl from '../ui/SegmentedControl';
import TextInput from '../ui/TextInput';
import TextareaInput from '../ui/TextareaInput';

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

function formatOptionalActorLabel(actor) {
  const name = String(actor?.name || '').trim();
  if (name) return name;
  const email = String(actor?.email || '').trim();
  if (email) return email.split('@')[0];
  return '';
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

function getNormalizedVersionName(version) {
  return String(version?.name || '').trim();
}

function isDefaultVersionName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  return !normalized || normalized === 'autosaved' || normalized === 'updated';
}

function isBookmarkedVersion(version) {
  const normalizedName = String(version?.name || '').trim().toLowerCase();
  return Boolean(Number(version?.is_bookmarked || 0) || version?.isBookmarked)
    || (!!normalizedName && !['autosaved', 'updated', 'initial'].includes(normalizedName));
}

function getVersionDisplayName(version) {
  const name = getNormalizedVersionName(version);
  const normalizedName = name.toLowerCase();
  if (isBookmarkedVersion(version)) return name || `Version ${version?.version_number || ''}`.trim();
  if (normalizedName === 'initial' || Number(version?.version_number) === 1) return 'Initial version';
  return `Version ${version?.version_number || ''}`.trim();
}

function getBookmarkDraftTitle(version) {
  const name = getNormalizedVersionName(version);
  return isDefaultVersionName(name) || name.toLowerCase() === 'initial'
    ? `Version ${version?.version_number || ''}`.trim()
    : name;
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
  onBookmarkVersion,
  canBookmarkVersion = false,
  canViewActivity = false,
  currentUser = null,
  activity = [],
  isActivityLoading = false,
}) => {
  const bodyRef = useRef(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [activeView, setActiveView] = useState(VIEW_TABS.VERSIONS);
  const [expandedMonths, setExpandedMonths] = useState(() => ({ [getCurrentMonthKey()]: true }));
  const [expandedDates, setExpandedDates] = useState({});
  const [editingVersionId, setEditingVersionId] = useState(null);
  const [bookmarkDraft, setBookmarkDraft] = useState({ name: '', notes: '' });
  const [bookmarkError, setBookmarkError] = useState('');
  const [savingBookmarkId, setSavingBookmarkId] = useState(null);
  const [expandedVersionNotes, setExpandedVersionNotes] = useState({});
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
      setEditingVersionId(null);
      setBookmarkError('');
      setExpandedVersionNotes({});
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

  const startBookmarkEdit = (version) => {
    setEditingVersionId(version.id);
    setBookmarkDraft({
      name: getBookmarkDraftTitle(version),
      notes: String(version?.notes || ''),
    });
    setBookmarkError('');
  };

  const cancelBookmarkEdit = () => {
    setEditingVersionId(null);
    setBookmarkDraft({ name: '', notes: '' });
    setBookmarkError('');
  };

  const handleBookmarkSubmit = async (event, version) => {
    event.preventDefault();
    const name = bookmarkDraft.name.trim();
    if (!name) {
      setBookmarkError('Name is required');
      return;
    }
    if (!onBookmarkVersion) return;

    setSavingBookmarkId(version.id);
    setBookmarkError('');
    try {
      await onBookmarkVersion(version, {
        name,
        notes: bookmarkDraft.notes.trim(),
      });
      cancelBookmarkEdit();
    } catch (error) {
      setBookmarkError(error.message || 'Could not update this version');
    } finally {
      setSavingBookmarkId(null);
    }
  };

  const toggleVersionDetails = (versionId) => {
    setExpandedVersionNotes((current) => ({
      ...current,
      [versionId]: !current[versionId],
    }));
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
    const isBookmarked = isBookmarkedVersion(version);
    const isEditing = editingVersionId === version.id;
    const hasNotes = !!String(version?.notes || '').trim();
    const detailsExpanded = !!expandedVersionNotes[version.id];
    const detailsId = `version-details-${version.id}`;
    const bookmarkerLabel = formatOptionalActorLabel(version.bookmarkedBy)
      || formatOptionalActorLabel({
        name: version.bookmarked_by_name,
        email: version.bookmarked_by_email,
      });

    return (
      <div
        key={version.id}
        className={`version-history-item${isActive ? ' active' : ''}${isBookmarked ? ' bookmarked' : ''}${isEditing ? ' editing' : ''}`}
      >
        <span className={`version-history-marker${isBookmarked ? ' bookmarked' : ''}${isCurrent ? ' current' : ''}`} />
        <div className="version-history-content">
          <div className="version-history-row">
            <button
              type="button"
              className="version-history-restore"
              onClick={() => onRestoreVersion(version)}
            >
              <div className="version-history-main">
                <div className="version-history-title-row">
                  {isBookmarked ? <Bookmark size={14} className="version-history-title-icon" aria-hidden="true" /> : null}
                  <span className="version-history-title">{getVersionDisplayName(version)}</span>
                </div>
              </div>
            </button>
            {canBookmarkVersion ? (
              <IconButton
                variant="ghost"
                size="sm"
                className="version-history-inline-action"
                icon={isBookmarked ? <Pencil /> : <BookmarkPlus />}
                onClick={() => startBookmarkEdit(version)}
                aria-label={isBookmarked ? 'Edit version bookmark' : 'Bookmark version'}
                title={isBookmarked ? 'Edit bookmark' : 'Bookmark version'}
              />
            ) : null}
            <div className="version-history-meta">
              <div className="version-history-number">v{version.version_number}</div>
              {hasNotes ? (
                <IconButton
                  variant="ghost"
                  size="sm"
                  className="version-history-detail-toggle"
                  icon={detailsExpanded ? <ChevronUp /> : <ChevronDown />}
                  onClick={() => toggleVersionDetails(version.id)}
                  aria-label={detailsExpanded ? 'Hide version details' : 'Show version details'}
                  aria-expanded={detailsExpanded}
                  aria-controls={detailsId}
                  title={detailsExpanded ? 'Hide details' : 'Show details'}
                />
              ) : null}
            </div>
          </div>
          {hasNotes && detailsExpanded ? (
            <div className="version-history-details" id={detailsId}>
              <div className="version-history-notes">{version.notes}</div>
              {isBookmarked && bookmarkerLabel ? (
                <div className="version-history-actor">Marked by {bookmarkerLabel}</div>
              ) : null}
            </div>
          ) : null}
        </div>
        {isEditing ? (
          <form className="version-history-bookmark-editor" onSubmit={(event) => handleBookmarkSubmit(event, version)}>
            <Field label="Name" required error={bookmarkError}>
              <TextInput
                size="sm"
                value={bookmarkDraft.name}
                invalid={!!bookmarkError}
                onChange={(event) => {
                  setBookmarkDraft((current) => ({ ...current, name: event.target.value }));
                  if (bookmarkError && event.target.value.trim()) setBookmarkError('');
                }}
                placeholder={`Version ${version.version_number}`}
                autoFocus
              />
            </Field>
            <Field label="Description (optional)">
              <TextareaInput
                size="sm"
                value={bookmarkDraft.notes}
                onChange={(event) => setBookmarkDraft((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Add context for this version"
                rows={3}
              />
            </Field>
            <div className="version-history-bookmark-editor-footer">
              <div className="version-history-bookmark-byline">
                Marked by {formatActorLabel(currentUser)}
              </div>
              <div className="version-history-bookmark-editor-actions">
                <Button variant="secondary" size="sm" onClick={cancelBookmarkEdit}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  htmlType="submit"
                  loading={savingBookmarkId === version.id}
                >
                  Save
                </Button>
              </div>
            </div>
          </form>
        ) : null}
      </div>
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
      className="version-history-drawer"
      bodyRef={bodyRef}
      onBodyScroll={handleScroll}
    >
      {canViewActivity ? (
        <SegmentedControl
          className="version-history-tabs"
          variant="tabs"
          size="sm"
          fullWidth
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
