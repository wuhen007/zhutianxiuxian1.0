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

**实测提醒（2026-10-16 出图后修正）**

风格锚卡只锁**画风与配色**，不锁**角色**。已出的一版锚卡里，四格分别出现了：黄昏边城远景 / 长发金甲蓝披风少女 / 金线羊皮纸 UI / 3D 辉光法阵。其中两处会污染后续：

1. **角色格会把四职业立绘带成「圣殿骑士」**——参考图里的长发、华丽肩甲、蓝披风会被一起抄走，与白桦镇边境公会穷冒险者的设定冲突。故新增 §1.1。
2. **法阵格是 3D 渲染辉光**，撞在统一负面词的「3D渲染 / CG塑料感 / 过饱和荧光色」上。**当参考图前先裁掉这一格**。

---

### 1.1 角色锚卡（第二张参考图，强烈建议做）

**三级参考链（按顺序做，不要跳）**

```
① 风格锚卡（§1）      锁画风与配色；裁掉右下角法阵格后再用
        ↓ 作为参考图上传
② 角色锚卡（本节）     纯白底，只画角色本体，不含任何华丽装备
        ↓ 作为参考图上传
③ 四职业立绘（§4）     拿②当参考，只换姿势与手中道具
```

§4 的文字角色锚**仍要保留在每条提示词里**，参考图与文字锚双管齐下才稳。

**生成提示词（先出女版）**

```
纯白背景的角色设定立绘，正侧 3/4 角度的半身像，一名十六七岁少女冒险者：及肩的浅金栗色短发被风吹得略乱，灰蓝色眼睛，左眉尾有一道很淡的细疤，浅肤色，脸上带着赶路后的浅尘。穿着白色亚麻内衬与深棕色皮质轻甲，皮甲上有明显的磨损与补线痕迹，肩部是简单的皮质护肩；颈间用皮绳挂着一枚手工雕刻的白桦木公会徽章。腰间系着旧皮带与一只粗布小袋。装备朴素——没有金属板甲、没有披风、没有宝石、没有华丽金饰。站姿自然，神情是边境少年人那种警觉又逞强的样子。日系二次元赛璐璐上色＋厚涂光影，干净描线，柔和轮廓光，轻小说插画质感。画面中没有任何文字。
```

```
A character sheet bust illustration on a pure white background, three-quarter view. A 16-17 year old adventurer girl: ash-blonde shoulder-length short hair slightly tousled by wind, grey-blue eyes, a very faint thin scar at the tail of her left eyebrow, light skin with a little travel dust. She wears a white linen undershirt with dark brown leather light armor that is visibly scuffed and repaired with stitching, simple leather shoulder pads; a hand-carved birch-wood guild badge hangs from a leather cord at her neck. An old leather belt and a rough cloth pouch at her waist. Plain gear — no metal plate armor, no cape, no gems, no ornate gold trim. Natural stance, a wary but stubborn frontier-teen expression. Anime cel shading with painterly lighting, clean linework, soft rim light, light-novel illustration quality. No text anywhere.
```

男版只改两处：「少女」→「少年」，「及肩的浅金栗色短发」→「浅金栗色短发」；英文版 `girl`→`boy`，`shoulder-length short hair`→`short hair`。其余不动。

**自检清单（出图后逐条核对，任一条不符就重出，不要将就）**

- [ ] 头发是**及肩短**发，不是长发、不是扎起来的
- [ ] 眼睛是**灰蓝**，不是纯亮蓝
- [ ] 左眉尾**有细疤**
- [ ] 护甲是**深棕皮质**且有磨损痕迹，不是金属板甲
- [ ] 颈间挂着**木质**徽章（不是金质、不带宝石）
- [ ] 没有披风、没有宝石、没有华丽金饰
- [ ] 纯白底，可直接抠图

**判断依据**：模型会把参考图里的**非风格特征**（发型、服装、配饰）一起迁移过去。若四张职业立绘最终出现了统一的披风 / 板甲 / 宝石，即说明本节被跳过。

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

**先做 §1.1 的角色锚卡**，再拿它当参考图生下面四张；文字角色锚仍要原样保留在每条提示词里。

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

统一尾缀：**厚涂绘本质感（高完成度动画背景美术，不要赛璐璐），电影感构图，大气透视，无文字。**

> 尾缀于 2026-10-16 修正：原写「赛璐璐上色」，与已交付的 §2 主面板背景（厚涂半写实）不符，沿用会让六张地区场景和主面板背景不像同一套。**纯场景图走厚涂绘本，含角色的图才走赛璐璐＋厚涂**——详见 §10.3。

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
  _ref/                      参考图归档，不参与插件打包（生图链路用）
    style_anchor.jpg         风格锚卡 v1（对照用）
    style_anchor_v2.jpg      风格锚卡采用版
    char_anchor.jpg          角色锚卡 · 女版（7/7 全过）
    char_anchor_male.jpg     角色锚卡 · 男版（6/7，仅缺眉尾细疤）
  ══ 已交付 2026-10-16（实际为 JPEG；尺寸见 §10.1）══
  bg_panel.jpg               主面板背景   941×1672（9:16）
  ui_frame.jpg               九宫格面板框 1254×1254（1:1）
  ui_icons.jpg               资源图标组   1920×640（六枚横排，待拆为 icons/*.png）
  ui_bars.jpg                生命/魔力条  1920×714（两条叠放，待裁徽记）
  job_swordsman.jpg          剑士   1774×887（女左男右双人图，需裁半）
  job_mage.jpg               魔法师 同规格
  job_cleric.jpg             僧侣   同规格
  job_ranger.jpg             游侠   同规格
  ══ 待出图 ══
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

---

## 10. 出图实测记录（2026-10-16）

本节记录**实际出图与合成验收**的结果，是上面各节提示词的实践修正，出下一批图前先看这节。

### 10.1 进度

| 素材 | 状态 | 实测尺寸 | 判定 |
|---|---|---|---|
| §1 风格锚卡 | ✅ 采用 v2 | 1:1 | 配色锁定；**法阵格为深底满光效，当参考图前须裁掉** |
| §1.1 角色锚卡 · 女 | ✅ | 2:3 | 七项自检全过 |
| §1.1 角色锚卡 · 男 | ✅ 6/7 | 2:3 | 仅缺眉尾细疤（次要项，不重出） |
| §2 主面板背景 | ✅ | 941×1672 | 已合成验收；底部加压暗后小字可读 |
| §3.1 九宫格边框 | ✅ | 1254×1254 | 已合成验收；面板内容不溢出（余 57px） |
| §3.2 图标组 | ⚠️ 待加工 | 1920×640 | 六枚齐、纯白底；需拆 6 张 + 透明底 + 尺寸归一 |
| §3.3 生命/魔力条 | ⚠️ 待加工 | 1920×714 | 两条款式统一；需裁徽记 + 改用遮罩表示损耗 |
| §4 四职业立绘 | ✅ 四职业齐 | 1774×887（女左男右双人图） | 裁 2:3 后与羊皮纸卡合成良好，见 §10.2 第 7、8 条 |
| §5 / §6 / §7 | ⬜ 待出 | — | — |

### 10.2 八条实测经验（均为合成后才暴露，光看图看不出）

1. **风格锚卡会把「角色」一起迁移过去**。首版锚卡的角色格是「长发 + 金线肩甲 + 蓝披风 + 宝石」，会被 §4 四职业立绘整批抄走，与「深棕皮甲 + 白桦木徽章」的设定冲突。→ 解法见 §1.1 三级参考链。
2. **背景图的「中央偏下留白」要求基本无关紧要**。羊皮纸面板不透明、占 43%–85%，把背景正中整块遮住了。真正要管的是两条**可见带**：`0–43%`（标题带 + 场景带）、`87–100%`（底部栏）。出背景图时不必为「中央留白」纠结。
3. **背景图最亮最碎的区域会正好落在底部资源栏**。§2 实拍时前景桌面（麦酒 / 地图 / 墨水瓶）压住图标与小字导致发虚。→ 处理：在**背景层栈末尾、内容层之前**加一道只吃底部 22% 的渐变压暗层（`transparent 78% → rgba(8,5,3,.85) 100%`），羊皮纸面板在它之后绘制故不受影响。
4. **九宫格边框的四条边中点不能有装饰**。本批 `ui_frame` 四边中点各有一枚菱形。主面板是固定尺寸、拉伸轻微，实拍看不出来；但**复用去小卡（地区卡 392×310、行动条 952×110）时角饰会被压扁、中点菱形会糊掉**。→ 只做主面板框则现有素材够用；要做可复用小卡框须重出「四角有饰、四边素净」版。
5. **图标组要么拆 6 张独立图，要么 6 等分裁**。六枚间距不完全均匀，等分裁会有偏移。且现在是**白底不是透明底**，放进深色圆底会露出白方块 → 需透明底 PNG（§3.2 提示词本来就有「或用透明底 6 张」这个选项），或改把图标放在米色/羊皮纸圆牌上。另需把六枚**归一化到同一边长**（晶片明显比铜币大）。
6. **状态条的填充是烘焙在整张图里的，不能靠改宽度表示损耗**。素材每条约 5.4:1，而血条槽是 17:1，直接铺会是三倍高。→ 处理：把左侧**徽记裁出来当独立元素**（模板本来就有独立 emblem 位），只留条身（约 12:1）铺到 440×38 左右；损耗改为**整条铺满 + 未填充区叠压暗遮罩**，视觉上读作「宝石被抽空」，比直接截断更好看。
7. **职业立绘是「女左男右」双人并排图，必须裁一半**。四张（剑士 / 魔法师 / 僧侣 / 游侠）均为 1774×887 横幅，左右各一位角色，风格与道具完全对称。取左半裁 2:3 后效果良好：头部落在上三分之一，道具（剑与金色斗气 / 青蓝法球与魔导书 / 金色圣印与光环 / 短弓与地脉晶片与旧地图）全部完整入画，四者靠**道具与主色**区分得很清楚（金 / 藏蓝 / 米白 / 苔绿）。
   - **主角性别决策因此从「重出图」变成「裁哪半」**，男女两版都已可用，零额外成本。
   - 裁切注意：人物光效与布料一直延伸到画幅边缘（四角采样显示约一半边框其实是画面内容而非留白），裁切时让光效**自然淡出**，别切在最亮处。
8. **白底立绘不要抠图，改用 `mix-blend-mode:multiply` 叠在浅色卡上**。
   - 实测：常规白底抠图（亮度+饱和度阈值）能抠干净、金色斗气完整保留，但**发丝轮廓会留一圈淡白边**（典型 alpha 白边），过曝的光效核心也有被吃掉的风险。
   - 正确做法：**把立绘放进浅色（羊皮纸）卡槽，用 `multiply` 去白**——白色直接消失、发丝与光效完整保留、**无白边**。已在四职业上逐一验证，无可见矩形残影。
   - **前提：底必须浅**。若让立绘直接浮在背景图（偏暗的工会大厅）上，multiply 会把人物压暗到看不清。所以立绘需要一块**羊皮纸卡槽**——顺带把立绘与面板的 UI 语言也统一了。

### 10.3 风格分轨规则（据已交付素材确立）

```
纯场景图（§2 面板背景、§5 六地区）    → 厚涂绘本质感    ← 以 bg_panel 为准
含角色的图（§4 立绘、§6 终局、§7 飞升） → 赛璐璐＋厚涂    ← 以角色锚卡为准
```

背景厚涂、角色赛璐璐是动画与 AVG 的标准搭配（如京阿尼/新海诚式背景配动画人物），**不要为了迎合提示词把背景改成赛璐璐**，那会把已到手的质感做丢。

### 10.4 参考图使用规则

1. **三级参考链**：风格锚卡 → 角色锚卡 → 职业立绘（§1.1），不要跳步。
2. **风格锚卡当参考前先裁掉右下角法阵格**：它是深底 + 六七个光效元素的堆叠，会教坏 §3.2 / §3.3 这两条要求**纯白底**的提示词（素材会被画成深底，直接影响抠图）。
3. **别让两张参考图性别打架**：若主角定为男版，风格锚卡里的少年与角色锚卡性别自洽、无需裁剪；若定为女版，须把风格锚卡裁成「只剩边城 + UI」两格。
4. **色温小提醒**：`ui_frame` 的青色发光与血/蓝条的蓝，比背景里沉稳的青金石蓝**更亮更饱和**。作为 UI 元素这样是对的（要跳出来）；若想让整套更「沉稳史诗」，把发光整体调暗一档即可。
