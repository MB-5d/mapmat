import React, { useEffect, useRef, useState } from 'react';

import Avatar from '../ui/Avatar';
import TextInput from '../ui/TextInput';

const CanvasMapHeader = ({
  canEdit,
  mapName,
  isEditingMapName,
  onMapNameChange,
  onMapNameBlur,
  onMapNameKeyDown,
  onMapNameClick,
  collaborators = [],
}) => {
  const [showCollaboratorMenu, setShowCollaboratorMenu] = useState(false);
  const collaboratorMenuRef = useRef(null);

  useEffect(() => {
    if (!showCollaboratorMenu) return;
    const handleClickOutside = (event) => {
      if (collaboratorMenuRef.current && !collaboratorMenuRef.current.contains(event.target)) {
        setShowCollaboratorMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCollaboratorMenu]);

  const visibleCollaborators = collaborators.slice(0, 2);
  const hiddenCollaboratorCount = Math.max(0, collaborators.length - visibleCollaborators.length);

  return (
    <div className="canvas-map-header">
      <div className="canvas-map-pill">
        {isEditingMapName ? (
          <TextInput
            className="canvas-map-name-input"
            framed={false}
            value={mapName}
            onChange={onMapNameChange}
            onBlur={onMapNameBlur}
            onKeyDown={onMapNameKeyDown}
            autoFocus
            spellCheck={false}
          />
        ) : (
          <button
            type="button"
            className={`canvas-map-name-button${canEdit ? '' : ' static'}`}
            onClick={canEdit ? onMapNameClick : undefined}
            title={canEdit ? 'Click to rename' : mapName}
          >
            <span className="canvas-map-name-text">{mapName || 'Untitled Map'}</span>
          </button>
        )}

        {collaborators.length > 0 && (
          <div className="canvas-map-collaborators" ref={collaboratorMenuRef}>
            <button
              type="button"
              className="topbar-collaborator-stack canvas-map-collaborator-stack"
              title={`${collaborators.length} active collaborator${collaborators.length === 1 ? '' : 's'}`}
              aria-haspopup="menu"
              aria-expanded={showCollaboratorMenu}
              onClick={() => setShowCollaboratorMenu((prev) => !prev)}
            >
              {visibleCollaborators.map((collaborator) => (
                <Avatar
                  key={collaborator.id}
                  className="topbar-collaborator-avatar"
                  src={collaborator.avatarUrl}
                  label={collaborator.avatarLabel}
                  size="md"
                  tone={collaborator.tone}
                  bordered
                  aria-hidden="true"
                />
              ))}
              {hiddenCollaboratorCount > 0 && (
                <span className="topbar-collaborator-hover-count" aria-hidden="true">
                  {collaborators.length}
                </span>
              )}
            </button>
            {showCollaboratorMenu && (
              <div className="topbar-collaborator-menu canvas-map-collaborator-menu" role="menu">
                <div className="topbar-collaborator-menu-header">
                  {collaborators.length} active collaborator{collaborators.length === 1 ? '' : 's'}
                </div>
                {collaborators.map((collaborator) => (
                  <div key={collaborator.id} className="topbar-collaborator-item" role="menuitem">
                    <Avatar
                      className="topbar-collaborator-avatar"
                      src={collaborator.avatarUrl}
                      label={collaborator.avatarLabel}
                      size="md"
                      tone={collaborator.tone}
                      bordered
                      aria-hidden="true"
                    />
                    <div className="topbar-collaborator-item-copy">
                      <span className="topbar-collaborator-item-name">{collaborator.label}</span>
                      <span className="topbar-collaborator-item-role">{String(collaborator.accessMode || 'view')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CanvasMapHeader;
