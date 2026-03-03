/**
 * readBySignItLayoutOnly
 * Lightweight version that only uses LAYOUT feature for PaperPal™
 * Cost: $4/1K pages (vs $65/1K for full FORMS+TABLES+LAYOUT)
 *
 * This is used by PaperPal™ for document context, while the full readBySignIt
 * is used when the user clicks "Auto-detect fields" button.
 */

import {
  TextractClient,
  AnalyzeDocumentCommand,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
} from '@aws-sdk/client-textract';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { PDFDocument } from 'pdf-lib';
import Parse from 'parse';
import crypto from 'crypto';

// Initialize AWS clients
const textractClient = new TextractClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Parse Textract response to extract LAYOUT and TEXT blocks only
 */
function parseTextractResponseLayoutOnly(textractResponse) {
  const blocks = textractResponse.Blocks || [];

  // Create block map for efficient lookup
  const blockMap = {};
  blocks.forEach(block => {
    if (block.Id) {
      blockMap[block.Id] = block;
    }
  });

  // Extract TEXT blocks (LINE and WORD)
  const textBlocks = [];
  const layoutBlocks = [];

  blocks.forEach(block => {
    const pageNumber = block.Page || 1;

    // TEXT blocks (LINE blocks are more useful than WORD blocks)
    if (block.BlockType === 'LINE') {
      const text = extractTextFromBlock(block, blockMap);
      if (text && text.trim()) {
        textBlocks.push({
          type: block.BlockType,
          text: text.trim(),
          pageNumber,
          geometry: block.Geometry,
        });
      }
    }

    // LAYOUT blocks (headers, footers, titles, etc.)
    if (block.BlockType === 'LAYOUT' || block.BlockType?.startsWith('LAYOUT_')) {
      const text = extractTextFromBlock(block, blockMap);
      layoutBlocks.push({
        type: block.BlockType,
        text: text || '',
        pageNumber,
        geometry: block.Geometry,
      });
    }
  });

  return {
    text: textBlocks,
    layout: layoutBlocks,
    forms: [], // Empty - not extracted in LAYOUT-only mode
    tables: [], // Empty - not extracted in LAYOUT-only mode
  };
}

/**
 * Extract text from a block
 */
function extractTextFromBlock(block, blockMap) {
  if (block.Text) {
    return block.Text;
  }

  if (block.Relationships) {
    const childIds = block.Relationships.filter(rel => rel.Type === 'CHILD').flatMap(
      rel => rel.Ids || []
    );

    const textParts = childIds
      .map(id => {
        const childBlock = blockMap[id] || block;
        return childBlock.Text || '';
      })
      .filter(text => text && text.trim());

    return textParts.join(' ').trim();
  }

  return '';
}

export default async function readBySignItLayoutOnly(request) {
  try {
    const { documentId } = request.params;

    if (!documentId) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'documentId is required');
    }

    if (!request.user) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'User not authenticated');
    }

    // Validate AWS credentials
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'AWS credentials not configured.');
    }

    console.log('[readBySignItLayoutOnly] Processing document (LAYOUT-only mode):', documentId);

    // Load document - accept doc object if provided, otherwise query
    let doc = request.params.doc || null;
    let pdfUrl = request.params.pdfUrl || null;

    if (!doc && !pdfUrl) {
      const DocumentClass = Parse.Object.extend('contracts_Document');
      const query = new Parse.Query(DocumentClass);
      query.equalTo('objectId', documentId);

      // Try regular query first (user session), fallback to master key if needed
      try {
        doc = await query.first();
      } catch (queryError) {
        // If that fails, try master key (if available in context)
        try {
          doc = await query.first({ useMasterKey: true });
        } catch (masterKeyError) {
          throw new Parse.Error(
            Parse.Error.OBJECT_NOT_FOUND,
            'Document not found or access denied'
          );
        }
      }
    }

    if (!doc && !pdfUrl) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Document not found');
    }

    // Get PDF URL from doc if not provided
    if (!pdfUrl && doc) {
      pdfUrl = doc.get('URL');
    }

    if (!pdfUrl) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Document has no PDF file');
    }

    console.log('[readBySignItLayoutOnly] Fetching PDF from URL:', pdfUrl);

    // Download PDF
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Parse.Error(
        Parse.Error.FILE_SAVE_ERROR,
        `Failed to fetch PDF: ${response.statusText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const pdfBytes = Buffer.from(arrayBuffer);

    console.log('[readBySignItLayoutOnly] PDF loaded, size:', pdfBytes.length, 'bytes');

    // Validate PDF format
    if (pdfBytes.length < 4) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Invalid PDF: file too small');
    }

    const magicBytes = pdfBytes.slice(0, 4).toString('ascii');
    if (magicBytes !== '%PDF') {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Invalid PDF format');
    }

    // Determine if multi-page
    let isMultiPage = false;
    let pageCount = 1;
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      pageCount = pdfDoc.getPageCount();
      isMultiPage = pageCount > 1;
      console.log('[readBySignItLayoutOnly] PDF has', pageCount, 'page(s)');
    } catch (pdfError) {
      console.warn('[readBySignItLayoutOnly] Could not determine page count, assuming single-page');
      isMultiPage = false;
    }

    let textractResponse;

    if (isMultiPage) {
      // Multi-page PDF: Upload to S3 and use StartDocumentAnalysis (async)
      if (!process.env.AWS_S3_BUCKET) {
        throw new Parse.Error(
          Parse.Error.INTERNAL_SERVER_ERROR,
          'AWS_S3_BUCKET not configured for multi-page PDFs.'
        );
      }

      const s3Key = `textract-temp/${crypto.randomUUID()}.pdf`;
      console.log('[readBySignItLayoutOnly] Uploading PDF to S3:', s3Key);

      try {
        const putCommand = new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: s3Key,
          Body: pdfBytes,
          ContentType: 'application/pdf',
        });
        await s3Client.send(putCommand);
        console.log('[readBySignItLayoutOnly] PDF uploaded to S3 successfully');
      } catch (s3Error) {
        console.error('[readBySignItLayoutOnly] S3 upload error:', s3Error);
        throw new Parse.Error(
          Parse.Error.INTERNAL_SERVER_ERROR,
          `Failed to upload PDF to S3: ${s3Error.message}`
        );
      }

      // Start async analysis with LAYOUT only
      try {
        const startCommand = new StartDocumentAnalysisCommand({
          DocumentLocation: {
            S3Object: {
              Bucket: process.env.AWS_S3_BUCKET,
              Name: s3Key,
            },
          },
          FeatureTypes: ['LAYOUT'], // LAYOUT only for cost savings
        });

        const startResponse = await textractClient.send(startCommand);
        const jobId = startResponse.JobId;
        console.log('[readBySignItLayoutOnly] Analysis job started, JobId:', jobId);

        // Poll for completion
        const maxWaitTime = 5 * 60 * 1000;
        const pollInterval = 2000;
        let jobStatus = 'IN_PROGRESS';
        const startTime = Date.now();

        while (jobStatus === 'IN_PROGRESS' && Date.now() - startTime < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));

          const getCommand = new GetDocumentAnalysisCommand({ JobId: jobId });
          const getResponse = await textractClient.send(getCommand);
          jobStatus = getResponse.JobStatus;

          if (jobStatus === 'SUCCEEDED') {
            console.log('[readBySignItLayoutOnly] Analysis completed');
            break;
          } else if (jobStatus === 'FAILED') {
            throw new Error(getResponse.StatusMessage || 'Analysis job failed');
          }
        }

        if (jobStatus !== 'SUCCEEDED') {
          throw new Error('Analysis job timed out or failed');
        }

        // Fetch all pages using NextToken
        const allBlocks = [];
        let nextToken = null;
        let responsePageNum = 1;

        while (true) {
          const getCommand = new GetDocumentAnalysisCommand({
            JobId: jobId,
            NextToken: nextToken || undefined,
          });
          const getResponse = await textractClient.send(getCommand);

          if (getResponse.Blocks && getResponse.Blocks.length > 0) {
            allBlocks.push(...getResponse.Blocks);
            console.log(
              `[readBySignItLayoutOnly] Retrieved ${getResponse.Blocks.length} blocks from response page ${responsePageNum}`
            );
          }

          nextToken = getResponse.NextToken;
          if (nextToken) {
            responsePageNum++;
          } else {
            console.log(
              `[readBySignItLayoutOnly] All pages retrieved, total blocks: ${allBlocks.length}`
            );
            break;
          }
        }

        textractResponse = {
          Blocks: allBlocks,
          DocumentMetadata: { Pages: pageCount },
          JobStatus: 'SUCCEEDED',
        };

        // Cleanup S3 file
        try {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.AWS_S3_BUCKET,
              Key: s3Key,
            })
          );
          console.log('[readBySignItLayoutOnly] S3 file cleaned up');
        } catch (cleanupError) {
          console.warn('[readBySignItLayoutOnly] Failed to cleanup S3 file:', cleanupError.message);
        }
      } catch (asyncError) {
        console.error('[readBySignItLayoutOnly] Async analysis error:', asyncError);
        throw new Parse.Error(
          Parse.Error.INTERNAL_SERVER_ERROR,
          `Textract detection failed: ${asyncError.message || 'Analysis job failed'}`
        );
      }
    } else {
      // Single-page PDF: Use sync AnalyzeDocument with LAYOUT only
      console.log(
        '[readBySignItLayoutOnly] Single-page PDF, using sync AnalyzeDocument (LAYOUT only)...'
      );

      try {
        const command = new AnalyzeDocumentCommand({
          Document: {
            Bytes: pdfBytes,
          },
          FeatureTypes: ['LAYOUT'], // LAYOUT only for cost savings
        });

        textractResponse = await textractClient.send(command);
        console.log(
          '[readBySignItLayoutOnly] Textract response received, blocks:',
          textractResponse.Blocks?.length || 0
        );
      } catch (textractError) {
        console.error('[readBySignItLayoutOnly] Textract API error:', textractError);
        throw new Parse.Error(
          Parse.Error.INVALID_QUERY,
          `Textract detection failed: ${textractError.message || 'Unknown error'}`
        );
      }
    }

    // Parse response (LAYOUT and TEXT only)
    const extracted = parseTextractResponseLayoutOnly(textractResponse);

    console.log('[readBySignItLayoutOnly] Extraction summary:');
    console.log('[readBySignItLayoutOnly]   - Text blocks:', extracted.text.length);
    console.log('[readBySignItLayoutOnly]   - Layout blocks:', extracted.layout.length);

    // Return data (forms and tables will be empty arrays)
    const result = {
      success: true,
      text: extracted.text,
      layout: extracted.layout,
      forms: extracted.forms, // Empty - not available in LAYOUT-only mode
      tables: extracted.tables, // Empty - not available in LAYOUT-only mode
      hasFullData: false, // Flag to indicate this is LAYOUT-only
    };

    // Store LAYOUT-only results in in-memory cache (1-hour TTL)
    // This allows future PaperPal™ queries to use cached data instead of re-running Textract
    // Don't await - make it non-blocking so it doesn't delay the response
    try {
      const { storeLayoutOnlyTextractResults } = await import(
        '../services/documentContextService.js'
      );
      storeLayoutOnlyTextractResults(documentId, result).catch(cacheError => {
        // Non-critical - if caching fails, log and continue
        console.warn(
          '[readBySignItLayoutOnly] Could not cache Textract results:',
          cacheError.message
        );
      });
    } catch (importError) {
      // Non-critical - if import fails, continue anyway
      console.warn('[readBySignItLayoutOnly] Could not import cache service:', importError.message);
    }

    return result;
  } catch (error) {
    console.error('[readBySignItLayoutOnly] Error:', error);

    if (error instanceof Parse.Error) {
      throw error;
    }

    throw new Parse.Error(
      Parse.Error.INTERNAL_SERVER_ERROR,
      `Failed to analyze document: ${error.message || 'Unknown error'}`
    );
  }
}
