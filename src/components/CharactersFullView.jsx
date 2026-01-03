import React, { useState, useMemo } from 'react'
import { IconUsers, IconChevronLeft } from './Icons.jsx'
import MermaidDiagram from './MermaidDiagram.jsx'

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

  // Build org chart Mermaid diagram
  const orgChartDiagram = useMemo(() => {
    if (!characters || !characters.isOrgChart || !characters.characters) {
      return null
    }

    const orgChartCharacters = characters.characters.filter(c => c.inOrgChart !== false)
    if (orgChartCharacters.length === 0) {
      return null
    }

    // Build the Mermaid org chart syntax
    let mermaidCode = 'graph TD\n'
    
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

    // Build relationships
    const processed = new Set()
    const queue = root ? [root] : []
    
    while (queue.length > 0) {
      const current = queue.shift()
      if (processed.has(current.name)) continue
      processed.add(current.name)

      // Find direct reports
      const reports = orgChartCharacters.filter(c => 
        c.reportsTo && c.reportsTo.trim() === current.name.trim()
      )

      // Add node for current person
      const nodeId = current.name.replace(/[^a-zA-Z0-9]/g, '_')
      const nodeLabel = `${current.name}\\n${current.role || ''}`
      mermaidCode += `    ${nodeId}["${nodeLabel}"]\n`

      // Add edges to reports
      reports.forEach(report => {
        const reportId = report.name.replace(/[^a-zA-Z0-9]/g, '_')
        mermaidCode += `    ${nodeId} --> ${reportId}\n`
        if (!processed.has(report.name)) {
          queue.push(report)
        }
      })
    }

    // Add any remaining characters that weren't processed
    orgChartCharacters.forEach(char => {
      if (!processed.has(char.name)) {
        const nodeId = char.name.replace(/[^a-zA-Z0-9]/g, '_')
        const nodeLabel = `${char.name}\\n${char.role || ''}`
        mermaidCode += `    ${nodeId}["${nodeLabel}"]\n`
        
        if (char.reportsTo) {
          const reportsToId = char.reportsTo.replace(/[^a-zA-Z0-9]/g, '_')
          mermaidCode += `    ${reportsToId} --> ${nodeId}\n`
        }
      }
    })

    return mermaidCode
  }, [characters])

  // Get characters outside org chart
  const externalCharacters = useMemo(() => {
    if (!characters || !characters.characters) return []
    return characters.characters.filter(c => c.inOrgChart === false)
  }, [characters])

  // Get org chart characters
  const orgChartCharacters = useMemo(() => {
    if (!characters || !characters.characters) return []
    return characters.characters.filter(c => c.inOrgChart !== false)
  }, [characters])

  if (!characters || !characters.characters || characters.characters.length === 0) {
    return null
  }

  const allCharacters = characters.characters

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
        {characters.isOrgChart && orgChartDiagram && (
          <div className="characters-org-chart-section">
            <h3>Organizational Structure</h3>
            <div className="mermaid-container">
              <MermaidDiagram chart={orgChartDiagram} fontSize={14} />
            </div>
          </div>
        )}

        {/* Characters Grid */}
        <div className="characters-grid-section">
          <h3>{characters.isOrgChart ? 'All Characters' : 'Characters'}</h3>
          <div className="characters-grid">
            {allCharacters.map((character, index) => {
              const avatarColor = getAvatarColor(character.name)
              const avatarInitials = getAvatarInitials(character.name)
              const isSelected = selectedCharacter === index

              return (
                <div
                  key={`character-${index}`}
                  className={`character-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedCharacter(isSelected ? null : index)}
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
                    {character.inOrgChart === false && (
                      <div className="character-card-external-badge">External</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* External Characters Section (if org chart and there are external characters) */}
        {characters.isOrgChart && externalCharacters.length > 0 && (
          <div className="characters-external-section">
            <h3>External Stakeholders</h3>
            <div className="characters-grid">
              {externalCharacters.map((character, index) => {
                const avatarColor = getAvatarColor(character.name)
                const avatarInitials = getAvatarInitials(character.name)
                const isSelected = selectedCharacter === `external-${index}`

                return (
                  <div
                    key={`external-${index}`}
                    className={`character-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedCharacter(isSelected ? null : `external-${index}`)}
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

