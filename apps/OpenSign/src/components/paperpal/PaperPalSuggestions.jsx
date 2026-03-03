import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * PaperPal™ Suggestions Component
 * Displays quick action suggestion chips
 */
function PaperPalSuggestions({ onSuggestionClick, workflowState }) {
  const { t } = useTranslation();

  // Context-aware suggestions based on workflow state
  const getSuggestions = () => {
    if (workflowState === 'dashboard') {
      return [
        'How do I create a new document?',
        'How do I manage my documents?',
        'What can I do on the dashboard?',
      ];
    }

    if (workflowState === 'editing') {
      return [
        'What is this document about?',
        'Help placing fields',
        'Where should signatures go?',
      ];
    }

    if (workflowState === 'signing') {
      return [
        'What am I signing?',
        'Where do I sign?',
        'What happens after I sign?',
      ];
    }

    return [
      'How can I help you?',
      'What would you like to know?',
    ];
  };

  const suggestions = getSuggestions();

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          onClick={() => onSuggestionClick(suggestion)}
          className="px-3 py-1.5 text-sm bg-base-200 hover:bg-base-300 text-base-content rounded-full border border-base-300 transition-colors"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

export default PaperPalSuggestions;

