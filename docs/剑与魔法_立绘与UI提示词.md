# 剑与魔法·艾瑟兰 立绘与 UI 提示词包

用途：网页版 GPT 生图（GPT-4o 图像 / DALL·E）。目标风格：**日系二次元异世界（anime isekai）+ 复古奇幻 RPG 面板**。
日期：2026-10-16。

---

## 0. 使用须知（先看这段，决定成败）

1. **先生成一张「风格锚卡」**（见第 1 节），之后每一张都把这张图上传作为 **style reference**，一致性才守得住。GPT 生图对同一段文字的理解每次都不同，靠参考图才能锁风格。
2. **面板背景必须留白**：中央偏下 60% 区域要低对比、少细节，否则叠玩家文字会看不清。提示词里已写死这一点。
3. **立绘要抠图**：要求纯色底（纯白 `#FFFFFF` 或洋红 `#FF00FF`）或直接要透明 PNG，否则后期抠不干净。
4. **不要让它写文字**：所有提示词都带 `no text`，符文/铭文一律要求"抽象、不可辨识"。模型生成的文字 100% 是乱码。
5. **一次只生一张**，不要一张图里塞多个元素；拆开生成再合成。
6. 中文提示词即可，但**风格类描述用英文更稳**——下面每条都给中英双版，可整段粘贴英文版。

**统一负面提示词（每条都附在最后）**

```
负面：任何文字/字母/水印/签名/logo，3D渲染，写实照片，CG塑料感，多余手指，扭曲五官，畸变肢体，过饱和荧光色，杂乱堆砌的符文，低质量，模糊
Negative: any text, letters, watermark, signature, logo, 3D render, photorealistic, plastic CG look, extra fingers, deformed face, distorted limbs, oversaturated neon, cluttered gibberish runes, low quality, blurry
```

---

## 1. 风格锚卡（先生成这一张）

**用途**：作为后续所有图的参考图，锁定画风与配色。建议尺寸 1:1。

```
一张日系二次元异世界风格的美术设定板，画面被分为四个小格：左上角是白桦镇的中世纪边境小镇黄昏远景，右上角是一名冒险者少年/少女的半身立绘，左下角是羊皮纸面板与魔纹边框的 UI 组件，右下角是魔法术式的青蓝色法阵与琥珀色斗气光效。整体赛璐璐上色配合厚涂光影，干净的描线，鲜明的轮廓光，轻小说插画质感，复古奇幻 RPG 氛围。主色调：暖琥珀金 + 青金石蓝，辅以羊皮纸米色与深棕。轻微纸张颗粒质感。画面中没有任何文字与符号。
```

```
An anime isekai fantasy art style sheet, divided into four tiles: top-left a medieval border town at golden dusk, top-right a half-body hero character illustration, bottom-left a parchment UI panel frame with abstract magic-engraved borders, bottom-right blue magic circle runes and amber battle-aura glow. Cel shading with painterly lighting, clean linework, crisp rim light, light-novel illustration quality, retro fantasy JRPG mood. Palette: warm amber gold + lapis blue, parchment beige and deep brown accents. Subtle parchment grain. Absolutely no text or readable symbols anywhere.
```

---

## 2. 主面板背景（最重要，1 张，竖版 9:16 / 1080×1920）

**要求**：中央偏下大面积留白给文本；装饰集中在四角与顶部。

```
竖版构图（9:16）。中世纪冒险者公会大厅内景，黄昏光线从高窗斜射进来，暖琥珀色的光束里浮着尘埃。画面顶部是木质拱梁与公会徽记旗帜，两侧是挂着的旧地图与铜制提灯；画面中央偏下是一张摊开的羊皮纸台面与半杯麦酒，景深虚化、低对比、留出大面积干净区域用于叠放文字。远景窗外能看见白桦林与雪山剪影。日系二次元赛璐璐上色＋厚涂光影，干净描线，轻小说插画质感，复古奇幻 RPG 氛围。主色暖琥珀金＋深棕，点缀青金石蓝。轻微纸张颗粒。画面中没有任何文字。
```

```
Vertical composition (9:16). Interior of a medieval adventurers' guild hall at golden dusk, warm amber god-rays falling through tall windows with floating dust motes. Top of frame: wooden arches and guild banner; sides: pinned old maps and brass lanterns. Center-lower area: an open parchment desk with a half-finished mug of ale, background faded and low-contrast, leaving a large clean area for UI text. Through the window, a distant birch forest and snow mountains. Anime cel shading with painterly lighting, clean linework, light-novel quality, retro fantasy JRPG mood. Warm amber and deep brown palette with lapis blue accents. Subtle parchment grain. No text anywhere.
```

---

## 3. UI 组件（面板边框与图标）

### 3.1 面板九宫格边框（1 张，正方形）

```
一张用于游戏 UI 的羊皮纸面板边框素材，正方形构图：四周是厚实的旧羊皮纸与深棕木质包边，四角有黄铜角饰与抽象魔纹浮雕（不构成任何可读文字），边框内侧有一圈细微的青蓝色发光纹路。画面正中央是完全干净的米色留白区域，用于叠加界面文字。日系奇幻 RPG 界面质感，柔和打光，轻微做旧与颗粒。无任何文字与字母。
```

```
A game UI parchment panel frame asset, square: thick aged parchment and dark wood trim along the edges, brass corner ornaments and abstract engraved magic motifs (no readable text), a subtle glowing lapis-blue filigree just inside the border. The entire center is a clean flat beige area for UI text. Fantasy JRPG interface quality, soft lighting, lightly weathered with grain. No text or letters.
```

### 3.2 资源图标组（1 张，网格线内 6 枚，或用透明底 6 张）

```
六枚游戏道具图标，横向排列在纯白背景上，每个图标独立且等距：一枚刻着断冠纹章的黄铜铜币、一枚青蓝色发光的地脉晶片、一包粗布野营口粮、一瓶红色疗伤药、一瓶蓝色魔力药、一封盖着蜡印的旧契约信。日系奇幻 RPG 道具图标，赛璐璐上色，厚涂高光，边缘清晰，轻微等距视角，木质与金属材质对比明显。无文字。
```

```
Six game item icons in a row on a pure white background, evenly spaced and independent: a brass coin stamped with a broken-crown crest, a glowing lapis-blue leyline shard, a rough cloth-wrapped travel ration, a red healing potion bottle, a blue mana potion bottle, a wax-sealed old contract letter. Fantasy JRPG item icons, cel shading with painterly highlights, crisp edges, slight isometric view, contrast between wood and metal. No text.
```

### 3.3 状态条（生命 / 魔力）

```
一条游戏 UI 状态条素材，纯白背景：一条以暗红宝石与黄铜边框组成的长条，内部是流动的赤色液体光，左端有一枚心形或血脉纹样的抽象徽记；下方并列一条同规格但内部为青蓝色魔法液体的状态条，左端是菱形法术纹样。扁平化边框＋内部渐变发光，日系奇幻 RPG 界面风格。无文字。
```

```
A game UI status bar asset on a pure white background: a long bar framed in dark ruby and brass with flowing crimson liquid light inside, a small abstract heart/vein emblem on the left end; below it a matching bar filled with lapis-blue arcane fluid with a diamond spell emblem on the left. Flat frame with glowing inner gradient, fantasy JRPG interface style. No text.
```

---

## 4. 职业立绘（4 张，半身，竖版 2:3，纯色底）

**角色锚（每张都要带，保证是"同一个角色"）**

```
角色锚（女版）：十六七岁少女冒险者，浅金栗色及肩短发被风吹起，灰蓝色眼睛，左眉尾一道细疤，浅肤色，裹着白色亚麻内衬与深棕皮质轻甲，颈间挂着白桦镇公会的木质徽章。
角色锚（男版）：十六七岁少年冒险者，浅金栗色短发，灰蓝色眼睛，左眉尾一道细疤，浅肤色，白色亚麻内衬与深棕皮质轻甲，颈间挂着白桦镇公会的木质徽章。
```

```
Character anchor (female): a 16-17 year old adventurer girl, ash-blonde shoulder-length hair blown by wind, grey-blue eyes, a thin scar at the tail of her left eyebrow, light skin, white linen undershirt with dark brown leather light armor, a birch-wood guild badge at her neck.
Character anchor (male): a 16-17 year old adventurer boy, ash-blonde short hair, grey-blue eyes, a thin scar at the tail of his left eyebrow, light skin, white linen undershirt with dark brown leather light armor, a birch-wood guild badge at his neck.
```

**统一构图句**：半身立绘，正侧 3/4 角度，视线看向画面外，纯白背景，柔和轮廓光，日系二次元赛璐璐上色，轻小说插画质感，无文字。

### 4.1 剑士 · 斗气之姿

```
（角色锚） 半身立绘，3/4 侧角度，双手握着一把素朴的阔刃长剑斜置身前，剑身缠绕着琥珀金色的斗气光流；呼吸法带起的气旋卷动衣角与碎叶，眼神坚定。深棕皮质轻甲与皮质护腕上有磨损痕迹。纯白背景，柔和轮廓光。日系二次元赛璐璐上色＋厚涂光影，轻小说插画质感。无文字。
```

### 4.2 魔法师 · 术式解析

```
（角色锚） 半身立绘，3/4 侧角度，一只手掌向上托着悬浮的青蓝色术式法阵（抽象几何符文，不可辨认文字），另一手拿着写满图解的笔记；周围漂浮着细小的元素光点与半透明书页。学院风格深蓝长袍披在轻甲外，袍角绣着抽象纹样。纯白背景，柔和轮廓光。日系二次元赛璐璐上色＋厚涂光影。无文字。
```

### 4.3 僧侣 · 圣印庇护

```
（角色锚） 半身立绘，3/4 侧角度，双手合于胸前结成誓愿手印，指间浮着一枚暖金色的圣印光环；肩后披着巡礼者的粗布斗篷，腰间挂着药囊与圣水小瓶，神情平静温和。纯白背景，柔和轮廓光，暖色调。日系二次元赛璐璐上色＋厚涂光影。无文字。
```

### 4.4 游侠 · 遗迹勘察

```
（角色锚） 半身立绘，3/4 侧角度，肩背一把短弓，一手展开一张标注着抽象等高线的旧时代地图，另一手捏着一枚青蓝色地脉晶片对着光看；颈间围着苔绿色围巾，斗篷上有林间尘埃。背景留纯白。柔和轮廓光，青绿与琥珀配色。日系二次元赛璐璐上色＋厚涂光影。无文字。
```

---

## 5. 六地区场景背景（6 张，16:9 / 1920×1080）

统一尾缀：**日系二次元赛璐璐上色＋厚涂光影，电影感构图，大气透视，轻小说动画背景美术质感，无文字。**

| 地区 | 提示词正文 |
|---|---|
| 风鸣林 | 幽深的精灵古林，一棵巨大的**倒生巨树**横跨画面，树根间嵌着王室铸造的金属魔力钉，青蓝色微光从钉缝渗出；林间浮着萤火般的低阶木精灵光点，歌声般的粒子飘散。苔绿与琥珀光束。 |
| 灰钟地窟 | 废弃钟楼下的地底洞窟，一口布满铭文的古钟斜挂在断梁上，钟下一群半透明的亡灵剪影正重复着祈祷姿态；地面刻着时间刻度般的环形石纹，冷灰与青蓝冷光，压抑寂静。 |
| 雾桥驿 | 雾气弥漫的石拱桥驿站，桥头立着举旗封桥的骑士剪影，桥另一侧是一列背着行囊的魔族难民（长角与暗纹，非恐怖化处理），远处的旧时代地图卷在孩子怀里。灰蓝晨雾＋橙色火把。 |
| 断冠遗迹 | 无声大厅内景，一顶**断裂的王冠残片**悬浮在半空，尘埃凝固般静止不动；墙壁上排布着历代勇者的誓约石板（抽象刻痕，无文字），地面刻着封印环。青金石蓝与银白冷光，静谧庄严。 |
| 黑曜边城 | 世界边缘的黑曜石要塞，城墙上布满朝向**城外**的巨型抓痕，墙下魔族守军执械列阵；天空裂开一道吞噬光线的漆黑裂隙，裂隙边缘渗出不祥的暗红微光。厚重、末世感。 |
| 裂月王庭 | 古代王庭遗址广场，一轮**裂开的月亮**占据天空，中央矗立着庞大的地脉炉巨构，炉膛内琥珀色熔流翻涌；四周散落着三份发光的旧约残章。史诗构图，仰视视角，暖橙与深渊蓝对冲。 |

---

## 6. 三条终局插图（3 张，16:9）

统一尾缀：**电影感史诗构图，二次元赛璐璐上色＋厚涂光影，强戏剧光，无文字。**

- **黎明勇者**：少年/少女冒险者高举重铸的誓约长剑立在王庭高台，剑身迸发黎明般的金色光柱刺破裂月，脚下石板裂纹蔓延出抽象誓约纹样；远处无数微小的人影抬头仰望。
- **地脉贤者**：角色站在被拆解的地脉炉核心，双手放出一缕缕青金色丝线，丝线汇入大地裂缝并顺着地面蔓延向远方城镇与森林，象征力量归还众生；人物剪影被自身的光照亮，构图以"贯穿全球的脉络"为主体。
- **守隙魔王**：角色背对镜头，戴上守隙王冠走向漆黑的裂隙，冠冕内侧刻满抽象名字刻痕；一道巨大阴影为他披上披风，远方的世界灯火安然无恙。悲壮、孤独、逆光。

---

## 7. 飞升场景（1 张，16:9）

```
电影感竖向光柱构图。一名异界冒险者悬浮在上升的光柱中，脚下的白桦镇在夜色里变小，钟楼钟声化作可看见的同心声波涟漪；随身档案化作无数泛着金光的书页与符文碎片环绕上升，通往上方一片星辰与仙山交叠的天空。二次元赛璐璐上色＋厚涂光影，暖金与青蓝对冲，史诗而温柔，无文字。
```

---

## 8. 建议命名与落地路径

```
resources/img/swordmagic/
  bg_panel.png            主面板背景（1080×1920）
  ui_frame.png            九宫格面板框（1024×1024）
  ui_icons.png            资源图标组（或拆分 icons/*.png）
  ui_bars.png             生命/魔力条
  job_swordsman.png       剑士立绘（800×1200）
  job_mage.png            魔法师
  job_cleric.png          僧侣
  job_ranger.png          游侠
  region_01_fengming.png  风鸣林（1920×1080）
  region_02_greybell.png  灰钟地窟
  region_03_fogbridge.png 雾桥驿
  region_04_brokencrown.png 断冠遗迹
  region_05_obsidian.png  黑曜边城
  region_06_crackmoon.png 裂月王庭
  ending_dawn.png         黎明勇者
  ending_leyline.png      地脉贤者
  ending_riftward.png     守隙魔王
  ascension.png           飞升
```

## 9. 现实提醒（重要）

目前 `#剑与魔法 状态` 面板是**纯文本回复**（`e.reply`），图片不会自动显示。要用上这批立绘，还需要：

1. 一套 HTML/CSS 模板（背景图 + 羊皮纸框 + 绝对定位的文字层 + 职业立绘）
2. 走插件已有的 **puppeteer 截图管线**（`zd_battle` 战报用的就是这条），把 HTML 渲染成图片再回复

这套渲染管线是独立的工程量，先出图、后接管线，顺序不冲突。
