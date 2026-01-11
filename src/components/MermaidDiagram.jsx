import React, { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

// Initialize Mermaid once globally
let mermaidInitialized = false
let currentFontSize = 16

const initializeMermaid = (fontSize = 16) => {
  // Re-initialize if fontSize changed or not initialized
  if (!mermaidInitialized || currentFontSize !== fontSize) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
      fontSize: fontSize,
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis',
        nodeSpacing: Math.max(fontSize * 3, 40), // Reduced spacing for more compact diagrams
        rankSpacing: Math.max(fontSize * 4, 50) // Reduced vertical spacing to fit screen height
      },
      sequence: {
        useMaxWidth: true,
        diagramMarginX: 50,
        diagramMarginY: 10
      },
      gantt: {
        useMaxWidth: true
      }
    })
    mermaidInitialized = true
    currentFontSize = fontSize
  }
}

/**
 * Sanitize Mermaid diagram code by removing HTML tags that cause parse errors
 * Mermaid doesn't support HTML tags like <br>, <b>, <i> in node labels
 */
const sanitizeMermaidCode = (code) => {
  if (!code) return code
  
  let sanitized = code
  
  // Replace <br> and <br/> with spaces (Mermaid doesn't support HTML line breaks)
  sanitized = sanitized.replace(/<br\s*\/?>/gi, ' ')
  
  // Remove HTML formatting tags but preserve their text content
  sanitized = sanitized.replace(/<b>(.*?)<\/b>/gi, '$1')
  sanitized = sanitized.replace(/<i>(.*?)<\/i>/gi, '$1')
  sanitized = sanitized.replace(/<strong>(.*?)<\/strong>/gi, '$1')
  sanitized = sanitized.replace(/<em>(.*?)<\/em>/gi, '$1')
  sanitized = sanitized.replace(/<u>(.*?)<\/u>/gi, '$1')
  
  // Remove any remaining HTML tags (catch-all)
  sanitized = sanitized.replace(/<[^>]+>/g, '')
  
  // Clean up multiple consecutive spaces that might result from tag removal
  // Use a more conservative approach: only collapse spaces, don't remove them entirely
  sanitized = sanitized.replace(/[ \t]{2,}/g, ' ')
  
  return sanitized.trim()
}

const MermaidDiagram = ({ chart, fontSize = 18 }) => {
  const mermaidRef = useRef(null)
  const containerRef = useRef(null)
  const [error, setError] = useState(null)
  const [svgContent, setSvgContent] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    if (!chart) return

    // Initialize Mermaid with the specified font size
    initializeMermaid(fontSize)

    const renderDiagram = async () => {
      try {
        setError(null)
        
        // Sanitize the chart code to remove HTML tags that cause parse errors
        const sanitizedChart = sanitizeMermaidCode(chart)
        
        const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`

        // Render the diagram - mermaid.render returns { svg, bindFunctions }
        const { svg } = await mermaid.render(id, sanitizedChart)
        
        // Process SVG to add rounded corners and light blue background
        const parser = new DOMParser()
        const svgDoc = parser.parseFromString(svg, 'image/svg+xml')
        const svgElement = svgDoc.documentElement
        
        // Add rounded corners to all rect elements
        const rects = svgElement.querySelectorAll('rect')
        rects.forEach(rect => {
          // Only add rounded corners to node rectangles (not background or other elements)
          const parent = rect.parentElement
          if (parent && parent.classList.contains('node')) {
            rect.setAttribute('rx', '8')
            rect.setAttribute('ry', '8')
          }
        })
        
        // Update fill colors to light blue for node shapes
        const nodeRects = svgElement.querySelectorAll('.node rect')
        nodeRects.forEach(rect => {
          rect.setAttribute('fill', '#e3f2fd')
          rect.setAttribute('stroke', '#1976d2')
        })
        
        const nodePolygons = svgElement.querySelectorAll('.node polygon')
        nodePolygons.forEach(polygon => {
          polygon.setAttribute('fill', '#e3f2fd')
          polygon.setAttribute('stroke', '#1976d2')
        })
        
        const nodeCircles = svgElement.querySelectorAll('.node circle')
        nodeCircles.forEach(circle => {
          circle.setAttribute('fill', '#e3f2fd')
          circle.setAttribute('stroke', '#1976d2')
        })
        
        const nodeEllipses = svgElement.querySelectorAll('.node ellipse')
        nodeEllipses.forEach(ellipse => {
          ellipse.setAttribute('fill', '#e3f2fd')
          ellipse.setAttribute('stroke', '#1976d2')
        })
        
        // Convert back to string
        const serializer = new XMLSerializer()
        const modifiedSvg = serializer.serializeToString(svgElement)
        
        setSvgContent(modifiedSvg)
      } catch (err) {
        console.error('Error rendering Mermaid diagram:', err)
        setError(err.message || 'Failed to render diagram')
      }
    }

    renderDiagram()
  }, [chart, fontSize])

  // Scale SVG to fit max-height constraint after it's rendered
  useEffect(() => {
    if (!svgContent || !mermaidRef.current) return

    const scaleSVG = () => {
      const svgElement = mermaidRef.current?.querySelector('svg')
      if (!svgElement || !containerRef.current) return

      // Get the container's max-height (590px for summary full view)
      const container = containerRef.current.closest('.mermaid-container')
      if (!container) return

      const isSummaryFullView = container.closest('.summary-full-view-markdown')
      const maxHeight = isSummaryFullView ? 590 : container.clientHeight - 48 // Account for padding
      const maxWidth = container.clientWidth - 48 // Account for padding

      // Get SVG's natural dimensions
      const svgHeight = parseFloat(svgElement.getAttribute('height')) || svgElement.getBoundingClientRect().height
      const svgWidth = parseFloat(svgElement.getAttribute('width')) || svgElement.getBoundingClientRect().width

      if (!svgHeight || !svgWidth) return

      // Calculate scale factor to fit within constraints
      const heightScale = maxHeight / svgHeight
      const widthScale = maxWidth / svgWidth
      const scale = Math.min(1, heightScale, widthScale) // Don't scale up, only down

      if (scale < 1) {
        // Apply scale and adjust SVG dimensions
        const newHeight = svgHeight * scale
        const newWidth = svgWidth * scale
        
        svgElement.setAttribute('width', newWidth)
        svgElement.setAttribute('height', newHeight)
        svgElement.style.width = `${newWidth}px`
        svgElement.style.height = `${newHeight}px`
        svgElement.style.maxWidth = '100%'
        svgElement.style.maxHeight = `${maxHeight}px`
      }
      
      // Set min-width to ensure readability (allow horizontal scroll if needed)
      svgElement.style.minWidth = '100%'
      // If SVG is naturally wider, allow it to be wider for better readability
      if (svgWidth > maxWidth) {
        svgElement.style.minWidth = `${Math.min(svgWidth, maxWidth * 1.2)}px`
      }
    }

    // Scale after SVG is rendered and dimensions are available
    const timeoutId = setTimeout(scaleSVG, 150)
    
    // Also scale on window resize
    window.addEventListener('resize', scaleSVG)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', scaleSVG)
    }
  }, [svgContent])

  if (error) {
    return (
      <div className="mermaid-error" style={{
        padding: '1rem',
        border: '1px solid #e0e0e0',
        borderRadius: '4px',
        backgroundColor: '#fafafa',
        color: '#666',
        fontSize: '0.875rem'
      }}>
        <strong>Diagram Error:</strong> {error}
      </div>
    )
  }

  const handleDiagramClick = () => {
    setIsModalOpen(true)
  }

  const Modal = ({ isOpen, onClose, children }) => {
    if (!isOpen) return null
    return (
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          cursor: 'pointer'
        }}
        onClick={onClose}
      >
        <div 
          style={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'auto',
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '8px',
            cursor: 'default',
            position: 'relative'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
          <button 
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#333',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div 
        className="mermaid-container" 
        ref={containerRef}
        style={{ 
          overflowX: 'auto', 
          overflowY: 'hidden', 
          width: '100%',
          cursor: 'pointer'
        }}
        onClick={handleDiagramClick}
      >
        {svgContent ? (
          <div 
            ref={mermaidRef}
            className="mermaid-diagram-content"
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        ) : (
          <div className="mermaid-loading">Rendering diagram...</div>
        )}
      </div>
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <div 
          dangerouslySetInnerHTML={{ __html: svgContent || '' }}
          style={{ minWidth: '100%' }}
        />
      </Modal>
    </>
  )
}

export default MermaidDiagram

