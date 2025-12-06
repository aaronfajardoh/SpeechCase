import React, { useState, useRef, useEffect } from 'react'
import {
  IconTimeline,
  IconLoading,
  IconExpandTimeline,
  IconMinimizeTimeline,
  IconClose
} from './Icons.jsx'

// Sidebar tab: timeline list / controls
const TimelineSidebar = ({
  isPDFProcessing,
  isTimelineLoading,
  timelineError,
  documentId,
  generateTimeline,
  timeline,
  isTimelineExpanded,
  setIsTimelineExpanded,
  isSidebarCollapsed
}) => {
  // Hooks must be called at the top level
  const [selectedEvent, setSelectedEvent] = useState(null)
  const itemsContainerRef = useRef(null)
  const lineRef = useRef(null)

  // Update line height to match scrollable content
  useEffect(() => {
    const updateLineHeight = () => {
      if (itemsContainerRef.current && lineRef.current) {
        const itemsContainer = itemsContainerRef.current.querySelector('.timeline-items')
        if (itemsContainer) {
          const scrollHeight = itemsContainer.scrollHeight
          lineRef.current.style.height = `${scrollHeight}px`
        }
      }
    }

    if (timeline && timeline.length > 0) {
      updateLineHeight()
      // Update on window resize
      window.addEventListener('resize', updateLineHeight)
      // Update after a short delay to ensure content is rendered
      const timeoutId = setTimeout(updateLineHeight, 100)
      return () => {
        window.removeEventListener('resize', updateLineHeight)
        clearTimeout(timeoutId)
      }
    }
  }, [timeline])

  // Choose the best available date string from an event
  const getBestDate = (event) => {
    return (
      event?.date ||
      event?.date_original_format ||
      event?.date_normalized ||
      null
    )
  }

  // Parse date string to numeric timestamp for calculation
  const parseDateToTimestamp = (dateStr, index) => {
    if (!dateStr) return index * 1000 // Default spacing

    const str = dateStr.toLowerCase().trim()

    // Try to parse various date formats
    // Format: dd/mm/yyyy or mm/dd/yyyy
    const ddmmyyyy = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime()
    }

    // Format: mm/yyyy
    const mmyyyy = str.match(/(\d{1,2})\/(\d{4})/)
    if (mmyyyy) {
      const [, month, year] = mmyyyy
      return new Date(parseInt(year), parseInt(month) - 1, 1).getTime()
    }

    // Format: yyyy
    const yyyy = str.match(/(\d{4})/)
    if (yyyy) {
      return new Date(parseInt(yyyy[1]), 0, 1).getTime()
    }

    // Try parsing as full date string
    const parsed = Date.parse(dateStr)
    if (!isNaN(parsed)) {
      return parsed
    }

    // Extract numbers and use as relative time
    const numbers = str.match(/\d+/)
    if (numbers) {
      const num = parseInt(numbers[0])
      // If it's a day number
      if (str.includes('day')) {
        return num * 86400000 // milliseconds in a day
      }
      // If it's a year
      if (str.includes('year')) {
        return new Date(num, 0, 1).getTime()
      }
      // Default: use as days
      return num * 86400000
    }

    // Fallback: use index
    return index * 1000
  }

  // Format date for display (preserve original format if possible)
  const formatDateForDisplay = (dateStr, index) => {
    if (!dateStr) return null

    // If it already looks like a date format, return as-is
    if (
      /\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr) ||
      /\d{1,2}\/\d{4}/.test(dateStr) ||
      /^\d{4}$/.test(dateStr)
    ) {
      return dateStr
    }

    // Try to parse and reformat
    const timestamp = parseDateToTimestamp(dateStr, index)
    if (timestamp && timestamp !== index * 1000) {
      const date = new Date(timestamp)
      if (!isNaN(date.getTime())) {
        // Check what information we have in the original string
        const hasDay = /\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)
        const hasMonth = /\d{1,2}\/\d{4}/.test(dateStr)

        if (hasDay) {
          // dd/mm/yyyy
          const day = date.getDate()
          const month = date.getMonth() + 1
          const year = date.getFullYear()
          return `${day}/${month}/${year}`
        } else if (hasMonth) {
          // mm/yyyy
          const month = date.getMonth() + 1
          const year = date.getFullYear()
          return `${month}/${year}`
        } else if (/^\d{4}$/.test(dateStr)) {
          // yyyy
          return dateStr
        } else {
          // Try to extract year from parsed date
          return date.getFullYear().toString()
        }
      }
    }

    // Return original if we can't parse
    return dateStr
  }

  const handleEventClick = (e, index) => {
    e.stopPropagation()
    console.log('Event clicked:', index, 'Current selected:', selectedEvent)
    setSelectedEvent(selectedEvent === index ? null : index)
  }

  const handleCloseTooltip = (e) => {
    e?.stopPropagation()
    setSelectedEvent(null)
  }

  if (isPDFProcessing) {
    return (
      <div className="sidebar-tab-content timeline-sidebar-content">
        <div className="timeline-loading">
          <IconLoading size={32} />
          <p>Processing PDF for AI features...</p>
          <p className="timeline-loading-subtitle">This may take a moment</p>
        </div>
      </div>
    )
  }

  if (isTimelineLoading) {
    return (
      <div className="sidebar-tab-content timeline-sidebar-content">
        <div className="timeline-loading">
          <IconLoading size={32} />
          <p>Generating timeline...</p>
        </div>
      </div>
    )
  }

  if (timelineError) {
    return (
      <div className="sidebar-tab-content timeline-sidebar-content">
        <div className="timeline-error">
          <IconTimeline size={48} />
          <h3>Unable to Generate Timeline</h3>
          <p>{timelineError}</p>
          {documentId && (
            <button className="btn-retry-timeline" onClick={() => generateTimeline(0, false)}>
              Try Again
            </button>
          )}
        </div>
      </div>
    )
  }

  if (timeline && timeline.length > 0) {
    return (
      <div className="sidebar-tab-content timeline-sidebar-content">
        <div className="timeline-list">
          <div className="timeline-header">
            <div className="timeline-header-left">
              <h3>Story Timeline</h3>
              <span className="timeline-count">{timeline.length} events</span>
            </div>
            <button
              className="btn-expand-timeline"
              onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
              title={isTimelineExpanded ? 'Minimize timeline' : 'Expand timeline'}
            >
              {isTimelineExpanded ? (
                <IconMinimizeTimeline size={18} />
              ) : (
                <IconExpandTimeline size={18} />
              )}
              {!isSidebarCollapsed && <span>{isTimelineExpanded ? 'Minimize' : 'Expand'}</span>}
            </button>
          </div>
          <div className="timeline-items-wrapper" ref={itemsContainerRef}>
            {/* Vertical timeline line that extends to full content height */}
            <div className="timeline-vertical-line" ref={lineRef}></div>
            <div className="timeline-items">
            {timeline.map((event, index) => {
              const rawDate = getBestDate(event)
              const displayDate = formatDateForDisplay(rawDate, index)
              const isSelected = selectedEvent === index
              const importance = event.importance || 'medium'
              const importanceClass = `importance-${importance.toLowerCase()}`
              
              return (
                <div 
                  key={index} 
                  className={`timeline-item ${isSelected ? 'selected' : ''} ${importanceClass}`}
                  onClick={(e) => handleEventClick(e, index)}
                  data-event-index={index}
                >
                  <div className="timeline-marker">
                    <div className="timeline-dot"></div>
                    {index < timeline.length - 1 && <div className="timeline-line"></div>}
                  </div>
                  <div className="timeline-content">
                    {displayDate && (
                      <div className="timeline-event-date">
                        {displayDate}
                      </div>
                    )}
                    <div className="timeline-event-title">
                      {event.event || `Event ${event.order || index + 1}`}
                    </div>
                  </div>
                </div>
              )
            })}

            {/* Event Details Tooltip */}
            {selectedEvent !== null &&
              timeline[selectedEvent] &&
              (() => {
                const event = timeline[selectedEvent]
                const rawDate = getBestDate(event)
                const displayDate = formatDateForDisplay(rawDate, selectedEvent)
                const eventElement = itemsContainerRef.current?.querySelector(
                  `[data-event-index="${selectedEvent}"]`
                )
                const rect = eventElement?.getBoundingClientRect()
                const containerRect = itemsContainerRef.current?.getBoundingClientRect()

                let tooltipStyle = {}
                if (rect) {
                  // Position tooltip to the right of the item, or left if not enough space
                  const spaceRight = window.innerWidth - rect.right
                  const spaceLeft = rect.left
                  const tooltipWidth = 280 // approximate tooltip width
                  
                  if (spaceRight >= tooltipWidth + 10) {
                    // Position to the right
                    tooltipStyle = {
                      top: `${rect.top}px`,
                      left: `${rect.right + 10}px`,
                      position: 'fixed'
                    }
                  } else if (spaceLeft >= tooltipWidth + 10) {
                    // Position to the left
                    tooltipStyle = {
                      top: `${rect.top}px`,
                      left: `${rect.left - tooltipWidth - 10}px`,
                      position: 'fixed'
                    }
                  } else {
                    // Center it vertically, position to the right (best we can do)
                    tooltipStyle = {
                      top: `${rect.top + (rect.height / 2)}px`,
                      left: `${rect.right + 10}px`,
                      transform: 'translateY(-50%)',
                      position: 'fixed'
                    }
                  }
                }

                return (
                  <div className="timeline-event-details-tooltip timeline-sidebar-tooltip" style={tooltipStyle}>
                    <button className="tooltip-close" onClick={handleCloseTooltip}>
                      <IconClose size={14} />
                    </button>
                    <div className="tooltip-header">
                      {displayDate && <div className="tooltip-date">{displayDate}</div>}
                      <div className="tooltip-title">{event.event || `Event ${event.order || selectedEvent + 1}`}</div>
                    </div>
                    <div className="tooltip-description">
                      {event.description || event.event || 'No description available.'}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="sidebar-tab-content timeline-sidebar-content">
      <div className="feature-placeholder">
        <IconTimeline size={48} />
        <h3>Timeline</h3>
        <p>Click to generate timeline from the story</p>
        {documentId && (
          <button className="btn-generate-timeline" onClick={generateTimeline}>
            Generate Timeline
          </button>
        )}
      </div>
    </div>
  )
}

export default TimelineSidebar


