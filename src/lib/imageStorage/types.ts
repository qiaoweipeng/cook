// 图片存储适配器接口。
//
// 设计目标：业务代码只认「相对 key」，不认任何一家云厂商的 URL 结构。
// 换存储平台 = 新增一个实现这个接口的文件 + 在 index.ts 注册 + 改环境变量，
// 上传、删除、渲染、缓存这四条链路都不用动。
//
// 约束（改代码前先读）：
//   1. 数据库只存 key（如 `dishes/xxx.webp`），绝不存完整 URL；
//   2. 密钥绝不进前端（不能用 VITE_ 前缀），上传签名/中转必须放服务端；
//   3. 上传和删除用的 key 必须一致，否则会产生孤儿文件；
//   4. 新增平台必须同时登记到 domains.ts，否则 SW 不会缓存它的图片。

/** 图片分类目录，直接作为 key 的第一段 */
export type ImageFolder = 'dishes' | 'ingredients' | 'seeds';

export interface ImageStorageProvider {
  /** 适配器标识，和环境变量 VITE_IMAGE_PROVIDER 对应 */
  readonly id: string;

  /** 当前环境是否具备使用条件（缺 URL / 缺公钥时为 false） */
  isEnabled(): boolean;

  /** 上传（同名覆盖），失败必须抛出可读错误，禁止静默降级 */
  upload(key: string, body: Blob, contentType: string): Promise<void>;

  /** 删除；对象不存在时应视为成功（幂等） */
  remove(key: string): Promise<void>;

  /** key → 浏览器可直接访问的完整 URL */
  publicUrl(key: string): string;

  /**
   * 从「本平台的历史完整 URL」或「相对 key」解析出 key。
   * 解析不了（比如其他平台的外链）返回 null，由调用方决定怎么处理。
   */
  parseKey(value: string): string | null;
}
