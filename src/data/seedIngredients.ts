import type { Ingredient } from '@/types';

export const seedIngredients: Ingredient[] = [
  // —— 蔬菜 ——
  { id: 'ing_tomato', name: '番茄', category: '蔬菜', pricePerUnit: 1.0, unit: '个', spec: '粉番茄，单个约 4 两', unitGrams: 200 },
  { id: 'ing_potato', name: '土豆', category: '蔬菜', pricePerUnit: 0.8, unit: '个', spec: '中等大小', unitGrams: 200 },
  { id: 'ing_cucumber', name: '黄瓜', category: '蔬菜', pricePerUnit: 1.5, unit: '根', unitGrams: 250 },
  { id: 'ing_cabbage', name: '白菜', category: '蔬菜', pricePerUnit: 2.0, unit: '斤' },
  { id: 'ing_green_veg', name: '青菜', category: '蔬菜', pricePerUnit: 1.0, unit: '把', spec: '约 400g / 把', unitGrams: 400 },
  { id: 'ing_pepper_green', name: '青椒', category: '蔬菜', pricePerUnit: 0.8, unit: '个', unitGrams: 80 },
  { id: 'ing_pepper_red', name: '红椒', category: '蔬菜', pricePerUnit: 1.0, unit: '个', unitGrams: 80 },
  { id: 'ing_onion', name: '洋葱', category: '蔬菜', pricePerUnit: 1.5, unit: '个', unitGrams: 200 },
  { id: 'ing_eggplant', name: '茄子', category: '蔬菜', pricePerUnit: 1.5, unit: '个', unitGrams: 250 },
  { id: 'ing_mushroom', name: '蘑菇', category: '蔬菜', pricePerUnit: 8.0, unit: '斤' },
  { id: 'ing_lettuce', name: '生菜', category: '蔬菜', pricePerUnit: 1.5, unit: '个', unitGrams: 350 },

  // —— 肉类 ——
  { id: 'ing_pork_belly', name: '五花肉', category: '肉类', pricePerUnit: 22.0, unit: '斤' },
  { id: 'ing_pork_tenderloin', name: '里脊', category: '肉类', pricePerUnit: 25.0, unit: '斤' },
  { id: 'ing_pork_ribs', name: '排骨', category: '肉类', pricePerUnit: 28.0, unit: '斤' },
  { id: 'ing_chicken_leg', name: '鸡腿肉', category: '肉类', pricePerUnit: 15.0, unit: '斤' },
  { id: 'ing_beef', name: '牛肉', category: '肉类', pricePerUnit: 45.0, unit: '斤' },

  // —— 海鲜 ——
  { id: 'ing_shrimp', name: '虾', category: '海鲜', pricePerUnit: 35.0, unit: '斤' },
  { id: 'ing_sea_bass', name: '鲈鱼', category: '海鲜', pricePerUnit: 18.0, unit: '斤' },

  // —— 蛋奶 ——
  { id: 'ing_egg', name: '鸡蛋', category: '蛋奶', pricePerUnit: 1.2, unit: '个', spec: '红壳普通蛋', unitGrams: 60 },

  // —— 主食 ——
  { id: 'ing_rice', name: '大米', category: '主食', pricePerUnit: 3.0, unit: '斤' },
  { id: 'ing_noodle', name: '面条', category: '主食', pricePerUnit: 4.0, unit: '把', spec: '500g / 把', unitGrams: 500 },
  { id: 'ing_tofu', name: '豆腐', category: '主食', pricePerUnit: 3.0, unit: '斤' },

  // —— 调料 ——
  { id: 'ing_garlic', name: '大蒜', category: '调料', pricePerUnit: 2.0, unit: '头', unitGrams: 50 },
  { id: 'ing_ginger', name: '生姜', category: '调料', pricePerUnit: 1.0, unit: '块', unitGrams: 50 },
  { id: 'ing_scallion', name: '香葱', category: '调料', pricePerUnit: 5.0, unit: '把', unitGrams: 100 },
  { id: 'ing_soy_sauce', name: '生抽', category: '调料', pricePerUnit: 8.0, unit: '瓶', spec: '500ml / 瓶', unitMl: 500 },
  { id: 'ing_dark_soy', name: '老抽', category: '调料', pricePerUnit: 9.0, unit: '瓶', spec: '500ml / 瓶', unitMl: 500 },
  { id: 'ing_oyster_sauce', name: '蚝油', category: '调料', pricePerUnit: 10.0, unit: '瓶', spec: '700g / 瓶', unitGrams: 700 },
  { id: 'ing_salt', name: '盐', category: '调料', pricePerUnit: 2.0, unit: '袋', spec: '500g / 袋', unitGrams: 500 },
  { id: 'ing_sugar', name: '糖', category: '调料', pricePerUnit: 5.0, unit: '袋', spec: '500g / 袋', unitGrams: 500 },
  { id: 'ing_vinegar', name: '醋', category: '调料', pricePerUnit: 6.0, unit: '瓶', spec: '500ml / 瓶', unitMl: 500 },
  { id: 'ing_cooking_wine', name: '料酒', category: '调料', pricePerUnit: 8.0, unit: '瓶', spec: '500ml / 瓶', unitMl: 500 },
  { id: 'ing_doubanjiang', name: '豆瓣酱', category: '调料', pricePerUnit: 10.0, unit: '瓶', spec: '500g / 瓶', unitGrams: 500 },
  { id: 'ing_oil', name: '食用油', category: '调料', pricePerUnit: 15.0, unit: '瓶', spec: '1L / 瓶', unitMl: 1000 },

  // —— 增量补的常用食材 ——
  { id: 'ing_fish_head', name: '鱼头', category: '海鲜', pricePerUnit: 30.0, unit: '斤', spec: '胖头鱼鱼头' },
  { id: 'ing_chili_diced', name: '剁椒', category: '调料', pricePerUnit: 15.0, unit: '瓶', spec: '500g / 瓶，坛子剁椒', unitGrams: 500 },
  { id: 'ing_snow_pea', name: '荷兰豆', category: '蔬菜', pricePerUnit: 6.0, unit: '斤' },
  { id: 'ing_sausage', name: '腊肠', category: '肉类', pricePerUnit: 35.0, unit: '斤', spec: '广式甜口腊肠' },

  // —— 第三批：扩菜单时补充（41 个） ——
  // 肉/水产
  { id: 'ing_chicken_wing', name: '鸡翅', category: '肉类', pricePerUnit: 25.0, unit: '斤' },
  { id: 'ing_duck', name: '鸭肉', category: '肉类', pricePerUnit: 18.0, unit: '斤', spec: '半只鸭 / 整鸭均可' },
  { id: 'ing_sausage_fresh', name: '鲜香肠', category: '肉类', pricePerUnit: 22.0, unit: '斤', spec: '广式甜口鲜肠' },
  { id: 'ing_lamb_meat', name: '羊肉卷', category: '肉类', pricePerUnit: 38.0, unit: '盒', spec: '约 500g / 盒', unitGrams: 500 },
  { id: 'ing_pork_meatball', name: '猪肉丸', category: '肉类', pricePerUnit: 18.0, unit: '斤', spec: '手打猪肉丸' },

  { id: 'ing_fish_piece', name: '草鱼片', category: '海鲜', pricePerUnit: 18.0, unit: '斤', spec: '现杀现切鱼片' },
  { id: 'ing_clam', name: '花蛤', category: '海鲜', pricePerUnit: 12.0, unit: '斤' },
  { id: 'ing_crab', name: '螃蟹', category: '海鲜', pricePerUnit: 60.0, unit: '斤', spec: '肉蟹，约 2 只 / 斤' },
  { id: 'ing_small_yellow_fish', name: '小黄鱼', category: '海鲜', pricePerUnit: 18.0, unit: '斤' },
  { id: 'ing_river_shrimp', name: '河虾', category: '海鲜', pricePerUnit: 30.0, unit: '斤' },
  { id: 'ing_fan_shell', name: '扇贝', category: '海鲜', pricePerUnit: 30.0, unit: '斤', spec: '活鲜扇贝 10 只 / 斤' },

  // 蔬菜/豆制品/主食
  { id: 'ing_cauliflower', name: '花菜', category: '蔬菜', pricePerUnit: 3.0, unit: '颗', spec: '中等大小', unitGrams: 600 },
  { id: 'ing_string_bean', name: '四季豆', category: '蔬菜', pricePerUnit: 3.0, unit: '斤' },
  { id: 'ing_bitter_melon', name: '苦瓜', category: '蔬菜', pricePerUnit: 2.5, unit: '根', unitGrams: 300 },
  { id: 'ing_winter_melon', name: '冬瓜', category: '蔬菜', pricePerUnit: 1.5, unit: '斤' },
  { id: 'ing_chive', name: '韭菜', category: '蔬菜', pricePerUnit: 2.0, unit: '把', spec: '约 250g / 把', unitGrams: 250 },
  { id: 'ing_bean_sprout', name: '绿豆芽', category: '蔬菜', pricePerUnit: 1.5, unit: '斤' },
  { id: 'ing_broccoli', name: '西兰花', category: '蔬菜', pricePerUnit: 3.0, unit: '颗', spec: '中等大小', unitGrams: 500 },
  { id: 'ing_water_spinach', name: '空心菜', category: '蔬菜', pricePerUnit: 2.0, unit: '把', spec: '约 400g / 把', unitGrams: 400 },
  { id: 'ing_oil_mai', name: '油麦菜', category: '蔬菜', pricePerUnit: 2.5, unit: '把', spec: '约 400g / 把', unitGrams: 400 },
  { id: 'ing_chinese_cabbage', name: '娃娃菜', category: '蔬菜', pricePerUnit: 3.0, unit: '颗', spec: '约 500g / 颗', unitGrams: 500 },
  { id: 'ing_pickle', name: '酸菜', category: '蔬菜', pricePerUnit: 6.0, unit: '斤', spec: '东北酸菜 / 袋装' },
  { id: 'ing_fungus', name: '黑木耳', category: '蔬菜', pricePerUnit: 25.0, unit: '斤' },
  { id: 'ing_tofu_dried', name: '腐竹', category: '主食', pricePerUnit: 12.0, unit: '斤' },
  { id: 'ing_vermicelli', name: '粉丝', category: '主食', pricePerUnit: 5.0, unit: '把', spec: '200g / 把', unitGrams: 200 },

  // 调料/蛋
  { id: 'ing_scallion_white', name: '大葱', category: '调料', pricePerUnit: 1.5, unit: '根', unitGrams: 150 },
  { id: 'ing_garlic_sprout', name: '蒜苗', category: '调料', pricePerUnit: 3.0, unit: '把', spec: '约 200g / 把', unitGrams: 200 },
  { id: 'ing_dried_chili', name: '干辣椒', category: '调料', pricePerUnit: 25.0, unit: '斤' },
  { id: 'ing_sichuan_pepper', name: '花椒', category: '调料', pricePerUnit: 35.0, unit: '斤' },
  { id: 'ing_anise', name: '八角', category: '调料', pricePerUnit: 40.0, unit: '斤' },
  { id: 'ing_peanut', name: '花生', category: '调料', pricePerUnit: 8.0, unit: '斤', spec: '生花生米' },
  { id: 'ing_sesame_oil', name: '香油', category: '调料', pricePerUnit: 18.0, unit: '瓶', spec: '450ml / 瓶', unitMl: 450 },
  { id: 'ing_chili_oil', name: '辣椒油', category: '调料', pricePerUnit: 18.0, unit: '瓶', spec: '500ml / 瓶', unitMl: 500 },
  { id: 'ing_starch', name: '淀粉', category: '调料', pricePerUnit: 5.0, unit: '袋', spec: '250g / 袋', unitGrams: 250 },
  { id: 'ing_tomato_sauce', name: '番茄酱', category: '调料', pricePerUnit: 8.0, unit: '瓶', spec: '300g / 瓶', unitGrams: 300 },
  { id: 'ing_fermented_black_bean', name: '豆豉', category: '调料', pricePerUnit: 12.0, unit: '瓶', spec: '200g / 瓶', unitGrams: 200 },
  { id: 'ing_xiang_cai', name: '香菜', category: '调料', pricePerUnit: 2.0, unit: '把', spec: '约 50g / 把', unitGrams: 50 },
  { id: 'ing_cola', name: '可乐', category: '调料', pricePerUnit: 3.5, unit: '瓶', spec: '500ml / 瓶', unitMl: 500 },
  { id: 'ing_beer', name: '啤酒', category: '调料', pricePerUnit: 4.0, unit: '瓶', spec: '500ml / 瓶', unitMl: 500 },
  { id: 'ing_hotpot_base', name: '火锅底料', category: '调料', pricePerUnit: 15.0, unit: '包', spec: '200g / 包', unitGrams: 200 },
  { id: 'ing_preserved_egg', name: '皮蛋', category: '蛋奶', pricePerUnit: 1.5, unit: '个', unitGrams: 60 },
  { id: 'ing_sesame', name: '白芝麻', category: '调料', pricePerUnit: 15.0, unit: '斤', spec: '生白芝麻' },
  { id: 'ing_white_pepper', name: '白胡椒粉', category: '调料', pricePerUnit: 25.0, unit: '瓶', spec: '50g / 瓶', unitGrams: 50 },
  { id: 'ing_xihamigua', name: '西葫芦', category: '蔬菜', pricePerUnit: 2.0, unit: '根', unitGrams: 400 },
  { id: 'ing_enoki', name: '金针菇', category: '蔬菜', pricePerUnit: 3.0, unit: '把', spec: '约 200g / 把', unitGrams: 200 },
];
