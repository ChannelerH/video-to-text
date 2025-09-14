// Simple per-tier semaphore with FIFO queue (in-memory)
type Release = () => void;

class Semaphore {
  private capacity: number;
  private current = 0;
  private queue: Array<(value: Release) => void> = [];

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
  }

  acquire(): Promise<Release> {
    return new Promise<Release>((resolve) => {
      const tryAcquire = () => {
        if (this.current < this.capacity) {
          this.current++;
          const release = () => {
            this.current = Math.max(0, this.current - 1);
            const next = this.queue.shift();
            if (next) next(release);
          };
          resolve(release);
        } else {
          this.queue.push(resolve);
        }
      };
      tryAcquire();
    });
  }
}

// Global manager per runtime
const semaphores: Record<string, Semaphore> = Object.create(null);

function getCapacityForTier(tier: string): number {
  switch (tier) {
    case 'pro':
      return Number(process.env.Q_CAP_PRO || 4);
    case 'basic':
      return Number(process.env.Q_CAP_BASIC || 2);
    case 'free':
    default:
      return Number(process.env.Q_CAP_FREE || 1);
  }
}

export async function acquireTierSlot(tier: string): Promise<Release> {
  const key = `tier:${tier}`;
  if (!semaphores[key]) {
    semaphores[key] = new Semaphore(getCapacityForTier(tier));
  }
  return semaphores[key].acquire();
}

