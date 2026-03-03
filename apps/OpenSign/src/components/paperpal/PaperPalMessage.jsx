import React from 'react';

/**
 * Convert markdown syntax (**text** for bold, *text* for italic) to React elements
 */
function parseMarkdown(text) {
  if (!text) return null;
  
  const parts = [];
  let lastIndex = 0;
  
  // Combined regex to match both **bold** and *italic*
  // Order matters: match **bold** first, then *italic* (but not if it's part of **bold**)
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    // match[1] is for **bold** (group 1), match[2] is for *italic* (group 2)
    if (match[1]) {
      // Bold text (**text**)
      parts.push(<strong key={match.index}>{match[1]}</strong>);
    } else if (match[2]) {
      // Italic text (*text*)
      parts.push(<em key={match.index}>{match[2]}</em>);
    }
    
    lastIndex = regex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

/**
 * PaperPal™ Message Component
 * Displays individual chat messages (user or assistant)
 */
function PaperPalMessage({ message, role }) {
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser
            ? 'bg-primary text-primary-content'
            : isAssistant
            ? 'bg-base-200 text-base-content'
            : 'bg-base-300 text-base-content'
        }`}
      >
        <div className="text-sm whitespace-pre-wrap break-words">
          {parseMarkdown(message)}
        </div>
        {isAssistant && (
          <div className="text-xs opacity-70 mt-1">
            PaperPal™
          </div>
        )}
      </div>
    </div>
  );
}

export default PaperPalMessage;

