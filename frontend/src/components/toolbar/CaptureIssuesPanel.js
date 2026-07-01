import React from 'react';

const CaptureIssuesPanel = ({
  issues = [],
  onSelectIssue,
  onOpenIssueUrl,
}) => {
  if (!issues.length) {
    return (
      <div className="capture-issues capture-issues-empty">
        <span>No capture issues</span>
      </div>
    );
  }

  return (
    <div className="capture-issues" role="group" aria-label="Capture issues">
      <div className="capture-issues-summary">
        {issues.length} issue{issues.length === 1 ? '' : 's'}
      </div>
      <div className="capture-issues-list">
        {issues.slice(0, 12).map((issue) => (
          <div className="capture-issue-row" key={issue.id}>
            <div className="capture-issue-main">
              <span className="capture-issue-title">
                {issue.pageNumber ? `${issue.pageNumber} · ` : ''}{issue.title}
              </span>
              <span className={`capture-issue-label capture-issue-label-${issue.type}`}>
                {issue.label}
              </span>
              {issue.url && <span className="capture-issue-url">{issue.url}</span>}
            </div>
            <div className="capture-issue-actions">
              <button type="button" onClick={() => onSelectIssue?.(issue)}>
                Select
              </button>
              {issue.url && (
                <button type="button" onClick={() => onOpenIssueUrl?.(issue)}>
                  Open
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {issues.length > 12 && (
        <div className="capture-issues-more">
          +{issues.length - 12} more
        </div>
      )}
    </div>
  );
};

export default CaptureIssuesPanel;
