import React from 'react'

// Sidebar tab: thumbnails / pages
const PagesSidebar = ({ totalPages, currentPage, scrollToPage, thumbnailRefs }) => {
  return (
    <div className="sidebar-tab-content thumbnail-sidebar-content">
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
        <div
          key={pageNum}
          className={`thumbnail-item ${currentPage === pageNum ? 'active' : ''}`}
          onClick={() => scrollToPage(pageNum)}
          title={`Page ${pageNum}`}
        >
          <canvas
            ref={(el) => {
              if (el) thumbnailRefs.current[pageNum] = el
            }}
            className="thumbnail-canvas"
          />
          <div className="thumbnail-page-number">{pageNum}</div>
        </div>
      ))}
    </div>
  )
}

export default PagesSidebar


