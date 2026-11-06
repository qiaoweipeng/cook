/**
 * 食材批量传图 —— 左点食材 / 右点图片，一配对就完成。
 *
 * 用户图片文件名全乱的，没法自动按文件名匹配。所以最简单的办法就是人眼看：
 *   左边列着食材名（空图占位），右边是图片缩略图网格
 *   点左边「土豆」→ 点右边那张土豆图 → 自动配对 + 跳到下一个未配对的
 *   配完点「开始上传」：批量压缩转 WebP → 上传 COS → 写回食材 image 字段
 *
 * 为什么压缩 / 转码 / 上传在前端做：
 *   1. 复用现有 pickImage / compressImage 链路，参数一致（最长边 1000px、WebP quality 0.82）
 *   2. COS 直传已经有临时签名，不需要中转后端
 *   3. 300 张一起传大概 1-2 分钟，用户能看到进度条
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal, Progress, Empty, Typography, Upload, List, Card, Image, Tag, theme, App as AntApp } from 'antd';
import type { UploadFile } from 'antd';
import { InboxOutlined, PictureOutlined, CheckCircleFilled } from '@ant-design/icons';
import JSZip from 'jszip';
import type { Ingredient } from '@/types';
import { validateImageFile, compressImage } from '@/lib/imageUpload';
import { uploadImage } from '@/lib/imageStorage';
import { useIngredientStore } from '@/store/useIngredientStore';

const { Dragger } = Upload;

/** 允许的图片 MIME —— 跟单图上传保持一致 */
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
/** zip 里的图片扩展名 */
const ZIP_IMG_EXT = /\.(jpe?g|png|webp)$/i;
/** 文件夹选择框的额外属性（TS 的 InputHTMLAttributes 没声明 webkitdirectory） */
const DIR_INPUT_PROPS = {
  webkitdirectory: '',
  directory: '',
} as unknown as React.InputHTMLAttributes<HTMLInputElement>;

interface LoadedImage {
  /** 用户给的原始文件名（去 zip 里的路径前缀） */
  name: string;
  /** 浏览器里显示缩略图用的 objectURL */
  url: string;
  /** 原始 File（拖文件夹上传时），或 zip 解压后的 Blob */
  file?: File;
  blob?: Blob;
  blobType?: string;
}

interface Pair {
  ingredient: Ingredient;
  /** null = 还没配对 */
  image: LoadedImage | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 全部上传成功时回调（用来让父组件刷新列表） */
  onAllSuccess?: () => void;
}

/** 从 zip 里提取所有静态图片 File */
async function extractImagesFromZip(file: File): Promise<LoadedImage[]> {
  const zip = await JSZip.loadAsync(file);
  const out: LoadedImage[] = [];
  // 同时保留原始扩展名（zip 里的 blob 没有 type，要靠文件名判断 MIME）
  const mimeByExt: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !ZIP_IMG_EXT.test(path)) continue;
    const blob = await entry.async('blob');
    const name = path.split('/').pop() ?? path;
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    out.push({
      name,
      url: URL.createObjectURL(blob),
      blob,
      blobType: mimeByExt[ext] ?? 'image/jpeg',
    });
  }
  return out;
}

/** 从文件夹拖入的 FileList 里挑出图片 */
function extractImagesFromFiles(files: File[]): LoadedImage[] {
  const out: LoadedImage[] = [];
  for (const f of files) {
    if (!ALLOWED.includes(f.type)) continue;
    out.push({ name: f.name, url: URL.createObjectURL(f), file: f });
  }
  return out;
}

export default function BulkImagePairer({ open, onClose, onAllSuccess }: Props) {
  const { items, update } = useIngredientStore();
  const { message } = AntApp.useApp();
  const { token } = theme.useToken();

  /** 所有还没图片的食材 —— 只有这些需要配对 */
  const pendingIngredients = useMemo(
    () => items.filter((it) => !it.image || it.image.startsWith('/seeds/')),
    [items]
  );

  const [images, setImages] = useState<LoadedImage[]>([]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [selectedIngIdx, setSelectedIngIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // 选整个文件夹的隐藏 input（antd Dragger 不直接支持 webkitdirectory）
  const dirInputRef = useRef<HTMLInputElement>(null);

  /** 每次重新打开时重置状态 */
  useEffect(() => {
    if (!open) return;
    setImages([]);
    setPairs(pendingIngredients.map((ing) => ({ ingredient: ing, image: null })));
    setSelectedIngIdx(0);
    setUploading(false);
    setProgress({ done: 0, total: 0 });
    return () => {
      // 释放 objectURL，避免内存泄漏
      images.forEach((im) => URL.revokeObjectURL(im.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** 拖入 zip 或文件夹 —— 解压/遍历后统一塞进 images */
  async function handleFiles(fileList: File[]) {
    if (!fileList || fileList.length === 0) return;
    let loaded: LoadedImage[] = [];
    const zipFile = fileList.find((f) => /\.zip$/i.test(f.name));
    if (zipFile) {
      try {
        loaded = await extractImagesFromZip(zipFile);
      } catch (e) {
        message.error('zip 解压失败：' + (e instanceof Error ? e.message : String(e)));
        return;
      }
      if (loaded.length === 0) {
        message.warning('zip 里没找到 JPG / PNG / WebP 图片');
        return;
      }
    } else {
      loaded = extractImagesFromFiles(fileList);
      if (loaded.length === 0) {
        message.warning('文件夹里没找到 JPG / PNG / WebP 静态图片');
        return;
      }
    }
    // 去重（同一个文件可能被拖进来两次）
    const seen = new Set<string>();
    loaded = loaded.filter((im) => {
      if (seen.has(im.name + ':' + (im.file?.size ?? im.blob?.size ?? 0))) return false;
      seen.add(im.name + ':' + (im.file?.size ?? im.blob?.size ?? 0));
      return true;
    });
    setImages((prev) => {
      // 释放旧的 objectURL
      prev.forEach((im) => URL.revokeObjectURL(im.url));
      return loaded;
    });
    message.success(`载入 ${loaded.length} 张图片`);
  }

  /** 点右边某张图片 —— 跟当前选中的食材配对，然后自动跳下一个未配对的 */
  function handlePickImage(img: LoadedImage) {
    if (selectedIngIdx >= pairs.length) return;
    // 如果这张图已经被其他食材占了，先释放
    const prevPairIdx = pairs.findIndex((p) => p.image === img);
    const nextPairs = pairs.map((p, i) => {
      if (i === selectedIngIdx) return { ...p, image: img };
      if (i === prevPairIdx) return { ...p, image: null };
      return p;
    });
    setPairs(nextPairs);
    // 跳下一个还没配对的
    const nextIdx = nextPairs.findIndex((p, i) => i > selectedIngIdx && !p.image);
    if (nextIdx >= 0) setSelectedIngIdx(nextIdx);
    else {
      // 后面的都配完了，回到最前面还没配的
      const wrap = nextPairs.findIndex((p) => !p.image);
      if (wrap >= 0) setSelectedIngIdx(wrap);
    }
  }

  /** 撤销当前配对 —— 把当前食材配对图清掉，方便重新选 */
  function unpickCurrent() {
    if (selectedIngIdx >= pairs.length) return;
    setPairs(pairs.map((p, i) => (i === selectedIngIdx ? { ...p, image: null } : p)));
  }

  async function handleUpload() {
    const toUpload = pairs.filter((p) => p.image);
    if (toUpload.length === 0) {
      message.warning('还没配对任何图片');
      return;
    }
    setUploading(true);
    setProgress({ done: 0, total: toUpload.length });

    let done = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const pair of toUpload) {
      try {
        const img = pair.image!; // toUpload 已过滤 image !== null
        // 转成标准 File 再走 compressImage —— blob 没有 File 类，需要包一层
        const imgFile = img.file ?? new File([img.blob!], img.name, {
          type: img.blobType ?? 'image/jpeg',
        });
        const invalid = await validateImageFile(imgFile);
        if (invalid) throw new Error(invalid);
        const { blob, ext } = await compressImage(imgFile);
        const key = `ingredients/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        await uploadImage(key, blob, blob.type || `image/${ext}`);
        // throwOnError=true：云端写失败要抛出来，不能静默吞——否则用户以为成功了，
        // 刷新后从云端拉数据 image 字段还是空的，等于白传
        await update(pair.ingredient.id, { image: key }, true);
      } catch (e) {
        failed++;
        errors.push(`${pair.ingredient.name}: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`);
      }
      done++;
      setProgress({ done, total: toUpload.length });
    }

    setUploading(false);
    if (failed === 0) {
      message.success(`全部 ${done} 张上传完成`);
      // 全部成功：关掉弹窗 + 让父组件刷新列表看到新图
      onAllSuccess?.();
      onClose();
      return;
    }
    Modal.warning({
      title: `上传完成，${failed} 张失败`,
      width: 520,
      content: (
        <div style={{ maxHeight: 300, overflow: 'auto', fontSize: 13 }}>
          {errors.map((e, i) => (
            <div key={i} style={{ marginBottom: 4, color: token.colorErrorText }}>
              · {e}
            </div>
          ))}
        </div>
      ),
    });
  }

  /** 当前选中的那个食材 —— 用来在左边高亮 + 显示它已配对的图片 */
  const current = pairs[selectedIngIdx];
  const pairedCount = pairs.filter((p) => p.image).length;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="批量上传食材图片"
      width={1080}
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button
          key="upload"
          type="primary"
          disabled={pairedCount === 0 || uploading}
          loading={uploading}
          onClick={handleUpload}
        >
          {uploading
            ? `上传中 ${progress.done}/${progress.total}`
            : `开始上传（${pairedCount} 张已配对）`}
        </Button>,
      ]}
    >
      <div style={{ display: 'flex', gap: 16, height: 560 }}>
        {/* ========== 左：食材列表（antd List） ========== */}
        <div
          style={{
            width: 240,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: token.borderRadiusLG,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '10px 16px',
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorFillAlter,
              fontWeight: 600,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>待配对食材</span>
            <Tag color={pairedCount === pairs.length && pairs.length > 0 ? 'success' : 'blue'}>
              {pairs.length - pairedCount} / {pairs.length}
            </Tag>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {pairs.length === 0 ? (
              <Empty description="所有食材都已有图片" style={{ marginTop: 40 }} />
            ) : (
              <List
                dataSource={pairs}
                renderItem={(p, idx) => {
                  const isSelected = idx === selectedIngIdx;
                  return (
                    <List.Item
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        background: isSelected ? token.colorPrimaryBg : 'transparent',
                        borderLeft: isSelected ? `3px solid ${token.colorPrimary}` : '3px solid transparent',
                      }}
                      onClick={() => setSelectedIngIdx(idx)}
                    >
                      <List.Item.Meta
                        avatar={
                          p.image ? (
                            <Image
                              width={36}
                              height={36}
                              src={p.image.url}
                              style={{ borderRadius: token.borderRadiusSM, objectFit: 'cover' }}
                              preview={false}
                            />
                          ) : (
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: token.borderRadiusSM,
                                background: token.colorFillTertiary,
                                border: `1px dashed ${token.colorBorder}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: token.colorTextTertiary,
                              }}
                            >
                              <PictureOutlined />
                            </div>
                          )
                        }
                        title={
                          <Typography.Text
                            ellipsis
                            style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400 }}
                          >
                            {p.ingredient.name}
                          </Typography.Text>
                        }
                        description={
                          p.image ? (
                            <span style={{ fontSize: 11, color: token.colorSuccess }}>
                              <CheckCircleFilled /> 已配对
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: token.colorTextSecondary }}>
                              待选图
                            </span>
                          )
                        }
                      />
                    </List.Item>
                  );
                }}
              />
            )}
          </div>
        </div>

        {/* ========== 中：当前选中（antd Card） ========== */}
        {current ? (
          <Card
            size="small"
            title="当前选中"
            style={{ width: 200, flexShrink: 0 }}
            styles={{ body: { padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 } }}
          >
            <Image
              width={140}
              height={140}
              src={current.image?.url}
              style={{ borderRadius: token.borderRadiusLG, objectFit: 'cover' }}
              fallback="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><rect fill='%23fafafa' width='140' height='140'/><text x='50%25' y='50%25' fill='%23bfbfbf' text-anchor='middle' dy='.3em'>暂无图片</text></svg>"
            />
            <Typography.Text strong style={{ fontSize: 15, textAlign: 'center' }}>
              {current.ingredient.name}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              ID: {current.ingredient.id.slice(0, 20)}
            </Typography.Text>
            {current.image && (
              <Button size="small" onClick={unpickCurrent}>
                取消配对
              </Button>
            )}
          </Card>
        ) : (
          <Card size="small" style={{ width: 200, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description="没有待配对的食材" />
          </Card>
        )}

        {/* ========== 右：图片网格（antd Image.PreviewGroup + Dragger） ========== */}
        <Card
          size="small"
          title="图片库"
          extra={<Tag>{images.length} 张</Tag>}
          style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}
          styles={{ body: { flex: 1, overflow: 'hidden', padding: 8, display: 'flex', flexDirection: 'column' } }}
        >
          <div style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
            {images.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Dragger
                  showUploadList={false}
                  multiple
                  beforeUpload={() => false}
                  accept=".jpg,.jpeg,.png,.webp,.zip"
                  onChange={(info) => {
                    const raws: File[] = [];
                    const all: UploadFile[] = info.fileList ?? [];
                    for (const u of all) {
                      if (u.originFileObj instanceof File) raws.push(u.originFileObj);
                    }
                    if (raws.length > 0) void handleFiles(raws);
                  }}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">把图片文件夹拖进来，或者点这里选文件 / zip</p>
                  <p className="ant-upload-hint" style={{ fontSize: 12, color: token.colorTextTertiary }}>
                    支持 JPG / PNG / WebP；zip 会自动解压；文件名乱的没关系，你眼睛认
                  </p>
                  <Button
                    size="small"
                    type="link"
                    style={{ marginTop: 4 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      dirInputRef.current?.click();
                    }}
                  >
                    选择文件夹
                  </Button>
                </Dragger>
              </div>
            ) : (
              <Image.PreviewGroup>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
                    gap: 8,
                  }}
                >
                  {images.map((im, i) => {
                    const owner = pairs.find((p) => p.image === im);
                    const isCurrentOwner = owner && current && owner.ingredient.id === current.ingredient.id;
                    return (
                      <div
                        key={i}
                        onClick={() => handlePickImage(im)}
                        title={`${im.name}${owner ? ` · 已配给 ${owner.ingredient.name}` : ''}`}
                        style={{
                          position: 'relative',
                          width: '100%',
                          aspectRatio: '1',
                          border: isCurrentOwner
                            ? `2px solid ${token.colorPrimary}`
                            : owner
                              ? `2px solid ${token.colorSuccess}`
                              : `1px solid ${token.colorBorderSecondary}`,
                          borderRadius: token.borderRadiusSM,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          transition: 'transform 0.15s',
                        }}
                      >
                        <Image
                          width="100%"
                          height="100%"
                          src={im.url}
                          preview={owner ? true : false}
                          style={{ objectFit: 'cover' }}
                        />
                        {owner && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              background: 'linear-gradient(transparent, rgba(0,0,0,0.65))',
                              color: '#fff',
                              fontSize: 10,
                              padding: '3px 6px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            <CheckCircleFilled /> {owner.ingredient.name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Image.PreviewGroup>
            )}
          </div>
          {/* 选整个文件夹：webkitdirectory 会把文件夹里所有文件都列出来 */}
          <input
            ref={dirInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            {...DIR_INPUT_PROPS}
            onChange={(e) => {
              const raws = Array.from(e.target.files ?? []);
              if (raws.length > 0) void handleFiles(raws);
              e.target.value = '';
            }}
          />
        </Card>
      </div>

      {uploading && (
        <div style={{ marginTop: 12 }}>
          <Progress
            percent={progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}
            size="small"
          />
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 12, color: token.colorTextTertiary }}>
        上传时会自动压缩（最长边 1000px、转 WebP）再存 COS，跟单图上传走同一套参数。
      </div>
    </Modal>
  );
}
