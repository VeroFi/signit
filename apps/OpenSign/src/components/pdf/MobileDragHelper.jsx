import React, { useEffect } from 'react';
import { isMobile } from '../../constant/Utils';

// Helper component to improve mobile drag interactions
const MobileDragHelper = ({ children }) => {
  useEffect(() => {
    if (!isMobile) return;

    // Improve touch scrolling for mobile
    const preventDefaultForTouchMove = (e) => {
      // Only prevent default if we're dragging
      if (e.target.closest('[draggable="true"]')) {
        e.preventDefault();
      }
    };

    // Add better touch handling
    document.addEventListener('touchmove', preventDefaultForTouchMove, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventDefaultForTouchMove);
    };
  }, []);

  return <>{children}</>;
};

export default MobileDragHelper;