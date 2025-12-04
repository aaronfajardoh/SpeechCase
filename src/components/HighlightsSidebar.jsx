import React, { useState, useRef } from 'react'
import { IconHighlighter } from './Icons.jsx'

// Sidebar tab: highlights
const HighlightsSidebar = ({ highlightItems, setHighlightItems, documentId }) => {
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
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
  }

  // Handle drop
  const handleDrop = (e, targetItem) => {
    e.preventDefault()
    if (!draggedId || draggedId === targetItem.id) {
      setDraggedId(null)
      setDragOverId(null)
      return
    }

    setHighlightItems(prev => {
      const items = [...prev]
      const draggedIndex = items.findIndex(item => item.id === draggedId)
      const targetIndex = items.findIndex(item => item.id === targetItem.id)

      if (draggedIndex === -1 || targetIndex === -1) return prev

      const [draggedItem] = items.splice(draggedIndex, 1)
      
      // Insert at target position
      items.splice(targetIndex, 0, draggedItem)
      
      // Update order
      return items.map((item, index) => ({ ...item, order: index }))
    })

    setDraggedId(null)
    setDragOverId(null)
  }

  // Handle drag end
  const handleDragEnd = () => {
    setDraggedId(null)
    setDragOverId(null)
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
        <div className="highlights-items">
          {highlightItems.map((item, index) => (
            <div
              key={item.id}
              className={`highlight-item ${getFormattingClass(item.color)} ${draggedId === item.id ? 'dragging' : ''} ${dragOverId === item.id ? 'drag-over' : ''}`}
              draggable={editingId !== item.id}
              onDragStart={(e) => handleDragStart(e, item)}
              onDragOver={(e) => handleDragOver(e, item)}
              onDrop={(e) => handleDrop(e, item)}
              onDragEnd={handleDragEnd}
            >
              {/* Start drag handle */}
              <div
                className="highlight-drag-handle highlight-drag-handle-start"
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleConcatenate(item.id)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
              >
                <div className="drag-handle-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>

              {/* Content */}
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
                <div
                  className="highlight-item-content"
                  onDoubleClick={() => handleDoubleClick(item)}
                >
                  {item.color === 'blue' && <span className="bullet-point">•</span>}
                  {item.text}
                </div>
              )}

              {/* End drag handle */}
              <div
                className="highlight-drag-handle highlight-drag-handle-end"
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleConcatenate(item.id)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
              >
                <div className="drag-handle-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          ))}
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
