import React, { useState, useRef } from 'react'
import { IconHighlighter } from './Icons.jsx'

// Sidebar tab: highlights
const HighlightsSidebar = ({ highlightItems, setHighlightItems, documentId, highlights }) => {
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [dropPosition, setDropPosition] = useState(null) // { itemId, position: 'before' | 'after', inline: boolean }
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
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
    const isInline = mouseY >= verticalTop && mouseY <= verticalBottom
    
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

    const position = dropPosition || { itemId: targetItem.id, position: 'after', inline: false }
    const isInline = position.inline && position.itemId === targetItem.id

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
      
      // Add inline property if placing inline
      const itemToInsert = isInline 
        ? { ...draggedItem, inline: true }
        : { ...draggedItem, inline: false }
      
      items.splice(insertIndex, 0, itemToInsert)
      
      // If placing inline, also mark the target item as inline (if it wasn't already)
      if (isInline) {
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

  // Format as Summary
  const handleFormatAsSummary = async () => {
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
      
      // Replace all items with the summary
      setHighlightItems([{
        id: Date.now(),
        text: data.summary,
        color: 'yellow',
        order: 0
      }])
    } catch (error) {
      console.error('Error generating summary:', error)
      alert(`Failed to generate summary: ${error.message}`)
    } finally {
      setIsGeneratingSummary(false)
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
      </div>
    </div>
  )
}

export default HighlightsSidebar
