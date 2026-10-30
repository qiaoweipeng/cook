/**
 * 菜系（category）—— 一道菜必须且只能属于其中一个，1 对 1。
 * 只按「地域流派」分：能明确归属就归流派，归不进去就是家常，实在没地方放才用其他兜底。
 * 形态/做法/属性（汤羹、凉菜、烘焙、减脂、快手…）全部用 Dish.tags 表达。
 */
export type DishCategory = '川菜' | '粤菜' | '湘菜' | '鲁菜' | '江浙' | '家常' | '其他';

/**
 * 内置标签（供编辑器下拉选择，用户也可以自由输入新的）。
 * 首页属性筛选 chips（ATTRIBUTE_TAGS）是这里的一个子集 —— 内置标签可以多放，
 * 但 chips 不能太多否则 Tab 下面一排排不下。
 *
 * 分类规则：一道菜最少 1 个标签，最多 5 个；自由输入不受此清单限制。
 */
export const BUILTIN_TAGS = [
  // 形态
  '汤羹', '凉菜', '烘焙', '主食',
  // 做法
  '快手', '焖炖', '小炒', '清蒸', '红烧', '油炸', '凉拌',
  // 属性
  '减脂', '高蛋白', '高纤维', '低碳水',
  // 口味
  '清淡', '重口', '下饭', '开胃', '辛辣', '酸甜',
  // 场合
  '宴客', '家常便饭',
  // 其他
  '素食', '新手', '一锅出', '颜值菜',
] as const;

/** 首页属性筛选 chips —— 从 BUILTIN_TAGS 挑最常用的一批 */
export const ATTRIBUTE_FILTER_TAGS = [
  '减脂', '快手', '下饭', '清淡', '重口', '素食', '宴客', '汤羹', '凉菜', '烘焙',
] as const;

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
  unit: string;
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

/** 计价单位：固体用斤 / g / kg，液体用 ml / L */
export type IngredientUnit = '斤' | 'g' | 'kg' | 'ml' | 'L';

/**
 * 某个平台的价格记录。
 * 用户只记「这一份花了多少钱 + 这一份有多重/多少容量」，
 * 系统再折算成统一的「元/斤」或「元/L」用于比价。
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
