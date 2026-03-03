import React, { useState, useRef, useEffect } from "react";
import ModalUi from "../../primitives/ModalUi";
import RecipientList from "./RecipientList";
import { useDrag } from "react-dnd";
import WidgetList from "./WidgetList";
import {
  color,
  darkenColor,
  getFirstLetter,
  isMobile,
  nameColor,
  radioButtonWidget,
  textInputWidget,
  cellsWidget,
  textWidget,
  widgets
} from "../../constant/Utils";
import { useTranslation } from "react-i18next";
function WidgetComponent(props) {
  const { t } = useTranslation();
  const signRef = useRef(null);
  const userInformation = localStorage.getItem("UserInformation");
  const [isSignersModal, setIsSignersModal] = useState(false);
  const [, signature] = useDrag({
    type: "BOX",
    item: { type: "BOX", id: 1, text: "signature" }
  });
  const [, stamp] = useDrag({
    type: "BOX",
    item: { type: "BOX", id: 2, text: "stamp" }
  });
  const [, dropdown] = useDrag({
    type: "BOX",
    item: { type: "BOX", id: 5, text: "dropdown" }
  });
  const [, checkbox] = useDrag({
    type: "BOX",
    item: { type: "BOX", id: 6, text: "checkbox" }
  });
  const [, textInput] = useDrag({
    type: "BOX",
    item: { type: "BOX", id: 7, text: textInputWidget }
  });
  const [, cells] = useDrag({
    type: "BOX",
    item: { type: "BOX", id: 17, text: cellsWidget }
  });
  const [, initials] = useDrag({
    type: "BOX",
    item: { type: "BOX", id: 8, text: "initials" }
  });
  const [, name] = useDrag({
    type: "BOX",
    item: { type: "BOX", id: 9, text: "name" }
  });
  const [, company] = useDrag({
    type: "BOX",
    item: { type: "BOX", id: 10, text: "company" }
  });
  const [, jobTitle] = useDrag({
    type: "BOX",
    item: { type: "BOX", id: 11, text: "job title" }
  });
  const [, date] = useDrag({
    type: "BOX",
    item: { type: "BOX", id: 12, text: "date" }
  });
  const [, image] = useDrag({
    type: "BOX",
    item: { type: "BOX", id: 13, text: "image" }
  });
  const [, email] = useDrag({
    type: "BOX",
    item: { type: "BOX", id: 14, text: "email" }
  });
  const [, radioButton] = useDrag({
    type: "BOX",
    item: { type: "BOX", id: 15, text: radioButtonWidget }
  });
  const [, text] = useDrag({
    type: "BOX",
    item: { type: "BOX", id: 16, text: textWidget }
  });
  const [widget, setWidget] = useState([]);
  const handleModal = () => {
    setIsSignersModal(!isSignersModal);
  };

  useEffect(() => {
    const widgetRef = [
      signature,
      stamp,
      initials,
      name,
      jobTitle,
      company,
      date,
      text,
      textInput,
      cells,
      checkbox,
      dropdown,
      radioButton,
      image,
      email
    ];
    const getWidgetArray = widgets;
    const newUpdateSigner = getWidgetArray.map((obj, ind) => {
      return { ...obj, ref: widgetRef[ind] };
    });

    setWidget(newUpdateSigner);
    // eslint-disable-next-line
  }, []);

  const modifiedWidgets = widget.filter(
    (data) =>
      ![
        "dropdown",
        radioButtonWidget,
        textInputWidget,
        "date",
        "image",
        "checkbox"
      ].includes(data.type)
  );
  const unlogedInUserWidgets = widget.filter(
    (data) =>
      ![
        "dropdown",
        radioButtonWidget,
        textInputWidget,
        "date",
        "image",
        "checkbox",
        "name",
        "email",
        "job title",
        "company"
      ].includes(data.type)
  );
  const filterWidgets = widget.filter(
    (data) =>
      !["dropdown", radioButtonWidget, textInputWidget].includes(
        data.type
      )
  );
  const textWidgetData = widget.filter((data) => data.type !== textWidget);
  const updateWidgets = props.isSignYourself
    ? filterWidgets
    : props.isTemplateFlow
      ? textWidgetData
      : props.isAlllowModify
        ? userInformation
          ? modifiedWidgets
          : unlogedInUserWidgets
        : widget;

  const handleSelectRecipient = () => {
    if (
      props.signersdata[props.isSelectListId]?.Email ||
      props.signersdata[props.isSelectListId]?.Role
    ) {
      const userData =
        props.signersdata[props.isSelectListId]?.Name ||
        props.signersdata[props.isSelectListId]?.Role;
      const name =
        userData?.length > 20 ? `${userData.slice(0, 20)}...` : userData;
      return name;
    }
  };

  return (
    <>
      {/* Recipients + Fields bottom bar: same on all screen sizes, at bottom; horizontal scroll on one line */}
      {!props.isMailSend && (
          <div id="navbar" className="navbar-container fixed z-[99] bottom-0 right-0 w-full max-w-[100vw]">
            <div
              data-tut="addWidgets"
              className="widget-navbar bg-base-100 border-[2px] border-t-primary"
            >
              <div className="widget-list-responsive flex flex-nowrap overflow-x-auto gap-x-2 gap-y-2 py-2 px-2 items-center">
                {props.isSigners && (
                  <>
                    <button
                      type="button"
                      data-tut="recipientArea"
                      onClick={() => handleModal()}
                      className="op-btn op-btn-outline op-btn-sm shrink-0 w-8 h-8 min-w-[32px] p-0 flex justify-center items-center rounded-full outline outline-[1.5px] border-2 border-base-300 overflow-hidden"
                      title={handleSelectRecipient()}
                    >
                      {props.signersdata?.length > 0 &&
                      props.signersdata[props.isSelectListId] ? (
                        <span
                          className="w-full h-full flex items-center justify-center text-white uppercase font-bold text-[11px]"
                          style={{
                            background:
                              props.signersdata[props.isSelectListId]?.blockColor
                                ? darkenColor(
                                    props.signersdata[props.isSelectListId].blockColor,
                                    0.4
                                  )
                                : nameColor[
                                    props.isSelectListId % nameColor.length
                                  ]
                          }}
                        >
                          {props.signersdata[props.isSelectListId]?.Name
                            ? getFirstLetter(
                                props.signersdata[props.isSelectListId].Name
                              )
                            : getFirstLetter(
                                props.signersdata[props.isSelectListId]?.Role ||
                                  "?"
                              )}
                        </span>
                      ) : (
                        <i
                          className="fa-light fa-user text-base text-base-content"
                          aria-hidden="true"
                       ></i>
                      )}
                    </button>
                    {props.handleAddSigner ? (
                      <button
                        data-tut="reactourAddbtn"
                        onClick={() => props.handleAddSigner()}
                        className="op-btn op-btn-accent op-btn-sm shrink-0 w-8 h-8 min-w-[32px] p-0 flex justify-center items-center rounded-full"
                      >
                        <i className="fa-light fa-plus" aria-hidden="true"></i>
                      </button>
                    ) : props.setIsAddSigner ? (
                      <button
                        data-tut="addRecipient"
                        onClick={() => props.setIsAddSigner(true)}
                        className="op-btn op-btn-accent op-btn-sm shrink-0 w-8 h-8 min-w-[32px] p-0 flex justify-center items-center rounded-full"
                      >
                        <i className="fa-light fa-plus" aria-hidden="true"></i>
                      </button>
                    ) : null}
                  </>
                )}
                <WidgetList
                  updateWidgets={updateWidgets}
                  handleDivClick={props.handleDivClick}
                  handleMouseLeave={props.handleMouseLeave}
                  signRef={signRef}
                  marginLeft={5}
                  addPositionOfSignature={props.addPositionOfSignature}
                />
              </div>
            </div>
          </div>
        )}
      {isSignersModal && (
        <ModalUi
          title={props.title ? props.title : t("recipients")}
          isOpen={isSignersModal}
          handleClose={handleModal}
        >
          {props.signersdata.length > 0 ? (
            <div className="max-h-[600px] overflow-auto pb-1">
              <RecipientList
                signerPos={props.signerPos}
                signersdata={props.signersdata}
                isSelectListId={props.isSelectListId}
                setIsSelectId={props.setIsSelectId}
                setUniqueId={props.setUniqueId}
                setRoleName={props.setRoleName}
                handleDeleteUser={props.handleDeleteUser}
                handleRoleChange={props.handleRoleChange}
                handleOnBlur={props.handleOnBlur}
                handleModal={handleModal}
                sendInOrder={props.sendInOrder}
                setSignersData={props.setSignersData}
                setBlockColor={props.setBlockColor}
                uniqueId={props.uniqueId}
                setSignerPos={props.setSignerPos}
              />
            </div>
          ) : (
            <div className=" p-[20px] text-[15px] font-medium text-center">
              {t("please-add")} {props.title ? props.title : t("recipients")}
            </div>
          )}
        </ModalUi>
      )}
    </>
  );
}

export default WidgetComponent;
