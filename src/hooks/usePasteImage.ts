import { useEffect, useRef } from 'react';

/**
 * 从剪贴板事件里取出图片文件。
 *
 * 三种来源都要覆盖：
 *  - 截图工具（Snipaste / 微信截图 / macOS ⌘⇧4）→ clipboardData.items 里是 image/png
 *  - 网页上右键「复制图片」→ 同上，image/png 或 image/jpeg
 *  - 在文件管理器里复制了图片文件 → clipboardData.files 里才有，items 可能是空
 *
 * 所以先扫 items，再兜底扫 files，两处都只认 image/*。
 */
export function getImageFilesFromClipboard(e: ClipboardEvent): File[] {
  const dt = e.clipboardData;
  if (!dt) return [];

  const files: File[] = [];

  if (dt.items) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  }

  // 兜底：某些浏览器把「复制的文件」只放进 files，items 里看不到
  if (files.length === 0 && dt.files) {
    for (const file of Array.from(dt.files)) {
      if (file.type.startsWith('image/')) files.push(file);
    }
  }

  return files;
}

/**
 * 在 enabled 为 true 期间监听全局粘贴，粘到图片就交给 onFile 处理。
 *
 * 典型的用法是「编辑器弹框打开时才监听」，关掉就解除，避免在别的页面误触发。
 * onFile 用 ref 保存，调用方不需要 useCallback 包裹，effect 也不会反复重绑。
 */
export function usePasteImage(
  enabled: boolean,
  onFile: (file: File) => void
) {
  const handlerRef = useRef(onFile);
  handlerRef.current = onFile;

  useEffect(() => {
    if (!enabled) return;

    const handlePaste = (e: ClipboardEvent) => {
      const files = getImageFilesFromClipboard(e);
      if (files.length === 0) return;

      // 剪贴板里确实是图片：拦住默认粘贴，否则会把图片当成内容塞进当前输入框
      e.preventDefault();
      handlerRef.current(files[0]);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [enabled]);
}
