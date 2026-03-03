import React, { useRef, useState } from "react";
import PrevNext from "./PrevNext";
import {
  base64ToArrayBuffer,
  decryptPdf,
  deletePdfPage,
  flattenPdf,
  getFileAsArrayBuffer,
  handleDownloadCertificate,
  handleDownloadPdf,
  handleRemoveWidgets,
  handleToPrint,
  reorderPdfPages
} from "../../constant/Utils";
import "../../styles/signature.css";
import { DropdownMenu } from "radix-ui";
import ModalUi from "../../primitives/ModalUi";
import Loader from "../../primitives/Loader";
import PageReorderModal from "./PageReorderModal";
import { useTranslation } from "react-i18next";
import { PDFDocument } from "pdf-lib";
import { maxFileSize } from "../../constant/const";
import { useWindowSize } from "../../hook/useWindowSize";

function Header(props) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowSize();
  const isMobile = windowWidth > 0 && windowWidth < 767;
  const filterPrefill =
    props?.signerPos &&
    props?.signerPos?.filter((data) => data.Role !== "prefill");
  const [isDownloading, setIsDownloading] = useState("");
  const [isDeletePage, setIsDeletePage] = useState(false);
  const [isReorderModal, setIsReorderModal] = useState(false);
  const mergePdfInputRef = useRef(null);
  const enabledBackBtn = props?.disabledBackBtn === true ? false : true;
  //function for show decline alert
  const handleDeclinePdfAlert = async () => {
    if (props?.handleDecline) {
      props.handleDecline();
    } else {
      const currentDecline = { currnt: "Sure", isDeclined: true };
      props?.setIsDecline(currentDecline);
    }
  };
  const handleDetelePage = async () => {
    props?.setIsUploadPdf && props?.setIsUploadPdf(true);
    const pdfupdatedData = await deletePdfPage(
      props?.pdfArrayBuffer,
      props?.pageNumber
    );
    if (pdfupdatedData?.totalPages === 1) {
      alert(t("delete-alert"));
    } else {
      props?.setPdfBase64Url(pdfupdatedData.base64);
      props?.setPdfArrayBuffer(pdfupdatedData.arrayBuffer);
      setIsDeletePage(false);
      handleRemoveWidgets(
        props?.setSignerPos,
        props?.signerPos,
        props?.pageNumber
      );
    }
  };

  // `removeFile` is used to  remove file if exists
  const removeFile = (e) => {
    if (e) {
      e.target.value = "";
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) {
      alert("Please upload a valid PDF file.");
      return;
    }
    if (!file.type.includes("pdf")) {
      alert("Only PDF files are allowed.");
      return;
    }

    const mb = Math.round(file?.size / Math.pow(1024, 2));
    if (mb > maxFileSize) {
      alert(`${t("file-alert-1")} ${maxFileSize} MB`);
      removeFile(e);
      return;
    }
    try {
      let uploadedPdfBytes = await file.arrayBuffer();
      try {
        uploadedPdfBytes = await flattenPdf(uploadedPdfBytes);
      } catch (err) {
        if (err?.message?.includes("is encrypted")) {
          try {
            const pdfFile = await decryptPdf(file, "");
            const pdfArrayBuffer = await getFileAsArrayBuffer(pdfFile);
            uploadedPdfBytes = await flattenPdf(pdfArrayBuffer);
          } catch (err) {
            if (err?.response?.status === 401) {
              const password = prompt(
                `PDF "${file.name}" is password-protected. Enter password:`
              );
              if (password) {
                try {
                  const pdfFile = await decryptPdf(file, password);
                  const pdfArrayBuffer = await getFileAsArrayBuffer(pdfFile);
                  uploadedPdfBytes = await flattenPdf(pdfArrayBuffer);
                  // Upload the file to Parse Server
                } catch (err) {
                  console.error("Incorrect password or decryption failed", err);
                  alert("Incorrect password or decryption failed.");
                }
              } else {
                alert("Please provided Password.");
              }
            } else {
              console.log("Err ", err);
              alert("error while uploading pdf.");
            }
          }
        } else {
          alert("error while uploading pdf.");
        }
      }
      const uploadedPdfDoc = await PDFDocument.load(uploadedPdfBytes, {
        ignoreEncryption: true
      });
      const basePdfDoc = await PDFDocument.load(props.pdfArrayBuffer);

      // Copy pages from the uploaded PDF to the base PDF
      const uploadedPdfPages = await basePdfDoc.copyPages(
        uploadedPdfDoc,
        uploadedPdfDoc.getPageIndices()
      );
      uploadedPdfPages.forEach((page) => basePdfDoc.addPage(page));
      // Save the updated PDF
      const pdfBase64 = await basePdfDoc.saveAsBase64({
        useObjectStreams: false
      });
      const pdfBuffer = base64ToArrayBuffer(pdfBase64);
      props.setPdfArrayBuffer(pdfBuffer);
      props.setPdfBase64Url(pdfBase64);
      props.setIsUploadPdf && props.setIsUploadPdf(true);
      mergePdfInputRef.current.value = "";
    } catch (error) {
      mergePdfInputRef.current.value = "";
      console.error("Error merging PDF:", error);
    }
  };

  const handleReorderSave = async (order) => {
    try {
      const pdfupdatedData = await reorderPdfPages(props.pdfArrayBuffer, order);
      if (pdfupdatedData) {
        props.setPdfArrayBuffer(pdfupdatedData.arrayBuffer);
        props.setPdfBase64Url(pdfupdatedData.base64);
        props.setAllPages(pdfupdatedData.totalPages);
        props.setPageNumber(1);
      }
    } catch (e) {
      console.log("error in reorder pdf pages", e);
    }
    setIsReorderModal(false);
  };
  return (
    <div className="flex py-[5px]">
      {/* Same toolbar for mobile and desktop (Tools, page nav, Auto-detect, Back/Next) to avoid overlap and match layout */}
      {(!isMobile || props?.isShowHeader) && (
        <div
          className="flex flex-wrap items-center w-full justify-between gap-x-3 gap-y-2 ml-1 min-w-0"
          style={isMobile && props?.isShowHeader ? { width: windowWidth + "px" } : undefined}
        >
          {/* Left: Tools + page numbers — never shrink, wrap to next line if needed */}
          <div className="flex items-center gap-x-2 flex-shrink-0">
          {props?.showToolsDropdown && (
            <div className="flex-shrink-0">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="op-btn op-btn-ghost op-btn-sm border border-base-300 bg-base-200 hover:bg-base-300 whitespace-nowrap"
                  title={t("Tools") || "Tools"}
                >
                  <i className="fa-light fa-ellipsis-v text-base-content text-lg mr-1" aria-hidden="true"></i>
                  <span className="text-sm font-medium">{t("Tools") || "Tools"}</span>
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="DropdownMenuContent bg-base-100 shadow-lg rounded-md border border-base-300 min-w-[180px]"
                  side="bottom"
                  sideOffset={6}
                  align="start"
                >
                  {(props?.pdfDetails != null || props?.pdfBase64 != null) && (
                    <DropdownMenu.Item
                      className="DropdownMenuItem"
                      onClick={() => {
                        if (props?.isCompleted) {
                          props?.setIsDownloadModal?.(true);
                        } else {
                          handleDownloadPdf(
                            props?.pdfDetails,
                            setIsDownloading,
                            props?.pdfBase64
                          );
                        }
                      }}
                    >
                      <div className="flex flex-row items-center gap-2">
                        <i className="fa-light fa-arrow-down text-gray-500"></i>
                        <span className="font-[500]">{t("download")}</span>
                      </div>
                    </DropdownMenu.Item>
                  )}
                  {props?.onToolsPages != null && (
                    <DropdownMenu.Item
                      className="DropdownMenuItem"
                      onClick={() => props?.onToolsPages?.()}
                    >
                      <div className="flex flex-row items-center gap-2">
                        <i className="fa-light fa-file-lines text-gray-500"></i>
                        <span className="font-[500]">{t("pages")}</span>
                      </div>
                    </DropdownMenu.Item>
                  )}
                  {!props?.isDisableEditTools && (
                    <>
                      <DropdownMenu.Item
                        className="DropdownMenuItem"
                        onClick={() => props?.onToolsAddPages?.()}
                      >
                        <div className="flex flex-row items-center gap-2">
                          <i className="fa-light fa-plus text-gray-500"></i>
                          <span className="font-[500]">{t("add-pages")}</span>
                        </div>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="DropdownMenuItem"
                        onClick={() => props?.onToolsDeletePage?.()}
                      >
                        <div className="flex flex-row items-center gap-2">
                          <i className="fa-light fa-trash text-gray-500"></i>
                          <span className="font-[500]">{t("delete-page")}</span>
                        </div>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="DropdownMenuItem"
                        onClick={() => props?.onToolsReorder?.()}
                      >
                        <div className="flex flex-row items-center gap-2">
                          <i className="fa-light fa-list-ol text-gray-500"></i>
                          <span className="font-[500]">{t("reorder-pages")}</span>
                        </div>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="DropdownMenuItem"
                        onClick={() => props?.handleRotationFun?.(90)}
                      >
                        <div className="flex flex-row items-center gap-2">
                          <i className="fa-light fa-rotate-right text-gray-500"></i>
                          <span className="font-[500]">{t("rotate-right")}</span>
                        </div>
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="DropdownMenuItem"
                        onClick={() => props?.handleRotationFun?.(-90)}
                      >
                        <div className="flex flex-row items-center gap-2">
                          <i className="fa-light fa-rotate-left text-gray-500"></i>
                          <span className="font-[500]">{t("rotate-left")}</span>
                        </div>
                      </DropdownMenu.Item>
                    </>
                  )}
                  <DropdownMenu.Item
                    className="DropdownMenuItem"
                    onClick={() => props?.clickOnZoomIn?.()}
                  >
                    <div className="flex flex-row items-center gap-2">
                      <i className="fa-light fa-magnifying-glass-plus text-gray-500"></i>
                      <span className="font-[500]">{t("zoom-in")}</span>
                    </div>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="DropdownMenuItem"
                    onClick={() => props?.clickOnZoomOut?.()}
                    disabled={props?.zoomPercent != null && props.zoomPercent <= -90}
                  >
                    <div className="flex flex-row items-center gap-2">
                      <i className="fa-light fa-magnifying-glass-minus text-gray-500"></i>
                      <span className="font-[500]">{t("zoom-out")}</span>
                    </div>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            </div>
          )}
          <div className="flex-shrink-0 whitespace-nowrap">
          <PrevNext
            pageNumber={props?.pageNumber}
            allPages={props?.allPages}
            changePage={props?.changePage}
            setPageNumber={props?.setPageNumber}
          />
          </div>
          </div>
          {/* Center: Auto-Detect-Fields — never shrink, wrap to next line if needed */}
          <div className="flex flex-shrink-0 justify-center min-w-0 px-2">
          {props?.showAutoDetectFields && (
            <div className="flex-shrink-0 whitespace-nowrap">
              <button
                onClick={props?.onAutoDetectFields}
                disabled={props?.isDetectingFields}
                type="button"
                className="op-btn op-btn-sm bg-[#3579F7] text-white border-[#007ACC] hover:bg-[#006bb3] hover:border-[#006bb3] disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap"
                title={t("auto-detect-fields-tooltip") || "Automatically detect signature, date, and initial fields"}
              >
                {props?.isDetectingFields ? (
                  <>
                    <span className="loading loading-spinner loading-sm mr-2"></span>
                    {t("detecting-fields") || "Detecting fields..."}
                  </>
                ) : (
                  <>
                    <i className="fa-light fa-magic-wand-sparkles mr-2"></i>
                    {t("Auto-Detect-Fields") || "Auto-detect fields"}
                  </>
                )}
              </button>
            </div>
          )}
          </div>
          {/* Right: Back + Next — never shrink, wraps to next line when no room */}
          <div className="flex items-center gap-x-2 flex-shrink-0">
          {props?.isPlaceholder ? (
            <>
              <div className="flex flex-shrink-0 order-last lg:order-none">
                {!props?.isMailSend &&
                  props?.signersdata.length > 0 &&
                  props?.signersdata.length !== filterPrefill.length && (
                    <div>
                      {filterPrefill.length === 0 ? (
                        <span className="text-[13px] text-[#f5405e]">
                          {t("add")}{" "}
                          {props?.signersdata.length - filterPrefill.length}{" "}
                          {t("recipients")} {t("widgets-name.signature")}
                        </span>
                      ) : (
                        <span className="text-[13px] text-[#f5405e]">
                          {t("add")}{" "}
                          {props?.signersdata.length - filterPrefill.length}{" "}
                          {t("more")}
                          {t("recipients")} {t("widgets-name.signature")}
                        </span>
                      )}
                    </div>
                  )}
              </div>
              <div className="flex flex-shrink-0">
                {props?.setIsEditTemplate && (
                  <button
                    onClick={() => props?.setIsEditTemplate(true)}
                    className="outline-none border-none text-center mr-[3px]"
                  >
                    <i className="fa-light fa-gear fa-lg"></i>
                  </button>
                )}
                {enabledBackBtn && (
                  <button
                    onClick={() => window.history.go(-2)}
                    type="button"
                    className="op-btn op-btn-ghost op-btn-sm mr-[3px]"
                  >
                    {t("back")}
                  </button>
                )}
                <button
                  disabled={props?.isMailSend && true}
                  data-tut="headerArea"
                  className="op-btn op-btn-primary op-btn-sm mr-[3px]"
                  onClick={() => props?.alertSendEmail()}
                >
                  {props?.completeBtnTitle
                    ? props?.completeBtnTitle
                    : props?.isMailSend
                      ? t("sent")
                      : t("send")}
                </button>
              </div>
            </>
          ) : props?.isPdfRequestFiles || props?.isSelfSign ? (
            props?.alreadySign || (props?.isSelfSign && props?.isCompleted) ? (
              <div className="flex flex-row flex-shrink-0">
                <button
                  onClick={(e) =>
                    handleToPrint(e, setIsDownloading, props?.pdfDetails)
                  }
                  type="button"
                  className="op-btn op-btn-neutral op-btn-sm mr-[3px] shadow"
                >
                  <i
                    className="fa-light fa-print py-[3px]"
                    aria-hidden="true"
                  ></i>
                  <span className="hidden lg:block">{t("print")}</span>
                </button>
                {props?.isCompleted && (
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadCertificate(
                        props?.pdfDetails,
                        setIsDownloading
                      )
                    }
                    className="op-btn op-btn-secondary op-btn-sm mr-[3px] shadow"
                  >
                    <i
                      className="fa-light fa-award py-[3px]"
                      aria-hidden="true"
                    ></i>
                    <span className="hidden lg:block">{t("certificate")}</span>
                  </button>
                )}
                <button
                  type="button"
                  className="op-btn op-btn-primary op-btn-sm mr-[3px] shadow"
                  onClick={() => {
                    if (props?.isCompleted) {
                      props?.setIsDownloadModal(true);
                    } else {
                      handleDownloadPdf(
                        props?.pdfDetails,
                        setIsDownloading,
                        props.pdfBase64
                      );
                    }
                  }}
                >
                  <i
                    className="fa-light fa-download py-[3px]"
                    aria-hidden="true"
                  ></i>
                  <span className="hidden lg:block">{t("download")}</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-shrink-0" data-tut="reactourFifth">
                {props?.currentSigner && (
                  <>
                    {props?.templateId && (
                      <button
                        onClick={() =>
                          handleDownloadPdf(
                            props?.pdfDetails,
                            setIsDownloading,
                            props.pdfBase64
                          )
                        }
                        type="button"
                        className="op-btn op-btn-ghost op-btn-sm mr-[3px]"
                      >
                        <span className="hidden lg:block">{t("download")}</span>
                      </button>
                    )}
                    {!props?.isSelfSign && (
                      <button
                        className="op-btn op-btn-secondary op-btn-sm mr-[3px] shadow"
                        onClick={() => handleDeclinePdfAlert()}
                      >
                        {t("decline")}
                      </button>
                    )}
                    {!props?.templateId && (
                      <button
                        type="button"
                        className="op-btn op-btn-ghost op-btn-sm mr-[3px]"
                        onClick={() =>
                          handleDownloadPdf(
                            props?.pdfDetails,
                            setIsDownloading,
                            props.pdfBase64
                          )
                        }
                      >
                        <i className="fa-light fa-arrow-down font-semibold lg:hidden"></i>
                        <span className="hidden lg:block">{t("download")}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="op-btn op-btn-primary op-btn-sm mr-[3px] shadow"
                      onClick={() => props?.embedWidgetsData()}
                    >
                      {t("finish")}
                    </button>
                  </>
                )}
              </div>
            )
          ) : props?.isCompleted ? (
            <div className="flex flex-row flex-shrink-0">
              {props?.isCompleted && (
                <button
                  type="button"
                  onClick={() =>
                    handleDownloadCertificate(
                      props?.pdfDetails,
                      setIsDownloading
                    )
                  }
                  className="op-btn op-btn-secondary op-btn-sm gap-0 font-medium text-[12px] mr-[3px] shadow"
                >
                  <i className="fa-light fa-award" aria-hidden="true"></i>
                  <span className="hidden lg:block ml-1">
                    {t("certificate")}
                  </span>
                </button>
              )}
              <button
                onClick={(e) =>
                  handleToPrint(e, setIsDownloading, props?.pdfDetails)
                }
                type="button"
                className="op-btn op-btn-neutral op-btn-sm gap-0 font-medium text-[12px] mr-[3px] shadow"
              >
                <i className="fa-light fa-print" aria-hidden="true"></i>
                <span className="hidden lg:block ml-1">{t("print")}</span>
              </button>
              <button
                type="button"
                className="op-btn op-btn-primary op-btn-sm gap-0 font-medium text-[12px] mr-[3px] shadow"
                onClick={() => props?.setIsDownloadModal(true)}
              >
                <i className="fa-light fa-download" aria-hidden="true"></i>
                <span className="hidden lg:block ml-1">{t("download")}</span>
              </button>
              <button
                type="button"
                className="op-btn op-btn-info op-btn-sm gap-0 font-medium text-[12px] mr-[3px] shadow"
                onClick={() => props?.setIsEmail(true)}
              >
                <i className="fa-light fa-envelope" aria-hidden="true"></i>
                <span className="hidden lg:block ml-1">{t("mail")}</span>
              </button>
            </div>
          ) : props?.isPublicTemplate ? (
            <div className="flex flex-shrink-0">
              <button
                type="button"
                className="op-btn op-btn-primary op-btn-sm  shadow"
                onClick={() => props?.embedWidgetsData()}
              >
                {t("sign-now")}
              </button>
            </div>
          ) : (
            <div className="flex flex-shrink-0">
              <button
                onClick={() => window.history.go(-2)}
                type="button"
                className="op-btn op-btn-ghost op-btn-sm mr-[3px]"
              >
                {t("back")}
              </button>
              <button
                type="button"
                className="op-btn op-btn-primary op-btn-sm mr-[3px]"
                onClick={() => props?.embedWidgetsData()}
              >
                {t("finish")}
              </button>
            </div>
          )}
          </div>
        </div>
      )}
      {isDownloading === "pdf" && (
        <div className="fixed z-[200] inset-0 flex justify-center items-center bg-black bg-opacity-30">
          <Loader />
        </div>
      )}
      <ModalUi
        isOpen={
          isDownloading === "certificate" || isDownloading === "certificate_err"
        }
        title={
          isDownloading === "certificate" || isDownloading === "certificate_err"
            ? t("generating-certificate")
            : t("pdf-download")
        }
        handleClose={() => setIsDownloading("")}
      >
        <div className="p-3 md:p-5 text-[13px] md:text-base text-center text-base-content">
          {isDownloading === "certificate" ? (
            <p>{t("generate-certificate-alert")}</p>
          ) : (
            <p>{t("generate-certificate-err")}</p>
          )}
        </div>
      </ModalUi>
      <ModalUi
        isOpen={isDeletePage}
        title={t("delete-page")}
        handleClose={() => setIsDeletePage(false)}
      >
        <div className="h-[100%] p-[20px]">
          <p className="font-medium">{t("delete-alert-2")}</p>
          <p className="pt-3">{t("delete-note")}</p>
          <div className="h-[1px] bg-[#9f9f9f] w-full my-[15px]"></div>
          <button
            onClick={() => handleDetelePage()}
            type="button"
            className="op-btn op-btn-primary"
          >
            {t("yes")}
          </button>
          <button
            onClick={() => setIsDeletePage(false)}
            type="button"
            className="op-btn op-btn-ghost"
          >
            {t("no")}
          </button>
        </div>
      </ModalUi>
      <PageReorderModal
        isOpen={isReorderModal}
        handleClose={() => setIsReorderModal(false)}
        totalPages={props.allPages}
        onSave={handleReorderSave}
      />
    </div>
  );
}

export default Header;
