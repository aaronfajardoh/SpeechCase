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
          content: `You are an expert at converting event descriptions into concrete, specific visual illustrations. Your job is to analyze an event and create a precise description of what should be drawn as an icon.

Your output should be a single, specific sentence that describes exactly what visual elements should appear in the icon. Be concrete and specific - describe the actual objects, symbols, or scenes that should be illustrated.

Examples:
- Event: "Uber received cease-and-desist orders from regulatory agencies"
  → "A document with a forbidden/stop icon (circle with diagonal line) on it"

- Event: "Company launched its first product"
  → "A rocket ship taking off with a product box attached"

- Event: "Received $10 million in funding"
  → "A money bag or stack of dollar bills with a checkmark"

- Event: "Partnership agreement signed with major corporation"
  → "Two hands shaking with a contract document in the background"

- Event: "Expanded operations to 5 new cities"
  → "A map with multiple location pins or buildings growing"

- Event: "UberCab official launch in San Francisco"
  → "A taxi car with a launch rocket or celebration elements"

Be specific about:
- The main object(s) to draw
- Any symbols or icons that should be included (forbidden signs, checkmarks, arrows, etc.)
- The composition or arrangement
- Any text or labels (though keep it minimal - prefer symbols)

Return ONLY the illustration description, nothing else.`
        },
        {
          role: 'user',
          content: `Convert this timeline event into a concrete illustration description:

Event: "${eventText}"

What specific visual elements should be drawn to represent this event? Describe exactly what should appear in the icon. Be concrete and specific about objects, symbols, and composition.`
        }
      ],
      temperature: 0.5,
      max_tokens: 150
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

2. EVENT REPRESENTATION (CRITICAL):
   - The icon MUST tell the specific story of THIS event, not be generic
   - "Uber launch" → A cute cartoon car with a smile, maybe with a taxi sign
   - "Funding received" → A happy cartoon money bag or dollar bill with eyes
   - "Partnership" → Two cartoon characters shaking hands or hugging
   - "Expansion" → A cartoon building growing or a map with a happy pin
   - "Legal issue" → A cartoon gavel or warning sign with a concerned expression
   - "Product launch" → The actual product as a cute cartoon character
   - Think: "How would a child draw this event?" - simple but expressive

3. Design Specifications:
   - ViewBox: "0 0 64 64"
   - Use 3-5 shapes for detail and character (not just 2-3)
   - Bold outlines: stroke-width="2.5" to "3.5"
   - Rounded corners everywhere (rx, ry attributes)
   - Add small decorative elements (stars, sparkles, lines) for personality
   - Make it instantly recognizable and memorable

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
          content: `Create a fun, cartoonish, artistic SVG icon based on this specific illustration description:

Illustration to create: "${illustrationDescription}"

Original event context: "${eventText}"

Create the SVG icon exactly as described. Make it:
- Cartoonish and artistic with personality
- Specific to the illustration description (not generic)
- Expressive and memorable
- Clear and recognizable at 64x64px

Draw exactly what is described in the illustration description.`
        }
      ],
      temperature: 0.7,
      max_tokens: 800 // Reduced for faster generation
    });

    const svgContent = completion.choices[0]?.message?.content?.trim();
    
    if (!svgContent) {
      return null;
    }

    // Clean up the response - remove markdown code blocks if present
    let cleanedSvg = svgContent
      .replace(/```svg\n?/g, '')
      .replace(/```\n?/g, '')
      .replace(/```html\n?/g, '')
      .trim();

    // Ensure it starts with <svg
    if (!cleanedSvg.startsWith('<svg')) {
      // Try to extract SVG from the response
      const svgMatch = cleanedSvg.match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch) {
        cleanedSvg = svgMatch[0];
      } else {
        return null;
      }
    }

    // Validate it's a proper SVG
    if (!cleanedSvg.includes('</svg>')) {
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

    return processedSvg;
  } catch (error) {
    console.error('Error generating event icon:', error);
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

  // Use AI to determine which events are appropriate for icons
  // Some events like "meeting held" or "discussion" might not need icons
  let remarkableEvents = highImportanceEvents;
  
  try {
    const eventSummaries = highImportanceEvents.map(({ event, index }) => ({
      index,
      title: event.event || '',
      description: event.description || ''
    }));

    const selectionPrompt = `You are selecting which timeline events should have visual icons. 

CRITICAL: Be GENEROUS and INCLUSIVE. Include almost all events unless they are truly abstract or meaningless.

INCLUDE these types of events (include most of them):
- Launches, product releases, service launches
- Funding rounds, investments, valuations
- Regulatory actions, legal issues, cease-and-desist orders
- Major milestones, achievements, growth milestones
- Company changes, rebranding, renaming
- Expansions, scaling, market entries
- Key partnerships, agreements
- Revenue milestones, financial achievements
- Any event with a concrete action or outcome

ONLY EXCLUDE:
- Truly abstract events like "discussion held" or "meeting occurred" with no concrete outcome
- Very minor administrative events with no significance

Events to review:
${eventSummaries.map((e, i) => `${i + 1}. "${e.title}" - ${e.description.substring(0, 200)}`).join('\n')}

Return a JSON array of ALL indices (0-based) that should have icons. Be very inclusive - if an event has any significance, include it. Return something like [0, 1, 2, 3, 4, 5, 6] for most events.`;

    const selectionCompletion = await chatClient.chat.completions.create({
      model: chatClient.baseURL?.includes('deepseek') ? 'deepseek-chat' : 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are selecting which timeline events should have visual icons. Be GENEROUS and INCLUSIVE - include almost all events. Return ONLY a JSON array of indices (0-based), nothing else. Example: [0, 1, 2, 3, 4, 5, 6]'
        },
        {
          role: 'user',
          content: selectionPrompt
        }
      ],
      temperature: 0.2, // Lower temperature for more consistent, inclusive selection
      max_tokens: 150 // Increased to allow for more indices
    });

    const selectionText = selectionCompletion.choices[0]?.message?.content?.trim();
    console.log(`AI selection response: "${selectionText}"`);
    let selectedIndices = [];
    
    try {
      // Try to parse as JSON array
      const parsed = JSON.parse(selectionText);
      if (Array.isArray(parsed)) {
        selectedIndices = parsed.filter(idx => typeof idx === 'number' && idx >= 0 && idx < highImportanceEvents.length);
        console.log(`Parsed ${selectedIndices.length} indices from AI response:`, selectedIndices);
      }
    } catch (e) {
      console.log('JSON parse failed, trying to extract numbers from text');
      // If parsing fails, try to extract numbers from the text
      const numbers = selectionText.match(/\d+/g);
      if (numbers) {
        selectedIndices = numbers.map(n => parseInt(n)).filter(idx => idx >= 0 && idx < highImportanceEvents.length);
        console.log(`Extracted ${selectedIndices.length} indices from text:`, selectedIndices);
      }
    }

    // If AI selection succeeded, use selected events
    // But if AI is too conservative (selects less than 50% of high-importance events), use all of them
    if (selectedIndices.length > 0) {
      const selectedCount = selectedIndices.length;
      const totalHighImportance = highImportanceEvents.length;
      const selectionRatio = selectedCount / totalHighImportance;
      
      console.log(`AI selected ${selectedCount} out of ${totalHighImportance} high-importance events (${(selectionRatio * 100).toFixed(0)}%)`);
      
      if (selectionRatio < 0.5) {
        console.warn(`WARNING: AI selection is too conservative (${(selectionRatio * 100).toFixed(0)}%). Using ALL high-importance events instead.`);
        remarkableEvents = highImportanceEvents;
      } else {
        remarkableEvents = selectedIndices.map(idx => highImportanceEvents[idx]);
        console.log(`Using AI-selected events: ${remarkableEvents.length} events`);
      }
    } else {
      console.log('AI selection returned empty, using ALL high-importance events as fallback');
      // If AI fails completely, just use all high-importance events
      // They're already marked as high importance, so they should get icons
      remarkableEvents = highImportanceEvents;
      console.log(`Fallback: Using all ${remarkableEvents.length} high-importance events`);
    }

    console.log(`Selected ${remarkableEvents.length} events for icon generation out of ${highImportanceEvents.length} high-importance events`);
  } catch (error) {
    console.error('Error selecting events for icons, using filtered high-importance events:', error);
      console.error('Error in AI selection, using ALL high-importance events as fallback');
      // If there's an error, just use all high-importance events
      // They're already marked as high importance, so they should get icons
      remarkableEvents = highImportanceEvents;
      console.log(`Error fallback: Using all ${remarkableEvents.length} high-importance events`);
  }

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

