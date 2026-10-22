import type { ThemeConfig } from 'antd';

export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#E8743C',
    colorInfo: '#E8743C',
    colorSuccess: '#7BB661',
    colorWarning: '#F0AD4E',
    borderRadius: 12,
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
    colorBgLayout: '#FFFFFF',
    colorTextHeading: '#2D2A26',
  },
  components: {
    Card: {
      borderRadiusLG: 16,
      borderRadius: 16,
    },
    Layout: {
      headerBg: '#FFFFFF',
      bodyBg: '#FFFFFF',
      headerHeight: 64,
    },
    Menu: {
      itemActiveBg: '#FFF1E8',
      itemSelectedBg: '#FFF1E8',
      itemSelectedColor: '#E8743C',
    },
  },
};
