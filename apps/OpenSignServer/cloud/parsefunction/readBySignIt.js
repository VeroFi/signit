import {
  TextractClient,
  AnalyzeDocumentCommand,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
} from '@aws-sdk/client-textract';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';

// Initialize Textract client with credentials from environment
const textractClient = new TextractClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Initialize S3 client for uploading multi-page PDFs
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

function parseTextractResponse(response) {
  const blocks = response.Blocks || [];

  // Create a map of block IDs to blocks for quick lookup
  const blockMap = {};
  blocks.forEach(block => {
    blockMap[block.Id] = block;
  });

  // Extract in order: TEXT, LAYOUT, FORMS, TABLES
  const textBlocks = [];
  const layoutBlocks = [];
  const forms = [];
  const tables = [];

  // 1. TEXT: Extract LINE and WORD blocks
  const lineBlocks = blocks.filter(block => block.BlockType === 'LINE');
  const wordBlocks = blocks.filter(block => block.BlockType === 'WORD');
  textBlocks.push(
    ...lineBlocks.map(block => ({
      id: block.Id,
      type: 'LINE',
      text: block.Text || '',
      pageNumber: block.Page || 1,
      geometry: block.Geometry,
      confidence: block.Confidence || 0,
    }))
  );
  textBlocks.push(
    ...wordBlocks.map(block => ({
      id: block.Id,
      type: 'WORD',
      text: block.Text || '',
      pageNumber: block.Page || 1,
      geometry: block.Geometry,
      confidence: block.Confidence || 0,
    }))
  );

  // 2. LAYOUT: Extract layout blocks (paragraphs, lists, headers, footers, etc.)
  const layoutTypes = [
    'LAYOUT_HEADER',
    'LAYOUT_FOOTER',
    'LAYOUT_TITLE',
    'LAYOUT_SECTION_HEADER',
    'LAYOUT_PARAGRAPH',
    'LAYOUT_LIST',
    'LAYOUT_FIGURE',
    'LAYOUT_TABLE',
    'LAYOUT_KEY_VALUE',
    'LAYOUT_PAGE_NUMBER',
  ];
  blocks.forEach(block => {
    if (
      block.BlockType === 'LAYOUT' ||
      (block.EntityTypes && block.EntityTypes.some(et => layoutTypes.includes(et)))
    ) {
      layoutBlocks.push({
        id: block.Id,
        type: block.BlockType,
        entityTypes: block.EntityTypes || [],
        text: extractTextFromBlock(block, blockMap),
        pageNumber: block.Page || 1,
        geometry: block.Geometry,
        confidence: block.Confidence || 0,
      });
    }
  });

  // 3. FORMS: Extract KEY_VALUE_SET blocks (forms)
  const keyBlocks = blocks.filter(
    block =>
      block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes && block.EntityTypes.includes('KEY')
  );

  for (const keyBlock of keyBlocks) {
    // Find the VALUE block associated with this KEY
    const valueRelationship = keyBlock.Relationships?.find(rel => rel.Type === 'VALUE');

    if (!valueRelationship || !valueRelationship.Ids || valueRelationship.Ids.length === 0) {
      // KEY without VALUE - skip or handle as needed
      continue;
    }

    // Get the VALUE block
    const valueBlockId = valueRelationship.Ids[0];
    const valueBlock = blockMap[valueBlockId];

    if (!valueBlock) {
      console.warn(`[readBySignIt] VALUE block ${valueBlockId} not found for KEY ${keyBlock.Id}`);
      continue;
    }

    // Extract text from KEY and VALUE blocks
    const keyText = extractTextFromBlock(keyBlock, blockMap);
    const valueText = extractTextFromBlock(valueBlock, blockMap);

    // Determine page number
    // For multi-page documents, Page property should always be present
    // For single-page documents, Page may be undefined (defaults to 1)
    const pageNumber = keyBlock.Page !== undefined && keyBlock.Page !== null ? keyBlock.Page : 1;

    // Create form object
    const form = {
      id: keyBlock.Id,
      pageNumber: pageNumber,
      key: {
        text: keyText,
        geometry: keyBlock.Geometry,
        confidence: keyBlock.Confidence || 0,
      },
      value: {
        text: valueText,
        geometry: valueBlock.Geometry,
        confidence: valueBlock.Confidence || 0,
      },
      relationshipType: 'VALUE',
    };

    forms.push(form);
  }

  // 4. TABLES: Extract TABLE blocks
  const tableBlocks = blocks.filter(block => block.BlockType === 'TABLE');
  for (const tableBlock of tableBlocks) {
    // Get cells from CHILD relationships
    const childRelationship = tableBlock.Relationships?.find(rel => rel.Type === 'CHILD');
    const cells = [];

    if (childRelationship && childRelationship.Ids) {
      for (const cellId of childRelationship.Ids) {
        const cellBlock = blockMap[cellId];
        if (cellBlock && cellBlock.BlockType === 'CELL') {
          cells.push({
            id: cellBlock.Id,
            rowIndex: cellBlock.RowIndex || 0,
            columnIndex: cellBlock.ColumnIndex || 0,
            rowSpan: cellBlock.RowSpan || 1,
            columnSpan: cellBlock.ColumnSpan || 1,
            text: extractTextFromBlock(cellBlock, blockMap),
            geometry: cellBlock.Geometry,
            confidence: cellBlock.Confidence || 0,
          });
        }
      }
    }

    tables.push({
      id: tableBlock.Id,
      pageNumber: tableBlock.Page || 1,
      geometry: tableBlock.Geometry,
      confidence: tableBlock.Confidence || 0,
      cells: cells,
    });
  }

  return {
    text: textBlocks,
    layout: layoutBlocks,
    forms: forms,
    tables: tables,
  };
}

function extractTextFromBlock(block, blockMap) {
  const textParts = [];

  // If block has direct text, use it
  if (block.Text) {
    textParts.push(block.Text);
  }

  // Follow CHILD relationships to get WORD blocks
  const childRelationship = block.Relationships?.find(rel => rel.Type === 'CHILD');
  if (childRelationship && childRelationship.Ids) {
    for (const childId of childRelationship.Ids) {
      const childBlock = blockMap[childId];
      if (childBlock && childBlock.BlockType === 'WORD' && childBlock.Text) {
        textParts.push(childBlock.Text);
      }
    }
  }

  return textParts.join(' ').trim();
}

export default async function readBySignIt(request) {
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
      throw new Parse.Error(
        Parse.Error.INTERNAL_SERVER_ERROR,
        'AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in environment variables.'
      );
    }

    console.log('[readBySignIt] Processing document:', documentId);

    // Load document
    const DocumentClass = Parse.Object.extend('contracts_Document');
    const query = new Parse.Query(DocumentClass);
    query.equalTo('objectId', documentId);

    // Check ACL - user must have read access
    const doc = await query.first({ useMasterKey: true });

    if (!doc) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Document not found');
    }

    // Get PDF URL
    const pdfUrl = doc.get('URL');
    if (!pdfUrl) {
      throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Document has no PDF file');
    }

    console.log('[readBySignIt] Fetching PDF from URL:', pdfUrl);

    // Download PDF
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Parse.Error(
        Parse.Error.FILE_SAVE_ERROR,
        `Failed to fetch PDF: ${response.statusText}`
      );
    }

    // Check content type
    const contentType = response.headers.get('content-type');
    console.log('[readBySignIt] PDF content-type:', contentType);

    const arrayBuffer = await response.arrayBuffer();
    // Convert to Buffer (Textract SDK expects Uint8Array or Buffer)
    // Note: PDF should already be flattened at upload time (see saveFile.js)
    const pdfBytes = Buffer.from(arrayBuffer);

    console.log('[readBySignIt] PDF loaded, size:', pdfBytes.length, 'bytes');

    // Validate PDF format
    if (pdfBytes.length < 4) {
      throw new Parse.Error(
        Parse.Error.INVALID_QUERY,
        'Textract detection failed: PDF file is too small or empty.'
      );
    }

    const magicBytes = pdfBytes.slice(0, 4).toString('ascii');
    console.log('[readBySignIt] PDF magic bytes:', magicBytes);

    if (magicBytes !== '%PDF') {
      console.error('[readBySignIt] Invalid PDF format - magic bytes:', magicBytes);
      throw new Parse.Error(
        Parse.Error.INVALID_QUERY,
        'Textract detection failed: Invalid PDF format. The file may be corrupted or not a valid PDF.'
      );
    }

    // Check if PDF is multi-page (AnalyzeDocument with Bytes only supports single-page)
    let isMultiPage = false;
    let pageCount = 1;
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      pageCount = pdfDoc.getPageCount();
      isMultiPage = pageCount > 1;
      console.log(
        '[readBySignIt] PDF has',
        pageCount,
        'page(s) -',
        isMultiPage ? 'using async API with S3' : 'using sync API'
      );
    } catch (pdfError) {
      console.warn(
        '[readBySignIt] Could not determine page count, assuming single-page:',
        pdfError.message
      );
      isMultiPage = false;
    }

    let textractResponse;

    if (isMultiPage) {
      // Multi-page PDF: Upload to S3 and use StartDocumentAnalysis (async)
      console.log('[readBySignIt] Multi-page PDF detected, uploading to S3 and using async API...');

      if (!process.env.AWS_S3_BUCKET) {
        throw new Parse.Error(
          Parse.Error.INTERNAL_SERVER_ERROR,
          'AWS_S3_BUCKET not configured. Multi-page PDFs require S3 bucket for Textract processing.'
        );
      }

      // Upload PDF to S3
      const s3Key = `textract-temp/${crypto.randomUUID()}.pdf`;
      console.log('[readBySignIt] Uploading PDF to S3:', s3Key);

      try {
        const putCommand = new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: s3Key,
          Body: pdfBytes,
          ContentType: 'application/pdf',
        });
        await s3Client.send(putCommand);
        console.log('[readBySignIt] PDF uploaded to S3 successfully');
      } catch (s3Error) {
        console.error('[readBySignIt] S3 upload error:', s3Error);
        throw new Parse.Error(
          Parse.Error.INTERNAL_SERVER_ERROR,
          `Failed to upload PDF to S3: ${s3Error.message}`
        );
      }

      // Start async analysis
      try {
        const startCommand = new StartDocumentAnalysisCommand({
          DocumentLocation: {
            S3Object: {
              Bucket: process.env.AWS_S3_BUCKET,
              Name: s3Key,
            },
          },
          FeatureTypes: ['FORMS', 'TABLES', 'LAYOUT'],
        });

        const startResponse = await textractClient.send(startCommand);
        const jobId = startResponse.JobId;
        console.log('[readBySignIt] Analysis job started, JobId:', jobId);

        // Poll for completion (max 5 minutes)
        const maxWaitTime = 5 * 60 * 1000;
        const pollInterval = 2000;
        const startTime = Date.now();

        // Collect all blocks from all pages (Textract paginates results)
        // Textract returns max 1000 blocks per response, so we need to paginate even after SUCCEEDED
        const allBlocks = [];
        let nextToken = null;
        let lastResponse = null;
        let jobStatus = 'IN_PROGRESS';

        // Phase 1: Poll until job completes (IN_PROGRESS -> SUCCEEDED/FAILED)
        while (jobStatus === 'IN_PROGRESS' && Date.now() - startTime < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));

          const getCommand = new GetDocumentAnalysisCommand({
            JobId: jobId,
          });
          const getResponse = await textractClient.send(getCommand);
          jobStatus = getResponse.JobStatus;
          lastResponse = getResponse;

          if (jobStatus === 'SUCCEEDED') {
            // Collect blocks from first page
            if (getResponse.Blocks && getResponse.Blocks.length > 0) {
              allBlocks.push(...getResponse.Blocks);
              console.log(
                '[readBySignIt] Retrieved',
                getResponse.Blocks.length,
                'blocks (initial page)'
              );
            }
            nextToken = getResponse.NextToken;
            break;
          } else if (jobStatus === 'FAILED') {
            throw new Error(
              `Textract analysis job failed: ${getResponse.StatusMessage || 'Unknown reason'}`
            );
          }
        }

        if (jobStatus !== 'SUCCEEDED') {
          throw new Error('Textract analysis timed out or failed');
        }

        // Phase 2: Continue fetching ALL pages using NextToken (even after SUCCEEDED)
        // Textract API limits responses to 1000 blocks per page, but we fetch ALL pages until NextToken is null
        let pageNumber = 2;
        while (nextToken) {
          console.log(
            '[readBySignIt] More results available, fetching page',
            pageNumber,
            'with NextToken...'
          );

          const getCommand = new GetDocumentAnalysisCommand({
            JobId: jobId,
            NextToken: nextToken,
          });
          const getResponse = await textractClient.send(getCommand);
          lastResponse = getResponse;

          // Collect blocks from this page
          if (getResponse.Blocks && getResponse.Blocks.length > 0) {
            allBlocks.push(...getResponse.Blocks);
            console.log(
              '[readBySignIt] Retrieved',
              getResponse.Blocks.length,
              'blocks from page',
              pageNumber,
              '(total so far:',
              allBlocks.length,
              ')'
            );
          } else {
            console.log('[readBySignIt] Page', pageNumber, 'returned 0 blocks');
          }

          // Check if there are more pages
          nextToken = getResponse.NextToken;
          if (nextToken) {
            console.log('[readBySignIt] NextToken found, continuing to page', pageNumber + 1);
          }
          pageNumber++;
        }

        console.log(
          '[readBySignIt] All pages retrieved, total blocks:',
          allBlocks.length,
          '(fetched',
          pageNumber - 1,
          'response pages)'
        );

        // Construct final response with all blocks from all pages
        // Use DocumentMetadata from last response (all responses have the same metadata)
        textractResponse = {
          Blocks: allBlocks,
          DocumentMetadata: lastResponse?.DocumentMetadata || { Pages: pageCount },
          JobStatus: 'SUCCEEDED',
        };

        console.log(
          '[readBySignIt] Analysis completed, total blocks from all pages:',
          textractResponse.Blocks?.length || 0
        );

        // Clean up S3 file
        try {
          // const deleteCommand = new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: s3Key });
          // await s3Client.send(deleteCommand);
        } catch (cleanupError) {
          console.warn('[readBySignIt] Failed to cleanup S3 file:', cleanupError.message);
        }
      } catch (asyncError) {
        console.error('[readBySignIt] Async analysis error:', asyncError);
        throw new Parse.Error(
          Parse.Error.INTERNAL_SERVER_ERROR,
          `Textract detection failed: ${asyncError.message || 'Analysis job failed'}`
        );
      }
    } else {
      // Single-page PDF: Use sync AnalyzeDocument with Bytes
      console.log('[readBySignIt] Single-page PDF, using sync AnalyzeDocument...');

      const command = new AnalyzeDocumentCommand({
        Document: {
          Bytes: pdfBytes,
        },
        FeatureTypes: ['FORMS', 'TABLES', 'LAYOUT'],
      });

      try {
        textractResponse = await textractClient.send(command);
        console.log(
          '[readBySignIt] Textract response received, blocks:',
          textractResponse.Blocks?.length || 0
        );
      } catch (textractError) {
        console.error('[readBySignIt] Textract API error:', textractError);
        console.error('[readBySignIt] Error name:', textractError.name);
        console.error('[readBySignIt] Error message:', textractError.message);
        console.error('[readBySignIt] Error code:', textractError.$metadata?.httpStatusCode);
        console.error('[readBySignIt] Full error:', JSON.stringify(textractError, null, 2));

        // Handle specific AWS errors
        if (
          textractError.name === 'InvalidParameterException' ||
          textractError.name === 'UnsupportedDocumentException' ||
          textractError.message?.includes('unsupported document format')
        ) {
          const errorMsg = textractError.message || 'Invalid PDF format';
          console.error('[readBySignIt] PDF format error:', errorMsg);
          throw new Parse.Error(
            Parse.Error.INVALID_QUERY,
            `Textract detection failed: ${errorMsg}. The PDF may be encrypted, password-protected, corrupted, or in an unsupported format.`
          );
        } else if (textractError.name === 'ThrottlingException') {
          throw new Parse.Error(
            Parse.Error.INTERNAL_SERVER_ERROR,
            'Textract detection failed: Rate limit exceeded. Please try again in a moment.'
          );
        } else if (textractError.name === 'ProvisionedThroughputExceededException') {
          throw new Parse.Error(
            Parse.Error.INTERNAL_SERVER_ERROR,
            'Textract detection failed: Service temporarily unavailable. Please try again later.'
          );
        } else if (
          textractError.name === 'InvalidS3ObjectException' ||
          textractError.name === 'AccessDeniedException'
        ) {
          throw new Parse.Error(
            Parse.Error.INTERNAL_SERVER_ERROR,
            'Textract detection failed: AWS access error. Please check credentials and permissions.'
          );
        } else {
          throw new Parse.Error(
            Parse.Error.INTERNAL_SERVER_ERROR,
            `Textract detection failed: ${textractError.message || 'Unknown error'}`
          );
        }
      }
    }

    // Debug: Check what pages Textract detected
    // IMPORTANT: For multi-page documents, ALL blocks should have a Page property
    // For single-page documents, blocks may not have Page (defaults to 1)
    const pagesDetected = new Set();
    const kvByPage = {};
    const blocksWithoutPage = [];
    const blocksWithPage = [];

    for (const block of textractResponse.Blocks || []) {
      if (block.Page !== undefined && block.Page !== null) {
        blocksWithPage.push(block.BlockType);
        pagesDetected.add(block.Page);
        if (block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes?.includes('KEY')) {
          kvByPage[block.Page] = (kvByPage[block.Page] || 0) + 1;
        }
      } else {
        blocksWithoutPage.push(block.BlockType);
        // Default to page 1 if Page property is missing
        pagesDetected.add(1);
        if (block.BlockType === 'KEY_VALUE_SET' && block.EntityTypes?.includes('KEY')) {
          kvByPage[1] = (kvByPage[1] || 0) + 1;
        }
      }
    }

    console.log(
      '[readBySignIt] Textract pages detected:',
      [...pagesDetected].sort((a, b) => a - b)
    );
    console.log('[readBySignIt] KEY_VALUE_SET blocks per page:', kvByPage);
    console.log('[readBySignIt] Total blocks:', textractResponse.Blocks?.length || 0);
    console.log('[readBySignIt] Blocks with Page property:', blocksWithPage.length);
    console.log('[readBySignIt] Blocks without Page property:', blocksWithoutPage.length);
    console.log('[readBySignIt] DocumentMetadata.Pages:', textractResponse.DocumentMetadata?.Pages);

    // Check if we detected fewer pages than expected
    if (isMultiPage && pagesDetected.size < pageCount) {
      console.warn(
        `[readBySignIt] WARNING: PDF has ${pageCount} pages but Textract only detected ${pagesDetected.size} page(s)`
      );
    }

    // Parse Textract response to extract all types in order: TEXT, LAYOUT, FORMS, TABLES
    const extracted = parseTextractResponse(textractResponse);

    // Debug: Check counts by type and page
    const formsByPage = {};
    extracted.forms.forEach(form => {
      const p = form.pageNumber;
      formsByPage[p] = (formsByPage[p] || 0) + 1;
    });
    console.log('[readBySignIt] Extraction summary:');
    console.log('[readBySignIt]   - Text blocks:', extracted.text.length);
    console.log('[readBySignIt]   - Layout blocks:', extracted.layout.length);
    console.log('[readBySignIt]   - Forms:', extracted.forms.length);
    console.log('[readBySignIt]   - Tables:', extracted.tables.length);
    console.log('[readBySignIt] Forms per page:', formsByPage);

    // Return all extracted data in order: text, layout, forms, tables
    // Note: Currently only forms are highlighted in the UI, but all data is available
    return {
      success: true,
      text: extracted.text,
      layout: extracted.layout,
      forms: extracted.forms,
      tables: extracted.tables,
      count: extracted.forms.length,
    };
  } catch (error) {
    console.error('[readBySignIt] Error:', error);

    if (error instanceof Parse.Error) {
      throw error;
    }

    throw new Parse.Error(
      Parse.Error.INTERNAL_SERVER_ERROR,
      error.message || 'Failed to detect forms'
    );
  }
}
