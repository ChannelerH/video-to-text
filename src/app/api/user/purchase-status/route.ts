import { getUserUuid } from "@/services/user";
import { getActiveOrdersByUserUuid } from "@/models/order";
import { findUserByUuid } from "@/models/user";
import { respData, respErr } from "@/lib/resp";

export async function GET() {
  try {
    const user_uuid = await getUserUuid();
    
    if (!user_uuid) {
      return respData({
        hasPurchased: false,
        subscription: null,
        minutesPurchased: 0,
        hasActiveOrders: false,
      });
    }

    // Check for active orders
    const activeOrders = await getActiveOrdersByUserUuid(user_uuid);
    const hasActiveOrders = activeOrders && activeOrders.length > 0;

    // Get user details
    const user = await findUserByUuid(user_uuid);
    
    if (!user) {
      return respData({
        hasPurchased: false,
        subscription: null,
        minutesPurchased: 0,
        hasActiveOrders,
      });
    }

    // Determine subscription status from active orders
    let subscription = null;
    let minutesPurchased = 0;

    if (hasActiveOrders) {
      // Check for subscription orders (monthly or yearly)
      const subscriptionOrder = activeOrders.find(
        order => order.interval === 'month' || order.interval === 'year'
      );
      
      if (subscriptionOrder) {
        // Determine subscription tier from product_id or product_name
        const productId = subscriptionOrder.product_id?.toLowerCase() || '';
        const productName = subscriptionOrder.product_name?.toLowerCase() || '';
        
        if (productId.includes('pro') || productName.includes('pro')) {
          subscription = 'pro';
        } else if (productId.includes('basic') || productName.includes('basic')) {
          subscription = 'basic';
        }
      }

      // Calculate total minutes purchased from one-time orders
      const minuteOrders = activeOrders.filter(
        order => order.order_type === 'minute_pack' || order.interval === 'one-time'
      );
      
      minutesPurchased = minuteOrders.reduce((total, order) => {
        return total + (order.credits || 0);
      }, 0);
    }

    // Check user's stored minutes/subscription as well
    if (user.minutes_balance && user.minutes_balance > 0) {
      minutesPurchased = Math.max(minutesPurchased, user.minutes_balance);
    }

    const hasPurchased = hasActiveOrders || minutesPurchased > 0 || subscription !== null;

    return respData({
      hasPurchased,
      subscription,
      minutesPurchased,
      hasActiveOrders,
    });
  } catch (error) {
    console.error('Error fetching purchase status:', error);
    return respErr('Failed to fetch purchase status');
  }
}