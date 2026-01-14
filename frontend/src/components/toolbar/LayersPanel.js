import React from 'react';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';

const LayersPanel = ({
  layers,
  connectionTool,
  onToggleUserFlows,
  onToggleCrossLinks,
  showViewDropdown,
  onToggleDropdown,
  viewDropdownRef,
}) => (
  <div className={`layers-panel ${showViewDropdown ? 'expanded' : ''}`} ref={viewDropdownRef}>
    <div
      className="layers-panel-header"
      onClick={onToggleDropdown}
    >
      <div className="layers-panel-title">
        <Layers size={16} />
        <span>Layers</span>
      </div>
      <button className="key-toggle">
        {showViewDropdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
    </div>
    {showViewDropdown && (
      <div className="layers-panel-list">
        <label className="layers-panel-item">
          <input
            type="checkbox"
            checked={layers.main}
            disabled
            onChange={() => {}}
          />
          <span>Main / URL</span>
        </label>
        <label className="layers-panel-item">
          <input
            type="checkbox"
            checked={layers.userFlows}
            onChange={() => onToggleUserFlows(connectionTool)}
          />
          <span>User Flows</span>
        </label>
        <label className="layers-panel-item">
          <input
            type="checkbox"
            checked={layers.crossLinks}
            onChange={() => onToggleCrossLinks(connectionTool)}
          />
          <span>Cross-links</span>
        </label>
        <label className="layers-panel-item disabled">
          <input
            type="checkbox"
            checked={layers.xmlComparison}
            disabled
            onChange={() => {}}
          />
          <span>XML Comparison</span>
        </label>
      </div>
    )}
  </div>
);

export default LayersPanel;
