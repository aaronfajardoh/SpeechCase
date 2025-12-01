import React from 'react'
import {
  IconTimeline,
  IconLoading,
  IconExpandTimeline,
  IconMinimizeTimeline
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
          <div className="timeline-items">
            {timeline.map((event, index) => (
              <div key={index} className="timeline-item">
                <div className="timeline-marker">
                  <div className="timeline-dot"></div>
                  {index < timeline.length - 1 && <div className="timeline-line"></div>}
                </div>
                <div className="timeline-content">
                  <div className="timeline-event-title">
                    {event.event || `Event ${event.order || index + 1}`}
                  </div>
                  <div className="timeline-event-description">{event.description || ''}</div>
                </div>
              </div>
            ))}
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


