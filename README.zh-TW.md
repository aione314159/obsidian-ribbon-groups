<!-- intl-release: locale-samples
     This file is the Traditional Chinese translation of README.md and is
     expected to contain CJK text. English source of truth: README.md -->

# Open Ribbon Groups

[English](./README.md)

![左側 ribbon 分成兩個彩色分組，下方是未分組區](./docs/images/ribbon.png)

把 Obsidian 左側 ribbon 的按鈕分組。每組可以設背景色與標題，組內與組間都能拖曳排序。

裝了十幾個插件之後，ribbon 會變成一長條看不出關聯的圖示。這個插件讓你把它們分成
「寫作」「同步」「開發」之類的區塊，用顏色隔開。

需要 Obsidian 1.8.7 以上。

## 功能

- 分組，每組可設背景色（八個內建色票）、標題與圖示
- 標題可關掉——ribbon 只有約 42px 寬，長標題會被截斷
- 點標題或圖示收合整組；另有指令一次收合或展開全部
- 設定頁直接列出目前 ribbon 上的按鈕，拖曳分配到各組
- 分組本身也能拖曳調整先後
- 拖曳支援滑鼠、觸控筆與手指，拖到邊緣會自動捲動
- 按鈕多時可用名稱篩選未分組清單
- 緊湊間距模式，視窗不高時放得下更多分組
- 把分組匯出成 JSON，貼到另一個 vault
- 未分組的按鈕自動聚在一起，可選擇擺最上面或最下面
- 介面跟著 Obsidian 的語系走：英文、繁中、簡中、日文、韓文

## 先知道這件事

**Obsidian 沒有公開 API 可以列舉或重排 ribbon 的按鈕。** `addRibbonIcon()` 只能新增
自己的按鈕，動不了別人的。這個插件走的是 `app.workspace.leftRibbon` 這個私有物件，
加上 ribbon 自己的 DOM。

意思是：**Obsidian 改版動到那塊結構，這個插件就會失效**，需要跟著修。

失效時不會靜默不動作——設定頁會顯示「找不到 ribbon」以及實際偵測到的結構，
按一下就能複製那段診斷資訊。

停用插件時 ribbon 會還原成原本的樣子，不需要重開 Obsidian。

貼進匯入框的設定會先驗證過才使用：分組顏色只接受字面色值，
匯入的檔案沒辦法夾帶 `url()` 讓你的 ribbon 去抓外部資源。

## 安裝

從社群插件市集搜尋「Open Ribbon Groups」，或手動安裝：

從最新一版
[release](https://github.com/aione314159/obsidian-ribbon-groups/releases)
下載 `main.js`、`styles.css`、`manifest.json`，放進
`<vault>/.obsidian/plugins/ribbon-groups/`，再到「設定 → 第三方插件」啟用。

自己編譯的話，`npm run build` 之後把 `dist/` 底下那三個檔案複製過去即可。

## 使用

「設定 → Ribbon Groups」：

1. 按「新增分組」建一組，填名稱、選背景色
2. 需要的話填一個 [Lucide](https://lucide.dev/icons/) 圖示名稱，例如 `folder-open`
3. 從下方「未分組」清單把按鈕拖進去
4. 用左邊的 `⠿` 把手調整分組先後

![插件設定頁，標出拖曳把手、色票與按鈕清單](./docs/images/settings.png)

改動即時生效，不需要按儲存。

在 ribbon 上點分組標題可以收合，收合狀態會記住。

## 某個插件被停用之後

它的按鈕會從 ribbon 上消失，但**位置會留在設定裡**。重新啟用那個插件時，按鈕會回到
原本的組，不必重排。

確定不會再用的話，設定頁上方會出現「有 N 個按鈕目前不在 ribbon 上」，按「清掉」移除。

## 開發

```bash
npm install
npm run build       # 產出 dist/{main.js, styles.css, manifest.json}
npm run dev         # watch 模式
npm test            # vitest
npm run typecheck
```

測試涵蓋分組資料的操作（去重、刪組後按鈕的去向、匯入允許哪些內容），以及完整的
放置判定——放開時落在哪一區、插在第幾個。DOM 操作與設定頁 UI 不在測試範圍，
那部分靠 `ribbonDom.ts` 的診斷輸出來確認。

程式碼註解一律用英文，使用者看得到的文字才走 `src/i18n.ts` 的多語系。
