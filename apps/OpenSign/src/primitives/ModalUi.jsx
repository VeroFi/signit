import React from "react";
import "../styles/signature.css";

const ModalUi = ({
  children,
  title,
  isOpen,
  handleClose,
  showHeader = true,
  showClose = true,
  reduceWidth,
  position
}) => {
  const width = reduceWidth;
  const isCenter = position === "items-center justify center" ? "items-end pb-2" : "";
  return (
    <>
      {isOpen && (
        <dialog
          id="selectSignerModal"
          className={`${isCenter} op-modal op-modal-open`}
        >
          <div
            className={`${
              width || "md:min-w-[500px]"
            } op-modal-box p-0 max-h-90 overflow-y-auto hide-scrollbar text-sm`}
          >
            {showHeader && (
              <>
                {title && (
                  <h3 className="text-base-content font-bold text-lg pt-[15px] px-[20px]">
                    {title}
                  </h3>
                )}
                {showClose && (
                  <button
                    className="op-btn op-btn-sm op-btn-circle op-btn-ghost text-base-content absolute right-2 top-2"
                    onClick={() => handleClose && handleClose()}
                  >
                    ✕
                  </button>
                )}
              </>
            )}
            <div>{children}</div>
          </div>
        </dialog>
      )}
    </>
  );
};

export default ModalUi;
