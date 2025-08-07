import { useEffect } from 'react';

export const useWidgetPanel = () => {
  useEffect(() => {
    const handlePanelToggle = (event) => {
      const panel = document.querySelector('.w-full.md\\:w-\\[23\\%\\]');
      if (!panel) return;

      // Check if click is inside the panel
      const isInsidePanel = panel.contains(event.target);
      
      if (isInsidePanel) {
        const rect = panel.getBoundingClientRect();
        const clickY = event.clientY - rect.top;
        
        // Only toggle if clicked in the top 30px (handle area)
        if (clickY <= 30) {
          panel.classList.toggle('collapsed');
          
          // Reset scroll to top when opening
          if (panel.classList.contains('collapsed')) {
            // Force scroll reset on panel and any scrollable children
            setTimeout(() => {
              panel.scrollTop = 0;
              const scrollableElements = panel.querySelectorAll('[class*="overflow"], .hide-scrollbar, .max-h-screen');
              scrollableElements.forEach(element => {
                element.scrollTop = 0;
              });
            }, 50);
          }
        }
      }
    };

    const handleTouchStart = (event) => {
      const panel = document.querySelector('.w-full.md\\:w-\\[23\\%\\]');
      if (!panel) return;
      
      const isInsidePanel = panel.contains(event.target);
      
      if (isInsidePanel) {
        const rect = panel.getBoundingClientRect();
        const touch = event.touches[0];
        const touchY = touch.clientY - rect.top;
        
        if (touchY <= 30) {
          event.preventDefault();
          event.stopPropagation();
          panel.classList.toggle('collapsed');
          
          // Reset scroll to top when opening
          if (panel.classList.contains('collapsed')) {
            // Force scroll reset on panel and any scrollable children
            setTimeout(() => {
              panel.scrollTop = 0;
              const scrollableElements = panel.querySelectorAll('[class*="overflow"], .hide-scrollbar, .max-h-screen');
              scrollableElements.forEach(element => {
                element.scrollTop = 0;
              });
            }, 50);
          }
        }
      }
    };

    // Add click listener (for mouse)
    document.addEventListener('click', handlePanelToggle);
    
    // Add touch listener with explicit non-passive option (for touch devices)
    document.addEventListener('touchstart', handleTouchStart, { passive: false });

    return () => {
      document.removeEventListener('click', handlePanelToggle);
      document.removeEventListener('touchstart', handleTouchStart);
    };
  }, []);
};