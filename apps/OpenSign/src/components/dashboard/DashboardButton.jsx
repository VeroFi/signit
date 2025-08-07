import React from "react";
import { useNavigate } from "react-router";
import { openInNewTab } from "../../constant/Utils";
import { useTranslation } from "react-i18next";

const DashboardButton = (props) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  function openReport() {
    if (props.Data && props.Data.Redirect_type) {
      const Redirect_type = props.Data.Redirect_type;
      const id = props.Data.Redirect_id;
      if (Redirect_type === "Form") {
        navigate(`/form/${id}`);
      } else if (Redirect_type === "Report") {
        navigate(`/report/${id}`);
      } else if (Redirect_type === "Url") {
        openInNewTab(id);
      }
    }
  }
  return (
    <div
      onClick={() => openReport()}
      className={`${
        props.Data && props.Data.Redirect_type
          ? "cursor-pointer"
          : "cursor-default"
      } w-full h-[140px] shadow-md px-3 pt-4 rounded-2xl bg-base-100`}
    >
      <div className="flex items-center justify-start gap-5 text-base-content">
        <span className="rounded-full bg-base-content bg-opacity-20 w-[60px] h-[60px] self-start flex justify-center items-center">
          <i
            className={`${
              props.Icon ? props.Icon : "fa-light fa-info"
            } text-[25px] lg:text-[30px]`}
          ></i>
        </span>

        <div className="font-medium">
          {/* {t(`sidebar.${props.Label}`)}
          {props.Label === "Sign yourself" && (
            <div className="text-gray-500 text-xs mt-1">
              t("signyour-self-button")}
            </div>
          )}
          {props.Label === "Request signatures" && (
            <div className="text-gray-500 text-xs mt-1">
              {t("requestsign-button")}
            </div>
          )} */}
          <div className="text-base lg:text-lg">
            {t(`sidebar.${props.Label}`)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardButton;
