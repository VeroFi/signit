import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

function PrevNext({ pageNumber, allPages, changePage, setPageNumber }) {
  const { t } = useTranslation();
  const current = pageNumber || (allPages ? 1 : 1);
  const [inputValue, setInputValue] = useState(String(current));

  useEffect(() => {
    setInputValue(String(current));
  }, [current]);

  function previousPage() {
    changePage(-1);
  }

  function nextPage() {
    changePage(1);
  }

  function goToPage(page) {
    const num = Math.max(1, Math.min(allPages || 1, page));
    if (setPageNumber) setPageNumber(num);
    else changePage(num - current);
    setInputValue(String(num));
  }

  function handlePageInputKeyDown(e) {
    if (e.key === "Enter") {
      e.target.blur();
    }
  }

  function handlePageInputBlur() {
    const parsed = parseInt(inputValue, 10);
    if (!Number.isNaN(parsed) && allPages) {
      goToPage(parsed);
    } else {
      setInputValue(String(current));
    }
  }

  function handlePageInputChange(e) {
    const v = e.target.value;
    setInputValue(v);
  }

  return (
    <div className="flex items-center">
      <button
        className="op-btn op-btn-neutral op-btn-xs md:op-btn-sm font-semibold text-xs"
        disabled={current <= 1}
        onClick={previousPage}
      >
        <span className="block">
          <i className="fa-light fa-backward" aria-hidden="true"></i>
        </span>
      </button>
      <div className="text-xs text-base-content font-medium mx-2 2xl:text-[20px] flex items-center gap-1">
        <input
          type="number"
          min={1}
          max={allPages || 1}
          value={inputValue}
          onChange={handlePageInputChange}
          onBlur={handlePageInputBlur}
          onKeyDown={handlePageInputKeyDown}
          className="w-10 min-w-8 text-center bg-base-200/80 border border-base-300 rounded px-1 py-0.5 text-xs font-medium 2xl:text-[20px] text-base-content [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          style={{ fontSize: "inherit", lineHeight: "inherit" }}
          aria-label={t("page-number") || "Page number"}
        />
        <span>{t("of")} {allPages || "--"}</span>
      </div>
      <button
        className="op-btn op-btn-neutral op-btn-xs md:op-btn-sm font-semibold text-xs"
        disabled={current >= allPages}
        onClick={nextPage}
      >
        <span className="block">
          <i className="fa-light fa-forward" aria-hidden="true"></i>
        </span>
      </button>
    </div>
  );
}

export default PrevNext;
