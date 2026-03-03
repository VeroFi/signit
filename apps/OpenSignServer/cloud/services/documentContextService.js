/**
 * Document Context Service
 * Extracts and formats document context from Textract data for GPT-5.1
 */

import Parse from 'parse';

// Textract results cache (in-memory, per document)
// Key: documentId, Value: { textractData, hasFullData, timestamp }
const textractCache = new Map();
const TEXTRACT_CACHE_TTL = 60 * 60 * 1000; // 1 hour cache TTL

/**
 * Get cached Textract data for a document
 */
function getCachedTextractData(documentId) {
  const cached = textractCache.get(documentId);
  if (cached && Date.now() - cached.timestamp < TEXTRACT_CACHE_TTL) {
    console.log(`[documentContextService] Using cached Textract data for document ${documentId}`);
    return cached;
  }
  // Cache expired or doesn't exist
  if (cached) {
    textractCache.delete(documentId);
  }
  return null;
}

/**
 * Cache Textract data for a document
 */
function cacheTextractData(documentId, textractData, hasFullData) {
  textractCache.set(documentId, {
    textractData,
    hasFullData,
    timestamp: Date.now(),
  });
  console.log(
    `[documentContextService] Cached Textract data for document ${documentId} (hasFullData: ${hasFullData})`
  );

  // Clean up old cache entries if cache gets too large
  if (textractCache.size > 100) {
    const now = Date.now();
    for (const [key, value] of textractCache.entries()) {
      if (now - value.timestamp > TEXTRACT_CACHE_TTL) {
        textractCache.delete(key);
      }
    }
  }
}

/**
 * Check if document has full Textract data available (from auto-detect)
 * Checks in-memory cache only
 */
async function checkForFullTextractData(documentId) {
  const cached = getCachedTextractData(documentId);
  if (cached && cached.hasFullData) {
    return cached.textractData;
  }
  return null;
}

/**
 * Store full Textract results in cache (called after auto-detect runs)
 * This allows PaperPal™ to use full data instead of re-running LAYOUT-only
 */
export async function storeFullTextractResults(documentId, textractResult) {
  if (!textractResult || !textractResult.success) {
    return;
  }

  const textractData = {
    text: textractResult.text || [],
    layout: textractResult.layout || [],
    forms: textractResult.forms || [],
    tables: textractResult.tables || [],
  };

  // Store in cache (1-hour TTL)
  cacheTextractData(documentId, textractData, true);

  console.log(
    `[documentContextService] Stored full Textract results for document ${documentId} (${textractData.forms.length} forms, ${textractData.tables.length} tables) - cached for 1 hour`
  );
}

/**
 * Store LAYOUT-only Textract results in cache (called after PaperPal™ runs)
 */
export async function storeLayoutOnlyTextractResults(documentId, textractResult) {
  if (!textractResult || !textractResult.success) {
    return;
  }

  const textractData = {
    text: textractResult.text || [],
    layout: textractResult.layout || [],
    forms: textractResult.forms || [], // Empty in LAYOUT-only mode
    tables: textractResult.tables || [], // Empty in LAYOUT-only mode
  };

  // Store in cache (1-hour TTL)
  cacheTextractData(documentId, textractData, false);

  console.log(
    `[documentContextService] Stored LAYOUT-only Textract results for document ${documentId} - cached for 1 hour`
  );
}

/**
 * Format text blocks into readable text
 */
function formatTextBlocks(textBlocks) {
  if (!textBlocks || !Array.isArray(textBlocks)) {
    return '';
  }

  // Group by page and extract LINE blocks (more readable than WORD blocks)
  const pageTexts = {};

  textBlocks.forEach(block => {
    if (block.type === 'LINE') {
      const page = block.pageNumber || 1;
      if (!pageTexts[page]) {
        pageTexts[page] = [];
      }
      pageTexts[page].push(block.text);
    }
  });

  // Format as page-by-page text
  const formattedPages = Object.keys(pageTexts)
    .sort((a, b) => parseInt(a) - parseInt(b))
    .map(pageNum => {
      const lines = pageTexts[pageNum].filter(line => line && line.trim());
      return `Page ${pageNum}:\n${lines.join('\n')}`;
    });

  return formattedPages.join('\n\n');
}

/**
 * Format forms into readable text
 */
function formatForms(forms) {
  if (!forms || !Array.isArray(forms)) {
    return '';
  }

  const formTexts = forms.map((form, index) => {
    const keyText = form.key?.text || '';
    const valueText = form.value?.text || '';
    const pageNum = form.pageNumber || 1;

    return `Form ${index + 1} (Page ${pageNum}):\n  Key: ${keyText}\n  Value: ${valueText}`;
  });

  return formTexts.join('\n\n');
}

/**
 * Format tables into readable text
 */
function formatTables(tables) {
  if (!tables || !Array.isArray(tables)) {
    return '';
  }

  const tableTexts = tables.map((table, index) => {
    const pageNum = table.pageNumber || 1;
    let tableText = `Table ${index + 1} (Page ${pageNum}):\n`;

    if (table.cells && table.cells.length > 0) {
      // Group cells by row
      const rows = {};
      table.cells.forEach(cell => {
        const row = cell.rowIndex || 0;
        if (!rows[row]) {
          rows[row] = [];
        }
        rows[row].push(cell.text || '');
      });

      // Format rows
      Object.keys(rows)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .forEach(rowIndex => {
          tableText += `  Row ${rowIndex}: ${rows[rowIndex].join(' | ')}\n`;
        });
    }

    return tableText;
  });

  return tableTexts.join('\n\n');
}

/**
 * Format layout blocks into readable text
 */
function formatLayout(layoutBlocks) {
  if (!layoutBlocks || !Array.isArray(layoutBlocks)) {
    return '';
  }

  // Group by type and page
  const layoutByType = {};

  layoutBlocks.forEach(block => {
    const type = block.type || 'LAYOUT';
    const page = block.pageNumber || 1;
    const key = `${type}_${page}`;

    if (!layoutByType[key]) {
      layoutByType[key] = {
        type,
        page,
        texts: [],
      };
    }

    if (block.text && block.text.trim()) {
      layoutByType[key].texts.push(block.text);
    }
  });

  const formattedLayouts = Object.values(layoutByType).map(layout => {
    return `${layout.type} (Page ${layout.page}):\n${layout.texts.join('\n')}`;
  });

  return formattedLayouts.join('\n\n');
}

/**
 * Summarize large document context
 */
function summarizeContext(context, maxLength = 50000) {
  const fullText = context.fullText || '';

  if (fullText.length <= maxLength) {
    return context;
  }

  // If too long, prioritize:
  // 1. First page (usually title/intro)
  // 2. Forms (important fields)
  // 3. Layout headers/titles
  // 4. First part of text

  const summary = {
    ...context,
    fullText:
      fullText.slice(0, maxLength) + '\n\n[Document truncated for length - showing first portion]',
    isTruncated: true,
  };

  return summary;
}

/**
 * Get document context from Textract data
 * @param {string} documentId - The document ID
 * @param {object} request - The Parse request object (for user context)
 * @param {Parse.Object} doc - Optional: pre-fetched document object (to avoid re-querying)
 */
export async function getDocumentContext(documentId, request, doc = null) {
  try {
    // Use provided doc or fetch it
    if (!doc) {
      const DocumentClass = Parse.Object.extend('contracts_Document');
      const query = new Parse.Query(DocumentClass);
      query.equalTo('objectId', documentId);
      // Try with user session first (if request.user is available)
      try {
        doc = await query.first();
      } catch (queryError) {
        // If that fails, try with master key (if available in context)
        try {
          doc = await query.first({ useMasterKey: true });
        } catch (masterKeyError) {
          console.error(
            '[documentContextService] Could not fetch document:',
            masterKeyError.message
          );
          throw queryError; // Throw original error
        }
      }
    }

    if (!doc) {
      return null;
    }

    // Check cache first - avoid re-running Textract for every question
    const cached = getCachedTextractData(documentId);
    let textractData = null;
    let hasFullData = false;

    if (cached) {
      // Use cached data (either full or LAYOUT-only)
      textractData = cached.textractData;
      hasFullData = cached.hasFullData;
      const cacheAge = Math.round((Date.now() - cached.timestamp) / 1000 / 60); // minutes
      console.log(
        `[documentContextService] Using cached Textract data (hasFullData: ${hasFullData}, cache age: ${cacheAge} minutes)`
      );
      console.log(
        `[documentContextService] Cache source: ${
          hasFullData ? 'Full data from auto-detect' : 'LAYOUT-only from PaperPal™'
        }`
      );
    } else {
      // Cache miss - need to fetch Textract data
      // First, check if full Textract data exists (from auto-detect) - but cache is empty, so skip
      // No full data available - use LAYOUT-only for cost savings
      // This happens when:
      // 1. Requestor didn't run auto-detect fields
      // 2. First time PaperPal™ is used for this document
      // 3. Cache expired or server restarted
      console.log(
        '[documentContextService] No cached data found. Running LAYOUT-only Textract (cost-optimized for PaperPal™)...'
      );
      try {
        const readBySignItLayoutOnly = (await import('../parsefunction/readBySignItLayoutOnly.js'))
          .default;
        const textractRequest = {
          params: {
            documentId,
            doc: doc, // Pass the doc object to avoid re-querying
            pdfUrl: doc ? doc.get('URL') : null, // Also pass PDF URL for convenience
          },
          user: request.user,
        };

        const textractResult = await readBySignItLayoutOnly(textractRequest);

        if (textractResult && textractResult.success) {
          textractData = {
            text: textractResult.text || [],
            layout: textractResult.layout || [],
            forms: textractResult.forms || [], // Empty in LAYOUT-only mode
            tables: textractResult.tables || [], // Empty in LAYOUT-only mode
          };
          hasFullData = false; // LAYOUT-only mode
          console.log(
            '[documentContextService] Fetched LAYOUT-only Textract data (will be cached for 1 hour)'
          );
        }
      } catch (error) {
        console.log('[documentContextService] Could not fetch Textract data:', error.message);
        // Continue without Textract data
      }

      // Cache the results (even if empty) to avoid re-fetching
      if (textractData) {
        cacheTextractData(documentId, textractData, hasFullData);
      }
    }

    // Format the context
    const context = {
      documentId,
      documentTitle: doc.get('Name') || 'Untitled Document',
      hasTextractData: !!textractData,
      hasFullData: hasFullData, // Flag to indicate if we have forms/tables data
    };

    if (textractData) {
      // Format each section
      const textContent = formatTextBlocks(textractData.text);
      const formsContent = formatForms(textractData.forms);
      const tablesContent = formatTables(textractData.tables);
      const layoutContent = formatLayout(textractData.layout);

      // Combine into full text
      const fullText = [
        `Document: ${context.documentTitle}`,
        '',
        '=== TEXT CONTENT ===',
        textContent,
        '',
        '=== FORMS ===',
        formsContent,
        '',
        '=== TABLES ===',
        tablesContent,
        '',
        '=== LAYOUT ===',
        layoutContent,
      ].join('\n');

      context.fullText = fullText;
      context.text = textContent;
      context.forms = formsContent;
      context.tables = tablesContent;
      context.layout = layoutContent;
      context.rawData = textractData; // Keep raw data for reference
    } else {
      // No Textract data available
      context.fullText = `Document: ${context.documentTitle}\n\n[Document content not available - Textract analysis may be needed]`;
    }

    // Summarize if too long
    const maxLength = parseInt(process.env.PAPERPAL_MAX_CONTEXT_LENGTH || '50000');
    const summarized = summarizeContext(context, maxLength);

    return summarized;
  } catch (error) {
    console.error('[documentContextService] Error getting document context:', error);
    return {
      documentId,
      documentTitle: 'Unknown Document',
      fullText: '[Error retrieving document context]',
      hasTextractData: false,
    };
  }
}

/**
 * Format document context for GPT-5.1 prompt
 */
export function formatContextForPrompt(documentContext, workflowState, workflowData) {
  if (!documentContext) {
    return '';
  }

  let promptContext = `Document: ${documentContext.documentTitle || 'Unknown'}\n\n`;

  // Add workflow state information
  if (workflowState) {
    promptContext += `Current Workflow: ${workflowState}\n`;

    if (workflowData) {
      if (workflowState === 'editing') {
        promptContext += `- Current Page: ${workflowData.pageNumber || 1}\n`;
        promptContext += `- Fields Placed: ${workflowData.signerPos?.length || 0}\n`;
        promptContext += `- Signers: ${workflowData.signersdata?.length || 0}\n`;
        if (workflowData.isDetectingFields) {
          promptContext += `- Auto-detect in progress\n`;
        }
      } else if (workflowState === 'signing') {
        promptContext += `- Signed: ${workflowData.isSigned ? 'Yes' : 'No'}\n`;
        promptContext += `- Document Complete: ${workflowData.isCompleted ? 'Yes' : 'No'}\n`;
        promptContext += `- Fields to Complete: ${workflowData.signerPos?.length || 0}\n`;
      }
    }
    promptContext += '\n';
  }

  // Add document content
  if (documentContext.fullText) {
    promptContext += `Document Content:\n${documentContext.fullText}`;
  }

  return promptContext;
}
