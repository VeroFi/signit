import React, { useEffect, useState } from "react";
import Parse from "parse";
import { useNavigate, useSearchParams } from "react-router";
import { useDispatch } from "react-redux";
import axios from "axios";
import Loader from "../primitives/Loader";
import Alert from "../primitives/Alert";
import { appInfo } from "../constant/appinfo";
import { showTenant } from "../redux/reducers/ShowTenant";
import { useTranslation } from "react-i18next";

/**
 * VerifyID Login Page
 * Handles SSO authentication from VerifyID platform
 * Receives session token from URL, validates it, and logs user into SignIt
 */
function VerifyIdLogin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState({
    loading: true,
    error: null,
    message: "Authenticating with VerifyID..."
  });

  useEffect(() => {
    handleVerifyIdLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocalVar = (user) => {
    localStorage.setItem("accesstoken", user.sessionToken);
    localStorage.setItem("UserInformation", JSON.stringify(user));
    localStorage.setItem("userEmail", user.email);
    if (user.ProfilePic) {
      localStorage.setItem("profileImg", user.ProfilePic);
    } else {
      localStorage.setItem("profileImg", "");
    }
  };

  const logOutUser = () => {
    localStorage.clear();
    navigate("/");
  };

  const handleVerifyIdLogin = async () => {
    try {
      // Get session token from URL
      const sessionToken = searchParams.get("token");
      const userId = searchParams.get("userId");
      const orgId = searchParams.get("orgId");

      console.log("[VerifyID Login] Starting authentication", { userId, orgId });

      if (!sessionToken) {
        setState({
          loading: false,
          error: "No session token provided",
          message: "Authentication failed: Missing token"
        });
        setTimeout(() => navigate("/"), 3000);
        return;
      }

      setState({
        loading: true,
        error: null,
        message: "Validating session token..."
      });

      // Get user data from Parse using session token
      const baseUrl = localStorage.getItem("baseUrl");
      const parseAppId = localStorage.getItem("parseAppId");

      const userResponse = await axios.get(baseUrl + "users/me", {
        headers: {
          "X-Parse-Session-Token": sessionToken,
          "X-Parse-Application-Id": parseAppId
        }
      });

      if (!userResponse.data) {
        throw new Error("Invalid session token");
      }

      const user = userResponse.data;
      console.log("[VerifyID Login] User data received:", user.objectId);

      setState({
        loading: true,
        error: null,
        message: "Setting up your account..."
      });

      // Set user as current Parse user
      console.log("[VerifyID Login] Calling Parse.User.become() with session token");
      try {
        await Parse.User.become(sessionToken);
        console.log("[VerifyID Login] Parse.User.become() successful");
      } catch (becomeError) {
        console.error("[VerifyID Login] Parse.User.become() failed:", becomeError);
        console.error("[VerifyID Login] Error code:", becomeError.code);
        console.error("[VerifyID Login] Error message:", becomeError.message);
        throw new Error(`Session validation failed: ${becomeError.message}`);
      }
      setLocalVar(user);

      // Get extended user details
      const userSettings = appInfo.settings;
      const extUser = await Parse.Cloud.run("getUserDetails");

      if (!extUser) {
        throw new Error("Failed to get user details");
      }

      const IsDisabled = extUser.get("IsDisabled") || false;
      if (IsDisabled) {
        throw new Error("Account is disabled");
      }

      const userRole = extUser.get("UserRole");
      const menu = userRole && userSettings.find((m) => m.role === userRole);

      if (!menu) {
        throw new Error("User role not configured");
      }

      const _currentRole = userRole;
      const redirectUrl = `/${menu.pageType}/${menu.pageId}`;
      const _role = _currentRole.replace("contracts_", "");
      const extInfo = JSON.parse(JSON.stringify(extUser));

      // Set user information in localStorage
      localStorage.setItem("_user_role", _role);
      localStorage.setItem("Extand_Class", JSON.stringify([extUser]));
      localStorage.setItem("userEmail", extInfo?.Email);
      localStorage.setItem("username", extInfo?.Name);

      // Set tenant information if available
      if (extInfo?.TenantId) {
        const tenant = {
          Id: extInfo?.TenantId?.objectId || "",
          Name: extInfo?.TenantId?.TenantName || ""
        };
        localStorage.setItem("TenantId", tenant?.Id);
        dispatch(showTenant(tenant?.Name));
        localStorage.setItem("TenantName", tenant?.Name);
      }

      localStorage.setItem("PageLanding", menu.pageId);
      localStorage.setItem("defaultmenuid", menu.menuId);
      localStorage.setItem("pageType", menu.pageType);

      // Store VerifyID linkage info
      localStorage.setItem("verifyIdLinked", "true");
      localStorage.setItem("verifyIdUserId", user.verifyIdUserId || "");

      console.log("[VerifyID Login] Authentication successful, redirecting to:", redirectUrl);

      setState({
        loading: true,
        error: null,
        message: "Success! Redirecting to dashboard..."
      });

      // Redirect to dashboard
      setTimeout(() => {
        navigate(redirectUrl);
      }, 500);

    } catch (error) {
      console.error("[VerifyID Login] Authentication error:", error);

      let errorMessage = "Authentication failed";
      if (error.message) {
        errorMessage = error.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }

      setState({
        loading: false,
        error: errorMessage,
        message: "Authentication failed. Redirecting to login..."
      });

      // Clear any partial authentication data
      localStorage.removeItem("accesstoken");
      localStorage.removeItem("UserInformation");

      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate("/?error=verifyid_auth_failed");
      }, 3000);
    }
  };

  return (
    <div className="flex flex-col justify-center items-center h-screen bg-base-200">
      <div className="bg-base-100 shadow-md rounded-lg p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-base-content">
            VerifyID Authentication
          </h1>
        </div>

        {state.loading && (
          <div className="flex flex-col items-center space-y-4">
            <Loader />
            <p className="text-base-content text-center">{state.message}</p>
          </div>
        )}

        {state.error && !state.loading && (
          <div className="space-y-4">
            <Alert type="danger">
              <div className="font-semibold">Authentication Error</div>
              <div className="text-sm mt-1">{state.error}</div>
            </Alert>
            <p className="text-base-content text-center text-sm">
              Redirecting to login page...
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 text-center">
        <p className="text-sm text-base-content/70">
          Powered by VerifyID × SignIt Integration
        </p>
      </div>
    </div>
  );
}

export default VerifyIdLogin;
