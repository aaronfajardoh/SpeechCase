import React from 'react'
import ReactMarkdown from 'react-markdown'
import { IconHighlighter, IconCopy, IconDownload, IconChevronLeft } from './Icons.jsx'
import { Document, Packer, Paragraph, TextRun } from 'docx'
import MermaidDiagram from './MermaidDiagram.jsx'

const SummaryFullView = ({ summaryText, pdfFileName, onMinimize, onCopy, onDownload }) => {
  // Copy summary to clipboard
  const handleCopy = async () => {
    if (!summaryText) return

    try {
      // Convert markdown to plain text for copying
      const plainText = summaryText
        .replace(/#{1,6}\s+/g, '') // Remove headers
        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.+?)\*/g, '$1') // Remove italic
        .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links
        .replace(/`(.+?)`/g, '$1') // Remove inline code
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .trim()

      await navigator.clipboard.writeText(plainText)
      if (onCopy) onCopy()
    } catch (error) {
      console.error('Failed to copy summary:', error)
      alert('Failed to copy summary to clipboard')
    }
  }

  // Download summary as DOCX
  const handleDownload = async () => {
    if (!summaryText) return

    try {
      // Convert markdown to plain text for the document
      const plainText = summaryText
        .replace(/#{1,6}\s+/g, '') // Remove headers
        .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.+?)\*/g, '$1') // Remove italic
        .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Remove links
        .replace(/`(.+?)`/g, '$1') // Remove inline code
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .trim()

      // Split text into paragraphs
      const paragraphs = plainText
        .split(/\n\n+/)
        .filter(p => p.trim())
        .map(text => 
          new Paragraph({
            children: [new TextRun(text.trim())],
            spacing: { after: 200 }
          })
        )

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
      
      // Create filename: "Summary - [pdf name].docx"
      let fileName = 'Summary.docx'
      if (pdfFileName) {
        // Remove .pdf extension if present and add .docx
        const baseName = pdfFileName.replace(/\.pdf$/i, '')
        fileName = `Summary - ${baseName}.docx`
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
                  return <MermaidDiagram key={codeContent} chart={codeContent} />
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

