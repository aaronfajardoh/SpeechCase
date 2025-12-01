import React, { useRef, useState, useEffect, useMemo } from 'react'
import { IconClose } from './Icons.jsx'

// Proportional Timeline Component
// - Horizontal line with dots
// - Proportional spacing based on event dates
// - Labels alternate above/below the line and never overlap
const ProportionalTimeline = ({ events, selectedEvent, onEventClick, onCloseDetails }) => {
  const containerRef = useRef(null)
  const trackRef = useRef(null)

  // Visible width of the viewport (used as the "ideal" line length)
  const [viewportWidth, setViewportWidth] = useState(0)

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
    if (!dateStr) return `Event ${index + 1}`

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

    // Return original if we can't parse, or fallback to order
    return dateStr || `Event ${index + 1}`
  }

  // Calculate proportional positions and layout based on dates and viewport width
  const { laidOutEvents, trackLength } = useMemo(() => {
    if (!events || events.length === 0) {
      return { laidOutEvents: [], trackLength: viewportWidth || 0 }
    }

    // --- 1. Convert event dates to timestamps ---
    const eventsWithTimestamps = events.map((event, index) => {
      const rawDate = getBestDate(event)
      return {
        ...event,
        rawDate,
        timestamp: parseDateToTimestamp(rawDate, index),
        originalIndex: index
      }
    })

    const timestamps = eventsWithTimestamps.map((e) => e.timestamp)
    const minTimestamp = Math.min(...timestamps)
    const maxTimestamp = Math.max(...timestamps)
    const timeRange = maxTimestamp - minTimestamp || 1 // Avoid division by zero

    // Base inner length we try to fit into the viewport, keeping side margins
    // Left margin must be at least half the label width (90px) plus safety padding
    // Labels are max 180px wide, centered on dots, so we need at least 90px + padding
    const leftMarginPx = 200 // Enough to ensure first label (180px wide, centered) never gets cut off
    const rightMarginPx = 200 // Same for last label
    const viewport = viewportWidth || 0
    const baseInnerLength = Math.max(viewport - leftMarginPx - rightMarginPx, 400) // sensible minimum

    // --- 2. Initial proportional positions in pixels ---
    const positioned = eventsWithTimestamps.map((event, idx) => {
      const normalized =
        timeRange === 0 ? 0.5 : (event.timestamp - minTimestamp) / timeRange
      // Start after left margin so the first label has room on the left
      const idealX = leftMarginPx + normalized * baseInnerLength
      const displayDate = formatDateForDisplay(event.rawDate, idx)

      return {
        ...event,
        position: normalized,
        idealX,
        displayDate
      }
    })

    // --- 3. Enforce non-overlapping labels by spacing centers ---
    // Labels can be up to ~180px wide; keep centers far enough apart to avoid overlap
    const minGapPx = 190

    const sorted = [...positioned].sort((a, b) => a.idealX - b.idealX)
    let lastX = -Infinity
    const xs = []

    sorted.forEach((event) => {
      let x = event.idealX

      if (x - lastX < minGapPx) {
        x = lastX + minGapPx
      }

      lastX = x
      xs.push({ event, x })
    })

    // --- 4. If needed, extend the line to accommodate spacing ---
    const minTotalLength = leftMarginPx + baseInnerLength + rightMarginPx
    let effectiveLength = Math.max(minTotalLength, (lastX || minTotalLength) + rightMarginPx)

    // Normalize back to 0–1 based on the final line length
    const layoutMap = new Map()
    xs.forEach(({ event, x }) => {
      const normalized = effectiveLength > 0 ? x / effectiveLength : event.position
      layoutMap.set(event.originalIndex, normalized)
    })

    const laidOut = positioned.map((event) => ({
      ...event,
      layoutPosition: layoutMap.get(event.originalIndex) ?? event.position
    }))

    return {
      laidOutEvents: laidOut,
      trackLength: effectiveLength
    }
  }, [events, viewportWidth])

  // Update viewport width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setViewportWidth(containerRef.current.offsetWidth)
      }
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  // Get brief description: short, single-sentence-ish summary
  const getBriefDescription = (text, maxWords = 4) => {
    if (!text) return ''
    const sentenceEnd = text.indexOf('.')
    const trimmed =
      sentenceEnd > 0 ? text.slice(0, sentenceEnd) : text
    const words = trimmed.split(' ').slice(0, maxWords * 3) // allow a bit longer but still short
    return words.join(' ')
  }

  // Group events by stage and identify stage boundaries
  const { stageBoundaries, hasStages } = useMemo(() => {
    if (!laidOutEvents || laidOutEvents.length === 0) {
      return { stageBoundaries: [], hasStages: false }
    }

    // Check if any events have stages
    const eventsWithStages = laidOutEvents.filter(e => e.stage && e.stage !== null)
    if (eventsWithStages.length === 0) {
      return { stageBoundaries: [], hasStages: false }
    }

    // Group events by stage
    const stageMap = new Map()
    laidOutEvents.forEach((event, index) => {
      if (event.stage && event.stage !== null) {
        if (!stageMap.has(event.stage)) {
          stageMap.set(event.stage, [])
        }
        stageMap.get(event.stage).push({ event, index })
      }
    })

    // Find stage boundaries (first event of each stage)
    const boundaries = []
    const seenStages = new Set()
    laidOutEvents.forEach((event, index) => {
      if (event.stage && event.stage !== null && !seenStages.has(event.stage)) {
        seenStages.add(event.stage)
        boundaries.push({
          stage: event.stage,
          position: event.layoutPosition ?? event.position,
          index
        })
      }
    })

    // Sort boundaries by position
    boundaries.sort((a, b) => a.position - b.position)

    return { stageBoundaries: boundaries, hasStages: true }
  }, [laidOutEvents])

  // Get importance class for styling
  const getImportanceClass = (importance) => {
    if (!importance) return ''
    return `importance-${importance.toLowerCase()}`
  }

  return (
    <div className="proportional-timeline-container" ref={containerRef}>
      <div
        className="timeline-track"
        ref={trackRef}
        style={{
          width: trackLength || '100%'
        }}
      >
        {/* Horizontal Timeline Line */}
        <div className="timeline-horizontal-line"></div>

        {/* Stage Separators (subtle vertical lines) */}
        {hasStages && stageBoundaries.length > 0 && (
          <div className="timeline-stage-separators">
            {stageBoundaries.map((boundary, idx) => {
              if (idx === 0) return null // Skip first boundary (start of timeline)
              const leftPercent = boundary.position * 100
              return (
                <div
                  key={`stage-separator-${boundary.stage}-${idx}`}
                  className="timeline-stage-separator"
                  style={{ left: `${leftPercent}%` }}
                >
                  <div className="timeline-stage-separator-line"></div>
                </div>
              )
            })}
          </div>
        )}

        {/* Stage Labels at Top */}
        {hasStages && stageBoundaries.length > 0 && (
          <div className="timeline-stage-labels">
            {stageBoundaries.map((boundary, idx) => {
              const leftPercent = boundary.position * 100
              const isFirst = idx === 0
              return (
                <div
                  key={`stage-label-${boundary.stage}-${idx}`}
                  className={`timeline-stage-label-start ${isFirst ? 'first-stage' : ''}`}
                  style={{ left: `${leftPercent}%` }}
                >
                  {boundary.stage}
                </div>
              )
            })}
          </div>
        )}

        {/* Events positioned along the line */}
        <div className="timeline-events-container">
          {laidOutEvents.map((event, index) => {
            const leftPercent = (event.layoutPosition ?? event.position) * 100
            const isAbove = index % 2 === 0 // Alternate labels above/below

            const importance = event.importance || 'medium'
            const importanceClass = getImportanceClass(importance)

            return (
              <div
                key={index}
                className={`timeline-event-marker ${isAbove ? 'above' : 'below'} ${
                  selectedEvent === index ? 'selected' : ''
                } ${importanceClass}`}
                style={{ left: `${leftPercent}%` }}
              >
                {/* Label above or below the dot */}
                <div
                  className={`timeline-event-label ${isAbove ? 'label-above' : 'label-below'} ${importanceClass}`}
                  onClick={() => onEventClick(selectedEvent === index ? null : index)}
                >
                  <div className="timeline-event-date">
                    {event.displayDate || event.date || `Event ${event.order || index + 1}`}
                  </div>
                  <div className="timeline-event-brief">
                    {getBriefDescription(event.event || event.description, 4)}
                  </div>
                </div>

                {/* Dot (kept on the line) */}
                <button
                  className={`timeline-dot-small ${importanceClass}`}
                  onClick={() => onEventClick(selectedEvent === index ? null : index)}
                  data-event-index={index}
                  aria-label={`Event ${index + 1}: ${event.event}`}
                />
              </div>
            )
          })}
        </div>

        {/* Event Details Tooltip */}
        {selectedEvent !== null &&
          laidOutEvents[selectedEvent] &&
          (() => {
            const event = laidOutEvents[selectedEvent]
            const eventElement =
              trackRef.current?.querySelector(
                `[data-event-index="${selectedEvent}"]`
              )
            const rect = eventElement?.getBoundingClientRect()
            const containerRect = trackRef.current?.getBoundingClientRect()

            let tooltipStyle = {}
            if (rect && containerRect) {
              // Position tooltip above or below based on available space
              const spaceAbove = rect.top - containerRect.top
              const spaceBelow = containerRect.bottom - rect.bottom
              const isAbove = spaceAbove > spaceBelow

              tooltipStyle = {
                top: isAbove
                  ? `${rect.top - containerRect.top - 10}px`
                  : `${rect.bottom - containerRect.top + 10}px`,
                left: `${rect.left + rect.width / 2 - containerRect.left}px`,
                transform: 'translateX(-50%)',
                position: 'absolute'
              }
            }

            return (
              <div className="timeline-event-details-tooltip" style={tooltipStyle}>
                <button className="tooltip-close" onClick={onCloseDetails}>
                  <IconClose size={14} />
                </button>
                <div className="tooltip-header">
                  {event.displayDate && <div className="tooltip-date">{event.displayDate}</div>}
                  <div className="tooltip-title">{event.event || `Event ${event.order}`}</div>
                </div>
                <div className="tooltip-description">
                  {event.description || event.event || 'No description available.'}
                </div>
              </div>
            )
          })()}
      </div>
    </div>
  )
}

export default ProportionalTimeline


