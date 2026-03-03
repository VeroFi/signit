import { useState, useCallback } from "react";
import Parse from "parse";
import { useDispatch, useSelector } from "react-redux";
import {
  addMessage,
  setLoading,
  setError,
  clearError,
  clearConversation,
  setPageContext
} from "../redux/reducers/paperpalSlice";

/**
 * Custom hook for PaperPal™ API interactions
 */
export function usePaperPal() {
  const dispatch = useDispatch();
  const {
    conversationHistory,
    isLoading,
    error,
    workflowState,
    documentId,
    pageContext
  } = useSelector((state) => state.paperpal);
  const [isSending, setIsSending] = useState(false);

  /**
   * Send a message to PaperPal™
   */
  const sendMessage = useCallback(
    async (message, workflowData = {}) => {
      if (!message || !message.trim()) {
        return;
      }

      // Add user message to conversation
      dispatch(
        addMessage({
          role: "user",
          content: message.trim()
        })
      );

      setIsSending(true);
      dispatch(setLoading(true));
      dispatch(clearError());

      try {
        // Call Parse Cloud Function
        const result = await Parse.Cloud.run("paperpalChat", {
          message: message.trim(),
          documentId: documentId || null,
          workflowState: workflowState || "dashboard",
          workflowData,
          pageContext: pageContext || null
        });

        if (result && result.success) {
          // Add AI response to conversation
          dispatch(
            addMessage({
              role: "assistant",
              content: result.response,
              timestamp: result.timestamp
            })
          );

          return {
            success: true,
            response: result.response,
            usage: result.usage
          };
        } else {
          throw new Error(
            result?.error || "Failed to get response from PaperPal™"
          );
        }
      } catch (error) {
        console.error("[usePaperPal] Error sending message:", error);

        const errorMessage =
          error.message || "Failed to send message. Please try again.";
        dispatch(setError(errorMessage));

        // Add error message to conversation
        dispatch(
          addMessage({
            role: "assistant",
            content: `Sorry, I encountered an error: ${errorMessage}. Please try again.`
          })
        );

        return {
          success: false,
          error: errorMessage
        };
      } finally {
        setIsSending(false);
        dispatch(setLoading(false));
      }
    },
    [dispatch, documentId, workflowState, pageContext]
  );

  /**
   * Clear conversation history
   */
  const clearConversationHistory = useCallback(() => {
    dispatch(clearConversation());
  }, [dispatch]);

  return {
    sendMessage,
    clearConversation: clearConversationHistory,
    conversationHistory,
    isLoading: isLoading || isSending,
    error,
    workflowState,
    documentId
  };
}
