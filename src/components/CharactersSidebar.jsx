import React, { useState } from 'react'
import { IconUsers, IconLoading, IconExpand } from './Icons.jsx'

// Sidebar tab: characters
const CharactersSidebar = ({
  isPDFProcessing,
  isCharactersLoading,
  charactersError,
  documentId,
  generateCharacters,
  characters,
  isCharactersExpanded,
  setIsCharactersExpanded,
  isSidebarCollapsed
}) => {
  const [expandedCharacterId, setExpandedCharacterId] = useState(null)

  const handleCharacterClick = (characterId) => {
    setExpandedCharacterId(expandedCharacterId === characterId ? null : characterId)
  }

  // Generate placeholder avatar from name
  const getAvatarInitials = (name) => {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  // Get avatar color based on name
  const getAvatarColor = (name) => {
    if (!name) return '#8ab4f8'
    const colors = [
      '#8ab4f8', '#34a853', '#fbbc04', '#ea4335', '#9c27b0',
      '#00bcd4', '#ff9800', '#4caf50', '#2196f3', '#e91e63'
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  if (isPDFProcessing) {
    return (
      <div className="sidebar-tab-content characters-sidebar-content">
        <div className="characters-loading">
          <IconLoading size={32} />
          <p>Processing PDF for AI features...</p>
          <p className="characters-loading-subtitle">This may take a moment</p>
        </div>
      </div>
    )
  }

  if (isCharactersLoading) {
    return (
      <div className="sidebar-tab-content characters-sidebar-content">
        <div className="characters-loading">
          <IconLoading size={32} />
          <p>Extracting characters...</p>
        </div>
      </div>
    )
  }

  if (charactersError) {
    return (
      <div className="sidebar-tab-content characters-sidebar-content">
        <div className="characters-error">
          <IconUsers size={48} />
          <h3>Unable to Extract Characters</h3>
          <p>{charactersError}</p>
          {documentId && (
            <button className="btn-retry-characters" onClick={() => generateCharacters(0)}>
              Try Again
            </button>
          )}
        </div>
      </div>
    )
  }

  if (characters && characters.characters && characters.characters.length > 0) {
    const characterList = characters.characters

    return (
      <div className="sidebar-tab-content characters-sidebar-content">
        <div className="characters-list">
          <div className="characters-header">
            <div className="characters-header-left">
              <h3>Characters</h3>
              <span className="characters-count">{characterList.length}</span>
            </div>
            <button
              className="btn-expand-characters"
              onClick={() => setIsCharactersExpanded(!isCharactersExpanded)}
              title={isCharactersExpanded ? 'Minimize characters' : 'Expand characters'}
            >
              <IconExpand size={18} />
              {!isSidebarCollapsed && <span>{isCharactersExpanded ? 'Minimize' : 'Expand'}</span>}
            </button>
          </div>
          <div className="characters-items">
            {characterList.map((character, index) => {
              const characterId = `character-${index}`
              const isExpanded = expandedCharacterId === characterId
              const avatarColor = getAvatarColor(character.name)
              const avatarInitials = getAvatarInitials(character.name)

              return (
                <div
                  key={characterId}
                  className={`character-item ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => handleCharacterClick(characterId)}
                >
                  <div className="character-item-main">
                    <div className="character-avatar">
                      {character.imageUrl ? (
                        <img
                          src={character.imageUrl}
                          alt={character.name}
                          onError={(e) => {
                            // Fallback to avatar if image fails to load
                            e.target.style.display = 'none'
                            e.target.nextSibling.style.display = 'flex'
                          }}
                        />
                      ) : null}
                      <div
                        className="character-avatar-placeholder"
                        style={{
                          backgroundColor: avatarColor,
                          display: character.imageUrl ? 'none' : 'flex'
                        }}
                      >
                        {avatarInitials}
                      </div>
                    </div>
                    <div className="character-info">
                      <div className="character-name">{character.name}</div>
                      {character.role && (
                        <div className="character-role">{character.role}</div>
                      )}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="character-details">
                      {character.description && (
                        <div className="character-description">{character.description}</div>
                      )}
                      {character.department && (
                        <div className="character-meta">
                          <strong>Department:</strong> {character.department}
                        </div>
                      )}
                      {character.reportsTo && (
                        <div className="character-meta">
                          <strong>Reports to:</strong> {character.reportsTo}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar-tab-content characters-sidebar-content">
      <div className="feature-placeholder">
        <IconUsers size={48} />
        <h3>Characters</h3>
        <p>Click to extract characters from the story</p>
        {documentId && (
          <button className="btn-generate-characters" onClick={generateCharacters}>
            Extract Characters
          </button>
        )}
      </div>
    </div>
  )
}

export default CharactersSidebar
