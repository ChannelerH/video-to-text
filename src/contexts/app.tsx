"use client";

import {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import { cacheGet, cacheRemove } from "@/lib/simple-cache";

import { CacheKey } from "@/services/constant";
import { ContextValue } from "@/types/context";
import { User } from "@/types/user";
import moment from "moment";
import useOneTapLogin from "@/hooks/useOneTapLogin";
import { useSession } from "next-auth/react";
import { isAuthEnabled, isGoogleOneTapEnabled } from "@/lib/auth";

const AppContext = createContext({} as ContextValue);

export const useAppContext = () => useContext(AppContext);

export const AppContextProvider = ({ children }: { children: ReactNode }) => {
  if (isAuthEnabled() && isGoogleOneTapEnabled()) {
    useOneTapLogin();
  }

  const { data: session } = isAuthEnabled() ? useSession() : { data: null };

  const [showSignModal, setShowSignModal] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);

  const [showFeedback, setShowFeedback] = useState<boolean>(false);
  // empty string indicates "unknown/not loaded"; avoids blocking initial fetch by truthy default
  const [userTier, setUserTier] = useState<string>('');
  const [subscriptionPlan, setSubscriptionPlan] = useState<string>('');
  const loadedRef = useRef(false);

  const fetchUserInfo = async function () {
    try {
      const resp = await fetch("/api/get-user-info", {
        method: "POST",
      });

      if (!resp.ok) {
        throw new Error("fetch user info failed with status: " + resp.status);
      }

      const { code, message, data } = await resp.json();
      if (code !== 0) {
        throw new Error(message);
      }

      // API returns { user, userTier }
      if (data?.user) setUser(data.user); else setUser(data);
      if (data?.userTier) setUserTier(data.userTier);
      if (data?.subscriptionPlan) setSubscriptionPlan(data.subscriptionPlan);

      updateInvite(data.user || data);
      loadedRef.current = true;
    } catch (e) {
      console.log("fetch user info failed");
    }
  };

  const updateInvite = async (user: User) => {
    try {
      if (user.invited_by) {
        // user already been invited
        console.log("user already been invited", user.invited_by);
        return;
      }

      const inviteCode = cacheGet(CacheKey.InviteCode);
      if (!inviteCode) {
        // no invite code
        return;
      }

      const userCreatedAt = moment(user.created_at).unix();
      const currentTime = moment().unix();
      const timeDiff = Number(currentTime - userCreatedAt);

      if (timeDiff <= 0 || timeDiff > 7200) {
        // user created more than 2 hours
        console.log("user created more than 2 hours");
        return;
      }

      // update invite relation
      console.log("update invite", inviteCode, user.uuid);
      const req = {
        invite_code: inviteCode,
        user_uuid: user.uuid,
      };
      const resp = await fetch("/api/update-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req),
      });
      if (!resp.ok) {
        throw new Error("update invite failed with status: " + resp.status);
      }
      const { code, message, data } = await resp.json();
      if (code !== 0) {
        throw new Error(message);
      }

      setUser(data);
      cacheRemove(CacheKey.InviteCode);
    } catch (e) {
      console.log("update invite failed: ", e);
    }
  };

  // Immediately hydrate context from NextAuth session so UI (avatar) shows instantly
  useEffect(() => {
    if (session && (session as any).user && !user) {
      try {
        setUser((session as any).user as User);
      } catch {}
    }
  }, [session, user]);

  useEffect(() => {
    if (session && session.user) {
      if (!loadedRef.current) {
        fetchUserInfo();
      }
    }
  }, [session]);

  return (
    <AppContext.Provider
      value={{
        showSignModal,
        setShowSignModal,
        user,
        userTier,
        subscriptionPlan,
        setUser,
        showFeedback,
        setShowFeedback,
        refreshUserInfo: fetchUserInfo,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
