import React from 'react'
import { IconHighlighter, IconCopy, IconDownload, IconChevronLeft } from './Icons.jsx'
import { Document, Packer, Paragraph, TextRun } from 'docx'

const HighlightsFullView = ({ highlightItems, pdfFileName, onMinimize, onCopy, onDownload }) => {
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

  // Copy highlights to clipboard
  const handleCopy = async () => {
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
      if (onCopy) onCopy()
    } catch (error) {
      console.error('Failed to copy highlights:', error)
      alert('Failed to copy highlights to clipboard')
    }
  }

  // Download highlights as DOCX
  const handleDownload = async () => {
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
      if (onDownload) onDownload()
    } catch (error) {
      console.error('Failed to download highlights:', error)
      alert('Failed to download highlights as DOCX')
    }
  }

  return (
    <div className="highlights-full-view">
      <div className="highlights-full-view-header">
        <div className="highlights-full-view-title">
          <IconHighlighter size={24} />
          <h2>Highlights</h2>
          <span className="highlights-full-view-count">{highlightItems.length} items</span>
        </div>
        <div className="highlights-full-view-actions">
          <button
            className="btn-highlights-full-action btn-copy-highlights"
            onClick={handleCopy}
            title="Copy highlights to clipboard"
          >
            <IconCopy size={16} />
            <span>Copy</span>
          </button>
          <button
            className="btn-highlights-full-action btn-download-highlights"
            onClick={handleDownload}
            title="Download highlights as DOCX"
          >
            <IconDownload size={16} />
            <span>Download</span>
          </button>
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
      <div className="highlights-full-view-content">
        <div className="highlights-full-view-items">
          {highlightItems.map((item) => (
            <div
              key={item.id}
              className={`highlights-full-view-item ${getFormattingClass(item.color)}`}
              data-color={item.color || 'yellow'}
            >
              {item.color === 'blue' && <span className="bullet-point">•</span>}
              {item.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default HighlightsFullView


