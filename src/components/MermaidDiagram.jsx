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

const MermaidDiagram = ({ chart, fontSize = 18 }) => {
  const mermaidRef = useRef(null)
  const containerRef = useRef(null)
  const [error, setError] = useState(null)
  const [svgContent, setSvgContent] = useState(null)

  useEffect(() => {
    if (!chart) return

    // Initialize Mermaid with the specified font size
    initializeMermaid(fontSize)

    const renderDiagram = async () => {
      try {
        setError(null)
        const id = `mermaid-${Math.random().toString(36).substring(2, 11)}`

        // Render the diagram - mermaid.render returns { svg, bindFunctions }
        const { svg } = await mermaid.render(id, chart)
        setSvgContent(svg)
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

  return (
    <div className="mermaid-container" ref={containerRef}>
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
  )
}

export default MermaidDiagram

