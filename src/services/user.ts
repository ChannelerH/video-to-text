import { CreditsAmount, CreditsTransType } from "./credit";
import { findUserByEmail, findUserByUuid, insertUser } from "@/models/user";

import { User } from "@/types/user";
import { auth } from "@/auth";
import { getIsoTimestr, getOneYearLaterTimestr } from "@/lib/time";
import { getUserUuidByApiKey } from "@/models/apikey";
import { headers } from "next/headers";
import { increaseCredits } from "./credit";
import { users } from "@/db/schema";
import { getUuid } from "@/lib/hash";

// save user to database, if user not exist, create a new user
export async function saveUser(user: User) {
  try {
    if (!user.email) {
      throw new Error("invalid user email");
    }

    const existUser = await findUserByEmail(user.email);

    if (!existUser) {
      // user not exist, create a new user
      if (!user.uuid) {
        user.uuid = getUuid();
      }

      console.log("user to be inserted:", user);

      const dbUser = await insertUser(user as typeof users.$inferInsert);

      // increase credits for new user, expire in one year
      await increaseCredits({
        user_uuid: user.uuid,
        trans_type: CreditsTransType.NewUser,
        credits: CreditsAmount.NewUserGet,
        expired_at: getOneYearLaterTimestr(),
      });

      user = {
        ...(dbUser as unknown as User),
      };
    } else {
      // user exist, return user info in db
      user = {
        ...(existUser as unknown as User),
      };
    }

    return user;
  } catch (e) {
    console.log("save user failed: ", e);
    throw e;
  }
}

export async function getUserUuid() {
  let user_uuid = "";

  const token = await getBearerToken();

  if (token) {
    // api key
    if (token.startsWith("sk-")) {
      const user_uuid = await getUserUuidByApiKey(token);

      return user_uuid || "";
    }
  }

  const session = await auth();
  if (session && session.user && session.user.uuid) {
    user_uuid = session.user.uuid;
  }

  return user_uuid;
}

export async function getBearerToken() {
  const h = await headers();
  const auth = h.get("Authorization");
  if (!auth) {
    return "";
  }

  return auth.replace("Bearer ", "");
}

export async function getUserEmail() {
  let user_email = "";

  const session = await auth();
  if (session && session.user && session.user.email) {
    user_email = session.user.email;
  }

  return user_email;
}

export async function getUserInfo() {
  let user_uuid = await getUserUuid();

  if (!user_uuid) {
    return;
  }
  // Guard against slow/failed DB connections: timeout + swallow errors
  try {
    const user = await Promise.race([
      findUserByUuid(user_uuid),
      new Promise<undefined>((_, reject) => setTimeout(() => reject(new Error('db-timeout')), Number(process.env.DB_USERINFO_TIMEOUT || 8000)))
    ]) as any;
    return user;
  } catch (e) {
    console.warn('getUserInfo: DB fetch failed or timed out', e);
    return undefined;
  }
}

/**
 * 获取用户信息和等级
 */
export async function getUserInfoWithTier() {
  const user_uuid = await getUserUuid();

  if (!user_uuid) {
    return { user: null, userTier: 'free', subscriptionPlan: 'FREE' };
  }

  const user = await findUserByUuid(user_uuid);
  
  // Check if user is admin
  let userWithAdmin = user ? { ...user } : null;
  if (userWithAdmin && userWithAdmin.email) {
    const adminEmails = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim()) || [];
    (userWithAdmin as any).is_admin = adminEmails.includes(userWithAdmin.email);
  }
  
  let subscriptionPlan = 'FREE';

  try {
    const { getUserSubscriptionPlan } = await import('@/services/user-subscription');
    subscriptionPlan = await getUserSubscriptionPlan(user_uuid);
  } catch (e) {
    console.error('getUserInfoWithTier: failed to load subscription plan', e);
  }
  let subscriptionStatus = '';

  if (user && (user as any).subscription_status) {
    subscriptionStatus = String((user as any).subscription_status).toLowerCase();
  }

  if (!subscriptionStatus) {
    const { getUserTier } = await import('@/services/user-tier');
    subscriptionStatus = (await getUserTier(user_uuid)).toLowerCase();
  }

  if (!subscriptionStatus) {
    subscriptionStatus = 'free';
  }

  return { user: userWithAdmin, userTier: subscriptionStatus, subscriptionPlan };
}
