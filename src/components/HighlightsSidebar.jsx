import React, { useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { IconHighlighter, IconRefresh, IconTrash, IconCopy, IconDownload, IconExpand } from './Icons.jsx'
import { Document, Packer, Paragraph, TextRun } from 'docx'
import MermaidDiagram from './MermaidDiagram.jsx'

// Sidebar tab: highlights
const HighlightsSidebar = ({ highlightItems, setHighlightItems, documentId, highlights, onColorChange, onDelete, pdfFileName, onExpandSummary, onExpandHighlights, onSummaryGenerated }) => {
  const [hoveredItemId, setHoveredItemId] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState(null)
  const isHoveringTooltipRef = useRef(false)
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [dropPosition, setDropPosition] = useState(null) // { itemId, position: 'before' | 'after', inline: boolean }
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [activeTab, setActiveTab] = useState('highlights') // 'highlights' | 'summary'
  const [summaryText, setSummaryText] = useState('') // Store the summary separately
  const editInputRef = useRef(null)

  // Handle double-click to edit
  const handleDoubleClick = (item) => {
    setEditingId(item.id)
    setEditingText(item.text)
    setTimeout(() => {
      if (editInputRef.current) {
        editInputRef.current.focus()
        editInputRef.current.select()
      }
    }, 0)
  }

  // Save edited text
  const handleSaveEdit = (id) => {
    if (editingText.trim()) {
      setHighlightItems(prev =>
        prev.map(item =>
          item.id === id ? { ...item, text: editingText.trim() } : item
        )
      )
    }
    setEditingId(null)
    setEditingText('')
  }

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingText('')
  }

  // Handle drag start
  const handleDragStart = (e, item) => {
    setDraggedId(item.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  // Handle drag over
  const handleDragOver = (e, item) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverId(item.id)
    
    // Check if dragged item or target item is blue (bullet point)
    const draggedItem = highlightItems.find(i => i.id === draggedId)
    const isDraggedBlue = draggedItem?.color === 'blue'
    const isTargetBlue = item.color === 'blue'
    
    // Blue items cannot be placed inline - force new line
    const cannotBeInline = isDraggedBlue || isTargetBlue
    
    // Determine drop position based on mouse position
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseX = e.clientX
    const mouseY = e.clientY
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    
    // Check if mouse is in the left or right half
    const isLeft = mouseX < centerX
    const position = isLeft ? 'before' : 'after'
    
    // Determine if inline (same line) or new line
    // If mouse is in the middle 70% vertically, consider it inline
    // This allows for easier inline placement
    const verticalTop = rect.top + rect.height * 0.15
    const verticalBottom = rect.top + rect.height * 0.85
    let isInline = mouseY >= verticalTop && mouseY <= verticalBottom
    
    // Force new line if blue item is involved
    if (cannotBeInline) {
      isInline = false
    }
    
    setDropPosition({ itemId: item.id, position, inline: isInline })
  }

  // Handle drop
  const handleDrop = (e, targetItem) => {
    e.preventDefault()
    if (!draggedId || draggedId === targetItem.id) {
      setDraggedId(null)
      setDragOverId(null)
      setDropPosition(null)
      return
    }

    // Check if dragged item or target item is blue (bullet point)
    const draggedItem = highlightItems.find(i => i.id === draggedId)
    const isDraggedBlue = draggedItem?.color === 'blue'
    const isTargetBlue = targetItem.color === 'blue'
    
    // Blue items cannot be placed inline - force new line
    const cannotBeInline = isDraggedBlue || isTargetBlue

    const position = dropPosition || { itemId: targetItem.id, position: 'after', inline: false }
    // Force new line if blue item is involved
    const isInline = !cannotBeInline && position.inline && position.itemId === targetItem.id

    setHighlightItems(prev => {
      const items = [...prev]
      const draggedIndex = items.findIndex(item => item.id === draggedId)
      const targetIndex = items.findIndex(item => item.id === targetItem.id)

      if (draggedIndex === -1 || targetIndex === -1) return prev

      const [draggedItem] = items.splice(draggedIndex, 1)
      
      // Adjust target index if dragged item was before target
      let insertIndex = targetIndex
      if (draggedIndex < targetIndex) {
        insertIndex = targetIndex - 1
      }
      
      // Insert based on position
      if (position.position === 'after') {
        insertIndex += 1
      }
      
      // Add inline property if placing inline (but never for blue items)
      const itemToInsert = isInline 
        ? { ...draggedItem, inline: true }
        : { ...draggedItem, inline: false }
      
      items.splice(insertIndex, 0, itemToInsert)
      
      // If placing inline, also mark the target item as inline (if it wasn't already)
      // But skip this if either item is blue
      if (isInline && !cannotBeInline) {
        const finalTargetIndex = items.findIndex(item => item.id === targetItem.id)
        if (finalTargetIndex !== -1) {
          items[finalTargetIndex] = { ...items[finalTargetIndex], inline: true }
        }
      }
      
      // Update order
      return items.map((item, index) => ({ ...item, order: index }))
    })

    setDraggedId(null)
    setDragOverId(null)
    setDropPosition(null)
  }

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedId(null)
    setDragOverId(null)
    setDropPosition(null)
  }

  // Handle concatenation (dropping on drag handle)
  const handleConcatenate = (targetId) => {
    if (!draggedId || draggedId === targetId) return

    setHighlightItems(prev => {
      const items = [...prev]
      const draggedIndex = items.findIndex(item => item.id === draggedId)
      const targetIndex = items.findIndex(item => item.id === targetId)

      if (draggedIndex === -1 || targetIndex === -1) return prev

      const draggedItem = items[draggedIndex]
      const targetItem = items[targetIndex]

      // Concatenate text
      const newText = `${targetItem.text} ${draggedItem.text}`.trim()
      const updatedTarget = { ...targetItem, text: newText }

      // Remove dragged item and update target
      const newItems = items.filter(item => item.id !== draggedId)
      const finalItems = newItems.map(item =>
        item.id === targetId ? updatedTarget : item
      )

      // Update order
      return finalItems.map((item, index) => ({ ...item, order: index }))
    })

    setDraggedId(null)
    setDragOverId(null)
  }

  // Generate summary (used by both Format as Summary and Update button)
  const generateSummary = async () => {
    if (!documentId || highlightItems.length === 0) {
      alert('No highlights to summarize. Please highlight some text first.')
      return
    }

    setIsGeneratingSummary(true)
    try {
      // Combine all highlight texts
      const combinedText = highlightItems
        .map(item => item.text)
        .join('\n\n')

      const response = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentId,
          highlights: combinedText
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate summary')
      }

      const data = await response.json()
      
      // Store summary and switch to summary tab
      setSummaryText(data.summary)
      setActiveTab('summary')
      // Notify parent component of the generated summary
      if (onSummaryGenerated) {
        onSummaryGenerated(data.summary)
      }
    } catch (error) {
      console.error('Error generating summary:', error)
      alert(`Failed to generate summary: ${error.message}`)
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  // Format as Summary button handler
  const handleFormatAsSummary = () => {
    generateSummary()
  }

  // Update summary button handler
  const handleUpdateSummary = () => {
    generateSummary()
  }

  // Copy summary to clipboard
  const handleCopySummary = async () => {
    if (!summaryText) return

    try {
      // Convert markdown to plain text for copying
      // Remove markdown syntax (basic conversion)
      const plainText = summaryText
        .replace(/#{1,6}\s+/g, '') // Remove headers
        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.+?)\*/g, '$1') // Remove italic
        .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links
        .replace(/`(.+?)`/g, '$1') // Remove inline code
        .replace(/```mermaid[\s\S]*?```/g, '[Diagram]') // Replace Mermaid diagrams with placeholder
        .replace(/```[\s\S]*?```/g, '') // Remove other code blocks
        .trim()

      await navigator.clipboard.writeText(plainText)
    } catch (error) {
      console.error('Failed to copy summary:', error)
      alert('Failed to copy summary to clipboard')
    }
  }

  // Download summary as DOCX
  const handleDownloadSummary = async () => {
    if (!summaryText) return

    try {
      // Convert markdown to plain text for the document
      const plainText = summaryText
        .replace(/#{1,6}\s+/g, '') // Remove headers
        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.+?)\*/g, '$1') // Remove italic
        .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links
        .replace(/`(.+?)`/g, '$1') // Remove inline code
        .replace(/```mermaid[\s\S]*?```/g, '[Diagram]') // Replace Mermaid diagrams with placeholder
        .replace(/```[\s\S]*?```/g, '') // Remove other code blocks
        .trim()

      // Split text into paragraphs
      const paragraphs = plainText
        .split(/\n\n+/)
        .filter(p => p.trim())
        .map(text => 
          new Paragraph({
            children: [new TextRun(text.trim())],
            spacing: { after: 200 }
          })
        )

      // Create document
      const doc = new Document({
        sections: [{
          properties: {},
          children: paragraphs
        }]
      })

      // Generate and download
      const blob = await Packer.toBlob(doc)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      // Create filename: "Summary - [pdf name].docx"
      let fileName = 'Summary.docx'
      if (pdfFileName) {
        // Remove .pdf extension if present and add .docx
        const baseName = pdfFileName.replace(/\.pdf$/i, '')
        fileName = `Summary - ${baseName}.docx`
      }
      
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download summary:', error)
      alert('Failed to download summary as DOCX')
    }
  }

  // Copy highlights to clipboard
  const handleCopyHighlights = async () => {
    if (!highlightItems || highlightItems.length === 0) return

    try {
      const text = highlightItems
        .map(item => {
          if (item.color === 'blue') {
            return `• ${item.text}`
          }
          return item.text
        })
        .join('\n\n')

      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.error('Failed to copy highlights:', error)
      alert('Failed to copy highlights to clipboard')
    }
  }

  // Download highlights as DOCX
  const handleDownloadHighlights = async () => {
    if (!highlightItems || highlightItems.length === 0) return

    try {
      // Create paragraphs from highlights
      const paragraphs = highlightItems.map(item => {
        let text = item.text
        if (item.color === 'blue') {
          text = `• ${text}`
        }
        return new Paragraph({
          children: [new TextRun(text)],
          spacing: { after: 200 }
        })
      })

      // Create document
      const doc = new Document({
        sections: [{
          properties: {},
          children: paragraphs
        }]
      })

      // Generate and download
      const blob = await Packer.toBlob(doc)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      // Create filename: "Highlights - [pdf name].docx"
      let fileName = 'Highlights.docx'
      if (pdfFileName) {
        // Remove .pdf extension if present and add .docx
        const baseName = pdfFileName.replace(/\.pdf$/i, '')
        fileName = `Highlights - ${baseName}.docx`
      }
      
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download highlights:', error)
      alert('Failed to download highlights as DOCX')
    }
  }

  // Get formatting class based on color
  const getFormattingClass = (color) => {
    switch (color) {
      case 'green':
        return 'highlight-item-h2'
      case 'blue':
        return 'highlight-item-bullet'
      default:
        return 'highlight-item-normal'
    }
  }

  if (highlightItems.length === 0) {
    return (
      <div className="sidebar-tab-content">
        <div className="feature-placeholder">
          <IconHighlighter size={48} />
          <h3>Highlights</h3>
          <p>Highlighted content will appear here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar-tab-content highlights-sidebar-content">
      <div className="highlights-editor">
        {/* Tab Navigation */}
        <div className="highlights-tabs">
          <div className="highlights-tabs-left">
            <button
              className={`highlights-tab ${activeTab === 'highlights' ? 'active' : ''}`}
              onClick={() => setActiveTab('highlights')}
            >
              Highlights
            </button>
            {summaryText && (
              <button
                className={`highlights-tab ${activeTab === 'summary' ? 'active' : ''}`}
                onClick={() => setActiveTab('summary')}
              >
                Summary
              </button>
            )}
          </div>
          {activeTab === 'summary' && summaryText && (
            <div className="highlights-summary-actions">
              <button
                className="btn-summary-action btn-copy-summary"
                onClick={handleCopySummary}
                title="Copy summary to clipboard"
              >
                <IconCopy size={14} />
              </button>
              <button
                className="btn-summary-action btn-download-summary"
                onClick={handleDownloadSummary}
                title="Download summary as DOCX"
              >
                <IconDownload size={14} />
              </button>
              <button
                className="btn-summary-action btn-expand-summary"
                onClick={onExpandSummary}
                title="Expand to full view"
              >
                <IconExpand size={14} />
              </button>
            </div>
          )}
          {activeTab === 'highlights' && highlightItems.length > 0 && (
            <div className="highlights-summary-actions">
              <button
                className="btn-summary-action btn-copy-highlights"
                onClick={handleCopyHighlights}
                title="Copy highlights to clipboard"
              >
                <IconCopy size={14} />
              </button>
              <button
                className="btn-summary-action btn-download-highlights"
                onClick={handleDownloadHighlights}
                title="Download highlights as DOCX"
              >
                <IconDownload size={14} />
              </button>
              <button
                className="btn-summary-action btn-expand-highlights"
                onClick={onExpandHighlights}
                title="Expand to full view"
              >
                <IconExpand size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Tab Content */}
        <div className="highlights-tab-content">
          {activeTab === 'highlights' && (
            <>
              <div 
                className="highlights-items"
                onDragOver={(e) => {
                  // Allow dropping on empty space
                  if (e.target === e.currentTarget || e.target.classList.contains('highlights-items')) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDropPosition({ itemId: null, position: 'after', inline: false })
                  }
                }}
                onDrop={(e) => {
                  // Handle drop on empty space
                  if (e.target === e.currentTarget || e.target.classList.contains('highlights-items')) {
                    e.preventDefault()
                    if (!draggedId) return
                    
                    setHighlightItems(prev => {
                      const items = [...prev]
                      const draggedIndex = items.findIndex(item => item.id === draggedId)
                      if (draggedIndex === -1) return prev
                      
                      const [draggedItem] = items.splice(draggedIndex, 1)
                      items.push({ ...draggedItem, inline: false })
                      
                      return items.map((item, index) => ({ ...item, order: index }))
                    })
                    
                    setDraggedId(null)
                    setDragOverId(null)
                    setDropPosition(null)
                  }
                }}
              >
              {highlightItems.map((item, index) => {
                const showDropIndicator = dropPosition && dropPosition.itemId === item.id
                const isInlineDrop = showDropIndicator && dropPosition.inline
                const isNewLineDrop = showDropIndicator && !dropPosition.inline
                
                return (
                  <React.Fragment key={item.id}>
                    {/* Drop indicator for new line before */}
                    {isNewLineDrop && dropPosition.position === 'before' && (
                      <div className="drop-indicator drop-indicator-newline" />
                    )}
                    
                    <span
                      className={`highlight-item ${getFormattingClass(item.color)} ${draggedId === item.id ? 'dragging' : ''} ${dragOverId === item.id ? 'drag-over' : ''} ${item.inline ? 'inline-item' : ''} ${isInlineDrop ? 'drop-preview-inline' : ''}`}
                      data-color={item.color || 'yellow'}
                      draggable={editingId !== item.id}
                      onDragStart={(e) => handleDragStart(e, item)}
                      onDragOver={(e) => handleDragOver(e, item)}
                      onDrop={(e) => handleDrop(e, item)}
                      onDragEnd={handleDragEnd}
                      onMouseEnter={(e) => {
                        if (editingId !== item.id) {
                          setHoveredItemId(item.id)
                          const rect = e.currentTarget.getBoundingClientRect()
                          setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.top })
                        }
                      }}
                      onMouseLeave={() => {
                        setTimeout(() => {
                          if (!isHoveringTooltipRef.current) {
                            setHoveredItemId(null)
                            setTooltipPosition(null)
                          }
                        }, 200)
                      }}
                    >
                      {/* Inline drop indicator before */}
                      {isInlineDrop && dropPosition.position === 'before' && (
                        <span className="drop-indicator-inline drop-indicator-inline-before" />
                      )}
                      
                      {editingId === item.id ? (
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onBlur={() => handleSaveEdit(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSaveEdit(item.id)
                            } else if (e.key === 'Escape') {
                              handleCancelEdit()
                            }
                          }}
                          className="highlight-edit-input"
                          autoFocus
                        />
                      ) : (
                        <span
                          className="highlight-item-content"
                          onDoubleClick={() => handleDoubleClick(item)}
                        >
                          {item.color === 'blue' && <span className="bullet-point">•</span>}
                          {item.text}
                        </span>
                      )}
                      
                      {/* Inline drop indicator after */}
                      {isInlineDrop && dropPosition.position === 'after' && (
                        <span className="drop-indicator-inline drop-indicator-inline-after" />
                      )}
                      
                      {/* Tooltip for sidebar highlights */}
                      {hoveredItemId === item.id && tooltipPosition && (
                        <div
                          className="highlight-tooltip sidebar-tooltip"
                          style={{
                            position: 'fixed',
                            left: tooltipPosition.x + 'px',
                            top: (tooltipPosition.y - 7.5) + 'px',
                            transform: 'translate(-50%, -100%)',
                            zIndex: 1000
                          }}
                          onMouseEnter={() => {
                            isHoveringTooltipRef.current = true
                            setHoveredItemId(item.id)
                          }}
                          onMouseLeave={() => {
                            isHoveringTooltipRef.current = false
                            setTimeout(() => {
                              if (!isHoveringTooltipRef.current) {
                                setHoveredItemId(null)
                                setTooltipPosition(null)
                              }
                            }, 200)
                          }}
                        >
                          <div className="tooltip-color-options">
                            {['yellow', 'green', 'blue'].map(color => (
                              <button
                                key={color}
                                className={`tooltip-color-btn ${item.color === color ? 'active' : ''}`}
                                style={{
                                  backgroundColor: color === 'yellow' ? 'rgba(251, 188, 4, 1)' : 
                                                   color === 'green' ? 'rgba(52, 168, 83, 1)' : 
                                                   'rgba(66, 133, 244, 1)'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (onColorChange) {
                                    onColorChange(item.id, color)
                                  }
                                  setHoveredItemId(null)
                                  setTooltipPosition(null)
                                }}
                                title={color}
                              />
                            ))}
                          </div>
                          <button
                            className="tooltip-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (onDelete) {
                                onDelete(item.id)
                              }
                              setHoveredItemId(null)
                              setTooltipPosition(null)
                            }}
                            title="Delete highlight"
                          >
                          </button>
                        </div>
                      )}
                    </span>
                    
                    {/* Drop indicator for new line after */}
                    {isNewLineDrop && dropPosition.position === 'after' && (
                      <div className="drop-indicator drop-indicator-newline" />
                    )}
                    
                    {/* Line break after each item by default (unless inline) */}
                    {!item.inline && <br />}
                  </React.Fragment>
                )
              })}
              
              {/* Drop indicator at the end when dragging */}
              {draggedId && dropPosition && dropPosition.itemId === null && (
                <div className="drop-indicator drop-indicator-newline" />
              )}
              </div>

              <div className="highlights-actions">
                <button
                  className="btn btn-primary btn-format-summary"
                  onClick={handleFormatAsSummary}
                  disabled={isGeneratingSummary || highlightItems.length === 0}
                >
                  {isGeneratingSummary ? 'Generating...' : 'Format as Summary'}
                </button>
              </div>
            </>
          )}

          {activeTab === 'summary' && summaryText && (
            <div className="highlights-summary-content">
              <div className="highlights-summary-markdown">
                <button
                  className="btn-update-summary-overlay"
                  onClick={handleUpdateSummary}
                  disabled={isGeneratingSummary || highlightItems.length === 0}
                  title="Update summary with current highlights"
                >
                  <IconRefresh size={14} />
                </button>
                <ReactMarkdown
                  components={{
                    code({ node, inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '')
                      const language = match ? match[1] : ''
                      const codeString = String(children).replace(/\n$/, '')
                      
                      if (!inline && language === 'mermaid') {
                        return <MermaidDiagram chart={codeString} />
                      }
                      
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      )
                    }
                  }}
                >
                  {summaryText}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default HighlightsSidebar
