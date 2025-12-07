import React from 'react'
import ReactMarkdown from 'react-markdown'
import { IconHighlighter, IconCopy, IconDownload, IconChevronLeft } from './Icons.jsx'
import MermaidDiagram from './MermaidDiagram.jsx'
import { markdownToClipboardHtml, copyHtmlToClipboard } from '../utils/clipboardUtils.js'

const SummaryFullView = ({ summaryText, pdfFileName, onMinimize, onCopy, onDownload }) => {
  // Copy summary to clipboard
  const handleCopy = async () => {
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
        .replace(/```mermaid[\s\S]*?```/g, '[Diagram]') // Replace Mermaid diagrams
        .replace(/```[\s\S]*?```/g, '') // Remove other code blocks
        .trim()
      
      // Wrap HTML in proper structure for Google Docs/Word compatibility
      // Google Docs prefers a simpler structure without DOCTYPE
      // Ensure no background colors are applied
      const wrappedHtml = `<html><head><meta charset="utf-8"><style>body { background: transparent !important; color: black !important; } * { background: transparent !important; }</style></head><body style="background: transparent; color: black;">${htmlContent}</body></html>`
      
      const success = await copyHtmlToClipboard(wrappedHtml, plainText)
      if (success && onCopy) {
        onCopy()
      } else if (!success) {
        alert('Failed to copy summary to clipboard')
      }
    } catch (error) {
      console.error('Failed to copy summary:', error)
      alert('Failed to copy summary to clipboard')
    }
  }

  // Download summary as DOCX
  const handleDownload = async () => {
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
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
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
      if (onDownload) onDownload()
    } catch (error) {
      console.error('Failed to download summary:', error)
      alert('Failed to download summary as DOCX')
    }
  }

  return (
    <div className="summary-full-view">
      <div className="summary-full-view-header">
        <div className="summary-full-view-title">
          <IconHighlighter size={24} />
          <h2>Summary</h2>
        </div>
        <div className="summary-full-view-actions">
          <button
            className="btn-summary-full-action btn-copy-summary"
            onClick={handleCopy}
            title="Copy summary to clipboard"
          >
            <IconCopy size={16} />
            <span>Copy</span>
          </button>
          <button
            className="btn-summary-full-action btn-download-summary"
            onClick={handleDownload}
            title="Download summary as DOCX"
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
      <div className="summary-full-view-content">
        <div className="summary-full-view-markdown">
          <ReactMarkdown
            components={{
              code({ node, inline, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '')
                const language = match ? match[1] : ''
                
                if (!inline && language === 'mermaid') {
                  const codeContent = String(children).replace(/\n$/, '')
                  return <MermaidDiagram key={codeContent} chart={codeContent} fontSize={16} />
                }
                
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                )
              }
            }}
          >
            {summaryText}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

export default SummaryFullView

