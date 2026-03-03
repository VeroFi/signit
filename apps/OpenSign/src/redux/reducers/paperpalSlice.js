// reducers/paperpalSlice.js
import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  isOpen: false,
  conversationHistory: [],
  isLoading: false,
  error: null,
  suggestions: [],
  workflowState: null, // 'dashboard' | 'editing' | 'signing'
  documentId: null,
  pageContext: null // Specific page context (e.g., 'contactbook', 'drive', 'users', etc.)
};

const paperpalSlice = createSlice({
  name: "paperpal",
  initialState,
  reducers: {
    openChat: (state, action) => {
      state.isOpen = true;
      if (action.payload) {
        state.workflowState = action.payload.workflowState;
        state.documentId = action.payload.documentId;
      }
    },
    closeChat: (state) => {
      state.isOpen = false;
    },
    addMessage: (state, action) => {
      const { role, content, timestamp } = action.payload;
      state.conversationHistory.push({
        role,
        content,
        timestamp: timestamp || new Date().toISOString()
      });
    },
    addSeparator: (state, action) => {
      const { label, subLabel } = action.payload;
      state.conversationHistory.push({
        role: "separator",
        content: label,
        subLabel: subLabel || null,
        timestamp: new Date().toISOString()
      });
    },
    setLoading: (state, action) => {
      state.isLoading = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    setSuggestions: (state, action) => {
      state.suggestions = action.payload || [];
    },
    setWorkflowState: (state, action) => {
      state.workflowState = action.payload;
    },
    setDocumentId: (state, action) => {
      state.documentId = action.payload;
    },
    setPageContext: (state, action) => {
      state.pageContext = action.payload;
    },
    clearConversation: (state) => {
      state.conversationHistory = [];
      state.error = null;
    },
    resetPaperPalState: () => initialState
  }
});

export const {
  openChat,
  closeChat,
  addMessage,
  addSeparator,
  setLoading,
  setError,
  clearError,
  setSuggestions,
  setWorkflowState,
  setDocumentId,
  setPageContext,
  clearConversation,
  resetPaperPalState
} = paperpalSlice.actions;

export default paperpalSlice.reducer;
