'use client';

import type { MixpanelEventProperties } from '@/types/mixpanel';

declare global {
  interface Window {
    mixpanel?: {
      track: (event: string, properties?: Record<string, any>) => void;
      identify: (id: string) => void;
      people?: {
        set: (properties: Record<string, any>) => void;
      };
      register?: (properties: Record<string, any>) => void;
      reset?: () => void;
    };
  }
}

const hasMixpanel = () => typeof window !== 'undefined' && !!window.mixpanel;

type PendingEvent = { event: string; properties?: MixpanelEventProperties };
type PendingIdentify = { id: string; traits?: Record<string, any> };

const pendingEvents: PendingEvent[] = [];
const pendingIdentities: PendingIdentify[] = [];
const pendingSuperProperties: Record<string, any>[] = [];
const pendingPageViews: string[] = [];

let flushInterval: number | null = null;

function scheduleFlush() {
  if (typeof window === 'undefined') return;
  if (flushInterval !== null) return;

  flushInterval = window.setInterval(() => {
    if (!hasMixpanel()) {
      return;
    }

    flushQueues();
    if (flushInterval !== null) {
      window.clearInterval(flushInterval);
      flushInterval = null;
    }
  }, 500);
}

function flushQueues() {
  if (!hasMixpanel()) return;

  while (pendingSuperProperties.length) {
    const props = pendingSuperProperties.shift();
    if (props && window.mixpanel!.register) {
      window.mixpanel!.register(props);
    }
  }

  while (pendingIdentities.length) {
    const { id, traits } = pendingIdentities.shift()!;
    if (!id) continue;
    window.mixpanel!.identify(id);
    if (traits && window.mixpanel!.people?.set) {
      window.mixpanel!.people.set(traits);
    }
  }

  while (pendingEvents.length) {
    const { event, properties } = pendingEvents.shift()!;
    window.mixpanel!.track(event, properties);
  }

  while (pendingPageViews.length) {
    const page = pendingPageViews.shift()!;
    window.mixpanel!.track('Page View', { page });
  }
}

export function trackMixpanelEvent(event: string, properties?: MixpanelEventProperties) {
  if (!event) return;
  if (hasMixpanel()) {
    window.mixpanel!.track(event, properties);
  } else {
    pendingEvents.push({ event, properties });
    scheduleFlush();
  }
}

export function identifyMixpanelUser(distinctId: string, traits?: Record<string, any>) {
  if (!distinctId) return;
  if (hasMixpanel()) {
    window.mixpanel!.identify(distinctId);
    if (traits && window.mixpanel!.people?.set) {
      window.mixpanel!.people.set(traits);
    }
  } else {
    pendingIdentities.push({ id: distinctId, traits });
    scheduleFlush();
  }
}

export function registerMixpanelSuperProperties(properties: Record<string, any>) {
  if (!properties || Object.keys(properties).length === 0) return;
  if (hasMixpanel() && window.mixpanel!.register) {
    window.mixpanel!.register(properties);
  } else {
    pendingSuperProperties.push(properties);
    scheduleFlush();
  }
}

export function resetMixpanel() {
  if (!hasMixpanel() || !window.mixpanel!.reset) return;
  window.mixpanel!.reset();
}

export function trackMixpanelPageView(url: string) {
  if (!url) return;
  if (hasMixpanel()) {
    window.mixpanel!.track('Page View', { page: url });
  } else {
    pendingPageViews.push(url);
    scheduleFlush();
  }
}
