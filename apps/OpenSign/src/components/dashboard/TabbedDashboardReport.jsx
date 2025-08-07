import React, { useState } from "react";
import DashboardReport from "./DashboardReport";
import { useTranslation } from "react-i18next";

const TabbedDashboardReport = ({ reportIds, labels }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="bg-white rounded-lg shadow-md">
      {/* Tab Headers */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex">
          {labels.map((label, index) => (
            <button
              key={index}
              onClick={() => setActiveTab(index)}
              className={`py-2 px-4 text-sm font-medium border-b-2 ${
                activeTab === index
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {t(label)}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-0">
        {reportIds.map((reportId, index) => (
          <div
            key={reportId}
            className={activeTab === index ? "block" : "hidden"}
          >
            <DashboardReport
              Record={{
                type: "report",
                reportId: reportId,
                label: labels[index]
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default TabbedDashboardReport;