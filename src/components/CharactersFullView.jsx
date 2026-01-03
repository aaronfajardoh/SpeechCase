import React, { useState, useMemo } from 'react'
import { IconUsers, IconChevronLeft } from './Icons.jsx'

// Recursive component to render org chart nodes
const OrgChartNode = ({ character, children, level, onSelect, selectedCharacter, getAvatarColor, getAvatarInitials }) => {
  const avatarColor = getAvatarColor(character.name)
  const avatarInitials = getAvatarInitials(character.name)
  const hasChildren = children && children.length > 0
  const isSelected = selectedCharacter && selectedCharacter.name === character.name

  return (
    <div className="org-chart-node">
      <div className="org-chart-node-content">
        <div
          className={`character-card org-chart-card ${isSelected ? 'selected' : ''}`}
          onClick={() => onSelect(character)}
        >
          <div className="character-card-avatar">
            {character.imageUrl ? (
              <img
                src={character.imageUrl}
                alt={character.name}
                onError={(e) => {
                  e.target.style.display = 'none'
                  e.target.nextSibling.style.display = 'flex'
                }}
              />
            ) : null}
            <div
              className="character-card-avatar-placeholder"
              style={{
                backgroundColor: avatarColor,
                display: character.imageUrl ? 'none' : 'flex'
              }}
            >
              {avatarInitials}
            </div>
          </div>
          <div className="character-card-info">
            <div className="character-card-name">{character.name}</div>
            {character.role && (
              <div className="character-card-role">{character.role}</div>
            )}
            {character.department && (
              <div className="character-card-department">{character.department}</div>
            )}
            {isSelected && character.description && (
              <div className="character-card-description">{character.description}</div>
            )}
          </div>
        </div>
        {hasChildren && <div className="org-chart-connector"></div>}
      </div>
      {hasChildren && (
        <div className="org-chart-children">
          {children.map((child, index) => (
            <OrgChartNode
              key={child.character.name}
              character={child.character}
              children={child.children}
              level={level + 1}
              onSelect={onSelect}
              selectedCharacter={selectedCharacter}
              getAvatarColor={getAvatarColor}
              getAvatarInitials={getAvatarInitials}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const CharactersFullView = ({ characters, onMinimize }) => {
  const [selectedCharacter, setSelectedCharacter] = useState(null)

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

  // Build org chart tree structure
  const orgChartTree = useMemo(() => {
    if (!characters || !characters.isOrgChart || !characters.characters) {
      return { tree: null, unconnected: [] }
    }

    const orgChartCharacters = characters.characters.filter(c => c.inOrgChart !== false)
    if (orgChartCharacters.length === 0) {
      return { tree: null, unconnected: [] }
    }

    // Find root (CEO or person with no reportsTo)
    const roots = orgChartCharacters.filter(c => !c.reportsTo || c.reportsTo.trim() === '')
    
    // If no clear root, find the person with the highest role (CEO, President, etc.)
    let root = roots.find(c => 
      c.role && /CEO|President|Founder|Chief Executive/i.test(c.role)
    ) || roots[0]

    // If still no root, use first character
    if (!root && orgChartCharacters.length > 0) {
      root = orgChartCharacters[0]
    }

    // Build tree structure
    const processed = new Set()
    const processNode = (node) => {
      if (processed.has(node.character.name)) return null
      processed.add(node.character.name)
      
      const directReports = orgChartCharacters.filter(c => 
        c.reportsTo && c.reportsTo.trim() === node.character.name.trim()
      )
      
      return {
        character: node.character,
        children: directReports
          .map(report => processNode({ character: report }))
          .filter(Boolean)
      }
    }

    const tree = root ? processNode({ character: root }) : null

    // Find unconnected characters (those not in the tree)
    const unconnected = orgChartCharacters.filter(c => !processed.has(c.name))

    return { tree, unconnected }
  }, [characters])

  // Get characters outside org chart
  const externalCharacters = useMemo(() => {
    if (!characters || !characters.characters) return []
    return characters.characters.filter(c => c.inOrgChart === false)
  }, [characters])

  // Handle character selection
  const handleCharacterSelect = (character) => {
    if (selectedCharacter && selectedCharacter.name === character.name) {
      setSelectedCharacter(null)
    } else {
      setSelectedCharacter(character)
    }
  }

  if (!characters || !characters.characters || characters.characters.length === 0) {
    return null
  }

  const allCharacters = characters.characters
  const hasOrgChart = characters.isOrgChart && orgChartTree.tree
  const hasUnconnected = orgChartTree.unconnected && orgChartTree.unconnected.length > 0

  return (
    <div className="characters-full-view">
      <div className="characters-full-view-header">
        <div className="characters-full-view-title">
          <IconUsers size={24} />
          <h2>Characters</h2>
          <span className="characters-full-view-count">{allCharacters.length} characters</span>
        </div>
        <button
          className="btn-back-to-pdf"
          onClick={onMinimize}
          title="Back to PDF"
        >
          <IconChevronLeft size={18} />
          <span>Back to PDF</span>
        </button>
      </div>

      <div className="characters-full-view-content">
        {/* Org Chart Section */}
        {hasOrgChart && (
          <div className="characters-org-chart-section">
            <h3>Organizational Structure</h3>
            <div className="org-chart-container">
              <OrgChartNode
                character={orgChartTree.tree.character}
                children={orgChartTree.tree.children}
                level={0}
                onSelect={handleCharacterSelect}
                selectedCharacter={selectedCharacter}
                getAvatarColor={getAvatarColor}
                getAvatarInitials={getAvatarInitials}
              />
            </div>
          </div>
        )}

        {/* Unconnected Characters Section (characters that don't fit in org chart) */}
        {hasOrgChart && hasUnconnected && (
          <div className="characters-unconnected-section">
            <h3>Additional Characters</h3>
            <div className="characters-grid">
              {orgChartTree.unconnected.map((character, index) => {
                const avatarColor = getAvatarColor(character.name)
                const avatarInitials = getAvatarInitials(character.name)
                const isSelected = selectedCharacter && selectedCharacter.name === character.name

                return (
                  <div
                    key={`unconnected-${index}`}
                    className={`character-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleCharacterSelect(character)}
                  >
                    <div className="character-card-avatar">
                      {character.imageUrl ? (
                        <img
                          src={character.imageUrl}
                          alt={character.name}
                          onError={(e) => {
                            e.target.style.display = 'none'
                            e.target.nextSibling.style.display = 'flex'
                          }}
                        />
                      ) : null}
                      <div
                        className="character-card-avatar-placeholder"
                        style={{
                          backgroundColor: avatarColor,
                          display: character.imageUrl ? 'none' : 'flex'
                        }}
                      >
                        {avatarInitials}
                      </div>
                    </div>
                    <div className="character-card-info">
                      <div className="character-card-name">{character.name}</div>
                      {character.role && (
                        <div className="character-card-role">{character.role}</div>
                      )}
                      {character.department && (
                        <div className="character-card-department">{character.department}</div>
                      )}
                      {isSelected && character.description && (
                        <div className="character-card-description">{character.description}</div>
                      )}
                      {isSelected && character.reportsTo && (
                        <div className="character-card-reports-to">
                          <strong>Reports to:</strong> {character.reportsTo}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Characters Grid (for non-org chart view) */}
        {!hasOrgChart && (
          <div className="characters-grid-section">
            <h3>Characters</h3>
            <div className="characters-grid">
              {allCharacters.map((character, index) => {
                const avatarColor = getAvatarColor(character.name)
                const avatarInitials = getAvatarInitials(character.name)
                const isSelected = selectedCharacter && selectedCharacter.name === character.name

                return (
                  <div
                    key={`character-${index}`}
                    className={`character-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleCharacterSelect(character)}
                  >
                    <div className="character-card-avatar">
                      {character.imageUrl ? (
                        <img
                          src={character.imageUrl}
                          alt={character.name}
                          onError={(e) => {
                            e.target.style.display = 'none'
                            e.target.nextSibling.style.display = 'flex'
                          }}
                        />
                      ) : null}
                      <div
                        className="character-card-avatar-placeholder"
                        style={{
                          backgroundColor: avatarColor,
                          display: character.imageUrl ? 'none' : 'flex'
                        }}
                      >
                        {avatarInitials}
                      </div>
                    </div>
                    <div className="character-card-info">
                      <div className="character-card-name">{character.name}</div>
                      {character.role && (
                        <div className="character-card-role">{character.role}</div>
                      )}
                      {character.department && (
                        <div className="character-card-department">{character.department}</div>
                      )}
                      {isSelected && character.description && (
                        <div className="character-card-description">{character.description}</div>
                      )}
                      {isSelected && character.reportsTo && (
                        <div className="character-card-reports-to">
                          <strong>Reports to:</strong> {character.reportsTo}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* External Characters Section (if org chart and there are external characters) */}
        {characters.isOrgChart && externalCharacters.length > 0 && (
          <div className="characters-external-section">
            <h3>External Stakeholders</h3>
            <div className="characters-grid">
              {externalCharacters.map((character, index) => {
                const avatarColor = getAvatarColor(character.name)
                const avatarInitials = getAvatarInitials(character.name)
                const isSelected = selectedCharacter && selectedCharacter.name === character.name

                return (
                  <div
                    key={`external-${index}`}
                    className={`character-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleCharacterSelect(character)}
                  >
                    <div className="character-card-avatar">
                      {character.imageUrl ? (
                        <img
                          src={character.imageUrl}
                          alt={character.name}
                          onError={(e) => {
                            e.target.style.display = 'none'
                            e.target.nextSibling.style.display = 'flex'
                          }}
                        />
                      ) : null}
                      <div
                        className="character-card-avatar-placeholder"
                        style={{
                          backgroundColor: avatarColor,
                          display: character.imageUrl ? 'none' : 'flex'
                        }}
                      >
                        {avatarInitials}
                      </div>
                    </div>
                    <div className="character-card-info">
                      <div className="character-card-name">{character.name}</div>
                      {character.role && (
                        <div className="character-card-role">{character.role}</div>
                      )}
                      {isSelected && character.description && (
                        <div className="character-card-description">{character.description}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CharactersFullView

