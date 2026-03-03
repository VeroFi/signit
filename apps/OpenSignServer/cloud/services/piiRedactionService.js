/**
 * PII Redaction Service
 * Redacts personally identifiable information from document text before sending to GPT-5.1
 */

/**
 * Redact email addresses
 */
function redactEmails(text) {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  return text.replace(emailRegex, '[EMAIL_REDACTED]');
}

/**
 * Redact phone numbers
 */
function redactPhoneNumbers(text) {
  // Matches various phone number formats
  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  return text.replace(phoneRegex, '[PHONE_REDACTED]');
}

/**
 * Redact SSN (Social Security Numbers)
 */
function redactSSN(text) {
  // Matches SSN format: XXX-XX-XXXX
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
  return text.replace(ssnRegex, '[SSN_REDACTED]');
}

/**
 * Redact credit card numbers
 */
function redactCreditCards(text) {
  // Matches credit card format: XXXX-XXXX-XXXX-XXXX or XXXX XXXX XXXX XXXX
  const cardRegex = /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/g;
  return text.replace(cardRegex, '[CARD_REDACTED]');
}

/**
 * Redact names from a list of known signers
 */
function redactNames(text, signerNames = []) {
  let redactedText = text;

  // Create case-insensitive regex for each name
  signerNames.forEach(name => {
    if (name && name.trim()) {
      // Escape special regex characters
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nameRegex = new RegExp(`\\b${escapedName}\\b`, 'gi');
      redactedText = redactedText.replace(nameRegex, '[NAME_REDACTED]');
    }
  });

  return redactedText;
}

/**
 * Redact addresses (basic pattern matching)
 */
function redactAddresses(text) {
  // Matches common address patterns
  // Street addresses: "123 Main St", "456 Oak Avenue", etc.
  const streetAddressRegex =
    /\b\d+\s+[A-Za-z0-9\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Place|Pl)\b/gi;
  let redactedText = text.replace(streetAddressRegex, '[ADDRESS_REDACTED]');

  // ZIP codes
  const zipRegex = /\b\d{5}(?:-\d{4})?\b/g;
  redactedText = redactedText.replace(zipRegex, '[ZIP_REDACTED]');

  return redactedText;
}

/**
 * Redact dates that might be sensitive (birth dates, etc.)
 */
function redactSensitiveDates(text) {
  // Matches dates in various formats
  // This is conservative - only redacts dates that look like birth dates or SSN dates
  const dateRegex = /\b(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])[-/](?:19|20)\d{2}\b/g;
  return text.replace(dateRegex, '[DATE_REDACTED]');
}

/**
 * Main function to redact PII from text
 */
export function redactPII(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  const {
    signerNames = [],
    redactEmails: shouldRedactEmails = true,
    redactPhones: shouldRedactPhones = true,
    redactSSN: shouldRedactSSN = true,
    redactCreditCards: shouldRedactCreditCards = true,
    redactNames: shouldRedactNames = true,
    redactAddresses: shouldRedactAddresses = true,
    redactDates: shouldRedactDates = false, // Usually dates in contracts are OK
  } = options;

  let redactedText = text;

  // Apply redactions in order
  if (shouldRedactEmails) {
    redactedText = redactEmails(redactedText);
  }

  if (shouldRedactPhones) {
    redactedText = redactPhoneNumbers(redactedText);
  }

  if (shouldRedactSSN) {
    redactedText = redactSSN(redactedText);
  }

  if (shouldRedactCreditCards) {
    redactedText = redactCreditCards(redactedText);
  }

  if (shouldRedactNames && signerNames.length > 0) {
    redactedText = redactNames(redactedText, signerNames);
  }

  if (shouldRedactAddresses) {
    redactedText = redactAddresses(redactedText);
  }

  if (shouldRedactDates) {
    redactedText = redactSensitiveDates(redactedText);
  }

  return redactedText;
}

/**
 * Redact PII from document context object
 */
export function redactDocumentContext(documentContext, signerNames = []) {
  if (!documentContext || typeof documentContext !== 'object') {
    return documentContext;
  }

  const redacted = { ...documentContext };

  // Preserve metadata flags
  const hasFullData = documentContext.hasFullData;

  // Redact text fields
  if (redacted.text && Array.isArray(redacted.text)) {
    redacted.text = redacted.text.map(textBlock => ({
      ...textBlock,
      text: redactPII(textBlock.text, { signerNames }),
    }));
  }

  // Redact form values (keep keys, redact values)
  if (redacted.forms && Array.isArray(redacted.forms)) {
    redacted.forms = redacted.forms.map(form => ({
      ...form,
      key: {
        ...form.key,
        text: redactPII(form.key?.text || '', { signerNames }),
      },
      value: {
        ...form.value,
        text: redactPII(form.value?.text || '', { signerNames }),
      },
    }));
  }

  // Redact table cell text
  if (redacted.tables && Array.isArray(redacted.tables)) {
    redacted.tables = redacted.tables.map(table => ({
      ...table,
      cells:
        table.cells?.map(cell => ({
          ...cell,
          text: redactPII(cell.text || '', { signerNames }),
        })) || [],
    }));
  }

  // Redact layout text
  if (redacted.layout && Array.isArray(redacted.layout)) {
    redacted.layout = redacted.layout.map(layoutBlock => ({
      ...layoutBlock,
      text: redactPII(layoutBlock.text || '', { signerNames }),
    }));
  }

  // Preserve metadata flags
  if (hasFullData !== undefined) {
    redacted.hasFullData = hasFullData;
  }

  return redacted;
}

/**
 * Check if text contains potential PII (for logging/auditing)
 */
export function detectPII(text) {
  const detected = {
    hasEmail: false,
    hasPhone: false,
    hasSSN: false,
    hasCreditCard: false,
    hasAddress: false,
  };

  if (!text || typeof text !== 'string') {
    return detected;
  }

  detected.hasEmail = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(text);
  detected.hasPhone = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(text);
  detected.hasSSN = /\b\d{3}-\d{2}-\d{4}\b/.test(text);
  detected.hasCreditCard = /\b\d{4}[-.\s]?\d{4}[-.\s]?\d{4}[-.\s]?\d{4}\b/.test(text);
  detected.hasAddress =
    /\b\d+\s+[A-Za-z0-9\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Place|Pl)\b/i.test(
      text
    );

  return detected;
}
