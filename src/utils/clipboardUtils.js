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

// Convert SVG to PNG data URL for better Word compatibility
const svgToPng = (svgString) => {
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
    
    // Use higher resolution for better quality (2x for retina, 3x for very high quality)
    // This ensures images are crisp when resized in documents
    const scale = 3
    const scaledWidth = width * scale
    const scaledHeight = height * scale
    
    // Ensure minimum dimensions
    const minWidth = Math.max(scaledWidth, 1200) // At least 1200px wide at 3x scale
    const minHeight = Math.max(scaledHeight, 900) // At least 900px tall at 3x scale
    
    const img = new Image()
    // Set crossOrigin to avoid CORS/tainting issues
    img.crossOrigin = 'anonymous'
    
    // Create data URL directly from SVG string (avoids CORS issues)
    const svgBase64 = btoa(unescape(encodeURIComponent(svgString)))
    const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        // Use high resolution for crisp rendering
        canvas.width = minWidth
        canvas.height = minHeight
        const ctx = canvas.getContext('2d')
        
        // Scale the context to match our high resolution
        ctx.scale(scale, scale)
        
        // Fill white background for better appearance in Word
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, width, height)
        
        // Draw the image at the original size (scaling is handled by context scale)
        ctx.drawImage(img, 0, 0, width, height)
        
        canvas.toBlob((blob) => {
          if (blob) {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          } else {
            reject(new Error('Failed to convert SVG to PNG'))
          }
        }, 'image/png', 1.0) // Maximum quality
      } catch (error) {
        console.warn('Canvas conversion failed, falling back to SVG:', error)
        // Fallback to SVG if canvas conversion fails
        resolve(svgDataUrl)
      }
    }
    
    img.onerror = () => {
      console.warn('Image load failed, using SVG directly')
      // Fallback to SVG if image load fails
      resolve(svgDataUrl)
    }
    
    img.src = svgDataUrl
  })
}

// Render Mermaid diagram to PNG and convert to base64 data URL
const renderMermaidToImage = async (mermaidCode) => {
  try {
    initializeMermaid()
    
    // Sanitize the chart code to remove HTML tags that cause parse errors
    const sanitizedCode = sanitizeMermaidCode(mermaidCode)
    
    const id = `mermaid-clipboard-${Math.random().toString(36).substring(2, 11)}`
    const { svg } = await mermaid.render(id, sanitizedCode)
    
    if (!svg) {
      console.error('Mermaid render returned no SVG')
      return null
    }
    
    // Try to convert SVG to PNG for better compatibility
    try {
      const pngDataUrl = await svgToPng(svg)
      return pngDataUrl
    } catch (pngError) {
      console.warn('PNG conversion failed, using SVG:', pngError)
      // Fallback to SVG if PNG conversion fails
      const svgBase64 = btoa(unescape(encodeURIComponent(svg)))
      return `data:image/svg+xml;base64,${svgBase64}`
    }
  } catch (error) {
    console.error('Error rendering Mermaid diagram:', error)
    return null
  }
}

// Helper function to process inline formatting (bold, italic, links, code)
const processInlineFormatting = (text) => {
  if (!text) return text
  // Links first
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  // Bold (before italic to avoid conflicts)
  // Use <b> tag for better Google Docs compatibility, and handle multiple spaces/newlines
  text = text.replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>')
  text = text.replace(/__([^_]+?)__/g, '<b>$1</b>')
  // Italic (single asterisks/underscores, but not part of bold)
  // Use non-greedy matching and handle edge cases
  text = text.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<i>$1</i>')
  text = text.replace(/(?<!_)_([^_\n]+?)_(?!_)/g, '<i>$1</i>')
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
  return text
}

// Simple markdown to HTML converter (handles common cases)
const markdownToHtml = (markdown) => {
  if (!markdown || !markdown.trim()) return ''
  
  let html = markdown
  
  // First, handle code blocks (before other processing to avoid conflicts)
  // Non-mermaid code blocks - but mermaid blocks should already be extracted
  html = html.replace(/```(\w+)?\s*\n?([\s\S]*?)```/g, (match, lang, code) => {
    // Skip if this looks like it might be mermaid (shouldn't happen if extraction worked)
    if (lang && lang.toLowerCase() === 'mermaid') {
      console.warn('Found mermaid block in markdown converter - should have been extracted earlier')
      return match // Keep mermaid blocks for separate processing
    }
    return `<pre><code>${escapeHtml(code.trim())}</code></pre>`
  })
  
  // Process lists line by line
  const lines = html.split('\n')
  const processedLines = []
  let inList = false
  let listType = null // 'ul' or 'ol'
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.trim()
    
    // Check for unordered list item (starts with *, -, or +)
    const ulMatch = trimmedLine.match(/^([*\-+])\s+(.+)$/)
    // Check for ordered list item (starts with number.)
    const olMatch = trimmedLine.match(/^\d+\.\s+(.+)$/)
    
    if (ulMatch || olMatch) {
      const isUnordered = !!ulMatch
      const content = ulMatch ? ulMatch[2] : olMatch[1]
      
      if (!inList || listType !== (isUnordered ? 'ul' : 'ol')) {
        // Close previous list if exists
        if (inList) {
          processedLines.push(`</${listType}>`)
        }
        // Start new list
        listType = isUnordered ? 'ul' : 'ol'
        processedLines.push(`<${listType}>`)
        inList = true
      }
      
      // Process inline formatting for list item content
      const itemContent = processInlineFormatting(content)
      processedLines.push(`<li>${itemContent}</li>`)
    } else {
      // Not a list item
      if (inList) {
        if (trimmedLine === '') {
          // Empty line - check if next line is also a list item
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim()
            const nextIsListItem = /^([*\-+]|\d+\.)\s+/.test(nextLine)
            if (!nextIsListItem) {
              processedLines.push(`</${listType}>`)
              inList = false
              listType = null
            }
          } else {
            // Last line, close list
            processedLines.push(`</${listType}>`)
            inList = false
            listType = null
          }
        } else {
          // Non-list content, close the list
          processedLines.push(`</${listType}>`)
          inList = false
          listType = null
          processedLines.push(line)
        }
      } else {
        processedLines.push(line)
      }
    }
  }
  
  // Close any open list
  if (inList) {
    processedLines.push(`</${listType}>`)
  }
  
  html = processedLines.join('\n')
  
  // Headers (process from most specific to least)
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>')
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>')
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>')
  
  // Process inline formatting for remaining text (not in lists/headers/code blocks)
  // Process line by line, skipping already-formatted content
  html = html.split('\n').map(line => {
    const trimmed = line.trim()
    // Skip if empty, already HTML, or code block
    if (!trimmed || trimmed.startsWith('<') || trimmed.startsWith('```')) {
      return line
    }
    // Process formatting
    return processInlineFormatting(line)
  }).join('\n')
  
  // Split into paragraphs and process (but preserve lists, headers, and code blocks)
  const blocks = html.split(/\n\n+/)
  html = blocks.map(block => {
    block = block.trim()
    if (!block) return ''
    // Don't wrap if it's already a block element
    if (/^<(h[1-6]|pre|ul|ol|li|p|div)/.test(block)) {
      return block
    }
    // Convert single newlines to <br> within paragraphs
    block = block.replace(/\n/g, '<br>')
    return `<p>${block}</p>`
  }).filter(p => p).join('\n')
  
  return html
}

// Escape HTML special characters
const escapeHtml = (text) => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Convert markdown with Mermaid diagrams to HTML for clipboard
export const markdownToClipboardHtml = async (markdownText) => {
  if (!markdownText) return ''
  
  console.log('Processing markdown for clipboard, length:', markdownText.length)
  
  // Extract Mermaid code blocks FIRST
  // Handle: ```mermaid\n...```, ``` mermaid \n...```, etc.
  // Match triple backticks with mermaid keyword (case insensitive)
  // Use non-greedy matching to handle multiple blocks
  const mermaidRegex = /```\s*mermaid\s*\n([\s\S]*?)```/gi
  let match
  let lastIndex = 0
  const parts = []
  let mermaidCount = 0
  
  // Process markdown and extract Mermaid blocks
  // Reset regex lastIndex to start from beginning
  mermaidRegex.lastIndex = 0
  while ((match = mermaidRegex.exec(markdownText)) !== null) {
    mermaidCount++
    console.log(`Found Mermaid block #${mermaidCount} at index ${match.index}`)
    
    // Add text before the Mermaid block
    const beforeText = markdownText.substring(lastIndex, match.index)
    if (beforeText.trim()) {
      parts.push({ type: 'markdown', content: beforeText })
    }
    
    // Add Mermaid block
    const mermaidCode = match[1].trim()
    console.log('Mermaid code length:', mermaidCode.length, 'First 50 chars:', mermaidCode.substring(0, 50))
    parts.push({ type: 'mermaid', content: mermaidCode })
    
    lastIndex = match.index + match[0].length
  }
  
  console.log(`Total Mermaid blocks found: ${mermaidCount}`)
  
  // Add remaining text
  if (lastIndex < markdownText.length) {
    const remainingText = markdownText.substring(lastIndex)
    if (remainingText.trim()) {
      parts.push({ type: 'markdown', content: remainingText })
    }
  }
  
  // If no Mermaid blocks found, process entire text as markdown
  if (parts.length === 0) {
    console.log('No Mermaid blocks found, processing as plain markdown')
    parts.push({ type: 'markdown', content: markdownText })
  }
  
  // Process each part
  const htmlParts = []
  for (const part of parts) {
    if (part.type === 'mermaid') {
      // Render Mermaid diagram
      console.log('Rendering Mermaid diagram:', part.content.substring(0, 100))
      try {
        const imageDataUrl = await renderMermaidToImage(part.content)
        if (imageDataUrl) {
          console.log('Mermaid diagram rendered successfully, image size:', imageDataUrl.length)
          // Use proper image tag with sizing for Google Docs/Word compatibility
          // Set a larger default width so images appear at a readable size
          htmlParts.push(`<div style="text-align: center; margin: 1em 0;"><img src="${imageDataUrl}" alt="Diagram" style="width: 800px; max-width: 100%; height: auto;" /></div>`)
        } else {
          console.warn('Failed to render Mermaid diagram - no image data URL returned')
          htmlParts.push('<p style="color: #666; font-style: italic;">[Diagram rendering failed]</p>')
        }
      } catch (error) {
        console.error('Error rendering Mermaid diagram:', error, error.stack)
        htmlParts.push('<p style="color: #666; font-style: italic;">[Diagram rendering error: ' + error.message + ']</p>')
      }
    } else {
      // Convert markdown to HTML
      const html = markdownToHtml(part.content)
      htmlParts.push(html)
    }
  }
  
  return htmlParts.join('\n')
}

// Copy HTML to clipboard with both HTML and plain text formats
export const copyHtmlToClipboard = async (htmlContent, plainTextFallback) => {
  try {
    // Method 1: Use execCommand with a temporary div (better Google Docs compatibility)
    // This method creates a temporary element with the HTML and copies it
    // It works better than ClipboardItem API for Google Docs
    const tempDiv = document.createElement('div')
    tempDiv.style.position = 'fixed'
    tempDiv.style.left = '-9999px'
    tempDiv.style.top = '-9999px'
    tempDiv.style.width = '1px'
    tempDiv.style.height = '1px'
    tempDiv.style.opacity = '0'
    tempDiv.style.backgroundColor = 'transparent'
    tempDiv.style.color = 'inherit'
    // Ensure no background colors are inherited
    tempDiv.setAttribute('contenteditable', 'true')
    tempDiv.innerHTML = htmlContent
    document.body.appendChild(tempDiv)
    
    // Select the content
    const range = document.createRange()
    range.selectNodeContents(tempDiv)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    
    try {
      // Copy using execCommand (deprecated but works better with Google Docs)
      const success = document.execCommand('copy')
      selection.removeAllRanges()
      document.body.removeChild(tempDiv)
      
      if (success) {
        return true
      } else {
        throw new Error('execCommand copy failed')
      }
    } catch (execError) {
      selection.removeAllRanges()
      if (document.body.contains(tempDiv)) {
        document.body.removeChild(tempDiv)
      }
      throw execError
    }
  } catch (error) {
    console.error('Failed to copy HTML to clipboard:', error)
    // Fallback: Try ClipboardItem API
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
      try {
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' })
        const textBlob = new Blob([plainTextFallback], { type: 'text/plain' })
        
        const clipboardItem = new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob
        })
        
        await navigator.clipboard.write([clipboardItem])
        return true
      } catch (clipboardError) {
        console.warn('ClipboardItem API also failed:', clipboardError)
      }
    }
    
    // Final fallback to plain text
    try {
      await navigator.clipboard.writeText(plainTextFallback)
      return true
    } catch (fallbackError) {
      console.error('Failed to copy plain text to clipboard:', fallbackError)
      return false
    }
  }
}

