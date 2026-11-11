/**
 * 菜系（category）—— 一道菜必须且只能属于其中一个，1 对 1。
 * 只按「地域流派」分：能明确归属就归流派，归不进去就是家常，实在没地方放才用其他兜底。
 * 形态/做法/属性（汤羹、凉菜、烘焙、减脂、快手…）全部用 Dish.tags 表达。
 */
export type DishCategory = '川菜' | '粤菜' | '湘菜' | '鲁菜' | '江浙' | '家常' | '其他';

/**
 * 固定标签分组 —— 一道菜只能从这 22 个标签里挑（1~5 个）。
 *
 * 分组的目的只是「展示时好找」，筛选逻辑不区分分组：
 * 首页「更多」面板和桌面端标签区都按这个分块显示。
 *
 *   口味风味：吃起来是什么味道
 *   营养健康：健康诉求 / 身体感受
 *   做法形态：烹饪方式或成菜形态
 *   场景节奏：什么时候吃、和谁吃
 *   饮食偏好：饮食类型、宗教、地域
 *   品牌系列：店名或系列名
 */
export const TAG_GROUPS = [
  { name: '口味风味', tags: ['清淡', '重口', '辛辣', '酸甜'] },
  { name: '营养健康', tags: ['减脂', '高蛋白', '低碳水', '暖胃'] },
  { name: '做法形态', tags: ['红烧', '凉菜', '汤羹', '烘焙', '主食'] },
  { name: '场景节奏', tags: ['快手', '下饭', '下酒', '宴请'] },
  { name: '饮食偏好', tags: ['素食', '清真', '西餐', '陕味'] },
  { name: '品牌系列', tags: ['大碗先生'] },
] as const;

/** 全部固定标签（按分组展开，共 22 个） */
export const BUILTIN_TAGS = TAG_GROUPS.flatMap((g) => [...g.tags]);

/** 首页属性筛选 chips —— 与固定标签完全一致 */
export const ATTRIBUTE_FILTER_TAGS = BUILTIN_TAGS;

export type IngredientCategory =
  | '蔬菜'
  | '肉类'
  | '海鲜'
  | '调料'
  | '主食'
  | '蛋奶'
  | '水果'
  | '其他';

export interface DishIngredient {
  ingredientId: string;
  amount: number;
  unit: IngredientUnit;
}

export interface Step {
  order: number;
  text: string;
}

export interface Dish {
  id: string;
  name: string;
  /** 封面图地址（对象存储路径） */
  coverImage?: string;
  category: DishCategory;
  tags: string[];
  difficulty: 1 | 2 | 3;
  cookTimeMin: number;
  servings: number;
  ingredients: DishIngredient[];
  steps: Step[];
  tips?: string;
  favorite: boolean;
  createdAt: number;
}

/** 全站唯一计价单位：固体用 g / kg，液体用 ml / L，不再使用斤、公斤等写法 */
export type IngredientUnit = 'g' | 'kg' | 'ml' | 'L';

/**
 * 某个平台的价格记录。
 * 单位 = 这一份包装的计量单位（跟食材的 unit 一致），
 * 用户只记「这一整份花了多少钱 + 这一份有多重/多少容量」。
 */
export interface PlatformPrice {
  /** 这一份实际花了多少钱（元） */
  price: number;
  /** 这一份的重量 / 容量，单位与食材的 unit 一致；不填按 1 份算 */
  amount?: number;
}

/** 每 100g / 100ml 的营养成分；调料一般不填 */
export interface IngredientNutrition {
  /** 热量 kcal */
  calories: number;
  /** 蛋白质 g */
  protein: number;
  /** 脂肪 g */
  fat: number;
  /** 碳水 g */
  carbs: number;
  /** 钠 mg */
  sodium: number;
  /** 膳食纤维 g */
  fiber: number;
}

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  /** 计价单位，价格的「一份」按这个单位算 */
  unit: IngredientUnit;
  /** 各平台价格：key = 平台名（盒马NB / 小象超市 / …），后面加平台不用改表结构 */
  prices: Record<string, PlatformPrice>;
  /** 备注，比如「这一瓶 1 升」 */
  note?: string;
  /** 每 100g / 100ml 的营养 */
  nutrition?: IngredientNutrition;
  /** 食材图片：对象存储的 URL（对象存储不可用时可能是 dataURL） */
  image?: string;
  /** 仅内存标记：这条是从老数据（price_per_unit）自动兼容出来的，下次 load 会用新种子覆盖 */
  legacy?: boolean;
}

/** 8 个食材分类各一种颜色，表格 / 详情里一眼区分 */
export const CATEGORY_COLOR: Record<IngredientCategory, string> = {
  蔬菜: 'green',
  肉类: 'red',
  海鲜: 'cyan',
  调料: 'orange',
  主食: 'gold',
  蛋奶: 'blue',
  水果: 'magenta',
  其他: 'purple',
};

export const NUTRI_FIELDS = [
  { key: 'calories', label: '热量', unit: 'kcal' },
  { key: 'protein', label: '蛋白质', unit: 'g' },
  { key: 'fat', label: '脂肪', unit: 'g' },
  { key: 'carbs', label: '碳水', unit: 'g' },
  { key: 'sodium', label: '钠', unit: 'mg' },
  { key: 'fiber', label: '膳食纤维', unit: 'g' },
] as const;

/** 菜单（今日/本周/本月共用）：日期 key（YYYY-MM-DD）→ 当天的菜品 id 列表 */
export type WeeklyPlans = Record<string, string[]>;

export interface MergedItem {
  ingredientId: string;
  ingredientName: string;
  amount: number;
  unit: string;
  unitPrice: number;
  totalCost: number;
}
