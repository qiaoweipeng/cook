/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** @sohumsuthar/liquid-glass 没有自带 .d.ts，补一个最基础的声明让 TS 不报 */
declare module '@sohumsuthar/liquid-glass' {
  import { ReactNode, CSSProperties } from 'react';
  export function LiquidGlass(props: {
    macro?: boolean;
    variant?: 'clear' | 'regular';
    dimmed?: boolean;
    interactive?: boolean;
    lens?: boolean;
    lensOptions?: { bezel?: number; refraction?: number; dispersion?: number; radius?: number };
    mobileFlat?: boolean;
    className?: string;
    style?: CSSProperties;
    contentClassName?: string;
    contentStyle?: CSSProperties;
    children?: ReactNode;
    [key: string]: unknown;
  }): JSX.Element;
  export function useLiquidLens<T extends { current: HTMLElement | null }>(
    ref: T,
    options?: { bezel?: number; refraction?: number; dispersion?: number; radius?: number }
  ): { filter: string; svg: ReactNode };
}

/** 构建时的 git 短提交号（vite.config.ts 里注入） */
declare const __APP_COMMIT__: string;
/** 该次提交的时间：YYYY-MM-DD HH:mm（取不到时为空串） */
declare const __APP_COMMIT_TIME__: string;
/** 打包时间（ISO） */
declare const __APP_BUILD_TIME__: string;
