export type DishCategory =
  | '家常'
  | '川菜'
  | '粤菜'
  | '湘菜'
  | '鲁菜'
  | '快手'
  | '烘焙'
  | '汤羹'
  | '凉菜'
  | '减脂'
  | '江浙'
  | '其他';

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
