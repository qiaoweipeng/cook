import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { idbStorage } from '@/lib/persistStorage';
import { DEFAULT_PLATFORM, PRICE_PLATFORMS } from '@/utils/platforms';
import { setCurrentPlatform } from '@/utils/price';

interface PriceState {
  /** 当前按哪个平台的价格算成本 / 比价 */
  platform: string;
  /** 平台列表：预置 4 个，后面可以自己加 */
  platforms: string[];
  setPlatform: (platform: string) => void;
  addPlatform: (platform: string) => void;
}

export const usePriceStore = create<PriceState>()(
  persist(
    (set, get) => ({
      platform: DEFAULT_PLATFORM,
      platforms: [...PRICE_PLATFORMS],

      setPlatform: (platform) => {
        setCurrentPlatform(platform);
        set({ platform });
      },

      addPlatform: (platform) => {
        const name = platform.trim();
        if (!name) return;
        if (get().platforms.includes(name)) return;
        set((s) => ({ platforms: [...s.platforms, name] }));
      },
    }),
    {
      name: 'cook-price-platform',
      storage: idbStorage,
      // 缓存恢复完把当前平台同步给 price 模块，否则刷新后成本会退回默认平台
      onRehydrateStorage: () => (state) => {
        if (state?.platform) setCurrentPlatform(state.platform);
      },
    }
  )
);
