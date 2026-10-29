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

export interface Ingredient {
  id: string;
  name: string;
  category: IngredientCategory;
  /** 单价 (元)，与 unit 对应 */
  pricePerUnit: number;
  unit: string;
  spec?: string;
  note?: string;
  /** 当 unit 是「个 / 块 / 头」等散装单位时，1 个 = 多少克，用于跨单位换算 */
  unitGrams?: number;
  /** 当 unit 是「瓶 / 盒 / 袋」等液体调料时，1 瓶 = 多少毫升 */
  unitMl?: number;
  /** 食材图片：对象存储的 URL（对象存储不可用时可能是 dataURL） */
  image?: string;
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
