import React, { useState, useRef, useEffect, useCallback } from "react";
import RSC from "react-scrollbars-custom";
import { Document, Page } from "react-pdf";
import {
  defaultWidthHeight,
  getContainerScale,
  handleImageResize,
  handleSignYourselfImageResize,
  isMobile
} from "../../constant/Utils";
import Placeholder from "./Placeholder";
import Alert from "../../primitives/Alert";
import { useTranslation } from "react-i18next";
import usePdfPinchZoom from "../../hook/usePdfPinchZoom";

function RenderPdf(props) {
  const { t } = useTranslation();
  const [scaledHeight, setScaledHeight] = useState();
  const [guideline, setGuideline] = useState({
    show: false,
    x1: 0,
    x2: 0,
    y1: 0,
    y2: 0
  });
  const [hoveredFormId, setHoveredFormId] = useState(null);
  //check isGuestSigner is present in local if yes than handle login flow header in mobile view
  const isGuestSigner = localStorage.getItem("isGuestSigner");

  const pdfContainerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const currentFormHighlightRef = useRef(null);
  const scrollSpyUpdateRef = useRef(false);
  const programmaticScrollInProgressRef = useRef(false);

  // enable pinch to zoom only on actual pdf wrapper
  usePdfPinchZoom(
    pdfContainerRef,
    props.scale,
    props.setScale,
    props.setZoomPercent
  );

  // Scroll to current form only when user changes form (Next/Previous) or enables auto-detect.
  // Do not depend on pageNumber: when user scrolls manually, scroll spy updates pageNumber
  // and we must not scroll back to the highlighted field.
  useEffect(() => {
    if (!props.isTextractMode || !currentFormHighlightRef.current) return;
    programmaticScrollInProgressRef.current = true;
    let clearGuardId;
    const timeoutId = setTimeout(() => {
      const highlightElement = currentFormHighlightRef.current;
      if (!highlightElement) {
        programmaticScrollInProgressRef.current = false;
        return;
      }
      highlightElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center'
      });
      clearGuardId = setTimeout(() => {
        programmaticScrollInProgressRef.current = false;
      }, 1500);
    }, 300);
    return () => {
      clearTimeout(timeoutId);
      if (clearGuardId != null) clearTimeout(clearGuardId);
    };
  }, [props.currentFormIndex, props.isTextractMode]);

  // Jump to top of page only when user pressed button or typed a number — not when page changed from scrolling.
  useEffect(() => {
    if (!props.allPages || !props.pageNumber) return;
    const wasFromScrollSpy = scrollSpyUpdateRef.current;
    scrollSpyUpdateRef.current = false;
    if (wasFromScrollSpy) return;

    const pageNum = props.pageNumber;
    programmaticScrollInProgressRef.current = true;

    const jumpToPage = () => {
      const scroller = scrollContainerRef.current?.scrollerElement;
      const container = pdfContainerRef.current;
      if (!scroller || !container) return false;
      const el = container.querySelector(`[data-page-number="${pageNum}"]`);
      if (!el) return false;
      const targetTop = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTop = Math.max(0, Math.floor(targetTop));
      return true;
    };

    jumpToPage();
    const rafId = requestAnimationFrame(() => {
      jumpToPage();
      setTimeout(() => {
        programmaticScrollInProgressRef.current = false;
      }, 150);
    });

    return () => cancelAnimationFrame(rafId);
  }, [props.pageNumber, props.allPages]);

  // Update page number when user scrolls (scroll spy)
  const handleScroll = useCallback(
    (scrollValues) => {
      if (!props.allPages || !props.setPageNumber) return;
      if (programmaticScrollInProgressRef.current) return;
      const container = pdfContainerRef.current;
      const scroller = scrollContainerRef.current?.scrollerElement;
      if (!container || !scroller) return;
      const pages = container.querySelectorAll("[data-page-number]");
      if (!pages.length) return;
      const viewTop = scroller.getBoundingClientRect().top + 80;
      let current = 1;
      for (const el of pages) {
        const r = el.getBoundingClientRect();
        if (r.top <= viewTop)
          current = parseInt(el.getAttribute("data-page-number"), 10) || current;
      }
      if (current !== props.pageNumber) {
        scrollSpyUpdateRef.current = true;
        props.setPageNumber(current);
      }
    },
    [props.allPages, props.setPageNumber, props.pageNumber]
  );

  const handleGuideline = (isShow, x = 0, y = 0, width = 0, height = 0) => {
    if (isShow) {
      setGuideline({
        show: true,
        x1: x,
        x2: x + width,
        y1: y,
        y2: y + height
      });
    } else {
      setGuideline({ show: false, x1: 0, x2: 0, y1: 0, y2: 0 });
    }
  };

  const MARGIN_BETWEEN_PAGES = 8;
  const getPageOffsetY = (pageNum) => {
    if (!props.pdfOriginalWH?.length || !props.containerWH) return 0;
    let offset = 0;
    const currentScale = props.scale || 1;
    for (let i = 1; i < pageNum; i++) {
      const pData = props.pdfOriginalWH.find((p) => p.pageNumber === i);
      if (!pData) continue;
      const scale = getContainerScale(props.pdfOriginalWH, i, props.containerWH);
      offset += pData.height * scale * currentScale + MARGIN_BETWEEN_PAGES;
    }
    return offset;
  };

  // handle signature block width and height according to screen
  const posWidth = (pos, signYourself) => {
    const containerScale = getContainerScale(
      props.pdfOriginalWH,
      props.pageNumber,
      props.containerWH
    );
    const defaultWidth = defaultWidthHeight(pos.type).width;
    const posWidth = pos.Width ? pos.Width : defaultWidth;
    if (signYourself) {
      return posWidth * props.scale * containerScale;
    } else {
      if (pos.isMobile && pos.scale) {
        if (pos.IsResize) {
          if (props.scale > 1) {
            return posWidth * pos.scale * containerScale * props.scale;
          } else {
            return posWidth * containerScale;
          }
        } else {
          if (props.scale > 1) {
            return posWidth * pos.scale * containerScale * props.scale;
          } else {
            return posWidth * pos.scale * containerScale;
          }
        }
      } else {
        return posWidth * props.scale * containerScale;
      }
    }
  };
  const posHeight = (pos, signYourself) => {
    const containerScale = getContainerScale(
      props.pdfOriginalWH,
      props.pageNumber,
      props.containerWH
    );
    const posHeight = pos.Height || defaultWidthHeight(pos.type).height;
    if (signYourself) {
      return posHeight * props.scale * containerScale;
    } else {
      if (pos.isMobile && pos.scale) {
        if (pos.IsResize) {
          if (props.scale > 1) {
            return posHeight * pos.scale * containerScale * props.scale;
          } else {
            return posHeight * containerScale;
          }
        } else {
          if (props.scale > 1) {
            return posHeight * pos.scale * containerScale * props.scale;
          } else {
            return posHeight * pos.scale * containerScale;
          }
        }
      } else {
        return posHeight * props.scale * containerScale;
      }
    }
  };

  // function for render placeholder block over pdf document (all signing flow)
  const checkSignedSigners = (data) => {
    let checkSign = [];
    //condition to handle quick send flow and using normal request sign flow
    checkSign = props.signedSigners
      ? props.signedSigners?.filter(
          (sign) =>
            sign?.Id === data?.Id || sign?.objectId === data?.signerObjId
        )
      : [];
    return (
      checkSign.length === 0 &&
      data?.placeHolder?.map((placeData, key) => (
        <React.Fragment key={key}>
          {placeData.pageNumber === props.pageNumber &&
            placeData.pos.map(
              (pos, ind) =>
                pos && (
                  <React.Fragment key={ind}>
                    <Placeholder
                      pos={pos}
                      handleSignYourselfImageResize={handleImageResize}
                      index={props.pageNumber}
                      xyPosition={props.signerPos}
                      setXyPosition={props.setSignerPos}
                      data={data}
                      setIsResize={props.setIsResize}
                      isShowBorder={props.isSelfSign}
                      isAlllowModify={props.isAlllowModify}
                      signerObjId={props.signerObjectId}
                      isShowDropdown={true}
                      isNeedSign={props.pdfRequest}
                      isSelfSign={true}
                      isSignYourself={false}
                      posWidth={posWidth}
                      posHeight={posHeight}
                      showGuidelines={handleGuideline}
                      isDragging={props.isDragging}
                      pdfDetails={props.pdfDetails}
                      unSignedWidgetId={props.unSignedWidgetId}
                      setCurrWidgetsDetails={props.setCurrWidgetsDetails}
                      uniqueId={props.uniqueId}
                      scale={props.scale}
                      containerWH={props.containerWH}
                      pdfOriginalWH={props.pdfOriginalWH}
                      pageNumber={props.pageNumber}
                      ispublicTemplate={props.ispublicTemplate}
                      handleUserDetails={props.handleUserDetails}
                      isResize={props.isResize}
                      handleTabDrag={props.handleTabDrag}
                      handleStop={props.handleStop}
                      setUniqueId={props.setUniqueId}
                      setIsSelectId={props.setIsSelectId}
                      handleDeleteSign={props.handleDeleteSign}
                      setIsPageCopy={props.setIsPageCopy}
                      handleTextSettingModal={props.handleTextSettingModal}
                      handleCellSettingModal={props.handleCellSettingModal}
                      setIsCheckbox={props.setIsCheckbox}
                      isFreeResize={props.isSelfSign ? true : false}
                      isOpenSignPad={true}
                      assignedWidgetId={props.assignedWidgetId}
                      isApplyAll={true}
                      setCellCount={props.setCellCount}
                      setFontSize={props.setFontSize}
                      fontSize={props.fontSize}
                      fontColor={props.fontColor}
                      setFontColor={props.setFontColor}
                      setRequestSignTour={props.setRequestSignTour}
                      calculateFontsize={calculateFontsize}
                      currWidgetsDetails={props?.currWidgetsDetails}
                      setTempSignerId={props.setTempSignerId}
                    />
                  </React.Fragment>
                )
            )}
        </React.Fragment>
      ))
    );
  };

  const calculateFontsize = (pos) => {
    const width = posWidth(pos);
    const height = posHeight(pos);

    if (height === width || height < width) {
      return `${height / 5}px`;
    } else if (width < height) {
      return `${width / 10}px`;
    }
  };
  const pdfDataBase64 = `data:application/pdf;base64,${props.pdfBase64Url}`;
  // calculate render height of pdf in mobile view
  const handlePageLoadSuccess = (page) => {
    if (isMobile) {
      const containerWidth = props.divRef.current.offsetWidth; // Get container width
      const viewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / viewport.width; // Scale to fit container width
      const scaleHeight = viewport.height * scale;
      setScaledHeight(scaleHeight);
    }
  };

  // Form highlight overlay for Textract forms
  const FormHighlightOverlay = () => {
    if (!props.isTextractMode || !props.textractForms || props.textractForms.length === 0) return null;
    
    // Get all active forms (across all pages) to find the current one by global index
    const allActiveForms = props.textractForms.filter(f => !props.dismissedFormIds.has(f.id));
    if (allActiveForms.length === 0) return null;
    
    // Get the current form
    let currentForm = null;
    if (props.currentFormIndex >= 0 && props.currentFormIndex < props.textractForms.length) {
      const formAtIndex = props.textractForms[props.currentFormIndex];
      // Check if this form is still active (not dismissed)
      if (formAtIndex && !props.dismissedFormIds.has(formAtIndex.id)) {
        currentForm = formAtIndex;
      }
    }
    
    // If the form at currentFormIndex is dismissed, find the next active form
    if (!currentForm && allActiveForms.length > 0) {
      // Find the first active form that comes after currentFormIndex in the original array
      for (let i = props.currentFormIndex + 1; i < props.textractForms.length; i++) {
        const form = props.textractForms[i];
        if (form && !props.dismissedFormIds.has(form.id)) {
          currentForm = form;
          break;
        }
      }
      // If not found after, look before
      if (!currentForm) {
        for (let i = props.currentFormIndex - 1; i >= 0; i--) {
          const form = props.textractForms[i];
          if (form && !props.dismissedFormIds.has(form.id)) {
            currentForm = form;
            break;
          }
        }
      }
      // Last resort: use first active form
      if (!currentForm) {
        currentForm = allActiveForms[0];
      }
    }
    
    const activeForms = props.textractForms.filter(f => !props.dismissedFormIds.has(f.id));
    if (activeForms.length === 0) return null;

    const currentScale = props.scale || 1;

    return (
      <>
        {activeForms.map((form) => {
          const isCurrentForm = currentForm && form.id === currentForm.id;
          const keyBox = form.key?.geometry?.BoundingBox;
          const valueBox = form.value?.geometry?.BoundingBox || keyBox;

          if (!keyBox || !valueBox) return null;

          const pageNum = form.pageNumber;
          const pageData = props.pdfOriginalWH.find(p => p.pageNumber === pageNum);
          if (!pageData) return null;

          const containerScale = getContainerScale(
            props.pdfOriginalWH,
            pageNum,
            props.containerWH
          );
          const pageOffsetY = getPageOffsetY(pageNum);

          const keyLeft = keyBox.Left * pageData.width * containerScale * currentScale;
          const keyTop = pageOffsetY + keyBox.Top * pageData.height * containerScale * currentScale;
          const keyWidth = keyBox.Width * pageData.width * containerScale * currentScale;
          const keyHeight = keyBox.Height * pageData.height * containerScale * currentScale;

          const valueLeft = valueBox.Left * pageData.width * containerScale * currentScale;
          const valueTop = pageOffsetY + valueBox.Top * pageData.height * containerScale * currentScale;
          const valueWidth = valueBox.Width * pageData.width * containerScale * currentScale;
          const valueHeight = valueBox.Height * pageData.height * containerScale * currentScale;
          
          // Check if this form is being hovered
          const isHovered = hoveredFormId === form.id;
          
          // Current form: brighter, thicker border. Other forms: dimmer, thinner border
          // Hovered forms get slightly brighter
          const keyBorderColor = isCurrentForm ? '#3b82f6' : (isHovered ? '#60a5fa' : '#93c5fd');
          const keyBorderWidth = isCurrentForm ? '3px' : (isHovered ? '2px' : '1px');
          const keyBgOpacity = isCurrentForm ? 0.8 : (isHovered ? 0.6 : 0.4);
          
          const valueBorderColor = isCurrentForm ? '#1f2937' : (isHovered ? '#374151' : '#6b7280');
          const valueBorderWidth = isCurrentForm ? '3px' : (isHovered ? '2px' : '1px');
          const valueBgOpacity = isCurrentForm ? 0.8 : (isHovered ? 0.7 : 0.5);
          
          // Handler to navigate to this form when clicked
          const handleFormClick = (e) => {
            e.stopPropagation();
            if (props.onFormClick) {
              // Find this form's index in the original sorted array
              const formIndex = props.textractForms.findIndex(f => f.id === form.id);
              if (formIndex >= 0) {
                props.onFormClick(formIndex, form);
              }
            }
          };

          // Calculate bounding box for the combined KEY and VALUE area
          const combinedLeft = Math.min(keyLeft, valueLeft);
          const combinedTop = Math.min(keyTop, valueTop);
          const combinedRight = Math.max(keyLeft + keyWidth, valueLeft + valueWidth);
          const combinedBottom = Math.max(keyTop + keyHeight, valueTop + valueHeight);
          const combinedWidth = combinedRight - combinedLeft;
          const combinedHeight = combinedBottom - combinedTop;

          return (
            <React.Fragment key={form.id}>
              {/* Combined clickable overlay for both KEY and VALUE */}
              <div
                style={{
                  position: 'absolute',
                  left: combinedLeft,
                  top: combinedTop,
                  width: combinedWidth,
                  height: combinedHeight,
                  cursor: 'pointer',
                  zIndex: isCurrentForm ? 10000 : 9999,
                  backgroundColor: 'transparent',
                }}
                onClick={handleFormClick}
                onMouseEnter={() => setHoveredFormId(form.id)}
                onMouseLeave={() => setHoveredFormId(null)}
                title={`Click to navigate to this form`}
              />
              {/* KEY highlight */}
              <div
                style={{
                  position: 'absolute',
                  left: keyLeft,
                  top: keyTop,
                  width: keyWidth,
                  height: keyHeight,
                  backgroundColor: `rgba(255, 255, 255, ${keyBgOpacity})`,
                  border: `${keyBorderWidth} solid ${keyBorderColor}`,
                  pointerEvents: 'none',
                  zIndex: isCurrentForm ? 9999 : 9998,
                  transition: 'all 0.2s ease-in-out'
                }}
              />
              {/* VALUE highlight */}
              <div
                ref={isCurrentForm ? currentFormHighlightRef : null}
                style={{
                  position: 'absolute',
                  left: valueLeft,
                  top: valueTop,
                  width: valueWidth,
                  height: valueHeight,
                  backgroundColor: `rgba(75, 85, 99, ${valueBgOpacity})`,
                  border: `${valueBorderWidth} solid ${valueBorderColor}`,
                  pointerEvents: 'none',
                  zIndex: isCurrentForm ? 9999 : 9998,
                  transition: 'all 0.2s ease-in-out'
                }}
              />
            </React.Fragment>
          );
        })}
      </>
    );
  };

  return (
    <>
      {props.successEmail && (
        <Alert type={"success"}>{t("success-email-alert")}</Alert>
      )}
      <RSC
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{
          position: "relative",
          boxShadow: "rgba(17, 12, 46, 0.15) 0px 48px 100px 0px",
          height: isMobile
            ? isGuestSigner
              ? window.innerHeight - 49 // 49 is height of header
              : scaledHeight
            : `${window.innerHeight}px`,
          zIndex: 0
        }}
        noScrollY={isMobile ? props.scale === 1 : false}
        noScrollX={props.scale === 1}
      >
        <div
          style={
            isMobile
              ? undefined
              : { display: "flex", justifyContent: "center", width: "100%", minHeight: "100%" }
          }
        >
        <div
          data-tut={isMobile ? "reactourForth" : undefined}
          className={
            isMobile
              ? `${isGuestSigner ? "30px" : ""} border-[0.1px] border-[#ebe8e8] overflow-x-auto relative`
              : "relative"
          }
          style={{
            width:
              props.containerWH?.width && props.containerWH?.width * props.scale
          }}
          ref={(node) => {
            pdfContainerRef.current = node;
            props.drop && props.drop(node);
          }}
          id="container"
        >
          {props.pdfLoad !== false &&
            props.containerWH?.width &&
            props.pdfOriginalWH.length > 0 && (
              <>
                {!props.allPages && (props.pdfRequest || props.isSelfSign
                  ? // request sign, guest sign,
                    props.signerPos?.map((data, key) => (
                      <React.Fragment key={key}>
                        {checkSignedSigners(data)}
                      </React.Fragment>
                    ))
                  : props.placeholder // placeholdersign document, draft document, create template, draft template
                    ? props.signerPos?.map((data, ind) => (
                        <React.Fragment key={ind}>
                          {data?.placeHolder &&
                            data?.placeHolder.map((placeData, index) => (
                              <React.Fragment key={index}>
                                {placeData.pageNumber === props.pageNumber &&
                                  placeData.pos.map((pos) => (
                                    <React.Fragment key={pos.key}>
                                      <Placeholder
                                        pos={pos}
                                        setIsPageCopy={props.setIsPageCopy}
                                        handleDeleteSign={
                                          props.handleDeleteSign
                                        }
                                        handleTabDrag={props.handleTabDrag}
                                        handleStop={props.handleStop}
                                        handleSignYourselfImageResize={
                                          handleImageResize
                                        }
                                        index={props.pageNumber}
                                        xyPosition={props.signerPos}
                                        setXyPosition={props.setSignerPos}
                                        data={data}
                                        setIsResize={props.setIsResize}
                                        setShowDropdown={props.setShowDropdown}
                                        isShowBorder={true}
                                        isPlaceholder={true}
                                        setUniqueId={props.setUniqueId}
                                        handleLinkUser={props.handleLinkUser}
                                        isSignYourself={false}
                                        posWidth={posWidth}
                                        posHeight={posHeight}
                                        showGuidelines={handleGuideline}
                                        isDragging={props.isDragging}
                                        setIsValidate={props.setIsValidate}
                                        setIsRadio={props.setIsRadio}
                                        setIsCheckbox={props.setIsCheckbox}
                                        setCurrWidgetsDetails={
                                          props.setCurrWidgetsDetails
                                        }
                                        handleNameModal={props.handleNameModal}
                                        setTempSignerId={props.setTempSignerId}
                                        uniqueId={props.uniqueId}
                                        handleTextSettingModal={
                                          props.handleTextSettingModal
                                        }
                                        handleCellSettingModal={
                                          props.handleCellSettingModal
                                        }
                                        scale={props.scale}
                                        containerWH={props.containerWH}
                                        pdfOriginalWH={props.pdfOriginalWH}
                                        pageNumber={props.pageNumber}
                                        setIsSelectId={props.setIsSelectId}
                                        fontSize={props.fontSize}
                                        setFontSize={props.setFontSize}
                                        setCellCount={props.setCellCount}
                                        fontColor={props.fontColor}
                                        setFontColor={props.setFontColor}
                                        isResize={props.isResize}
                                        unSignedWidgetId={
                                          props.unSignedWidgetId
                                        }
                                        isFreeResize={true}
                                        calculateFontsize={calculateFontsize}
                                        currWidgetsDetails={
                                          props?.currWidgetsDetails
                                        }
                                        highlightedFieldKey={props.highlightedFieldKey}
                                      />
                                    </React.Fragment>
                                  ))}
                              </React.Fragment>
                            ))}
                        </React.Fragment>
                      ))
                    : !props.pdfDetails?.[0]?.IsCompleted && // signyourself flow
                      props.xyPosition?.map((data, ind) => (
                        <React.Fragment key={ind}>
                          {data.pageNumber === props.pageNumber &&
                            data.pos.map(
                              (pos, id) =>
                                pos && (
                                  <Placeholder
                                    key={id}
                                    pos={pos}
                                    setIsPageCopy={props.setIsPageCopy}
                                    handleDeleteSign={props.handleDeleteSign}
                                    handleTabDrag={props.handleTabDrag}
                                    handleStop={props.handleStop}
                                    handleSignYourselfImageResize={
                                      handleSignYourselfImageResize
                                    }
                                    index={props.index}
                                    xyPosition={props.xyPosition}
                                    setXyPosition={props.setXyPosition}
                                    containerWH={props.containerWH}
                                    isShowBorder={true}
                                    isSignYourself={true}
                                    posWidth={posWidth}
                                    posHeight={posHeight}
                                    showGuidelines={handleGuideline}
                                    pdfDetails={props.pdfDetails[0]}
                                    isDragging={props.isDragging}
                                    setIsCheckbox={props.setIsCheckbox}
                                    setCurrWidgetsDetails={
                                      props.setCurrWidgetsDetails
                                    }
                                    handleTextSettingModal={
                                      props.handleTextSettingModal
                                    }
                                    handleCellSettingModal={
                                      props.handleCellSettingModal
                                    }
                                    scale={props.scale}
                                    pdfOriginalWH={props.pdfOriginalWH}
                                    pageNumber={props.pageNumber}
                                    fontSize={props.fontSize}
                                    setFontSize={props.setFontSize}
                                    fontColor={props.fontColor}
                                    setFontColor={props.setFontColor}
                                    isResize={props.isResize}
                                    setIsResize={props.setIsResize}
                                    isFreeResize={true}
                                    isOpenSignPad={true}
                                    calculateFontsize={calculateFontsize}
                                    currWidgetsDetails={
                                      props?.currWidgetsDetails
                                    }
                                  />
                                )
                            )}
                        </React.Fragment>
                      ))
                )}
                {props.allPages && props.placeholder &&
                  props.signerPos?.map((data, ind) => (
                    <React.Fragment key={ind}>
                      {data?.placeHolder?.map((placeData, index) => (
                        <React.Fragment key={index}>
                          {placeData.pos.map((pos) => (
                            <Placeholder
                              key={pos.key}
                              pos={pos}
                              setIsPageCopy={props.setIsPageCopy}
                              handleDeleteSign={props.handleDeleteSign}
                              handleTabDrag={props.handleTabDrag}
                              handleStop={props.handleStop}
                              handleSignYourselfImageResize={handleImageResize}
                              index={placeData.pageNumber}
                              xyPosition={props.signerPos}
                              setXyPosition={props.setSignerPos}
                              data={data}
                              setIsResize={props.setIsResize}
                              setShowDropdown={props.setShowDropdown}
                              isShowBorder={true}
                              isPlaceholder={true}
                              setUniqueId={props.setUniqueId}
                              handleLinkUser={props.handleLinkUser}
                              isSignYourself={false}
                              posWidth={posWidth}
                              posHeight={posHeight}
                              showGuidelines={handleGuideline}
                              isDragging={props.isDragging}
                              setIsValidate={props.setIsValidate}
                              setIsRadio={props.setIsRadio}
                              setIsCheckbox={props.setIsCheckbox}
                              setCurrWidgetsDetails={props.setCurrWidgetsDetails}
                              handleNameModal={props.handleNameModal}
                              setTempSignerId={props.setTempSignerId}
                              uniqueId={props.uniqueId}
                              handleTextSettingModal={props.handleTextSettingModal}
                              handleCellSettingModal={props.handleCellSettingModal}
                              scale={props.scale}
                              containerWH={props.containerWH}
                              pdfOriginalWH={props.pdfOriginalWH}
                              pageNumber={placeData.pageNumber}
                              pageOffsetY={getPageOffsetY(placeData.pageNumber)}
                              setIsSelectId={props.setIsSelectId}
                              fontSize={props.fontSize}
                              setFontSize={props.setFontSize}
                              setCellCount={props.setCellCount}
                              fontColor={props.fontColor}
                              setFontColor={props.setFontColor}
                              isResize={props.isResize}
                              unSignedWidgetId={props.unSignedWidgetId}
                              isFreeResize={true}
                              calculateFontsize={calculateFontsize}
                              currWidgetsDetails={props?.currWidgetsDetails}
                              highlightedFieldKey={props.highlightedFieldKey}
                            />
                          ))}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}
              </>
            )}
          <Document
            error={<p className="mx-2">{t("failed-to-load-refresh-page")}</p>}
            onLoadError={(e) => {
              console.log("PDF load error", e);
              props.setPdfLoad(false);
            }}
            loading={t("loading-doc")}
            onLoadSuccess={(pdf) => {
              props.setPdfLoad(true);
              if (pdf?.numPages != null) props.setAllPages?.(pdf.numPages);
              props.pageDetails(pdf);
            }}
            onClick={() =>
              props.setCurrWidgetsDetails && props.setCurrWidgetsDetails({})
            }
            file={pdfDataBase64}
          >
            {props.allPages
              ? Array.from(new Array(props.allPages), (_, i) => {
                  const pageNum = i + 1;
                  return (
                    <div
                      key={pageNum}
                      data-page-number={pageNum}
                      className="flex flex-col items-center"
                      style={{
                        width:
                          props.containerWH?.width &&
                          props.containerWH.width * (props.scale || 1),
                        marginBottom: 8
                      }}
                    >
                      <Page
                        onLoadSuccess={pageNum === 1 ? handlePageLoadSuccess : undefined}
                        width={props.containerWH.width}
                        scale={props.scale || 1}
                        className={isMobile ? "select-none touch-callout-none" : "-z-[1]"}
                        pageNumber={pageNum}
                        renderAnnotationLayer={false}
                        renderTextLayer={false}
                        onGetAnnotationsError={(error) => {
                          console.log("annotation error", error);
                        }}
                      />
                    </div>
                  );
                })
              : (
                <Page
                  key={props.index}
                  onLoadSuccess={handlePageLoadSuccess}
                  width={props.containerWH.width}
                  scale={props.scale || 1}
                  className={isMobile ? "select-none touch-callout-none" : "-z-[1]"}
                  pageNumber={props.pageNumber}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                  onGetAnnotationsError={(error) => {
                    console.log("annotation error", error);
                  }}
                />
              )}
          </Document>
          {props.isTextractMode && <FormHighlightOverlay />}
          {guideline.show && (
            <>
              {/* top guide */}
              <div
                className="absolute pointer-events-none z-[1000] left-0 w-full border-t-[1px] border-dashed border-[#3b82f6]"
                style={{ top: guideline.y1 }}
              />
              {/* bottom guide */}
              <div
                className="absolute pointer-events-none z-[1000] left-0 w-full border-t-[1px] border-dashed border-[#3b82f6]"
                style={{ top: guideline.y2 }}
              />
              {/* left guide */}
              <div
                className="absolute pointer-events-none z-[1000] top-0 h-full border-l-[1px] border-dashed border-[#3b82f6]"
                style={{ left: guideline.x1 }}
              />
              {/* right guide */}
              <div
                className="absolute pointer-events-none z-[1000] top-0 h-full border-l-[1px] border-dashed border-[#3b82f6]"
                style={{ left: guideline.x2 }}
              />
            </>
          )}
        </div>
        </div>
      </RSC>
    </>
  );
}

export default RenderPdf;
