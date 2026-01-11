import { Paragraph, TextRun, HeadingLevel, Media } from 'docx'
import mermaid from 'mermaid'

// Initialize Mermaid for rendering diagrams
let mermaidInitialized = false

const initializeMermaid = () => {
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
      fontSize: 16,
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis',
        nodeSpacing: 48,
        rankSpacing: 64
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
  }
}

// Convert SVG to PNG blob for DOCX
const svgToPngBlob = (svgString) => {
  return new Promise((resolve, reject) => {
    // Parse SVG to get dimensions
    const parser = new DOMParser()
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml')
    const svgElement = svgDoc.documentElement
    
    // Get width and height from SVG attributes or viewBox
    let width = parseFloat(svgElement.getAttribute('width')) || 800
    let height = parseFloat(svgElement.getAttribute('height')) || 600
    
    // If no explicit dimensions, try to get from viewBox
    const viewBox = svgElement.getAttribute('viewBox')
    if (viewBox) {
      const [, , vw, vh] = viewBox.split(/\s+|,/).map(parseFloat)
      if (vw && vh) {
        width = vw
        height = vh
      }
    }
    
    // Use higher resolution for better quality (3x scale)
    const scale = 3
    const scaledWidth = width * scale
    const scaledHeight = height * scale
    
    // Ensure minimum dimensions
    const minWidth = Math.max(scaledWidth, 1200)
    const minHeight = Math.max(scaledHeight, 900)
    
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    // Create data URL directly from SVG string
    const svgBase64 = btoa(unescape(encodeURIComponent(svgString)))
    const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = minWidth
        canvas.height = minHeight
        const ctx = canvas.getContext('2d')
        
        // Scale the context
        ctx.scale(scale, scale)
        
        // Fill white background
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, width, height)
        
        // Draw the image
        ctx.drawImage(img, 0, 0, width, height)
        
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Failed to convert SVG to PNG'))
          }
        }, 'image/png', 1.0)
      } catch (error) {
        reject(error)
      }
    }
    
    img.onerror = () => {
      reject(new Error('Failed to load SVG'))
    }
    
    img.src = svgDataUrl
  })
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
  sanitized = sanitized.replace(/[ \t]{2,}/g, ' ')
  
  return sanitized.trim()
}

// Render Mermaid diagram to PNG blob
const renderMermaidToBlob = async (mermaidCode) => {
  try {
    initializeMermaid()
    
    // Sanitize the chart code to remove HTML tags that cause parse errors
    const sanitizedCode = sanitizeMermaidCode(mermaidCode)
    
    const id = `mermaid-docx-${Math.random().toString(36).substring(2, 11)}`
    const { svg } = await mermaid.render(id, sanitizedCode)
    
    if (!svg) {
      console.error('Mermaid render returned no SVG')
      return null
    }
    
    const pngBlob = await svgToPngBlob(svg)
    return pngBlob
  } catch (error) {
    console.error('Error rendering Mermaid diagram:', error)
    return null
  }
}

// Convert data URL to Uint8Array for docx Media
const dataUrlToUint8Array = (dataUrl) => {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// Convert blob to Uint8Array
const blobToUint8Array = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const arrayBuffer = reader.result
      resolve(new Uint8Array(arrayBuffer))
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
}

// Process inline formatting in text (bold, italic, code)
const processInlineFormatting = (text) => {
  const runs = []
  let currentIndex = 0
  
  // Find all formatting markers
  const markers = []
  
  // Bold markers
  const boldRegex = /\*\*([^*]+)\*\*/g
  let match
  while ((match = boldRegex.exec(text)) !== null) {
    markers.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'bold',
      content: match[1]
    })
  }
  
  // Italic markers (single asterisk, not part of bold)
  const italicRegex = /(?<!\*)\*([^*\n]+?)\*(?!\*)/g
  while ((match = italicRegex.exec(text)) !== null) {
    markers.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'italic',
      content: match[1]
    })
  }
  
  // Inline code
  const codeRegex = /`([^`]+)`/g
  while ((match = codeRegex.exec(text)) !== null) {
    markers.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'code',
      content: match[1]
    })
  }
  
  // Sort markers by start position
  markers.sort((a, b) => a.start - b.start)
  
  // Remove overlapping markers (keep the first one)
  const nonOverlapping = []
  for (const marker of markers) {
    if (nonOverlapping.length === 0 || marker.start >= nonOverlapping[nonOverlapping.length - 1].end) {
      nonOverlapping.push(marker)
    }
  }
  
  // Build text runs
  for (const marker of nonOverlapping) {
    // Add text before marker
    if (marker.start > currentIndex) {
      const plainText = text.substring(currentIndex, marker.start)
      if (plainText) {
        runs.push(new TextRun(plainText))
      }
    }
    
    // Add formatted text
    const runProps = { text: marker.content }
    if (marker.type === 'bold') {
      runProps.bold = true
    } else if (marker.type === 'italic') {
      runProps.italics = true
    } else if (marker.type === 'code') {
      runProps.font = 'Courier New'
      runProps.size = 20 // 10pt in half-points
    }
    runs.push(new TextRun(runProps))
    
    currentIndex = marker.end
  }
  
  // Add remaining text
  if (currentIndex < text.length) {
    const remaining = text.substring(currentIndex)
    if (remaining) {
      runs.push(new TextRun(remaining))
    }
  }
  
  // If no formatting found, return single run
  if (runs.length === 0) {
    return [new TextRun(text)]
  }
  
  return runs
}

// Convert markdown to DOCX elements
// Returns { elements, images } where images is an array of { data, width, height } for Media.addImage
export const markdownToDocx = async (markdownText) => {
  if (!markdownText) return { elements: [], images: [] }
  
  const elements = []
  const images = [] // Store images separately for Media.addImage
  
  // Extract Mermaid code blocks first
  const mermaidRegex = /```\s*mermaid\s*\n([\s\S]*?)```/gi
  let match
  let lastIndex = 0
  const parts = []
  
  // Process markdown and extract Mermaid blocks
  mermaidRegex.lastIndex = 0
  while ((match = mermaidRegex.exec(markdownText)) !== null) {
    // Add text before the Mermaid block
    const beforeText = markdownText.substring(lastIndex, match.index)
    if (beforeText.trim()) {
      parts.push({ type: 'markdown', content: beforeText })
    }
    
    // Add Mermaid block
    const mermaidCode = match[1].trim()
    parts.push({ type: 'mermaid', content: mermaidCode })
    
    lastIndex = match.index + match[0].length
  }
  
  // Add remaining text
  if (lastIndex < markdownText.length) {
    const remainingText = markdownText.substring(lastIndex)
    if (remainingText.trim()) {
      parts.push({ type: 'markdown', content: remainingText })
    }
  }
  
  // If no Mermaid blocks found, process entire text as markdown
  if (parts.length === 0) {
    parts.push({ type: 'markdown', content: markdownText })
  }
  
  // Process each part
  for (const part of parts) {
    if (part.type === 'mermaid') {
      // Render Mermaid diagram
      try {
        const pngBlob = await renderMermaidToBlob(part.content)
        if (pngBlob) {
          const imageData = await blobToUint8Array(pngBlob)
          
          // Get image dimensions from the blob
          const dimensionImg = new Image()
          const imgUrl = URL.createObjectURL(pngBlob)
          
          await new Promise((resolve, reject) => {
            dimensionImg.onload = () => {
              URL.revokeObjectURL(imgUrl)
              const widthEmu = 7620000 // ~8.33 inches (800px at 96 DPI)
              const aspectRatio = dimensionImg.width / dimensionImg.height || 1.5
              const heightEmu = Math.round(widthEmu / aspectRatio)
              
              // Store image data for later use with Media.addImage
              const imageIndex = images.length
              images.push({
                data: imageData,
                width: widthEmu,
                height: heightEmu
              })
              
              // Create placeholder paragraph that will be replaced with image
              elements.push({
                type: 'image',
                index: imageIndex,
                alignment: 'center',
                spacing: { after: 200 }
              })
              
              resolve()
            }
            dimensionImg.onerror = () => {
              URL.revokeObjectURL(imgUrl)
              reject(new Error('Failed to load image'))
            }
            dimensionImg.src = imgUrl
          })
        } else {
          elements.push(
            new Paragraph({
              children: [new TextRun('[Diagram rendering failed]')],
              spacing: { after: 200 }
            })
          )
        }
      } catch (error) {
        console.error('Error rendering Mermaid diagram:', error)
        elements.push(
          new Paragraph({
            children: [new TextRun('[Diagram rendering error]')],
            spacing: { after: 200 }
          })
        )
      }
    } else {
      // Process markdown content
      const lines = part.content.split('\n')
      let inList = false
      let listType = null
      let listItems = []
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmedLine = line.trim()
        
        if (!trimmedLine) {
          // Empty line - close list if open
          if (inList) {
            elements.push(...listItems)
            listItems = []
            inList = false
            listType = null
          }
          // Add empty paragraph for spacing (paragraph break)
          // Check if previous element exists and is not already an empty paragraph
          if (elements.length === 0 || !(elements[elements.length - 1] instanceof Paragraph && (!elements[elements.length - 1].children || elements[elements.length - 1].children.length === 0))) {
            elements.push(
              new Paragraph({
                spacing: { after: 200 }
              })
            )
          }
          continue
        }
        
        // Check for headers
        if (line.startsWith('#### ')) {
          if (inList) {
            elements.push(...listItems)
            listItems = []
            inList = false
            listType = null
          }
          elements.push(
            new Paragraph({
              text: line.substring(5),
              heading: HeadingLevel.HEADING_4,
              spacing: { after: 200 }
            })
          )
          continue
        }
        
        if (line.startsWith('### ')) {
          if (inList) {
            elements.push(...listItems)
            listItems = []
            inList = false
            listType = null
          }
          elements.push(
            new Paragraph({
              text: line.substring(4),
              heading: HeadingLevel.HEADING_3,
              spacing: { after: 200 }
            })
          )
          continue
        }
        
        if (line.startsWith('## ')) {
          if (inList) {
            elements.push(...listItems)
            listItems = []
            inList = false
            listType = null
          }
          elements.push(
            new Paragraph({
              text: line.substring(3),
              heading: HeadingLevel.HEADING_2,
              spacing: { after: 200 }
            })
          )
          continue
        }
        
        if (line.startsWith('# ')) {
          if (inList) {
            elements.push(...listItems)
            listItems = []
            inList = false
            listType = null
          }
          elements.push(
            new Paragraph({
              text: line.substring(2),
              heading: HeadingLevel.HEADING_1,
              spacing: { after: 200 }
            })
          )
          continue
        }
        
        // Check for list items
        const ulMatch = line.match(/^([*\-+])\s+(.+)$/)
        const olMatch = line.match(/^\d+\.\s+(.+)$/)
        
        if (ulMatch || olMatch) {
          const isUnordered = !!ulMatch
          const content = ulMatch ? ulMatch[2] : olMatch[1]
          
          if (!inList || listType !== (isUnordered ? 'ul' : 'ol')) {
            // Close previous list by adding its items
            if (inList) {
              elements.push(...listItems)
              listItems = []
            }
            listType = isUnordered ? 'ul' : 'ol'
            inList = true
          }
          
          // Process inline formatting for list item
          const runs = processInlineFormatting(content)
          // Add bullet or number prefix
          const prefix = isUnordered ? '• ' : `${listItems.length + 1}. `
          listItems.push(
            new Paragraph({
              children: [new TextRun(prefix), ...runs],
              spacing: { after: 100 },
              indent: { left: 720 } // 0.5 inch indent for lists
            })
          )
        } else {
          // Regular paragraph
          if (inList) {
            // Add all list items
            elements.push(...listItems)
            listItems = []
            inList = false
            listType = null
          }
          
          // Process inline formatting
          const runs = processInlineFormatting(line)
          elements.push(
            new Paragraph({
              children: runs,
              spacing: { after: 200 }
            })
          )
        }
      }
      
      // Close any open list
      if (inList) {
        elements.push(...listItems)
      }
    }
  }
  
  return { elements, images }
}

