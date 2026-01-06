import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import { IconHighlighter, IconRefresh, IconTrash, IconCopy, IconDownload, IconChevronLeft } from './Icons.jsx'
import MermaidDiagram from './MermaidDiagram.jsx'
import { markdownToClipboardHtml, copyHtmlToClipboard } from '../utils/clipboardUtils.js'
import { Document, Packer, Paragraph, TextRun } from 'docx'

const SummaryFullView = ({ summaryText, highlightItems, setHighlightItems, documentId, highlights, onColorChange, onDelete, pdfFileName, onMinimize, onSummaryGenerated }) => {
  const [hoveredItemId, setHoveredItemId] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState(null)
  const isHoveringTooltipRef = useRef(false)
  const hoverTimeoutRef = useRef(null)
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [dropPosition, setDropPosition] = useState(null) // { itemId, position: 'before' | 'after', inline: boolean }
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [activeTab, setActiveTab] = useState('summary') // 'highlights' | 'summary'
  const editInputRef = useRef(null)
  const highlightsItemsRef = useRef(null)
  const prevHighlightItemsLengthRef = useRef(highlightItems?.length || 0)

  // Cleanup timeout on unmount or when editing starts
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
        hoverTimeoutRef.current = null
      }
    }
  }, [editingId])

  // Auto-scroll to bottom when a new highlight is added
  useEffect(() => {
    // Only auto-scroll if the length increased (new highlight added) and we're on the highlights tab
    if (highlightItems && highlightItems.length > prevHighlightItemsLengthRef.current && highlightsItemsRef.current && activeTab === 'highlights') {
      // Use requestAnimationFrame to ensure DOM has updated, then scroll
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (highlightsItemsRef.current) {
            highlightsItemsRef.current.scrollTop = highlightsItemsRef.current.scrollHeight
          }
        })
      })
    }
    // Update the ref to track the current length
    if (highlightItems) {
      prevHighlightItemsLengthRef.current = highlightItems.length
    }
  }, [highlightItems?.length, activeTab])

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
    if (editingText.trim() && setHighlightItems) {
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
    const draggedItem = highlightItems?.find(i => i.id === draggedId)
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
    if (!draggedId || draggedId === targetItem.id || !setHighlightItems) {
      setDraggedId(null)
      setDragOverId(null)
      setDropPosition(null)
      return
    }

    // Check if dragged item or target item is blue (bullet point)
    const draggedItem = highlightItems?.find(i => i.id === draggedId)
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

  // Update summary button handler
  const handleUpdateSummary = async () => {
    if (!documentId || !highlightItems || highlightItems.length === 0) {
      alert('No highlights to summarize. Please highlight some text first.')
      return
    }

    setIsGeneratingSummary(true)
    try {
      // Combine all highlight texts
      const combinedText = highlightItems
        .map(item => item.text)
        .join('\n\n')

      const generateSummary = httpsCallable(functions, 'generateSummary')
      const result = await generateSummary({
        documentId,
        highlights: combinedText,
      })

      const data = result.data
      
      // Switch to summary tab
      setActiveTab('summary')
      // Notify parent component of the generated summary
      if (onSummaryGenerated) {
        onSummaryGenerated(data.summary)
      }
    } catch (error) {
      console.error('Error generating summary:', error)
      // Handle Firebase-specific errors
      const errorMessage = error.code ? `Firebase error: ${error.message}` : error.message
      alert(`Failed to generate summary: ${errorMessage}`)
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  // Copy summary to clipboard
  const handleCopySummary = async () => {
    if (!summaryText) return

    try {
      // Convert markdown with diagrams to HTML for clipboard
      const htmlContent = await markdownToClipboardHtml(summaryText)
      
      // Create plain text fallback
      const plainText = summaryText
        .replace(/#{1,6}\s+/g, '') // Remove headers
        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.+?)\*/g, '$1') // Remove italic
        .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links
        .replace(/`(.+?)`/g, '$1') // Remove inline code
        .replace(/```mermaid[\s\S]*?```/g, '[Diagram]') // Replace Mermaid diagrams with placeholder
        .replace(/```[\s\S]*?```/g, '') // Remove other code blocks
        .trim()
      
      // Wrap HTML in proper structure for Google Docs/Word compatibility
      // Google Docs prefers a simpler structure without DOCTYPE
      // Ensure no background colors are applied
      const wrappedHtml = `<html><head><meta charset="utf-8"><style>body { background: transparent !important; color: black !important; } * { background: transparent !important; }</style></head><body style="background: transparent; color: black;">${htmlContent}</body></html>`
      
      const success = await copyHtmlToClipboard(wrappedHtml, plainText)
      if (success && onCopy) {
        onCopy()
      } else if (!success) {
        alert('Failed to copy summary to clipboard')
      }
    } catch (error) {
      console.error('Failed to copy summary:', error)
      alert('Failed to copy summary to clipboard')
    }
  }

  // Download summary as DOCX
  const handleDownloadSummary = async () => {
    if (!summaryText) return

    try {
      // Use the same HTML generation that works for copy
      // This includes properly formatted text and embedded Mermaid diagrams as images
      const htmlContent = await markdownToClipboardHtml(summaryText)
      
      // Wrap in a proper HTML document structure for better Word compatibility
      const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
      font-weight: 600;
    }
    h1 { font-size: 2em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.25em; }
    ul, ol {
      margin: 1em 0;
      padding-left: 2em;
    }
    li {
      margin: 0.5em 0;
    }
    p {
      margin: 1em 0;
    }
    img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
${htmlContent}
</body>
</html>`
      
      console.log('Creating HTML file for download (Word can open HTML and save as DOCX)')
      
      // Create HTML blob - users can open in Word and save as DOCX
      // Word will preserve formatting and images when opening HTML
      const blob = new Blob([fullHtml], { type: 'text/html' })
      
      console.log('HTML blob generated, size:', blob.size, 'bytes')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      // Create filename: "Summary - [pdf name].html" (Word can open and save as DOCX)
      let fileName = 'Summary.html'
      if (pdfFileName) {
        // Remove .pdf extension if present and add .html
        const baseName = pdfFileName.replace(/\.pdf$/i, '')
        fileName = `Summary - ${baseName}.html`
      }
      
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      if (onDownload) onDownload()
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

  return (
    <div className="summary-full-view">
      <div className="summary-full-view-header">
        <div className="summary-full-view-title">
          <IconHighlighter size={24} />
          <h2>Summary</h2>
          {highlightItems && highlightItems.length > 0 && (
            <span className="highlights-full-view-count">{highlightItems.length} items</span>
          )}
        </div>
        <div className="summary-full-view-actions">
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
            </div>
          )}
          {activeTab === 'highlights' && highlightItems && highlightItems.length > 0 && (
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
            </div>
          )}
          <button
            className="btn-back-to-pdf"
            onClick={onMinimize}
            title="Back to PDF"
          >
            <IconChevronLeft size={18} />
            <span>Back to PDF</span>
          </button>
        </div>
      </div>
      <div className="summary-full-view-content highlights-editor-full-view">
        <div className="highlights-editor">
          {/* Tab Navigation */}
          <div className="highlights-tabs">
            <div className="highlights-tabs-left">
              {highlightItems && highlightItems.length > 0 && (
                <button
                  className={`highlights-tab ${activeTab === 'highlights' ? 'active' : ''}`}
                  onClick={() => setActiveTab('highlights')}
                >
                  Highlights
                </button>
              )}
              {summaryText && (
                <button
                  className={`highlights-tab ${activeTab === 'summary' ? 'active' : ''}`}
                  onClick={() => setActiveTab('summary')}
                >
                  Summary
                </button>
              )}
            </div>
          </div>

          {/* Tab Content */}
          <div className="highlights-tab-content">
            {activeTab === 'highlights' && highlightItems && highlightItems.length > 0 && (
              <>
                <div 
                  ref={highlightsItemsRef}
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
                      if (!draggedId || !setHighlightItems) return
                      
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
                      
                      {/* Wrapper div for zebra striping */}
                      <div
                        className={`highlight-item-wrapper ${draggedId === item.id ? 'dragging' : ''} ${dragOverId === item.id ? 'drag-over' : ''}`}
                        onMouseEnter={(e) => {
                          if (editingId !== item.id) {
                            // Clear any pending timeout to prevent tooltip from disappearing
                            if (hoverTimeoutRef.current) {
                              clearTimeout(hoverTimeoutRef.current)
                              hoverTimeoutRef.current = null
                            }
                            setHoveredItemId(item.id)
                            const rect = e.currentTarget.getBoundingClientRect()
                            setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.top })
                          }
                        }}
                        onMouseLeave={() => {
                          // Only hide if not hovering over tooltip
                          hoverTimeoutRef.current = setTimeout(() => {
                            if (!isHoveringTooltipRef.current) {
                              setHoveredItemId(null)
                              setTooltipPosition(null)
                            }
                            hoverTimeoutRef.current = null
                          }, 500)
                        }}
                      >
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
                          
                          {/* Tooltip for full view highlights */}
                          {hoveredItemId === item.id && tooltipPosition && (
                            <div
                              className="highlight-tooltip full-view-tooltip"
                              style={{
                                position: 'fixed',
                                left: tooltipPosition.x + 'px',
                                top: (tooltipPosition.y - 0) + 'px',
                                transform: 'translate(-50%, -100%)',
                                zIndex: 1000
                              }}
                              onMouseEnter={() => {
                                // Clear any pending timeout when entering tooltip
                                if (hoverTimeoutRef.current) {
                                  clearTimeout(hoverTimeoutRef.current)
                                  hoverTimeoutRef.current = null
                                }
                                isHoveringTooltipRef.current = true
                                setHoveredItemId(item.id)
                              }}
                              onMouseLeave={() => {
                                isHoveringTooltipRef.current = false
                                hoverTimeoutRef.current = setTimeout(() => {
                                  if (!isHoveringTooltipRef.current) {
                                    setHoveredItemId(null)
                                    setTooltipPosition(null)
                                  }
                                  hoverTimeoutRef.current = null
                                }, 500)
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
                      </div>
                      
                      {/* Drop indicator for new line after */}
                      {isNewLineDrop && dropPosition.position === 'after' && (
                        <div className="drop-indicator drop-indicator-newline" />
                      )}
                    </React.Fragment>
                  )
                })}
                
                {/* Drop indicator at the end when dragging */}
                {draggedId && dropPosition && dropPosition.itemId === null && (
                  <div className="drop-indicator drop-indicator-newline" />
                )}
                </div>
              </>
            )}

            {activeTab === 'summary' && summaryText && (
              <div className="highlights-summary-content">
                <div className="highlights-summary-markdown">
                  <button
                    className="btn-update-summary-overlay"
                    onClick={handleUpdateSummary}
                    disabled={isGeneratingSummary || !highlightItems || highlightItems.length === 0}
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
                          return <MermaidDiagram chart={codeString} fontSize={16} />
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
    </div>
  )
}

export default SummaryFullView
