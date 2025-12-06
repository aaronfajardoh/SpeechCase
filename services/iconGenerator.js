/**
 * Service for generating custom SVG icons for timeline events
 * Uses AI to create simple, illustrative SVG icons based on event descriptions
 */

/**
 * Create a concrete illustration description from an event
 * This intermediate step converts the event description into a specific, concrete visual description
 * @param {Object} event - The timeline event object
 * @param {Object} chatClient - The AI client
 * @returns {Promise<string>} - Concrete illustration description
 */
async function createIllustrationPrompt(event, chatClient) {
  const eventTitle = event.event || '';
  const eventDescription = event.description || '';
  const eventText = `${eventTitle}. ${eventDescription}`.trim();

  if (!eventText) {
    return null;
  }

  try {
    const completion = await chatClient.chat.completions.create({
      model: chatClient.baseURL?.includes('deepseek') ? 'deepseek-chat' : 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Convert events into EXTREMELY SIMPLE icon descriptions. ONE object, 2-4 words max.

RULES:
- ONE object: "crown", "document", "hands", "arrow", "phone", "book"
- ONE symbol if needed: "with checkmark", "with arrow", "with warning"
- NO scenes, NO people, NO backgrounds, NO text, NO multiple objects
- Think: single emoji or app icon

Examples:
- "CEO appointed" → "A crown"
- "Funding received" → "A money bag with checkmark"  
- "Partnership" → "Two hands"
- "Launch" → "A rocket"
- "Stock rises" → "Rising arrow"
- "Regulatory issue" → "Document with warning triangle"
- "Expansion" → "Map with pin"
- "Office on iOS" → "Phone with app icon"
- "CEO anniversary" → "Crown with number badge"
- "Communication reading" → "Book with heart"

Return ONLY the description. 2-4 words. ONE object.`
        },
        {
          role: 'user',
          content: `Event: "${eventText}"

ONE simple object (2-4 words max). What represents this?`
        }
      ],
      temperature: 0.3, // Lower temperature for simpler, more consistent descriptions
      max_tokens: 100 // Reduced - descriptions should be very short
    });

    const illustrationDescription = completion.choices[0]?.message?.content?.trim();
    return illustrationDescription || null;
  } catch (error) {
    console.error('Error creating illustration prompt:', error);
    return null;
  }
}

/**
 * Generate an SVG icon for a timeline event using AI
 * @param {Object} event - The timeline event object
 * @param {Object} chatClient - The AI client (DeepSeek or OpenAI)
 * @returns {Promise<string>} - SVG code as a string
 */
export async function generateEventIcon(event, chatClient) {
  if (!chatClient) {
    console.warn('No AI client available for icon generation');
    return null;
  }

  const eventTitle = event.event || '';
  const eventDescription = event.description || '';
  const eventText = `${eventTitle}. ${eventDescription}`.trim();

  if (!eventText) {
    return null;
  }

  // Step 1: Create concrete illustration description
  const illustrationDescription = await createIllustrationPrompt(event, chatClient);
  if (!illustrationDescription) {
    console.warn('Failed to create illustration description for event');
    return null;
  }

  console.log(`Illustration description for "${eventTitle}": "${illustrationDescription}"`);

  // Step 2: Generate SVG based on the concrete description
  try {
    const completion = await chatClient.chat.completions.create({
      model: chatClient.baseURL?.includes('deepseek') ? 'deepseek-chat' : 'gpt-4o-mini', // Use faster model
      messages: [
        {
          role: 'system',
          content: `You are a talented cartoon illustrator specializing in creating fun, artistic, and expressive SVG icons. Your icons should be like charming cartoon drawings that tell a story - think Pixar-style simplicity with personality.

ARTISTIC STYLE REQUIREMENTS:
1. CARTOONISH & ARTISTIC:
   - Use playful, exaggerated proportions (big heads, expressive features)
   - Add personality and emotion to objects/characters
   - Use curved, organic lines instead of rigid geometric shapes
   - Include small details that add character (smiles, eyes, expressions)
   - Make it feel hand-drawn and friendly, not corporate or sterile

2. SIMPLICITY IS KEY:
   - Keep it to 2-4 simple shapes maximum
   - ONE main object (crown, document, hands, arrow, etc.)
   - ONE simple symbol if needed (checkmark, arrow, warning sign)
   - NO complex scenes, NO multiple people, NO backgrounds
   - Think: "What's the simplest emoji-style icon?"

3. Design Specifications:
   - ViewBox: "0 0 64 64"
   - Use 2-4 simple shapes (rect, circle, path, line)
   - Bold outlines: stroke-width="2" to "3"
   - Rounded corners (rx, ry attributes)
   - Simple and clean - must work at 64x64px

4. Color Palette (MUST use these exact colors):
   - Primary: #8ab4f8 (bright blue - main character/element)
   - Secondary: #e8eaed (light gray - accents, highlights, eyes)
   - Positive: #34a853 (green - for happy/successful events)
   - Negative: #ea4335 (red - for problems/warnings)
   - Accent: #fbbc04 (yellow - for energy/excitement)
   - Background: ABSOLUTELY NO BACKGROUND - completely transparent
   - Use fills for main shapes, strokes for outlines
   - Maximum 3-4 colors per icon

5. Cartoon Techniques:
   - Add faces/expressions to objects when appropriate
   - Use curved paths instead of straight lines
   - Add small details: dots for eyes, curved lines for smiles
   - Use circles and rounded rectangles, avoid sharp corners
   - Add motion lines or sparkles for dynamic events

6. Example - Cartoon Car Icon:
<svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <!-- Car body - rounded and friendly -->
  <rect x="12" y="28" width="40" height="20" rx="8" fill="#8ab4f8" stroke="#e8eaed" stroke-width="2.5"/>
  <!-- Car windows -->
  <rect x="18" y="32" width="12" height="8" rx="2" fill="#e8eaed"/>
  <rect x="34" y="32" width="12" height="8" rx="2" fill="#e8eaed"/>
  <!-- Wheels -->
  <circle cx="22" cy="50" r="6" fill="#202124" stroke="#e8eaed" stroke-width="2"/>
  <circle cx="42" cy="50" r="6" fill="#202124" stroke="#e8eaed" stroke-width="2"/>
  <!-- Happy face on front -->
  <circle cx="52" cy="36" r="2" fill="#202124"/>
  <path d="M 48 40 Q 52 42 56 40" stroke="#202124" stroke-width="2" fill="none" stroke-linecap="round"/>
</svg>

Return ONLY the SVG code. Make it artistic, cartoonish, and specific to the event!`
        },
        {
          role: 'user',
          content: `Create a SIMPLE, cartoonish SVG icon based on this description:

Description: "${illustrationDescription}"

CRITICAL: Keep it VERY SIMPLE. Use 2-4 shapes maximum. ONE main object, maybe ONE simple symbol.

Examples:
- "A crown" → Simple crown shape (2-3 rectangles/circles)
- "A money bag with checkmark" → Simple bag shape + checkmark line
- "Two hands shaking" → Two simple hand shapes
- "A rising arrow" → Simple arrow path going up
- "A document with warning" → Simple rectangle + triangle

Create ONLY the SVG code. Keep it simple - 2-4 shapes max.`
        }
      ],
      temperature: 0.7,
      max_tokens: 1200 // Increased to allow for more complex SVGs
    });

    const svgContent = completion.choices[0]?.message?.content?.trim();
    
    if (!svgContent) {
      console.warn(`[Icon Gen] SVG generation returned empty content for "${eventTitle}"`);
      return null;
    }

    console.log(`[Icon Gen] Raw SVG response (first 200 chars): "${svgContent.substring(0, 200)}..."`);

    // Clean up the response - remove markdown code blocks if present
    let cleanedSvg = svgContent
      .replace(/```svg\n?/g, '')
      .replace(/```\n?/g, '')
      .replace(/```html\n?/g, '')
      .replace(/```xml\n?/g, '')
      .trim();

    // Ensure it starts with <svg
    if (!cleanedSvg.startsWith('<svg')) {
      // Try to extract SVG from the response (more lenient - look for SVG anywhere)
      const svgMatch = cleanedSvg.match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch) {
        cleanedSvg = svgMatch[0];
        console.log(`[Icon Gen] Extracted SVG from response`);
      } else {
        console.warn(`[Icon Gen] No SVG found in response for "${eventTitle}". Response: "${svgContent.substring(0, 300)}"`);
        return null;
      }
    }

    // Validate it's a proper SVG
    if (!cleanedSvg.includes('</svg>')) {
      console.warn(`[Icon Gen] SVG missing closing tag for "${eventTitle}"`);
      return null;
    }
    
    // Basic validation - check if it has at least one shape element
    const hasShape = /<(rect|circle|ellipse|path|polygon|polyline|line|g)/i.test(cleanedSvg);
    if (!hasShape) {
      console.warn(`[Icon Gen] SVG has no shape elements for "${eventTitle}"`);
      console.warn(`[Icon Gen] SVG content: "${cleanedSvg.substring(0, 500)}"`);
      return null;
    }
    
    // Additional check - make sure SVG is not just empty or whitespace
    const svgWithoutTags = cleanedSvg.replace(/<\/?svg[^>]*>/gi, '').trim();
    if (svgWithoutTags.length < 10) {
      console.warn(`[Icon Gen] SVG appears to be empty or too short for "${eventTitle}"`);
      console.warn(`[Icon Gen] SVG content: "${cleanedSvg}"`);
      return null;
    }

    // Post-process SVG to ensure it matches app aesthetic
    let processedSvg = cleanedSvg;
    
    // Remove any background fills or rectangles that cover the entire viewBox
    // This ensures transparency on the dark timeline background (#525252)
    processedSvg = processedSvg.replace(
      /<rect[^>]*x=["']?0["']?[^>]*y=["']?0["']?[^>]*width=["']?64["']?[^>]*height=["']?64["']?[^>]*\/?>/gi,
      ''
    );
    processedSvg = processedSvg.replace(
      /<rect[^>]*width=["']?64["']?[^>]*height=["']?64["']?[^>]*x=["']?0["']?[^>]*y=["']?0["']?[^>]*\/?>/gi,
      ''
    );
    
    // Remove any white or light colored background rectangles
    processedSvg = processedSvg.replace(
      /<rect[^>]*(?:fill=["']#(?:fff|ffffff|FFFFFF|f5f5f5|F5F5F5|e8eaed)[^>]*|fill=["']white[^>]*|fill=["']rgb\(255,\s*255,\s*255\)[^>]*)[^>]*\/?>/gi,
      ''
    );
    
    // Remove any fill on the SVG root element
    processedSvg = processedSvg.replace(/<svg([^>]*)\s+fill=["'][^"']*["']([^>]*)>/gi, '<svg$1$2>');
    
    // Remove white fills from any elements
    processedSvg = processedSvg.replace(/fill=["']#(?:fff|ffffff|FFFFFF)["']/gi, 'fill="none"');
    processedSvg = processedSvg.replace(/fill=["']white["']/gi, 'fill="none"');
    processedSvg = processedSvg.replace(/fill=["']rgb\(255,\s*255,\s*255\)["']/gi, 'fill="none"');
    
    // Ensure SVG has proper viewBox attribute
    if (!processedSvg.includes('viewBox=')) {
      processedSvg = processedSvg.replace(/<svg([^>]*)>/, '<svg$1 viewBox="0 0 64 64">');
    }
    
    // Ensure SVG has proper dimensions and no background
    if (!processedSvg.includes('width=') && !processedSvg.includes('height=')) {
      processedSvg = processedSvg.replace(/<svg([^>]*)>/, '<svg$1 width="64" height="64">');
    }
    
    // Explicitly ensure no background fill on SVG element
    // Remove any existing background styles first
    processedSvg = processedSvg.replace(/<svg([^>]*)\s+style=["']([^"']*background[^"']*)["']/gi, (match, attrs, style) => {
      const cleanedStyle = style.replace(/background[^;]*;?/gi, '').trim();
      return cleanedStyle ? `<svg${attrs} style="${cleanedStyle}">` : `<svg${attrs}>`;
    });
    
    // Add explicit transparent background
    if (processedSvg.match(/<svg[^>]*\s+style=["']/gi)) {
      processedSvg = processedSvg.replace(
        /<svg([^>]*)\s+style=["']([^"']*)["']/gi,
        '<svg$1 style="$2; background: transparent !important; background-color: transparent !important;"'
      );
    } else {
      processedSvg = processedSvg.replace(
        /<svg([^>]*)>/,
        '<svg$1 style="background: transparent !important; background-color: transparent !important;">'
      );
    }

    // Normalize colors to match app's color palette
    // Replace common color variations with app's exact colors
    const colorMap = {
      // Blues - normalize to app's blue accent
      '#4285f4': '#8ab4f8',
      '#4285F4': '#8ab4f8',
      '#2196F3': '#8ab4f8',
      '#2196f3': '#8ab4f8',
      '#1976D2': '#8ab4f8',
      '#1976d2': '#8ab4f8',
      '#0D47A1': '#8ab4f8',
      '#0d47a1': '#8ab4f8',
      'rgb(66, 133, 244)': '#8ab4f8',
      'rgb(33, 150, 243)': '#8ab4f8',
      // Grays/whites - normalize to app's light gray
      '#ffffff': '#e8eaed',
      '#FFFFFF': '#e8eaed',
      '#fff': '#e8eaed',
      '#FFF': '#e8eaed',
      'white': '#e8eaed',
      'rgb(255, 255, 255)': '#e8eaed',
      '#f5f5f5': '#e8eaed',
      '#F5F5F5': '#e8eaed',
      // Keep app's exact colors as-is
      '#8ab4f8': '#8ab4f8',
      '#e8eaed': '#e8eaed',
      '#34a853': '#34a853',
      '#ea4335': '#ea4335',
      '#fbbc04': '#fbbc04',
    };

    // Replace colors in fill and stroke attributes
    Object.entries(colorMap).forEach(([oldColor, newColor]) => {
      // Replace in fill attributes
      processedSvg = processedSvg.replace(
        new RegExp(`fill=["']${oldColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'gi'),
        `fill="${newColor}"`
      );
      // Replace in stroke attributes
      processedSvg = processedSvg.replace(
        new RegExp(`stroke=["']${oldColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`, 'gi'),
        `stroke="${newColor}"`
      );
      // Replace in style attributes
      processedSvg = processedSvg.replace(
        new RegExp(`(fill|stroke):\\s*${oldColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
        `$1: ${newColor}`
      );
    });

    // If no colors are specified, add default blue fill
    if (!processedSvg.match(/fill=["']#[0-9a-fA-F]{3,6}/) && !processedSvg.match(/fill=["'](?:none|transparent)/i)) {
      // Add default fill to first shape element
      processedSvg = processedSvg.replace(
        /<(rect|circle|ellipse|path|polygon|polyline|line)([^>]*?)(?:\s*\/)?>/i,
        (match, tag, attrs) => {
          if (!attrs.includes('fill=')) {
            return `<${tag}${attrs} fill="#8ab4f8">`;
          }
          return match;
        }
      );
    }

    console.log(`[Icon Gen] Successfully processed SVG for "${eventTitle}" (${processedSvg.length} chars)`);
    return processedSvg;
  } catch (error) {
    console.error(`[Icon Gen] Error generating event icon for "${eventTitle}":`, error);
    console.error(`[Icon Gen] Error stack:`, error.stack);
    return null;
  }
}

/**
 * Generate icons for multiple events in batch
 * @param {Array} events - Array of event objects
 * @param {Object} chatClient - The AI client
 * @returns {Promise<Map>} - Map of event index to SVG string
 */
export async function generateEventIconsBatch(events, chatClient) {
  const iconMap = new Map();
  
  if (!chatClient || !events || events.length === 0) {
    return iconMap;
  }

  // Only generate icons for high-importance events that are appropriate for illustration
  // Use AI to determine which events are suitable for icons
  const highImportanceEvents = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => {
      const importance = (event.importance || '').toLowerCase();
      return importance === 'high';
    });

  console.log(`Icon generation: Found ${highImportanceEvents.length} high-importance events out of ${events.length} total events`);
  if (highImportanceEvents.length > 0) {
    console.log('High-importance events:', highImportanceEvents.map(({ event, index }) => `[${index}] "${event.event}"`).join(', '));
  }

  if (highImportanceEvents.length === 0) {
    console.log('No high-importance events found for icon generation');
    return iconMap;
  }

  // Generate icons for ALL high-importance events
  // High-importance events are already significant milestones, so they should all get icons
  // Skip AI selection entirely to ensure we don't miss any important events
  const remarkableEvents = highImportanceEvents;
  
  console.log(`[Icon Selection] Using ALL ${highImportanceEvents.length} high-importance events for icon generation (skipping AI selection)`);

  // Generate icons in parallel batches for speed (3 at a time to avoid rate limits)
  console.log(`Generating icons for ${remarkableEvents.length} remarkable events`);
  const batchSize = 3;
  
  for (let i = 0; i < remarkableEvents.length; i += batchSize) {
    const batch = remarkableEvents.slice(i, i + batchSize);
    
    // Generate batch in parallel
    const batchPromises = batch.map(async ({ event, index }) => {
      try {
        console.log(`[Icon Gen] Starting icon generation for event ${index}: "${event.event || 'Untitled'}"`);
        const svg = await generateEventIcon(event, chatClient);
        if (svg) {
          iconMap.set(index, svg);
          console.log(`[Icon Gen] ✓ Successfully generated icon for event ${index}: "${event.event}"`);
        } else {
          console.warn(`[Icon Gen] ✗ Failed to generate icon for event ${index}: "${event.event}" (returned null)`);
        }
        return { index, success: !!svg };
      } catch (error) {
        console.error(`[Icon Gen] ✗ Error generating icon for event ${index}: "${event.event}"`, error);
        return { index, success: false };
      }
    });
    
    // Wait for batch to complete
    await Promise.all(batchPromises);
    
    // Small delay between batches (reduced from 500ms per icon to 200ms per batch)
    if (i + batchSize < remarkableEvents.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log(`[Icon Gen] ===== Icon generation complete =====`);
  console.log(`[Icon Gen] Total remarkable events: ${remarkableEvents.length}`);
  console.log(`[Icon Gen] Successfully generated: ${iconMap.size} icons`);
  console.log(`[Icon Gen] Failed: ${remarkableEvents.length - iconMap.size} icons`);
  if (iconMap.size > 0) {
    console.log(`[Icon Gen] Generated icons for event indices:`, Array.from(iconMap.keys()).join(', '));
  }

  return iconMap;
}

