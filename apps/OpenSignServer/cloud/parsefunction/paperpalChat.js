/**
 * PaperPal™ Chat Cloud Function
 * Main Parse Cloud Function for PaperPal™ AI assistant
 */

import { getAIResponse } from '../services/gpt5Service.js';
import { redactDocumentContext } from '../services/piiRedactionService.js';
import { getDocumentContext, formatContextForPrompt } from '../services/documentContextService.js';

/**
 * Get page-specific context description
 */
function getPageContextDescription(pageContext) {
  if (!pageContext) return '';

  const contextMap = {
    contactbook: `You're on the Contactbook page. Users can:
- View all their contacts/signers
- Add new contacts
- Edit existing contacts
- Delete contacts
- Import contacts from CSV
- Search for contacts

Help users manage their contact list and understand how contacts are used when adding signers to documents.`,

    drive: `You're on the Signit™ Drive page. Users can:
- View all documents in a folder structure
- Create folders
- Organize documents into folders
- Search for documents
- Manage document files

Help users navigate and organize their documents.`,

    users: `You're on the Users page. Users can:
- View all users in their organization
- Add new users
- Edit user details (name, email, phone, role, team)
- Activate/deactivate users
- Manage user permissions

Help users understand user management and roles.`,

    preferences: `You're on the Preferences page. Users can:
- Configure general settings (timezone, date format, time format)
- Set up email templates (request emails, completion emails)
- Configure signature types
- Enable/disable features (notifications, tours, etc.)

Help users configure their account settings.`,

    managesign: `You're on the My Signature page. Users can:
- Create or edit their signature
- Draw a signature
- Upload a signature image
- Create or edit initials
- Choose signature color

Help users set up their signature for use in documents.`,

    'request-signatures': `You're on the Request Signatures form. Users can:
- Upload a document
- Add signers
- Set document title, description, and notes
- Configure advanced options (password, OTP, reminders, etc.)
- Send the document for signatures

Help users create and send signature requests.`,

    'sign-yourself': `You're on the Sign Yourself form. Users can:
- Upload a document
- Sign it themselves
- Add fields if needed
- Complete the signing process

Help users sign their own documents.`,

    templates: `You're on the Templates page. Users can:
- View all available templates
- Use a template to create a new document
- Edit templates
- Delete templates
- Share templates with team
- Quick send templates

Help users work with document templates.`,

    'create-template': `You're on the Create Template form. Users can:
- Upload a document to create a template
- Set template title, description, and notes
- Configure template settings
- Save the document as a reusable template

Help users create templates that can be reused for future documents.`,

    'need-your-sign': `You're on the "Need your sign" page. This shows documents waiting for your signature. Users can:
- View documents that need their signature
- Sign documents directly
- See document details

Help users understand and sign documents that require their signature.`,

    'in-progress': `You're on the "In Progress" page. This shows documents you've sent that are being signed. Users can:
- View documents in progress
- Share documents
- Resend reminders
- Revoke documents
- Rename documents
- Save as template

Help users manage documents that are currently being signed.`,

    completed: `You're on the "Completed" page. This shows fully signed documents. Users can:
- View completed documents
- Download signed documents
- Save as template
- Fix and resend if needed
- Delete documents

Help users manage completed documents.`,

    drafts: `You're on the "Drafts" page. This shows documents you've started but haven't sent. Users can:
- Edit draft documents
- Delete drafts
- Save drafts as templates
- Continue working on drafts

Help users manage their draft documents.`,

    declined: `You're on the "Declined" page. This shows documents that were declined by signers. Users can:
- View declined documents
- See decline reasons
- Fix and resend documents
- Save as template
- Delete documents

Help users handle declined documents.`,

    expired: `You're on the "Expired" page. This shows documents that have passed their expiration date. Users can:
- View expired documents
- Extend expiration dates
- Delete expired documents
- Save as template

Help users manage expired documents.`,
  };

  return contextMap[pageContext] || '';
}

/**
 * Get system prompt based on workflow state and page context
 */
function getSystemPrompt(workflowState, documentContext, pageContext) {
  const basePrompt = `You are PaperPal™, a helpful AI assistant for e-signature workflows. You help users understand documents, place fields, and complete signing processes. Be friendly, concise, and action-oriented.`;

  // Get page-specific context
  const pageContextDesc = getPageContextDescription(pageContext);

  if (workflowState === 'dashboard') {
    // Always prioritize pageContext if available
    if (pageContextDesc) {
      return `${basePrompt}

${pageContextDesc}

Provide clear, helpful guidance relevant to the current page.`;
    }

    // Fallback to generic dashboard if no pageContext
    return `${basePrompt}

You're helping a user on the dashboard. They may ask about:
- Document management
- Creating new documents
- Understanding dashboard features
- General questions about the platform

Provide clear, helpful guidance without needing document context.`;
  }

  if (workflowState === 'editing') {
    return `${basePrompt}

You're helping a user prepare a document for e-signature. They're on the preview/editing screen where they can:
- Place fields (signatures, text fields, checkboxes, etc.)
- Add signers
- Use auto-detect fields
- Review document content

Your role:
- Help users understand document content
- Guide field placement
- Assist with workflow steps
- Provide troubleshooting help

Be concise, friendly, and action-oriented.`;
  }

  if (workflowState === 'signing') {
    return `${basePrompt}

You're helping a recipient sign a document. They're on the signing screen where they need to:
- Understand what they're signing
- Fill in required fields
- Place their signature
- Complete the signing process

Your role:
- Explain what they're signing (in plain language)
- Guide them through the signing process
- Help them understand document content
- Provide reassurance and clarity

⚠️ IMPORTANT: You can explain the document, but you are NOT providing legal advice. For complex legal matters, recommend consulting a lawyer.

Be clear, supportive, and non-legal-advice-focused.`;
  }

  return basePrompt;
}

/**
 * Main PaperPal™ Chat Cloud Function
 */
export default async function paperpalChat(request) {
  try {
    // Check if PaperPal™ is enabled
    if (process.env.PAPERPAL_ENABLED !== 'true') {
      throw new Parse.Error(
        Parse.Error.FUNCTION_NOT_FOUND,
        'PaperPal™ is not enabled. Please contact support.'
      );
    }

    // Validate authentication
    if (!request.user) {
      throw new Parse.Error(
        Parse.Error.INVALID_SESSION_TOKEN,
        'User not authenticated. Please log in.'
      );
    }

    const userId = request.user.id;
    const { message, documentId, workflowState, workflowData, pageContext } = request.params;

    // Validate required parameters
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw new Parse.Error(
        Parse.Error.INVALID_QUERY,
        'Message is required and must be a non-empty string.'
      );
    }

    if (!workflowState || !['dashboard', 'editing', 'signing'].includes(workflowState)) {
      throw new Parse.Error(
        Parse.Error.INVALID_QUERY,
        'Valid workflowState is required: "dashboard", "editing", or "signing".'
      );
    }

    // Get document context if documentId is provided
    let documentContext = null;
    let signerNames = [];
    let hasFullTextractData = false;

    if (documentId && workflowState !== 'dashboard') {
      try {
        // Get document to verify access and get signer names
        const DocumentClass = Parse.Object.extend('contracts_Document');
        const query = new Parse.Query(DocumentClass);
        query.equalTo('objectId', documentId);

        // Check ACL - user must have read access
        const doc = await query.first({ useMasterKey: true });

        if (!doc) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Document not found.');
        }

        // Get signer names for PII redaction
        const signers = doc.get('Signers') || [];
        signerNames = signers.map(signer => signer.Name).filter(Boolean);

        // Get document context (uses LAYOUT-only for cost savings)
        // Pass the doc object to avoid re-querying (and master key issues)
        documentContext = await getDocumentContext(documentId, request, doc);
        hasFullTextractData = documentContext?.hasFullData || false;
      } catch (error) {
        console.error('[paperpalChat] Error getting document context:', error);
        // Continue without document context if there's an error
        // (user might be asking general questions)
      }
    }

    // Detect if user is asking about form fields
    const formFieldKeywords = [
      'form field',
      'form fields',
      'field',
      'fields',
      'signature line',
      'signature lines',
      'signature box',
      'signature boxes',
      'initial box',
      'initial boxes',
      'initials',
      'date field',
      'date fields',
      'date box',
      'key-value',
      'key value',
      'form data',
      'auto-detect',
      'auto detect',
      'detect fields',
      'where to sign',
      'where do i sign',
      'sign here',
    ];

    const messageLower = message.toLowerCase();
    const isAskingAboutFormFields = formFieldKeywords.some(keyword =>
      messageLower.includes(keyword)
    );

    // If user asks about form fields but we only have LAYOUT data, prompt them
    if (isAskingAboutFormFields && !hasFullTextractData && documentContext) {
      return {
        success: true,
        response: `I can help you with form fields! However, to get detailed information about specific form fields, signatures, and initial boxes, please first click the "Auto-detect fields" button in the document editor. This will analyze your document and detect all form fields, which will allow me to provide more specific guidance.\n\nFor now, I can help you with general document questions based on the document text and layout. What would you like to know?`,
        usage: null,
        model: 'paperpal-prompt',
        timestamp: new Date().toISOString(),
        requiresAutoDetect: true,
      };
    }

    // Redact PII from document context
    if (documentContext) {
      documentContext = redactDocumentContext(documentContext, signerNames);
      // Preserve the hasFullData flag after redaction
      hasFullTextractData = documentContext?.hasFullData || false;
    }

    // Get system prompt with page context
    const systemPrompt = getSystemPrompt(workflowState, documentContext, pageContext);

    // Format context for prompt
    let contextText = '';
    if (documentContext) {
      contextText = formatContextForPrompt(documentContext, workflowState, workflowData);
    }

    // Call GPT-5.1 API
    try {
      const aiResponse = await getAIResponse(message, systemPrompt, contextText, {
        userId,
        documentId,
        workflowState,
        pageContext,
        useCache: true,
      });

      // Log interaction (for audit - redacted)
      console.log(
        `[paperpalChat] User ${userId} asked: "${message.substring(
          0,
          50
        )}..." (workflow: ${workflowState}, doc: ${documentId || 'none'}, pageContext: ${
          pageContext || 'none'
        })`
      );

      return {
        success: true,
        response: aiResponse.content,
        usage: aiResponse.usage,
        model: aiResponse.model,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[paperpalChat] Error calling GPT-5.1:', error);

      // Return user-friendly error
      if (error.message?.includes('Rate limit')) {
        throw new Parse.Error(Parse.Error.REQUEST_LIMIT_EXCEEDED, error.message);
      }

      throw new Parse.Error(
        Parse.Error.INTERNAL_SERVER_ERROR,
        'AI service is temporarily unavailable. Please try again in a moment.'
      );
    }
  } catch (error) {
    console.error('[paperpalChat] Error:', error);

    // If it's already a Parse.Error, re-throw it
    if (error instanceof Parse.Error) {
      throw error;
    }

    // Otherwise, wrap it
    throw new Parse.Error(
      Parse.Error.INTERNAL_SERVER_ERROR,
      error.message || 'An unexpected error occurred. Please try again.'
    );
  }
}
