import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import { IconHighlighter, IconRefresh, IconTrash, IconCopy, IconDownload, IconExpand } from './Icons.jsx'
import MermaidDiagram from './MermaidDiagram.jsx'
import { markdownToClipboardHtml, copyHtmlToClipboard } from '../utils/clipboardUtils.js'

// Sidebar tab: highlights
const HighlightsSidebar = ({ highlightItems, setHighlightItems, documentId, highlights, onColorChange, onDelete, pdfFileName, onExpandSummary, onExpandHighlights, onSummaryGenerated, summaryText: externalSummaryText, onDragStateChange }) => {
  const [hoveredItemId, setHoveredItemId] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState(null)
  const isHoveringTooltipRef = useRef(false)
  const isHoveringWrapperRef = useRef(false)
  const hoverTimeoutRef = useRef(null)
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [dropPosition, setDropPosition] = useState(null) // { itemId, position: 'before' | 'after', inline: boolean }
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [activeTab, setActiveTab] = useState('highlights') // 'highlights' | 'summary'
  const [localSummaryText, setLocalSummaryText] = useState('') // Store the summary locally as fallback
  const editInputRef = useRef(null)
  const highlightsItemsRef = useRef(null)
  const prevHighlightItemsLengthRef = useRef(highlightItems.length)
  const dragOverThrottleRef = useRef(null) // Throttle drag-over to prevent excessive re-renders
  const lastDropPositionRef = useRef(null) // Track last drop position to avoid unnecessary updates
  const lastItemSwitchTimeRef = useRef(0) // Track when we last switched items to prevent rapid switching
  
  // Use external summary text if provided, otherwise use local state
  const summaryText = externalSummaryText || localSummaryText

  // Cleanup timeout on unmount or when editing starts
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
        hoverTimeoutRef.current = null
      }
      if (dragOverThrottleRef.current) {
        cancelAnimationFrame(dragOverThrottleRef.current)
        dragOverThrottleRef.current = null
      }
    }
  }, [editingId])

  // Auto-scroll to bottom when a new highlight is added
  useEffect(() => {
    // Only auto-scroll if the length increased (new highlight added) and we're on the highlights tab
    if (highlightItems.length > prevHighlightItemsLengthRef.current && highlightsItemsRef.current && activeTab === 'highlights') {
      // Use requestAnimationFrame to ensure DOM has updated, then scroll smoothly
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (highlightsItemsRef.current) {
            highlightsItemsRef.current.scrollTo({
              top: highlightsItemsRef.current.scrollHeight,
              behavior: 'smooth'
            })
          }
        })
      })
    }
    // Update the ref to track the current length
    prevHighlightItemsLengthRef.current = highlightItems.length
  }, [highlightItems.length, activeTab])

  // Handle double-click to edit
  const handleDoubleClick = (item) => {
    setEditingId(item.id)
    setEditingText(item.text)
    setTimeout(() => {
      if (editInputRef.current) {
        // Set initial height to match content
        editInputRef.current.style.height = 'auto'
        editInputRef.current.style.height = editInputRef.current.scrollHeight + 'px'
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
    if (onDragStateChange) onDragStateChange(true)
  }

  // Handle drag over (throttled to prevent excessive re-renders)
  const handleDragOver = (e, item) => {
    e.preventDefault()
    e.stopPropagation() // Prevent bubbling to avoid multiple handlers
    e.dataTransfer.dropEffect = 'move'
    
    if (!draggedId || draggedId === item.id) return
    
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
    
    // Use larger buffer zones (top 25% and bottom 25%) for easier placement between items
    // This makes it easier to place items between others without flickering
    const verticalTop = rect.top + rect.height * 0.25
    const verticalBottom = rect.top + rect.height * 0.75
    
    // Determine position and inline state based on vertical position
    let position, isInline
    
    if (mouseY < verticalTop) {
      // Top 25% - place before this item (new line)
      position = 'before'
      isInline = false
    } else if (mouseY > verticalBottom) {
      // Bottom 25% - place after this item (new line)
      position = 'after'
      isInline = false
    } else {
      // Middle 50% - can be inline or new line based on horizontal position
      const isLeft = mouseX < centerX
      position = isLeft ? 'before' : 'after'
      // Only allow inline if not blue and mouse is in center zone
      isInline = !cannotBeInline
    }
    
    const newDropPosition = { itemId: item.id, position, inline: isInline }
    
    // Only update state if the drop position actually changed
    const lastPos = lastDropPositionRef.current
    const isItemSwitch = lastPos && lastPos.itemId !== newDropPosition.itemId
    const now = Date.now()
    
    // Prevent rapid switching between items (debounce item switches by 30ms)
    // Reduced from 50ms to make indicator more responsive
    if (isItemSwitch && (now - lastItemSwitchTimeRef.current) < 30) {
      return
    }
    
    if (!lastPos || 
        lastPos.itemId !== newDropPosition.itemId || 
        lastPos.position !== newDropPosition.position || 
        lastPos.inline !== newDropPosition.inline) {
      
      // Throttle state updates using requestAnimationFrame for smooth updates
      if (dragOverThrottleRef.current) {
        return
      }
      
      dragOverThrottleRef.current = requestAnimationFrame(() => {
        dragOverThrottleRef.current = null
        lastDropPositionRef.current = newDropPosition
        if (isItemSwitch) {
          lastItemSwitchTimeRef.current = now
        }
        setDragOverId(item.id)
        setDropPosition(newDropPosition)
      })
    }
  }

  // Handle drop on an item
  const handleDrop = (e, targetItem) => {
    e.preventDefault()
    e.stopPropagation() // Prevent event from bubbling to container
    if (!draggedId || !targetItem || draggedId === targetItem.id) {
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

    // Use dropPosition if available and it matches the target, otherwise use target
    // IMPORTANT: If dropPosition exists but itemId doesn't match targetItem, use dropPosition's itemId
    let position = dropPosition
    let actualTargetItem = targetItem
    
    // If we have a dropPosition with a different itemId, use that item instead
    if (dropPosition && dropPosition.itemId && dropPosition.itemId !== targetItem.id) {
      const dropTargetItem = highlightItems.find(item => item.id === dropPosition.itemId)
      if (dropTargetItem) {
        actualTargetItem = dropTargetItem
        position = dropPosition
      } else {
        position = { itemId: targetItem.id, position: 'after', inline: false }
      }
    } else if (!position) {
      position = { itemId: targetItem.id, position: 'after', inline: false }
    }
    
    // Force new line if blue item is involved
    const isInline = !cannotBeInline && position.inline && position.itemId === actualTargetItem.id

    setHighlightItems(prev => {
      const items = [...prev]
      const draggedIndex = items.findIndex(item => item.id === draggedId)
      const targetIndex = items.findIndex(item => item.id === actualTargetItem.id)

      if (draggedIndex === -1 || targetIndex === -1) {
        return prev
      }

      const [draggedItem] = items.splice(draggedIndex, 1)
      
      // Calculate insert index based on position
      let insertIndex = targetIndex
      
      // If dragging from before target, we need to adjust
      if (draggedIndex < targetIndex) {
        insertIndex = targetIndex - 1
      }
      
      // Insert based on position (before or after)
      if (position.position === 'after') {
        insertIndex += 1
      }
      // If position is 'before', insertIndex is already correct (or adjusted above)
      
      // Add inline property if placing inline (but never for blue items)
      const itemToInsert = isInline 
        ? { ...draggedItem, inline: true }
        : { ...draggedItem, inline: false }
      
      items.splice(insertIndex, 0, itemToInsert)
      
      // If placing inline, also mark the target item as inline (if it wasn't already)
      // But skip this if either item is blue
      if (isInline && !cannotBeInline) {
        const finalTargetIndex = items.findIndex(item => item.id === actualTargetItem.id)
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
    if (onDragStateChange) {
      // Delay clearing drag state to allow useEffect to complete
      setTimeout(() => onDragStateChange(false), 100)
    }
  }

  // Handle drag end
  const handleDragEnd = () => {
    // Clear throttle
    if (dragOverThrottleRef.current) {
      cancelAnimationFrame(dragOverThrottleRef.current)
      dragOverThrottleRef.current = null
    }
    
    lastDropPositionRef.current = null
    lastItemSwitchTimeRef.current = 0
    setDraggedId(null)
    setDragOverId(null)
    setDropPosition(null)
    if (onDragStateChange) {
      // Delay clearing drag state to allow useEffect to complete
      setTimeout(() => onDragStateChange(false), 100)
    }
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

      
      const generateSummary = httpsCallable(functions, 'generateSummary')
      const result = await generateSummary({
        documentId,
        highlights: combinedText,
        highlightItems: highlightItems, // Pass full array for snip analysis
      })
      

      const data = result.data
      
      // Store summary locally and switch to summary tab
      setLocalSummaryText(data.summary)
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
      if (!success) {
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
      font-family: "SF Pro Text", "Helvetica Neue", sans-serif;
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
                ref={highlightsItemsRef}
                className="highlights-items"
                onDragOver={(e) => {
                  // Allow dropping on empty space, but don't clear existing dropPosition
                  // This allows drops between items to work correctly
                  if (e.target === e.currentTarget || e.target.classList.contains('highlights-items')) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    // Only set dropPosition to null if we don't already have one
                    // This prevents clearing the position when dragging between items
                    if (!dropPosition || !dropPosition.itemId) {
                      setDropPosition({ itemId: null, position: 'after', inline: false })
                    }
                  }
                }}
                onDrop={(e) => {
                  // Handle drop on empty space or between items
                  if (e.target === e.currentTarget || e.target.classList.contains('highlights-items')) {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!draggedId) return
                    
                    // If we have a drop position with an itemId, use that to place between items
                    if (dropPosition && dropPosition.itemId) {
                      const targetItem = highlightItems.find(item => item.id === dropPosition.itemId)
                      if (targetItem) {
                        // Call handleDrop with the target item from dropPosition
                        // This ensures consistent logic and proper saving
                        handleDrop(e, targetItem)
                        return
                      }
                    }
                    
                    // Fallback: drop at end (only if no dropPosition)
                    if (!dropPosition || !dropPosition.itemId) {
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
                      if (onDragStateChange) {
                        setTimeout(() => onDragStateChange(false), 100)
                      }
                    }
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
                          isHoveringWrapperRef.current = true
                          setHoveredItemId(item.id)
                          const rect = e.currentTarget.getBoundingClientRect()
                          setTooltipPosition({ x: rect.left + rect.width / 2, y: rect.top })
                        }
                      }}
                      onMouseMove={(e) => {
                        if (editingId !== item.id && hoveredItemId === item.id) {
                          // Keep tooltip visible while mouse is moving over wrapper
                          if (hoverTimeoutRef.current) {
                            clearTimeout(hoverTimeoutRef.current)
                            hoverTimeoutRef.current = null
                          }
                          isHoveringWrapperRef.current = true
                        }
                      }}
                      onMouseLeave={(e) => {
                        // Check if we're moving to a child element (the item) or the tooltip
                        const relatedTarget = e.relatedTarget
                        if (relatedTarget && relatedTarget instanceof Node) {
                          // If moving to a child element within the wrapper, don't hide
                          if (e.currentTarget.contains(relatedTarget)) {
                            isHoveringWrapperRef.current = true
                            return
                          }
                          // If moving to the tooltip, don't hide
                          if (relatedTarget.closest('.highlight-tooltip')) {
                            isHoveringWrapperRef.current = true
                            return
                          }
                        }
                        // Mouse is truly leaving the wrapper area
                        isHoveringWrapperRef.current = false
                        // Only hide if not hovering over tooltip - use a longer delay to allow movement to tooltip
                        hoverTimeoutRef.current = setTimeout(() => {
                          if (!isHoveringTooltipRef.current && !isHoveringWrapperRef.current) {
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
                        onDragStart={(e) => {
                          e.stopPropagation()
                          handleDragStart(e, item)
                        }}
                        onDragOver={(e) => {
                          e.stopPropagation()
                          handleDragOver(e, item)
                        }}
                        onDrop={(e) => {
                          e.stopPropagation()
                          handleDrop(e, item)
                        }}
                        onDragEnd={(e) => {
                          e.stopPropagation()
                          handleDragEnd()
                        }}
                      >
                        {/* Inline drop indicator before */}
                        {isInlineDrop && dropPosition.position === 'before' && (
                          <span className="drop-indicator-inline drop-indicator-inline-before" />
                        )}
                        
                        {editingId === item.id ? (
                          <textarea
                            ref={editInputRef}
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onBlur={() => handleSaveEdit(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                handleSaveEdit(item.id)
                              } else if (e.key === 'Escape') {
                                handleCancelEdit()
                              }
                            }}
                            className="highlight-edit-input"
                            autoFocus
                            rows={1}
                            style={{
                              resize: 'none',
                              overflow: 'hidden'
                            }}
                            onInput={(e) => {
                              // Auto-resize textarea to fit content
                              e.target.style.height = 'auto'
                              e.target.style.height = e.target.scrollHeight + 'px'
                            }}
                          />
                        ) : (
                          <span
                            className="highlight-item-content"
                            onDoubleClick={() => handleDoubleClick(item)}
                          >
                            {item.isSnip && item.image ? (
                              <img 
                                src={item.image} 
                                alt="Snip highlight" 
                                style={{ 
                                  maxWidth: '100%', 
                                  height: 'auto',
                                  display: 'block',
                                  margin: '4px 0',
                                  borderRadius: '4px',
                                  border: '1px solid #ddd'
                                }} 
                              />
                            ) : (
                              <>
                                {item.color === 'blue' && <span className="bullet-point">•</span>}
                                {item.text}
                              </>
                            )}
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
                              top: (tooltipPosition.y - 0) + 'px',
                              transform: 'translate(-50%, -100%)',
                              zIndex: 1000,
                              pointerEvents: 'auto'
                            }}
                            onMouseEnter={() => {
                              // Clear any pending timeout when entering tooltip
                              if (hoverTimeoutRef.current) {
                                clearTimeout(hoverTimeoutRef.current)
                                hoverTimeoutRef.current = null
                              }
                              isHoveringTooltipRef.current = true
                              isHoveringWrapperRef.current = true
                              setHoveredItemId(item.id)
                            }}
                            onMouseMove={() => {
                              // Keep tooltip visible while mouse is moving over it
                              if (hoverTimeoutRef.current) {
                                clearTimeout(hoverTimeoutRef.current)
                                hoverTimeoutRef.current = null
                              }
                              isHoveringTooltipRef.current = true
                              isHoveringWrapperRef.current = true
                            }}
                            onMouseLeave={(e) => {
                              // Check if we're moving back to the wrapper/item
                              const relatedTarget = e.relatedTarget
                              if (relatedTarget && relatedTarget instanceof Node) {
                                const wrapper = relatedTarget.closest('.highlight-item-wrapper')
                                if (wrapper) {
                                  // Mouse is moving back to wrapper/item, keep tooltip visible
                                  isHoveringTooltipRef.current = false
                                  isHoveringWrapperRef.current = true
                                  return
                                }
                              }
                              // Mouse is truly leaving the tooltip
                              isHoveringTooltipRef.current = false
                              hoverTimeoutRef.current = setTimeout(() => {
                                if (!isHoveringTooltipRef.current && !isHoveringWrapperRef.current) {
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
                    img: ({ src, alt, ...props }) => {
                      // Check if this is a snip placeholder (either by alt text or src)
                      const isSnipPlaceholder = (alt && alt.startsWith('Snip: ')) || (src === 'snip-placeholder');
                      if (isSnipPlaceholder) {
                        const snipId = alt ? alt.replace('Snip: ', '') : 'snip_1'; // Default to first if no alt
                        // Find the snip by matching the ID pattern (snip_1, snip_2, etc.)
                        const snipIndex = parseInt(snipId.replace('snip_', '')) - 1;
                        const snipItems = highlightItems?.filter(item => item.isSnip && item.image) || [];
                        const snipItem = snipItems[snipIndex];
                        if (snipItem && snipItem.image) {
                          return <img src={snipItem.image} alt={snipItem.text || 'User screenshot'} style={{ maxWidth: '100%', height: 'auto', margin: '1rem 0', borderRadius: '4px' }} />;
                        }
                        // Fallback: silently skip if snip not found (don't render anything)
                        return null;
                      }
                      // Regular image (concept image or other) - ensure src is valid
                      if (!src || src.trim().length === 0) {
                        return null;
                      }
                      return <img src={src} alt={alt || 'Image'} style={{ maxWidth: '100%', height: 'auto', margin: '1rem 0', borderRadius: '4px' }} />;
                    },
                    p: ({ children, ...props }) => {
                      // Check if paragraph contains image markdown text and render it as an image
                      const childrenArray = React.Children.toArray(children);
                      const childrenStr = childrenArray.map(child => {
                        if (typeof child === 'string') return child;
                        if (typeof child === 'object' && child.props) {
                          // Try to extract text from nested children
                          if (typeof child.props.children === 'string') {
                            return child.props.children;
                          }
                          if (Array.isArray(child.props.children)) {
                            return child.props.children.map(c => typeof c === 'string' ? c : '').join('');
                          }
                        }
                        return '';
                      }).join('');
                      
                      // Check for concept image markdown: ![Concept Image](url)
                      const conceptImageMatch = childrenStr.match(/!\[Concept Image\]\(([^)]+)\)/);
                      if (conceptImageMatch) {
                        const imageUrl = conceptImageMatch[1];
                        // Replace the markdown text with the actual image
                        const processedChildren = childrenArray.map((child, idx) => {
                          if (typeof child === 'string' && child.includes('![Concept Image]')) {
                            const parts = child.split(/!\[Concept Image\]\([^)]+\)/);
                            return (
                              <React.Fragment key={idx}>
                                {parts[0] && <span>{parts[0]}</span>}
                                <img src={imageUrl} alt="Concept Image" style={{ maxWidth: '100%', height: 'auto', margin: '1rem 0', borderRadius: '4px' }} />
                                {parts[1] && <span>{parts[1]}</span>}
                              </React.Fragment>
                            );
                          }
                          // Handle nested elements that might contain the markdown
                          if (typeof child === 'object' && child.props && typeof child.props.children === 'string' && child.props.children.includes('![Concept Image]')) {
                            const parts = child.props.children.split(/!\[Concept Image\]\([^)]+\)/);
                            return (
                              <React.Fragment key={idx}>
                                {parts[0] && <span>{parts[0]}</span>}
                                <img src={imageUrl} alt="Concept Image" style={{ maxWidth: '100%', height: 'auto', margin: '1rem 0', borderRadius: '4px' }} />
                                {parts[1] && <span>{parts[1]}</span>}
                              </React.Fragment>
                            );
                          }
                          return child;
                        });
                        return <div>{processedChildren}</div>;
                      }
                      
                      return <p {...props}>{children}</p>;
                    },
                    code({ node, inline, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '')
                      const language = match ? match[1] : ''
                      const codeString = String(children).replace(/\n$/, '')
                      
                      if (!inline && language === 'mermaid') {
                        return <MermaidDiagram chart={codeString} fontSize={12} />
                      }
                      
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      )
                    }
                  }}
                >
                  {(() => {
                    // Preprocess summary text: convert old snip format and ensure concept images are properly formatted
                    let processedText = summaryText?.replace(/!\[Snip: ([^\]]+)\](?!\()/g, '![Snip: $1](snip-placeholder)') || summaryText;
                    
                    // Fix double exclamation marks for concept images (!![Concept Image] -> ![Concept Image])
                    processedText = processedText?.replace(/!!\[Concept Image\]\(/g, '![Concept Image](') || processedText;
                    
                    // Fix missing exclamation marks for concept images ([Concept Image] -> ![Concept Image])
                    // Use a more compatible approach: replace [Concept Image]( that's NOT preceded by !
                    processedText = processedText?.replace(/(^|[^!])\[Concept Image\]\(/g, '$1![Concept Image](') || processedText;
                    
                    return processedText;
                  })()}
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
