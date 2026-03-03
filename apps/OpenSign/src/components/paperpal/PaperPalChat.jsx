import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { usePaperPal } from '../../hooks/usePaperPal';
import { openChat, closeChat, setSuggestions, setPageContext, setWorkflowState, setDocumentId } from '../../redux/reducers/paperpalSlice';
import PaperPalMessage from './PaperPalMessage';
import PaperPalSuggestions from './PaperPalSuggestions';
import { useTranslation } from 'react-i18next';
import { useWindowSize } from '../../hook/useWindowSize';

/**
 * PaperPal™ Chat Component
 * Main chat widget for PaperPal™ AI assistant
 */
function PaperPalChat({ workflowState = 'dashboard', documentId = null, workflowData = {}, pageContext = null }) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { width: windowWidth } = useWindowSize();
  const isMobile = windowWidth > 0 && windowWidth < 767;
  const { isOpen, conversationHistory, isLoading, error } = useSelector((state) => state.paperpal);
  const { sendMessage } = usePaperPal();
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Initialize chat state when component mounts (but don't auto-open)
  useEffect(() => {
    // Set workflow state, document ID, and page context without opening the chat
    // The chat will remain closed until user clicks the bubble
    dispatch(setWorkflowState(workflowState));
    dispatch(setDocumentId(documentId || null)); // Explicitly set to null if not provided
    const suggestions = getSuggestionsForWorkflow(workflowState);
    dispatch(setSuggestions(suggestions));
    // Always update pageContext, even if null, to clear previous context
    dispatch(setPageContext(pageContext || null));
  }, [dispatch, workflowState, documentId, pageContext]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conversationHistory]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const getSuggestionsForWorkflow = (state) => {
    if (state === 'dashboard') {
      return [
        'How do I create a new document?',
        'How do I manage my documents?',
        'What can I do on the dashboard?',
      ];
    }
    if (state === 'editing') {
      return [
        'What is this document about?',
        'Help placing fields',
        'Where should signatures go?',
      ];
    }
    if (state === 'signing') {
      return [
        'What am I signing?',
        'Where do I sign?',
        'What happens after I sign?',
      ];
    }
    return [];
  };


  const handleOpenChat = () => {
    // Set workflow state, document ID, and page context when opening
    dispatch(setWorkflowState(workflowState));
    dispatch(setDocumentId(documentId));
    dispatch(openChat({ workflowState, documentId }));
    // Set context-aware suggestions
    const suggestions = getSuggestionsForWorkflow(workflowState);
    dispatch(setSuggestions(suggestions));
    if (pageContext) {
      dispatch(setPageContext(pageContext));
    }
  };

  const handleCloseChat = () => {
    dispatch(closeChat());
  };

  const handleSendMessage = async (message = null) => {
    const messageToSend = message || inputMessage.trim();
    if (!messageToSend) {
      return;
    }

    setInputMessage('');
    await sendMessage(messageToSend, workflowData);
  };

  const handleSuggestionClick = (suggestion) => {
    handleSendMessage(suggestion);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Floating bubble (minimized state) — above recipients/fields bar (~80px)
  if (!isOpen) {
    return (
      <div
        className="fixed bottom-20 right-6 z-[10000] cursor-pointer"
        onClick={handleOpenChat}
      >
        <div className="bg-primary text-primary-content rounded-full w-16 h-16 flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
      </div>
    );
  }

  // Chat window (maximized state) — desktop: above recipients/fields bar
  return (
    <div
      className={`fixed ${
        isMobile ? 'bottom-0 left-0 right-0 top-0' : 'bottom-20 right-6'
      } z-[10000] ${
        isMobile ? 'w-full h-full' : 'w-96 h-[600px]'
      } bg-base-100 rounded-lg shadow-2xl flex flex-col border border-base-300`}
    >
      {/* Header */}
      <div className="bg-primary text-primary-content px-4 py-3 rounded-t-lg flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-content text-primary rounded-full flex items-center justify-center font-bold">
            P
          </div>
          <div>
            <div className="font-semibold">PaperPal™</div>
            <div className="text-xs opacity-80">AI Assistant</div>
          </div>
        </div>
        <button
          onClick={handleCloseChat}
          className="hover:bg-primary-focus rounded-full p-1 transition-colors"
          aria-label="Close chat"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {conversationHistory.length === 0 && (
          <div className="text-center text-base-content opacity-70 py-8">
            <div className="text-lg font-semibold mb-2">Hi! I'm PaperPal™</div>
            <div className="text-sm">
              {workflowState === 'dashboard' && 'I can help you with document management and dashboard features.'}
              {workflowState === 'editing' && 'I can help you understand your document and place fields correctly.'}
              {workflowState === 'signing' && 'I can help you understand what you\'re signing and guide you through the process.'}
            </div>
            <div className="mt-4">
              <PaperPalSuggestions
                onSuggestionClick={handleSuggestionClick}
                workflowState={workflowState}
              />
            </div>
          </div>
        )}

        {conversationHistory.map((msg, index) => (
          <PaperPalMessage
            key={index}
            message={msg.content}
            role={msg.role}
          />
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-base-200 rounded-lg px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-error text-error-content rounded-lg px-4 py-2 text-sm">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-base-300 p-4">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="flex-1 textarea textarea-bordered resize-none"
            rows={isMobile ? 3 : 2}
            disabled={isLoading}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={isLoading || !inputMessage.trim()}
            className="btn btn-primary"
            aria-label="Send message"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default PaperPalChat;

