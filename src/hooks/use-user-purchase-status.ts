'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

interface UserPurchaseStatus {
  hasPurchased: boolean;
  subscription: string | null;
  minutesPurchased: number;
  isLoading: boolean;
}

export function useUserPurchaseStatus(): UserPurchaseStatus {
  const { data: session, status } = useSession();
  const [purchaseStatus, setPurchaseStatus] = useState<UserPurchaseStatus>({
    hasPurchased: false,
    subscription: null,
    minutesPurchased: 0,
    isLoading: true,
  });

  useEffect(() => {
    async function fetchPurchaseStatus() {
      // Still loading session
      if (status === 'loading') {
        return;
      }

      // No user logged in
      if (!session || !session.user) {
        setPurchaseStatus({
          hasPurchased: false,
          subscription: null,
          minutesPurchased: 0,
          isLoading: false,
        });
        return;
      }

      try {
        // Fetch user's purchase status from API
        const response = await fetch('/api/user/purchase-status', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          
          // Determine if user has purchased anything
          const hasPurchased = 
            data.data?.hasPurchased === true ||
            data.data?.minutesPurchased > 0 || 
            data.data?.subscription !== null ||
            data.data?.hasActiveOrders === true;

          setPurchaseStatus({
            hasPurchased,
            subscription: data.data?.subscription || null,
            minutesPurchased: data.data?.minutesPurchased || 0,
            isLoading: false,
          });
        } else {
          // If API fails, assume no purchases
          setPurchaseStatus({
            hasPurchased: false,
            subscription: null,
            minutesPurchased: 0,
            isLoading: false,
          });
        }
      } catch (error) {
        console.error('Failed to fetch purchase status:', error);
        
        // On error, assume no purchases
        setPurchaseStatus({
          hasPurchased: false,
          subscription: null,
          minutesPurchased: 0,
          isLoading: false,
        });
      }
    }

    fetchPurchaseStatus();
  }, [session, status]);

  return purchaseStatus;
}