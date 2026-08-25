/**
 * User-facing strings.
 *
 * English is the fallback and the reference: reviewers of the community
 * catalogue read English, and any locale that is missing or unknown lands here.
 *
 * The locale comes from Obsidian's `getLanguage()`. That API arrived in 1.8.7,
 * which is why `minAppVersion` says 1.8.7 — the catalogue check compares the
 * two, and declaring something lower while guarding with `typeof` does not pass
 * it. The lookup happens once at module load: changing Obsidian's language
 * requires a restart anyway.
 *
 * Locales live in this file rather than in external JSON. A plugin ships as a
 * single `main.js`, so external files would have to be fetched or bundled
 * anyway, and the TypeScript interface is what guarantees a new string is
 * filled in for every language instead of silently falling back.
 */

import { getLanguage } from 'obsidian';

interface Strings {
  cmdReapply: string;
  cmdCollapseAll: string;
  cmdExpandAll: string;

  dataDirName: string;
  dataDirDesc: string;
  dataDirUnavailable: string;
  dataDirOpen: string;
  dataDirOpenTooltip: string;
  dataDirOpenFailed: (dir: string) => string;

  ribbonMissingHeading: string;
  ribbonMissingDesc: string;
  copyDiagnostics: string;
  copied: string;

  general: string;
  ungroupedPosition: string;
  ungroupedPositionDesc: string;
  positionTop: string;
  positionBottom: string;
  compact: string;
  compactDesc: string;

  missingCount: (n: number) => string;
  missingDesc: string;
  clear: string;

  groups: string;
  dragToReorder: string;
  dragToMove: string;
  groupNamePlaceholder: string;
  showTitle: string;
  showTitleDesc: string;
  deleteGroup: string;
  addGroup: string;
  newGroupName: string;
  backgroundColor: string;
  groupIcon: string;
  groupIconDesc: string;
  groupIconPlaceholder: string;
  groupIconInvalid: string;

  ungrouped: string;
  diagnostics: string;
  dropHere: string;
  searchPlaceholder: string;
  searchNoMatch: string;

  backup: string;
  backupDesc: string;
  exportSettings: string;
  exportCopied: string;
  importSettings: string;
  importPlaceholder: string;
  importFailed: string;
  importDone: (groups: number) => string;

  swatchNone: string;
  swatchRed: string;
  swatchOrange: string;
  swatchYellow: string;
  swatchGreen: string;
  swatchCyan: string;
  swatchBlue: string;
  swatchPurple: string;

  diagLeftRibbon: (found: boolean) => string;
  diagButtonEls: (n: number) => string;
  diagContainerFromItemsEl: string;
  diagContainerFromSelector: (sel: string) => string;
  diagContainerNotFound: (selectors: string) => string;
  diagItemsCount: (n: number) => string;
  diagFromButtonEl: (n: number) => string;
  diagHidden: (n: number) => string;
  diagDomOnly: (n: number) => string;
  diagUnmatched: (n: number) => string;
  unnamed: string;
}

const en: Strings = {
  cmdReapply: 'Reapply groups',
  cmdCollapseAll: 'Collapse all groups',
  cmdExpandAll: 'Expand all groups',

  dataDirName: 'Storage location',
  dataDirDesc: "This plugin's settings file (data.json) lives here.",
  dataDirUnavailable: 'The current storage backend is not a local file system, so there is no folder to open.',
  dataDirOpen: 'Open',
  dataDirOpenTooltip: 'Show this folder in your file manager',
  dataDirOpenFailed: (dir) => `Could not open ${dir}`,

  ribbonMissingHeading: 'Ribbon not found',
  ribbonMissingDesc:
    'The button container of the left ribbon could not be detected, so grouping cannot work. ' +
    'This usually means Obsidian changed the internal structure of the ribbon. ' +
    'Please report the details below to the developer.',
  copyDiagnostics: 'Copy diagnostics',
  copied: 'Copied',

  general: 'General',
  ungroupedPosition: 'Place ungrouped buttons',
  ungroupedPositionDesc: 'Whether buttons that belong to no group go above or below all groups.',
  positionTop: 'At the top',
  positionBottom: 'At the bottom',
  compact: 'Compact spacing',
  compactDesc: 'Tighten the space around groups so more buttons fit in a short window.',

  missingCount: (n) => `${n} button${n === 1 ? ' is' : 's are'} no longer on the ribbon`,
  missingDesc:
    'Their plugins may have been disabled. The positions are kept, so re-enabling a plugin puts its ' +
    'button back in the same group. Clear them if you are sure you will not use them again.',
  clear: 'Clear',

  groups: 'Groups',
  dragToReorder: 'Drag to reorder groups',
  dragToMove: 'Drag to move this button',
  groupNamePlaceholder: 'Group name',
  showTitle: 'Show title',
  showTitleDesc: 'The ribbon is narrow, so long titles get truncated.',
  deleteGroup: 'Delete this group',
  addGroup: 'Add group',
  newGroupName: 'New group',
  backgroundColor: 'Background color',
  groupIcon: 'Icon',
  groupIconDesc: 'A Lucide icon name, shown above the group. Leave empty for none.',
  groupIconPlaceholder: 'e.g. folder-open',
  groupIconInvalid: 'Unknown icon name',

  ungrouped: 'Ungrouped',
  diagnostics: 'Detection details',
  dropHere: 'Drop buttons here',
  searchPlaceholder: 'Filter buttons',
  searchNoMatch: 'No button matches this filter',

  backup: 'Backup',
  backupDesc: 'Copy your groups to another vault, or restore them after a reset.',
  exportSettings: 'Copy settings',
  exportCopied: 'Settings copied to the clipboard',
  importSettings: 'Replace settings',
  importPlaceholder: 'Paste exported settings here',
  importFailed: 'That is not a valid settings export',
  importDone: (groups) => `Imported ${groups} group${groups === 1 ? '' : 's'}`,

  swatchNone: 'None',
  swatchRed: 'Red',
  swatchOrange: 'Orange',
  swatchYellow: 'Yellow',
  swatchGreen: 'Green',
  swatchCyan: 'Cyan',
  swatchBlue: 'Blue',
  swatchPurple: 'Purple',

  diagLeftRibbon: (found) => `workspace.leftRibbon: ${found ? 'found' : 'not found'}`,
  diagButtonEls: (n) => `Button elements in container: ${n}`,
  diagContainerFromItemsEl: 'Container source: leftRibbon.ribbonItemsEl',
  diagContainerFromSelector: (sel) => `Container source: selector ${sel}`,
  diagContainerNotFound: (selectors) => `Container not found. Selectors tried: ${selectors}`,
  diagItemsCount: (n) => `leftRibbon.items: ${n}`,
  diagFromButtonEl: (n) => `Resolved directly from buttonEl: ${n}`,
  diagHidden: (n) => `Hidden by the user, excluded from grouping: ${n}`,
  diagDomOnly: (n) => `Found in DOM but missing from items: ${n}`,
  diagUnmatched: (n) => `Could not be matched to a DOM node: ${n}`,
  unnamed: '(unnamed)',
};

const zhTW: Strings = {
  cmdReapply: '重新套用分組',
  cmdCollapseAll: '收合所有分組',
  cmdExpandAll: '展開所有分組',

  dataDirName: '儲存位置',
  dataDirDesc: '這個插件的設定檔（data.json）就放在這裡。',
  dataDirUnavailable: '目前的儲存後端不是本機檔案系統，沒有可以開啟的資料夾。',
  dataDirOpen: '開啟',
  dataDirOpenTooltip: '在檔案管理員中開啟這個資料夾',
  dataDirOpenFailed: (dir) => `開不起來：${dir}`,

  ribbonMissingHeading: '找不到 ribbon',
  ribbonMissingDesc:
    '偵測不到左側 ribbon 的按鈕容器，分組功能無法運作。' +
    '這通常代表 Obsidian 改了 ribbon 的內部結構。請把下面這段回報給開發者。',
  copyDiagnostics: '複製診斷資訊',
  copied: '已複製',

  general: '一般',
  ungroupedPosition: '未分組的按鈕擺在',
  ungroupedPositionDesc: '沒有被分到任何組的按鈕，要放在所有分組的前面還是後面。',
  positionTop: '最上面',
  positionBottom: '最下面',
  compact: '緊湊間距',
  compactDesc: '縮小分組之間的留白，視窗不高時可以多放幾顆按鈕。',

  missingCount: (n) => `有 ${n} 個按鈕目前不在 ribbon 上`,
  missingDesc:
    '對應的插件可能被停用了。位置會先留著，重新啟用就會回到原本的組；' +
    '確定不會再用可以清掉。',
  clear: '清掉',

  groups: '分組',
  dragToReorder: '拖曳調整分組順序',
  dragToMove: '拖曳搬動這顆按鈕',
  groupNamePlaceholder: '分組名稱',
  showTitle: '顯示標題',
  showTitleDesc: 'ribbon 很窄，長標題會被截斷。',
  deleteGroup: '刪除這個分組',
  addGroup: '新增分組',
  newGroupName: '新分組',
  backgroundColor: '背景色',
  groupIcon: '圖示',
  groupIconDesc: 'Lucide 圖示名稱，顯示在分組上方。留空代表不顯示。',
  groupIconPlaceholder: '例如 folder-open',
  groupIconInvalid: '沒有這個圖示名稱',

  ungrouped: '未分組',
  diagnostics: '偵測資訊',
  dropHere: '把按鈕拖到這裡',
  searchPlaceholder: '篩選按鈕',
  searchNoMatch: '沒有符合的按鈕',

  backup: '備份',
  backupDesc: '把分組複製到另一個 vault，或在重設之後還原。',
  exportSettings: '複製設定',
  exportCopied: '設定已複製到剪貼簿',
  importSettings: '覆蓋設定',
  importPlaceholder: '把匯出的設定貼在這裡',
  importFailed: '這不是有效的設定內容',
  importDone: (groups) => `已匯入 ${groups} 個分組`,

  swatchNone: '無',
  swatchRed: '紅',
  swatchOrange: '橘',
  swatchYellow: '黃',
  swatchGreen: '綠',
  swatchCyan: '青',
  swatchBlue: '藍',
  swatchPurple: '紫',

  diagLeftRibbon: (found) => `workspace.leftRibbon：${found ? '有' : '找不到'}`,
  diagButtonEls: (n) => `容器內的按鈕元素：${n} 個`,
  diagContainerFromItemsEl: '容器來源：leftRibbon.ribbonItemsEl',
  diagContainerFromSelector: (sel) => `容器來源：選擇器 ${sel}`,
  diagContainerNotFound: (selectors) => `容器找不到，試過的選擇器：${selectors}`,
  diagItemsCount: (n) => `leftRibbon.items：${n} 筆`,
  diagFromButtonEl: (n) => `直接拿到 buttonEl 的：${n} 個`,
  diagHidden: (n) => `被使用者關掉、不參與分組的：${n} 個`,
  diagDomOnly: (n) => `只在 DOM 上找到、不在 items 裡的：${n} 個`,
  diagUnmatched: (n) => `配不到 DOM 節點的：${n} 個`,
  unnamed: '(未命名)',
};

const zhCN: Strings = {
  cmdReapply: '重新应用分组',
  cmdCollapseAll: '折叠所有分组',
  cmdExpandAll: '展开所有分组',

  dataDirName: '存储位置',
  dataDirDesc: '本插件的设置文件（data.json）就放在这里。',
  dataDirUnavailable: '当前的存储后端不是本地文件系统，没有可以打开的文件夹。',
  dataDirOpen: '打开',
  dataDirOpenTooltip: '在文件管理器中打开这个文件夹',
  dataDirOpenFailed: (dir) => `打不开：${dir}`,

  ribbonMissingHeading: '找不到 ribbon',
  ribbonMissingDesc:
    '检测不到左侧 ribbon 的按钮容器，分组功能无法工作。' +
    '这通常意味着 Obsidian 改动了 ribbon 的内部结构。请把下面这段信息反馈给开发者。',
  copyDiagnostics: '复制诊断信息',
  copied: '已复制',

  general: '常规',
  ungroupedPosition: '未分组的按钮放在',
  ungroupedPositionDesc: '没有分到任何分组的按钮，要放在所有分组的前面还是后面。',
  positionTop: '最上面',
  positionBottom: '最下面',
  compact: '紧凑间距',
  compactDesc: '缩小分组之间的留白，窗口不高时可以多放几个按钮。',

  missingCount: (n) => `有 ${n} 个按钮当前不在 ribbon 上`,
  missingDesc:
    '对应的插件可能被禁用了。位置会先保留，重新启用后按钮会回到原来的分组；' +
    '确定不再使用可以清除。',
  clear: '清除',

  groups: '分组',
  dragToReorder: '拖动调整分组顺序',
  dragToMove: '拖动移动这个按钮',
  groupNamePlaceholder: '分组名称',
  showTitle: '显示标题',
  showTitleDesc: 'ribbon 很窄，过长的标题会被截断。',
  deleteGroup: '删除这个分组',
  addGroup: '新建分组',
  newGroupName: '新分组',
  backgroundColor: '背景色',
  groupIcon: '图标',
  groupIconDesc: 'Lucide 图标名称，显示在分组上方。留空表示不显示。',
  groupIconPlaceholder: '例如 folder-open',
  groupIconInvalid: '没有这个图标名称',

  ungrouped: '未分组',
  diagnostics: '检测信息',
  dropHere: '把按钮拖到这里',
  searchPlaceholder: '筛选按钮',
  searchNoMatch: '没有匹配的按钮',

  backup: '备份',
  backupDesc: '把分组复制到另一个仓库，或在重置之后还原。',
  exportSettings: '复制设置',
  exportCopied: '设置已复制到剪贴板',
  importSettings: '覆盖设置',
  importPlaceholder: '把导出的设置粘贴在这里',
  importFailed: '这不是有效的设置内容',
  importDone: (groups) => `已导入 ${groups} 个分组`,

  swatchNone: '无',
  swatchRed: '红',
  swatchOrange: '橙',
  swatchYellow: '黄',
  swatchGreen: '绿',
  swatchCyan: '青',
  swatchBlue: '蓝',
  swatchPurple: '紫',

  diagLeftRibbon: (found) => `workspace.leftRibbon：${found ? '有' : '找不到'}`,
  diagButtonEls: (n) => `容器内的按钮元素：${n} 个`,
  diagContainerFromItemsEl: '容器来源：leftRibbon.ribbonItemsEl',
  diagContainerFromSelector: (sel) => `容器来源：选择器 ${sel}`,
  diagContainerNotFound: (selectors) => `找不到容器，尝试过的选择器：${selectors}`,
  diagItemsCount: (n) => `leftRibbon.items：${n} 条`,
  diagFromButtonEl: (n) => `直接取到 buttonEl 的：${n} 个`,
  diagHidden: (n) => `被用户关闭、不参与分组的：${n} 个`,
  diagDomOnly: (n) => `只在 DOM 中找到、不在 items 里的：${n} 个`,
  diagUnmatched: (n) => `匹配不到 DOM 节点的：${n} 个`,
  unnamed: '(未命名)',
};

const ja: Strings = {
  cmdReapply: 'グループを再適用',
  cmdCollapseAll: 'すべてのグループを折りたたむ',
  cmdExpandAll: 'すべてのグループを展開',

  dataDirName: '保存場所',
  dataDirDesc: 'このプラグインの設定ファイル（data.json）はここにあります。',
  dataDirUnavailable: '現在のストレージはローカルファイルシステムではないため、開けるフォルダーがありません。',
  dataDirOpen: '開く',
  dataDirOpenTooltip: 'ファイルマネージャーでこのフォルダーを表示',
  dataDirOpenFailed: (dir) => `開けませんでした：${dir}`,

  ribbonMissingHeading: 'リボンが見つかりません',
  ribbonMissingDesc:
    '左サイドリボンのボタンコンテナーを検出できないため、グループ化は動作しません。' +
    'Obsidian がリボンの内部構造を変更した可能性があります。以下の内容を開発者に報告してください。',
  copyDiagnostics: '診断情報をコピー',
  copied: 'コピーしました',

  general: '一般',
  ungroupedPosition: '未分類のボタンの位置',
  ungroupedPositionDesc: 'どのグループにも属さないボタンを、すべてのグループの上と下のどちらに置くか。',
  positionTop: '上',
  positionBottom: '下',
  compact: 'コンパクト表示',
  compactDesc: 'グループ周りの余白を詰めて、ウィンドウが低いときでも多くのボタンを表示します。',

  missingCount: (n) => `${n} 個のボタンが現在リボンにありません`,
  missingDesc:
    '対応するプラグインが無効になっている可能性があります。位置は保持されるので、' +
    '再度有効にすると同じグループに戻ります。もう使わない場合は削除してください。',
  clear: '削除',

  groups: 'グループ',
  dragToReorder: 'ドラッグしてグループを並べ替え',
  dragToMove: 'ドラッグしてこのボタンを移動',
  groupNamePlaceholder: 'グループ名',
  showTitle: 'タイトルを表示',
  showTitleDesc: 'リボンは幅が狭いため、長いタイトルは省略されます。',
  deleteGroup: 'このグループを削除',
  addGroup: 'グループを追加',
  newGroupName: '新しいグループ',
  backgroundColor: '背景色',
  groupIcon: 'アイコン',
  groupIconDesc: 'グループの上に表示する Lucide アイコン名。空にすると表示しません。',
  groupIconPlaceholder: '例：folder-open',
  groupIconInvalid: 'そのアイコン名は存在しません',

  ungrouped: '未分類',
  diagnostics: '検出情報',
  dropHere: 'ここにボタンをドロップ',
  searchPlaceholder: 'ボタンを絞り込む',
  searchNoMatch: '条件に一致するボタンがありません',

  backup: 'バックアップ',
  backupDesc: 'グループを別の保管庫にコピーしたり、リセット後に復元したりできます。',
  exportSettings: '設定をコピー',
  exportCopied: '設定をクリップボードにコピーしました',
  importSettings: '設定を上書き',
  importPlaceholder: 'エクスポートした設定をここに貼り付け',
  importFailed: '有効な設定データではありません',
  importDone: (groups) => `${groups} 個のグループをインポートしました`,

  swatchNone: 'なし',
  swatchRed: '赤',
  swatchOrange: 'オレンジ',
  swatchYellow: '黄',
  swatchGreen: '緑',
  swatchCyan: 'シアン',
  swatchBlue: '青',
  swatchPurple: '紫',

  diagLeftRibbon: (found) => `workspace.leftRibbon：${found ? 'あり' : 'なし'}`,
  diagButtonEls: (n) => `コンテナー内のボタン要素：${n} 個`,
  diagContainerFromItemsEl: 'コンテナーの取得元：leftRibbon.ribbonItemsEl',
  diagContainerFromSelector: (sel) => `コンテナーの取得元：セレクター ${sel}`,
  diagContainerNotFound: (selectors) => `コンテナーが見つかりません。試したセレクター：${selectors}`,
  diagItemsCount: (n) => `leftRibbon.items：${n} 件`,
  diagFromButtonEl: (n) => `buttonEl から直接取得：${n} 個`,
  diagHidden: (n) => `ユーザーが非表示にしたためグループ化対象外：${n} 個`,
  diagDomOnly: (n) => `DOM にはあるが items にない：${n} 個`,
  diagUnmatched: (n) => `DOM ノードと対応付けできない：${n} 個`,
  unnamed: '(名称未設定)',
};

const ko: Strings = {
  cmdReapply: '그룹 다시 적용',
  cmdCollapseAll: '모든 그룹 접기',
  cmdExpandAll: '모든 그룹 펼치기',

  dataDirName: '저장 위치',
  dataDirDesc: '이 플러그인의 설정 파일(data.json)이 여기에 있습니다.',
  dataDirUnavailable: '현재 저장소가 로컬 파일 시스템이 아니므로 열 수 있는 폴더가 없습니다.',
  dataDirOpen: '열기',
  dataDirOpenTooltip: '파일 관리자에서 이 폴더 보기',
  dataDirOpenFailed: (dir) => `열 수 없습니다: ${dir}`,

  ribbonMissingHeading: '리본을 찾을 수 없음',
  ribbonMissingDesc:
    '왼쪽 리본의 버튼 컨테이너를 찾지 못해 그룹 기능을 사용할 수 없습니다. ' +
    'Obsidian이 리본의 내부 구조를 변경했을 가능성이 높습니다. 아래 내용을 개발자에게 알려 주세요.',
  copyDiagnostics: '진단 정보 복사',
  copied: '복사했습니다',

  general: '일반',
  ungroupedPosition: '그룹 없는 버튼 위치',
  ungroupedPositionDesc: '어느 그룹에도 속하지 않는 버튼을 모든 그룹의 위와 아래 중 어디에 둘지 정합니다.',
  positionTop: '맨 위',
  positionBottom: '맨 아래',
  compact: '좁은 간격',
  compactDesc: '그룹 주위의 여백을 줄여 창이 낮아도 더 많은 버튼이 보이게 합니다.',

  missingCount: (n) => `현재 리본에 없는 버튼이 ${n}개 있습니다`,
  missingDesc:
    '해당 플러그인이 비활성화되었을 수 있습니다. 위치는 그대로 남으므로 다시 활성화하면 ' +
    '같은 그룹으로 돌아옵니다. 더 이상 쓰지 않는다면 지워도 됩니다.',
  clear: '지우기',

  groups: '그룹',
  dragToReorder: '끌어서 그룹 순서 바꾸기',
  dragToMove: '끌어서 이 버튼 옮기기',
  groupNamePlaceholder: '그룹 이름',
  showTitle: '제목 표시',
  showTitleDesc: '리본이 좁아서 긴 제목은 잘립니다.',
  deleteGroup: '이 그룹 삭제',
  addGroup: '그룹 추가',
  newGroupName: '새 그룹',
  backgroundColor: '배경색',
  groupIcon: '아이콘',
  groupIconDesc: '그룹 위에 표시할 Lucide 아이콘 이름입니다. 비워 두면 표시하지 않습니다.',
  groupIconPlaceholder: '예: folder-open',
  groupIconInvalid: '그런 아이콘 이름은 없습니다',

  ungrouped: '그룹 없음',
  diagnostics: '감지 정보',
  dropHere: '여기에 버튼을 놓으세요',
  searchPlaceholder: '버튼 검색',
  searchNoMatch: '조건에 맞는 버튼이 없습니다',

  backup: '백업',
  backupDesc: '그룹을 다른 보관함으로 복사하거나 초기화 후 복원할 수 있습니다.',
  exportSettings: '설정 복사',
  exportCopied: '설정을 클립보드에 복사했습니다',
  importSettings: '설정 덮어쓰기',
  importPlaceholder: '내보낸 설정을 여기에 붙여넣으세요',
  importFailed: '올바른 설정 데이터가 아닙니다',
  importDone: (groups) => `그룹 ${groups}개를 가져왔습니다`,

  swatchNone: '없음',
  swatchRed: '빨강',
  swatchOrange: '주황',
  swatchYellow: '노랑',
  swatchGreen: '초록',
  swatchCyan: '청록',
  swatchBlue: '파랑',
  swatchPurple: '보라',

  diagLeftRibbon: (found) => `workspace.leftRibbon: ${found ? '있음' : '없음'}`,
  diagButtonEls: (n) => `컨테이너 안의 버튼 요소: ${n}개`,
  diagContainerFromItemsEl: '컨테이너 출처: leftRibbon.ribbonItemsEl',
  diagContainerFromSelector: (sel) => `컨테이너 출처: 선택자 ${sel}`,
  diagContainerNotFound: (selectors) => `컨테이너를 찾지 못했습니다. 시도한 선택자: ${selectors}`,
  diagItemsCount: (n) => `leftRibbon.items: ${n}건`,
  diagFromButtonEl: (n) => `buttonEl에서 바로 얻음: ${n}개`,
  diagHidden: (n) => `사용자가 숨겨 그룹 대상에서 제외: ${n}개`,
  diagDomOnly: (n) => `DOM에는 있으나 items에 없음: ${n}개`,
  diagUnmatched: (n) => `DOM 노드와 연결하지 못함: ${n}개`,
  unnamed: '(이름 없음)',
};

/**
 * Map Obsidian's language code onto one of the bundled locales.
 *
 * Obsidian reports simplified Chinese as `zh` and traditional as `zh-TW`. The
 * two are kept separate rather than sharing one Chinese translation: the
 * wording differs enough that reusing either one reads as a machine conversion.
 */
function resolveStrings(code: string): Strings {
  if (code === 'zh-TW') return zhTW;
  if (code.startsWith('zh')) return zhCN;
  if (code.startsWith('ja')) return ja;
  if (code.startsWith('ko')) return ko;
  return en;
}

/** Strings for the current interface language. */
export const t: Strings = resolveStrings(getLanguage());
