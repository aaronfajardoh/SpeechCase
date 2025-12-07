import React, { useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

// Initialize Mermaid once globally
let mermaidInitialized = false

const initializeMermaid = () => {
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
      fontSize: 14
    })
    mermaidInitialized = true
  }
}

const MermaidDiagram = ({ chart }) => {
  const mermaidRef = useRef(null)
  const [error, setError] = useState(null)
  const [svgContent, setSvgContent] = useState(null)

  useEffect(() => {
    if (!chart) return

    // Initialize Mermaid (only once globally)
    initializeMermaid()

    const renderDiagram = async () => {
      try {
        setError(null)
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`

        // Render the diagram - mermaid.render returns { svg, bindFunctions }
        const { svg } = await mermaid.render(id, chart)
        setSvgContent(svg)
      } catch (err) {
        console.error('Error rendering Mermaid diagram:', err)
        setError(err.message || 'Failed to render diagram')
      }
    }

    renderDiagram()
  }, [chart])

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
    <div className="mermaid-container" style={{
      margin: '1.5rem 0',
      padding: '1rem',
      backgroundColor: '#fff',
      borderRadius: '4px',
      border: '1px solid #e0e0e0',
      overflow: 'auto',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      {svgContent ? (
        <div 
          ref={mermaidRef}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      ) : (
        <div style={{ color: '#999', fontSize: '0.875rem' }}>Rendering diagram...</div>
      )}
    </div>
  )
}

export default MermaidDiagram

