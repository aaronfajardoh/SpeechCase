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
        nodeSpacing: Math.max(fontSize * 4, 50),
        rankSpacing: Math.max(fontSize * 5, 60)
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
    <div className="mermaid-container">
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

