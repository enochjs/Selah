import { createAudioPreview } from "./audio-preview.js";

const $ = (selector, parent = document) => parent.querySelector(selector);
const app = $("#app");
const dialog = $("#dialog");
const paths = {
  cross: '<path d="M12 3v18M5 9h14"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  book: '<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1v15"/>',
  headphones:
    '<path d="M3 14v-3a9 9 0 0 1 18 0v3"/><rect x="3" y="12" width="4" height="9" rx="2"/><rect x="17" y="12" width="4" height="9" rx="2"/>',
  music:
    '<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
  words:
    '<path d="M4 4h7M7.5 3v2c0 5-2 8-5 10M4 8c1 3 4 5 7 6M13 21l4-11 4 11M14 18h6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  review: '<path d="M9 3H5v18h14V3h-4M9 2h6v4H9zM8 12l2 2 5-5M8 18h7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  settings:
    '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 12l3 3 5-6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  refresh: '<path d="M20 7a9 9 0 1 0 1 9M20 3v5h-5"/>',
  logout: '<path d="M10 3H4v18h6M9 12h12m-5-5 5 5-5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  leaf: '<path d="M20 3c-9-1-17 2-16 10a6 6 0 0 0 10 5c4-3 5-9 6-15M3 21l10-10"/>',
  external: '<path d="M14 3h7v7M21 3l-11 11M10 3H3v18h18v-7"/>',
  server:
    '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01"/>',
};
const icon = (name) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24">${paths[name] || paths.book}</svg>`;
const escapeHtml = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const e = escapeHtml;
const num = (value) => Number(value || 0).toLocaleString("zh-CN");
const date = (value, short = false) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        ...(short ? {} : { hour: "2-digit", minute: "2-digit" }),
      }).format(new Date(value))
    : "—";
const duration = (value) =>
  `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
const qualityLabel = (quality) =>
  ({
    "provider-timing": "来源时间轴",
    "verse-file": "独立经句 MP3",
    "forced-alignment": "本地验证补充",
    unaligned: "待对齐",
  })[quality] ||
  quality ||
  "—";
const actionLabel = (action) =>
  ({
    "review.update": "更新内容审核",
    "dictionary.save": "保存词典草稿",
    "hymn.save": "更新诗歌资料",
    "hymn.upload": "上传诗歌待审核",
    "hymn.review": "审核诗歌",
    "hymn.delete": "删除诗歌",
    "playlist.save": "保存云端歌单",
    "playlist.delete": "删除云端歌单",
    "dictionary.delete": "删除词典条目",
    "dictionary.publish": "发布内置词典",
    "content.check.passed": "资源索引校验通过",
    "content.check.failed": "资源索引校验未通过",
  })[action] || action;
const badge = (status = "pending") =>
  `<span class="badge ${e(status)}">${status === "approved" ? "已审核" : status === "flagged" ? "待处理" : "未审核"}</span>`;
const landscape = `<svg class="hero-art" viewBox="0 0 380 200" aria-hidden="true"><circle cx="263" cy="52" r="26" fill="#d5dcbc"/><path d="M20 200C80 100 110 133 171 108S256 68 380 120V200Z" fill="#d9e1cb"/><path d="M0 200c100-50 120-13 207-59s93-59 173-43v102z" fill="#becdb0"/><path d="M130 200c60-58 108-51 156-89s65-36 94-29v118z" fill="#a6bc99"/><path d="M212 200c43-45 92-17 168-69v69z" fill="#90aa80"/><path d="M289 200c-16-18-5-32 12-41s24-26 13-33" stroke="#edf1e8" stroke-width="2" fill="none"/><path d="M348 97V42m0 14-10 10m10-2 11 10m-11 0-15 12m15-4 13 9" stroke="#8da37b" stroke-width="2" fill="none"/></svg>`;
const brand = `<div class="brand"><span class="brand-symbol">${icon("cross")}</span><div><div class="brand-name">Selah<em>息语</em></div><div class="brand-sub">A MOMENT WITH THE WORD</div></div></div>`;
const routes = {
  "daily-verses": [
    "每日经文",
    "leaf",
    "DAILY SCRIPTURE",
    "安排经文与图片，审核后发布到每日阅读。",
  ],
  overview: ["工作台", "grid", "OVERVIEW", "内容与服务，一目了然。"],
  scripture: [
    "经文管理",
    "book",
    "SCRIPTURE LIBRARY",
    "浏览中英经文，记录每一次内容审核。",
  ],
  recordings: [
    "圣经音频",
    "headphones",
    "BIBLE AUDIO",
    "逐章查看录音与时间轴，试听每一节经文。",
  ],
  hymns: [
    "诗歌管理",
    "music",
    "HYMN LIBRARY",
    "独立管理平台诗歌、资料与提供状态。",
  ],
  dictionary: ["内置词典", "words", "VOCABULARY", "让每一个词，都更容易理解。"],
  playlists: [
    "云端歌单",
    "music",
    "CLOUD PLAYLISTS",
    "编排平台诗歌，为用户提供精选歌单。",
  ],
  reviews: [
    "内容审核",
    "review",
    "CONTENT REVIEW",
    "跟进问题、记录核对，让内容值得信赖。",
  ],
  audit: ["操作日志", "clock", "ACTIVITY LOG", "每一次管理操作，都有迹可循。"],
  system: [
    "系统设置",
    "settings",
    "SYSTEM & SOURCES",
    "资源来源、发布状态与服务信息。",
  ],
};
let session;
let books = [];
let pageData;
let routeName = "overview";
let query = new URLSearchParams();
let generation = 0;
let dialogGeneration = 0;
let toastTimer;
let audioPreview;
function toast(message, error = false) {
  const node = $("#toast");
  node.textContent = message;
  node.className = `toast${error ? " error" : ""}`;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 4000);
}
async function api(route, method = "GET", body) {
  const multipart = body instanceof FormData;
  const response = await fetch(`/api/admin${route}`, {
    method,
    credentials: "same-origin",
    headers: {
      ...(multipart ? {} : { "Content-Type": "application/json" }),
      ...(session ? { "X-CSRF-Token": session.csrf } : {}),
    },
    ...(body === undefined
      ? {}
      : { body: multipart ? body : JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && route !== "/login") {
      session = null;
      closeDialog();
      showLogin();
    }
    throw new Error(result.error || "请求失败，请稍后重试");
  }
  return result;
}
function navigate(name, params = {}) {
  const search = new URLSearchParams(params).toString();
  const target = `#${name}${search ? `?${search}` : ""}`;
  if (location.hash === target) loadPage();
  else location.hash = target;
}
function setFilter(name, value) {
  const next = new URLSearchParams(query);
  if (value) next.set(name, value);
  else next.delete(name);
  if (name !== "page") next.delete("page");
  if (name === "book") next.delete("chapter");
  navigate(routeName, Object.fromEntries(next));
}
function showLogin() {
  generation++;
  app.innerHTML = `<main class="login"><section class="login-story">${brand}<div class="login-quote"><div class="eyebrow">THE SELAH ADMINISTRATION</div><h1>安静的力量，<br>在每一处细节。</h1><p>用心照料每一段经文、每一节声音，<br>让阅读与聆听，成为日常的美好。</p></div>${landscape}<footer>PAUSE. REFLECT. GROW.</footer></section><section class="login-form-wrap"><form class="login-form" id="login-form"><div class="eyebrow">WELCOME BACK</div><h2>欢迎回到管理中心</h2><p>登录你的管理员账号，开始今天的内容管理。</p><div class="field"><label for="username">管理员账号</label><input id="username" name="username" autocomplete="username" value="admin" required maxlength="80"></div><div class="field"><label for="password">登录密码</label><div class="password-field"><input id="password" type="password" name="password" autocomplete="current-password" placeholder="请输入管理员密码" required maxlength="512"><button class="icon-button" type="button" data-action="toggle-password" aria-label="显示或隐藏密码">${icon("eye")}</button></div></div><div class="inline-error" id="login-error" role="alert"></div><button class="button primary" type="submit">登录管理中心 ${icon("arrow")}</button><div class="login-hint">首次使用？初始账号与随机密码显示在启动服务的终端中。<br>如已配置管理员密码，请使用配置的凭据登录。</div><div class="login-security">${icon("shield")} 安全会话 · 仅管理员可访问</div></form></section></main>`;
}
function navigation(label, keys) {
  return `<div class="nav-label">${label}</div><nav class="nav" aria-label="${label}导航">${keys.map((key) => `<a href="#${key}" data-route="${key}">${icon(routes[key][1])}${routes[key][0]}</a>`).join("")}</nav>`;
}
function shell() {
  app.innerHTML = `<div class="layout"><button class="mobile-backdrop" data-action="menu" aria-label="收起导航"></button><aside class="sidebar">${brand}<div class="workspace"><span>${icon("leaf")}</span><div><strong>息语内容中心</strong><p>Selah · Administration</p></div></div>${navigation("工作台", ["overview"])}${navigation("圣经", ["scripture", "recordings", "daily-verses"])}${navigation("诗歌", ["hymns", "playlists"])}<div class="nav-divider"></div>${navigation("管理", ["dictionary", "reviews", "audit", "system"])}<div class="sidebar-bottom"><div class="help-card">${icon("book")}<h3>每一份内容，悉心守护</h3><p>管理真实经文与配套资源，<br>让每一份改变都有迹可循。</p><a href="#system">查看资源与发布说明 ${icon("arrow")}</a></div><div class="profile"><div class="avatar">${e(session.username.slice(0, 1).toUpperCase())}</div><div><strong>${e(session.username)}</strong><p>系统管理员</p></div><button class="icon-button" data-action="logout" title="退出登录" aria-label="退出登录">${icon("logout")}</button></div></div></aside><main class="main"><header class="topbar"><button class="icon-button menu-toggle" data-action="menu" aria-label="展开导航">${icon("menu")}</button><div class="breadcrumb">管理中心 ${icon("chevron")}<strong id="breadcrumb-current">工作台</strong></div><div class="top-actions"><form class="global-search" id="global-search">${icon("search")}<input name="q" aria-label="全局经文搜索" placeholder="搜索经文、关键词…" autocomplete="off"><span class="keycap">↵</span></form><span class="live">资源服务已连接</span></div></header><div class="content" id="content"></div></main></div>`;
  loadPage();
}
function heading(actions = "") {
  const [title, , eyebrow, subtitle] = routes[routeName];
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${routeName === "overview" ? "工作台概览" : title}</h1><p>${subtitle}</p></div><div class="heading-actions">${actions}</div></div>`;
}
const button = (label, name, primary = false, extra = "") =>
  `<button class="button${primary ? " primary" : ""}" data-action="${name}" ${extra}>${label}</button>`;
const footer = () =>
  `<footer class="footer"><span>Selah · 息语管理中心</span><span>用心管理，让每一次相遇都有意义。</span></footer>`;
const empty = (
  title = "暂时没有内容",
  description = "试着调整搜索关键词或筛选条件。",
) =>
  `<div class="empty">${icon("leaf")}<strong>${title}</strong>${description}</div>`;
function pagination(data) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const choices = [
    ...new Set([1, data.page - 1, data.page, data.page + 1, pages]),
  ].filter((p) => p > 0 && p <= pages);
  return `<div class="pagination"><span>共 ${num(data.total)} 条 · 第 ${data.page} / ${pages} 页</span><div class="page-buttons"><button data-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""} aria-label="上一页">${icon("left")}</button>${choices.map((p) => `<button data-page="${p}" class="${p === data.page ? "active" : ""}" aria-label="第 ${p} 页" ${p === data.page ? 'aria-current="page"' : ""}>${p}</button>`).join("")}<button data-page="${data.page + 1}" ${data.page >= pages ? "disabled" : ""} aria-label="下一页">${icon("chevron")}</button></div></div>`;
}
function searchForm(placeholder) {
  return `<form class="search-form" id="filter-search"><input type="search" name="q" value="${e(query.get("q") || "")}" placeholder="${placeholder}" aria-label="${placeholder}"><button class="button" type="submit">${icon("search")}搜索</button></form>`;
}
function selectFilter(name, label, options) {
  return `<select data-filter="${name}" aria-label="${label}"><option value="">${label}</option>${options.map(([value, title]) => `<option value="${e(value)}" ${query.get(name) === String(value) ? "selected" : ""}>${e(title)}</option>`).join("")}</select>`;
}
function bookFilters() {
  const selected = books.find((b) => b.id === query.get("book"));
  return (
    selectFilter(
      "book",
      "全部书卷",
      books.map((b) => [b.id, b.zh]),
    ) +
    (selected
      ? selectFilter(
          "chapter",
          "全部章节",
          Array.from({ length: selected.chapters }, (_, i) => [
            i + 1,
            `第 ${i + 1} 章`,
          ]),
        )
      : "")
  );
}
function activity(items) {
  return items.length
    ? `<ul class="activity-list">${items.map((item) => `<li><span class="activity-icon">${icon(item.action.startsWith("dictionary") ? "words" : item.action.startsWith("content") ? "shield" : "review")}</span><div>${e(actionLabel(item.action))}<div class="target">${e(item.target)} · ${e(item.actor)}</div></div><time>${date(item.at)}</time></li>`).join("")}</ul>`
    : empty("新的一天，从这里开始", "审核、词典编辑与发布记录会在这里展示。");
}
function overview(data) {
  const counts = data.counts;
  const playable = counts.aligned + (counts.partial ?? 0);
  const percent = counts.recordings
    ? ((playable / counts.recordings) * 100).toFixed(1).replace(/\.0$/, "")
    : "0";
  const metrics = [
    [
      "经文书卷",
      counts.books,
      "卷",
      "book",
      `${num(counts.chapters)} 章 · ${num(counts.verses)} 节经文`,
    ],
    ["圣经音频", counts.recordings, "章", "headphones", "中英双语 · 按章配套"],
    [
      "经句播放可用",
      percent,
      "%",
      "shield",
      `${num(playable)} 章支持经句播放（含部分缺录）`,
    ],
    [
      "平台诗歌",
      data.hymns.total,
      "首",
      "music",
      `${num(data.hymns.enabled)} 首启用 · ${num(data.hymns.disabled)} 首停用`,
    ],
  ];
  return (
    heading(
      `<span class="muted small">${new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date())}</span>${button(`${icon("refresh")}刷新数据`, "refresh")}`,
    ) +
    `<section class="hero"><div class="hero-copy"><div class="eyebrow">A LITTLE CARE, A LASTING DIFFERENCE</div><h2>让每一份内容，安静地发光。</h2><p>从经文到声音，悉心照料每一个细节。<br>这里是息语的内容空间，也是美好体验的起点。</p><div class="hero-tag">${icon("leaf")} ${num(counts.books)} 卷圣经 · 中英双语 · 持续用心</div></div>${landscape}</section><div class="stats">${metrics.map(([title, value, unit, name, detail]) => `<section class="stat"><div class="stat-top"><span>${title}</span><span class="stat-icon">${icon(name)}</span></div><div class="stat-value">${typeof value === "number" ? num(value) : value}<small>${unit}</small></div><div class="stat-foot"><span class="dot"></span>${detail}</div></section>`).join("")}</div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>经文内容库</h2><p>THE SCRIPTURE COLLECTION</p></div><a class="text-link" href="#scripture">查看全部 ${icon("arrow")}</a></div><div class="panel-body"><div class="collection-tabs"><button class="active" data-testament="old">旧约 · ${data.books.filter((b) => b.testament === "old").length} 卷</button><button data-testament="new">新约 · ${data.books.filter((b) => b.testament === "new").length} 卷</button></div><div class="book-grid" id="overview-books">${bookCards(data.books, "old")}</div></div></section><section class="panel"><div class="panel-head"><div><h2>圣经音频状态</h2><p>让每一句，都被清晰听见</p></div><span class="badge green">${playable === counts.recordings ? "核对完成" : "仍有待核对"}</span></div><div class="panel-body"><div class="coverage-score"><strong>${percent}%</strong><span>经句播放可用章节占比</span></div><progress class="coverage-progress" value="${playable}" max="${counts.recordings || 1}" aria-label="经句播放可用章节占比"></progress><div class="progress-row"><span><i class="dot"></i>来源时间轴</span><b>${num(data.manifest.providerTimingRecordings)} 章</b></div><div class="progress-row"><span><i class="dot soft"></i>独立经句 MP3</span><b>${num(data.manifest.verseFileRecordings)} 章</b></div><div class="progress-row"><span>完整通过</span><b>${num(counts.aligned)} 章</b></div><div class="progress-row"><span>部分通过 · 来源缺录</span><b>${num(counts.partial)} 章 / ${num(counts.missingVerseCount)} 节</b></div><div class="progress-row"><span>待处理 / 待复核</span><b>${num(counts.pending)} / ${num(counts.review)} 章</b></div><div class="progress-row"><span><i class="dot gold"></i>本地验证补充</span><b>${num(data.manifest.localTimingRecordings)} 章</b></div><div class="notice">${icon("info")}<span>覆盖率根据资源索引计算。实际音频可用性可在圣经音频库中试听核对。</span></div><a class="text-link coverage-link" href="#recordings">进入圣经音频库 ${icon("arrow")}</a></div></section></div><section class="panel hymn-overview"><div class="panel-head"><div><h2>诗歌资源</h2><p>平台诗歌 · 独立于圣经录音</p></div><a class="text-link" href="#hymns">管理诗歌 ${icon("arrow")}</a></div><div class="panel-body"><div class="hymn-summary"><span>共 <strong>${num(data.hymns.total)}</strong> 首</span><span>启用 ${num(data.hymns.enabled)} 首</span><span>停用 ${num(data.hymns.disabled)} 首</span><span>可试听 ${num(data.hymns.audioAvailable)} 首</span></div><p class="small muted">管理平台诗歌与云端歌单；用户的个人歌单和收藏保存在设备上。</p></div></section><div class="dashboard-bottom"><section class="panel"><div class="panel-head"><div><h2>最近动态</h2><p>每一份用心，都留下记录</p></div><a class="text-link" href="#audit">全部记录 ${icon("arrow")}</a></div>${activity(data.recent)}</section><section class="panel"><div class="panel-head"><div><h2>快捷入口</h2><p>常用管理，触手可及</p></div></div><div class="panel-body"><div class="quick-links"><a class="quick-link" href="#reviews?status=flagged">${icon("review")}<div><strong>待处理内容</strong><p>${num(counts.flagged)} 条需要关注</p></div></a><a class="quick-link" href="#dictionary">${icon("words")}<div><strong>维护词典</strong><p>编辑释义与音标</p></div></a><button class="quick-link" data-action="check">${icon("shield")}<div><strong>资源校验</strong><p>检查经文与音频索引</p></div></button><a class="quick-link" href="/api/admin/export" download>${icon("download")}<div><strong>导出备份</strong><p>审核记录与词典草稿</p></div></a></div></div></section></div>` +
    footer()
  );
}
function bookCards(items, testament) {
  return items
    .filter((b) => b.testament === testament)
    .slice(0, 6)
    .map(
      (book) =>
        `<a class="book-card" href="#scripture?book=${e(book.id)}"><span class="book-icon">${icon("book")}</span><strong>${e(book.zh)}</strong><span class="en">${e(book.en)}</span><small>${book.chapters} 章 · ${num(book.verses)} 节</small><span class="arrow">${icon("arrow")}</span></a>`,
    )
    .join("");
}
function scripture(data) {
  return (
    heading(button(`${icon("refresh")}刷新`, "refresh")) +
    `<section class="panel"><div class="toolbar">${searchForm("搜索中英经文或引用…")}${bookFilters()}${selectFilter(
      "testament",
      "全部新旧约",
      [
        ["old", "旧约"],
        ["new", "新约"],
      ],
    )}${selectFilter("status", "全部审核状态", [
      ["pending", "未审核"],
      ["approved", "已审核"],
      ["flagged", "待处理"],
    ])}</div><div class="result-meta"><span>中英对照 · 共 ${num(data.total)} 节</span><span class="badge">BSB / CUVs</span></div>${data.items.length ? `<div class="table-scroll"><table><thead><tr><th>经文引用</th><th>中文 · 和合本</th><th>English · BSB</th><th>审核状态</th><th>操作</th></tr></thead><tbody>${data.items.map((row) => `<tr><td class="reference"><strong>${e(row.bookZh)} ${row.chapter}:${row.number}</strong><small>${e(row.book)} ${row.chapter}:${row.number}</small></td><td><div class="verse-zh">${e(row.zh || (row.zhMergedInto ? `合并至 ${row.zhMergedChapter || row.chapter}:${row.zhMergedInto}` : "来源版本省略"))}</div></td><td><div class="verse-en">${e(row.en || "Omitted / merged in source")}</div></td><td>${badge(row.review?.status)}</td><td><button class="button" data-action="review-verse" data-key="${e(row.key)}">${icon("review")}查看审核</button></td></tr>`).join("")}</tbody></table></div>` : empty()}${pagination(data)}</section>` +
    footer()
  );
}
function recordingPage(data) {
  return (
    heading(button(`${icon("refresh")}刷新`, "refresh")) +
    `<section class="panel"><div class="toolbar">${searchForm("搜索书卷或朗读者…")}${bookFilters()}${selectFilter(
      "locale",
      "全部语言",
      [
        ["en", "English · BSB"],
        ["zh", "中文 · 合成朗读"],
      ],
    )}${selectFilter("quality", "全部时间轴类型", [
      ["provider-timing", "来源时间轴"],
      ["verse-file", "独立经句 MP3"],
      ["forced-alignment", "本地验证补充"],
      ["unaligned", "待对齐"],
    ])}</div><div class="result-meta"><span>共 ${num(data.total)} 章录音</span><span>经句试听 · 原始资源</span></div>${data.items.length ? `<div class="table-scroll"><table><thead><tr><th>书卷 / 章节</th><th>语言与朗读</th><th>总时长</th><th>经句音频</th><th>时间轴</th><th>审核</th><th>操作</th></tr></thead><tbody>${data.items.map((row) => `<tr><td class="reference"><strong>${e(row.bookZh)} 第 ${row.chapter} 章</strong><small>${e(row.book)}</small></td><td><span class="badge ${row.locale === "en" ? "green" : "blue"}">${row.locale === "en" ? "English · BSB" : "中文 · CUVs"}</span><div class="small muted">${e(row.reader)}</div></td><td class="nowrap">${duration(row.duration)}</td><td>${num(row.items)} 节</td><td><span class="badge">${e(qualityLabel(row.timingQuality))}</span>${row.alignmentStatus === "partial" ? `<div class="small muted">部分通过 · 来源缺录 ${num(row.missingVerses?.length)} 节${row.missingFragments?.length ? `、${num(row.missingFragments.length)} 段文字` : ""}</div>` : ""}</td><td>${badge(row.review?.status)}</td><td><button class="button" data-action="audio" data-key="${e(row.key)}">${icon("play")}试听</button></td></tr>`).join("")}</tbody></table></div>` : empty()}${pagination(data)}</section>` +
    footer()
  );
}
function hymnPage(data) {
  return (
    heading(
      button(`${icon("plus")}上传诗歌`, "upload-hymn") +
        button(`${icon("refresh")}刷新`, "refresh"),
    ) +
    `<div class="info-banner"><span>${icon("info")} 上传 MP3 后先试听、核对资料与授权，再审核发布。通过后用户联网进入首页或聆听页即可看到；页面打开期间每分钟更新。个人收藏仍保存在用户设备上。</span><span class="badge">v${data.revision}</span></div>
    <section class="panel"><div class="toolbar">${searchForm("搜索歌名、演奏者或分类…")}${selectFilter(
      "status",
      "全部提供状态",
      [
        ["enabled", "启用"],
        ["disabled", "停用"],
      ],
    )}${selectFilter("reviewStatus", "全部审核状态", [
      ["pending", "待审核"],
      ["approved", "已通过"],
      ["rejected", "已驳回"],
    ])}${selectFilter(
      "category",
      "全部分类",
      data.categories.map((category) => [category, category]),
    )}</div>
    <div class="result-meta"><span>筛选结果 ${num(data.total)} 首 · 平台共 ${num(data.counts.total)} 首</span><span>启用 ${num(data.counts.enabled)} · 停用 ${num(data.counts.disabled)}</span></div>
    ${data.items.length ? `<div class="table-scroll"><table><thead><tr><th>诗歌名称</th><th>演奏者 / 分类</th><th>时长</th><th>来源与授权</th><th>提供状态</th><th>操作</th></tr></thead><tbody>${data.items.map((row) => `<tr><td class="reference"><strong>${e(row.titleZh)}</strong><small>${e(row.titleEn)}</small><div class="small muted">${e(row.subtitleZh)}</div></td><td class="nowrap">${e(row.artist)}<div class="small muted">${e(row.category)}</div></td><td class="nowrap">${duration(row.duration)}</td><td><div class="note-text small">${e(row.source)}</div><div class="note-text small muted">${e(row.license)}</div></td><td><span class="badge ${row.enabled ? "green" : "flagged"}">${row.reviewStatus === "pending" ? "待审核" : row.reviewStatus === "rejected" ? "已驳回" : row.enabled ? "已通过 · 启用" : "已通过 · 停用"}</span>${row.reviewNote ? `<div class="small muted">${e(row.reviewNote)}</div>` : ""}${row.audioAvailable ? "" : '<div class="small muted">试听文件未就绪</div>'}</td><td><div class="table-actions"><button class="button" data-action="hymn-audio" data-key="${e(row.id)}" ${row.audioAvailable ? "" : 'disabled title="服务端尚未准备此诗歌的试听文件"'}>${icon("play")}试听</button><button class="button" data-action="edit-hymn" data-key="${e(row.id)}">${icon("edit")}编辑</button>${row.reviewStatus === "pending" ? `<button class="button" data-action="review-hymn" data-key="${e(row.id)}">审核</button>` : ""}<button class="button danger" data-action="delete-hymn" data-key="${e(row.id)}" aria-label="删除${e(row.titleZh)}">${icon("trash")}删除</button></div></td></tr>`).join("")}</tbody></table></div>` : empty("没有匹配的诗歌", "试着调整搜索或筛选条件；这里仅显示平台诗歌。")}
    ${pagination(data)}</section>` +
    footer()
  );
}
function playlistPage(data) {
  const covers = { morning: "清晨", mountains: "群山", lake: "湖泊" };
  return (
    heading(
      button(`${icon("plus")}新建歌单`, "new-playlist", true) +
        button(`${icon("refresh")}刷新`, "refresh"),
    ) +
    `<div class="info-banner"><span>${icon("info")} 云端歌单由管理员编排。用户只会看到已发布歌单中当前可用的诗歌；下架歌曲的编排位置保留。个人歌单与收藏保存在用户设备上。</span><span class="badge">v${data.revision}</span></div><section class="panel"><div class="panel-head"><div><h2>精选歌单</h2><p>${num(data.items.length)} 个歌单 · ${num(data.items.filter((item) => item.enabled).length)} 个已发布</p></div></div>${data.items.length ? `<div class="table-scroll"><table><thead><tr><th>歌单名称</th><th>介绍</th><th>封面 / 歌曲</th><th>发布状态</th><th>操作</th></tr></thead><tbody>${data.items.map((row) => `<tr><td class="reference"><strong>${e(row.titleZh)}</strong><small>${e(row.titleEn)}</small></td><td><div class="note-text small">${e(row.descriptionZh)}</div><div class="note-text small muted">${e(row.descriptionEn)}</div></td><td>${covers[row.cover] || e(row.cover)}<div class="small muted">${num(row.hymnIds.length)} 首</div></td><td><span class="badge ${row.enabled ? "green" : "flagged"}">${row.enabled ? "已发布" : "未发布"}</span></td><td><div class="table-actions">${button("编辑 / 排序", "edit-playlist", false, `data-key="${e(row.id)}"`)}<button class="button danger" data-action="delete-playlist" data-key="${e(row.id)}">删除</button></div></td></tr>`).join("")}</tbody></table></div>` : empty("还没有云端歌单", "新建歌单，选择平台诗歌并编排播放顺序。")}</section>`
  );
}

function playlistSongRow(id, song) {
  const label = song
    ? `${song.titleZh} · ${song.titleEn}`
    : `歌曲已删除 · ${id}`;
  const available =
    song &&
    song.enabled &&
    (!song.reviewStatus || song.reviewStatus === "approved") &&
    (!song.uploadedAt || song.audioAvailable);
  return `<li data-hymn-id="${e(id)}"><div class="playlist-song-title"><strong>${e(label)}</strong>${available ? "" : '<span class="small muted">当前不向用户提供</span>'}</div><div class="table-actions">${button("上移", "playlist-up", false, 'aria-label="上移歌曲"')}${button("下移", "playlist-down", false, 'aria-label="下移歌曲"')}${button("移除", "playlist-remove", false, 'aria-label="从歌单移除歌曲"')}</div></li>`;
}

async function playlistDialog(id) {
  const request = ++dialogGeneration;
  const pageGeneration = generation;
  const row = pageData.items.find((item) => item.id === id) || {
    titleZh: "",
    titleEn: "",
    descriptionZh: "",
    descriptionEn: "",
    cover: "morning",
    hymnIds: [],
    enabled: false,
  };
  const revision = pageData.revision;
  const songs = [];
  let page = 1;
  while (true) {
    const result = await api(`/hymns?pageSize=100&page=${page}`);
    if (
      request !== dialogGeneration ||
      pageGeneration !== generation ||
      routeName !== "playlists"
    )
      return;
    songs.push(...result.items);
    if (songs.length >= result.total) break;
    page++;
  }
  const field = (name, label, multiline = false) =>
    `<div class="field"><label for="playlist-${name}">${label}</label>${multiline ? `<textarea id="playlist-${name}" name="${name}" maxlength="1000">${e(row[name])}</textarea>` : `<input id="playlist-${name}" name="${name}" maxlength="120" value="${e(row[name])}" required>`}</div>`;
  openDialog(
    id ? `编辑歌单 · ${row.titleZh}` : "新建云端歌单",
    `<div class="dialog-body"><form id="playlist-form" data-key="${e(id || "")}" data-revision="${revision}"><div class="form-grid">${field("titleZh", "中文名称")}${field("titleEn", "英文名称")}</div>${field("descriptionZh", "中文介绍", true)}${field("descriptionEn", "英文介绍", true)}<div class="form-grid"><div class="field"><label for="playlist-cover">封面</label><select id="playlist-cover" name="cover">${Object.entries(
      { morning: "清晨", mountains: "群山", lake: "湖泊" },
    )
      .map(
        ([key, label]) =>
          `<option value="${key}" ${row.cover === key ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></div><div class="field"><label for="playlist-enabled">发布状态</label><select id="playlist-enabled" name="enabled"><option value="false" ${row.enabled ? "" : "selected"}>未发布</option><option value="true" ${row.enabled ? "selected" : ""}>已发布 · 向用户提供</option></select></div></div><div class="field"><label for="playlist-song-search">查找诗歌</label><input id="playlist-song-search" type="search" placeholder="搜索中文或英文名称"></div><div class="field"><label for="playlist-song-picker">选择平台诗歌</label><select id="playlist-song-picker">${songs.map((song) => `<option value="${e(song.id)}" ${row.hymnIds.includes(song.id) ? "disabled" : ""}>${e(song.titleZh)} · ${e(song.titleEn)}${song.enabled && (!song.reviewStatus || song.reviewStatus === "approved") ? "" : "（未发布）"}</option>`).join("")}</select>${button("加入歌单", "playlist-add")}</div><p class="small muted">按下列顺序播放，最多 200 首。下架或待审核的诗歌会在用户端自动跳过；已删除的歌曲需从歌单移除后保存。</p><ol id="playlist-songs" class="playlist-songs">${row.hymnIds
      .map((hymnId) =>
        playlistSongRow(
          hymnId,
          songs.find((song) => song.id === hymnId),
        ),
      )
      .join(
        "",
      )}</ol><p class="small muted">保存前自动备份。取消发布后，歌单从在线列表中移除。</p><div class="form-error" role="alert"></div></form></div>`,
    formActions("保存歌单", "playlist-form"),
  );
  $("#playlist-form").playlistSongs = songs;
  updatePlaylistSongControls();
}

function updatePlaylistSongControls() {
  const rows = $$("#playlist-songs > li");
  const ids = new Set(rows.map((row) => row.dataset.hymnId));
  rows.forEach((row, index) => {
    $('[data-action="playlist-up"]', row).disabled = index === 0;
    $('[data-action="playlist-down"]', row).disabled =
      index === rows.length - 1;
  });
  $$("#playlist-song-picker option").forEach((option) => {
    option.disabled = ids.has(option.value);
  });
  const picker = $("#playlist-song-picker");
  if (
    !picker.selectedOptions[0] ||
    picker.selectedOptions[0].disabled ||
    picker.selectedOptions[0].hidden
  )
    picker.value =
      [...picker.options].find((option) => !option.disabled && !option.hidden)
        ?.value || "";
  $('[data-action="playlist-add"]', dialog).disabled =
    rows.length >= 200 || !picker.value;
}

function playlistDeleteDialog(id) {
  const row = pageData.items.find((item) => item.id === id);
  if (!row) return;
  openDialog(
    "删除云端歌单？",
    `<div class="dialog-body"><p>「${e(row.titleZh)}」将从云端歌单中移除。歌曲与用户个人歌单保留，删除前自动备份。</p><form id="playlist-delete-form" data-key="${e(id)}" data-revision="${pageData.revision}"><div class="form-error" role="alert"></div></form></div>`,
    `${button("取消", "close-dialog")}<button type="submit" form="playlist-delete-form" class="button danger">确认删除</button>`,
  );
}

function hymnDialog(id) {
  const uploading = !id;
  const row = uploading
    ? {
        titleZh: "",
        titleEn: "",
        subtitleZh: "",
        subtitleEn: "",
        artist: "",
        category: "",
        source: "",
        license: "",
      }
    : pageData.items.find((item) => item.id === id);
  if (!row) return;
  const input = (name, label, max) =>
    `<div class="field"><label for="hymn-${name}">${label}</label><input id="hymn-${name}" name="${name}" value="${e(row[name])}" required maxlength="${max}"></div>`;
  openDialog(
    uploading ? "上传诗歌" : `编辑诗歌 · ${row.titleZh}`,
    `<div class="dialog-body"><form id="${uploading ? "hymn-upload-form" : "hymn-form"}" data-key="${e(id || "")}">${uploading ? `<div class="field"><label for="hymn-audio">MP3 音频</label><div class="audio-upload"><input id="hymn-audio" name="audio" type="file" accept=".mp3,audio/mpeg" aria-describedby="hymn-file-name hymn-file-hint hymn-file-error" required><span class="audio-upload-icon">${icon("music")}</span><div class="audio-upload-details"><strong id="hymn-file-name" aria-live="polite">选择要上传的诗歌</strong><span id="hymn-file-hint">MP3 格式 · 最大 30 MB</span></div><span class="button audio-upload-button" id="hymn-file-button">${icon("plus")}选择文件</span></div><div id="hymn-file-error" class="file-error" aria-live="polite" hidden></div></div>` : ""}<div class="form-grid">${input("titleZh", "中文名称", 120)}${input("titleEn", "英文名称", 120)}</div>${input("subtitleZh", "中文介绍", 300)}${input("subtitleEn", "英文介绍", 300)}<div class="form-grid">${input("artist", "演唱 / 演奏者", 120)}${input("category", "分类", 60)}</div>${input("source", "来源", 500)}<div class="field"><label for="hymn-license">授权说明</label><textarea id="hymn-license" name="license" required maxlength="1000">${e(row.license)}</textarea></div><div class="field"><label for="hymn-lyrics">歌词（可选）</label><textarea id="hymn-lyrics" name="lyrics" rows="8" maxlength="40000" aria-describedby="hymn-lyrics-hint" placeholder="[00:12.50]第一句歌词&#10;[00:20.00]第二句歌词">${e(row.lyrics || "")}</textarea><p id="hymn-lyrics-hint" class="small muted">支持 LRC 时间戳、重复副歌和纯文本。LRC 时间必须对应本次上传的录音，用户可逐句跟唱、点击跳播；纯文本仅供阅读。留空则不显示歌词。</p></div>${uploading ? "" : `<div class="field"><label for="hymn-enabled">提供状态</label><select id="hymn-enabled" name="enabled"><option value="enabled" ${row.enabled ? "selected" : ""} ${row.reviewStatus && row.reviewStatus !== "approved" ? "disabled" : ""}>启用 · 向用户提供</option><option value="disabled" ${row.enabled ? "" : "selected"}>停用 · 从在线列表移除</option></select></div>`}<div class="form-hint">${uploading ? "上传后进入待审核，仅管理员可试听。核对资料与授权并审核通过后向用户提供。" : "保存前自动备份。上传诗歌的资料修改后需重新审核；已驳回的诗歌修改后可再次送审。"}</div><div class="form-error" role="alert"></div></form></div>`,
    formActions(
      uploading ? "上传并提交审核" : "保存诗歌资料",
      uploading ? "hymn-upload-form" : "hymn-form",
    ),
    "HYMN EDITOR",
  );
}
function hymnDeleteDialog(id) {
  const row = pageData.items.find((item) => item.id === id);
  if (!row) return;
  openDialog(
    "删除这首诗歌？",
    `<div class="dialog-body"><p>「${e(row.titleZh)}」将从平台诗歌库和在线列表中移除，用户下次刷新后不再看到。</p><p class="small muted">删除前会自动备份诗歌资料，音频保留用于恢复。用户设备上的个人收藏不受影响。</p><form id="hymn-delete-form" data-key="${e(id)}" data-revision="${pageData.revision}"><div class="form-error" role="alert"></div></form></div>`,
    `${button("取消", "close-dialog")}<button type="submit" form="hymn-delete-form" class="button danger">${icon("trash")}确认删除</button>`,
    "REMOVE HYMN",
  );
}
function updateHymnFile(input) {
  const file = input.files[0];
  const error = file
    ? !/\.mp3$/i.test(file.name)
      ? "请选择 MP3 音频文件"
      : !file.size
        ? "文件为空，请重新选择"
        : file.size > 30 * 1024 * 1024
          ? "单个文件不能超过 30 MB"
          : ""
    : "";
  input.setCustomValidity(error);
  $("#hymn-file-name").textContent = file?.name || "选择要上传的诗歌";
  $("#hymn-file-hint").textContent = file
    ? `${file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`} · MP3 格式 · 最大 30 MB`
    : "MP3 格式 · 最大 30 MB";
  $("#hymn-file-button").innerHTML =
    `${icon(file ? "refresh" : "plus")}${file ? "重新选择" : "选择文件"}`;
  input.closest(".audio-upload").classList.toggle("has-file", Boolean(file));
  input.closest(".audio-upload").classList.toggle("invalid", Boolean(error));
  input.setAttribute("aria-invalid", String(Boolean(error)));
  $("#hymn-file-error").textContent = error;
  $("#hymn-file-error").hidden = !error;
}
function hymnReviewDialog(id) {
  const row = pageData.items.find((item) => item.id === id);
  if (!row || row.reviewStatus !== "pending") return;
  openDialog(
    `审核诗歌 · ${row.titleZh}`,
    `<div class="dialog-body"><p>请先试听并核对资料、来源与授权。通过后向用户提供。</p><form id="hymn-review-form" data-key="${e(id)}"><div class="field"><label for="hymn-decision">审核结果</label><select id="hymn-decision" name="status"><option value="approved">审核通过并发布</option><option value="rejected">驳回</option></select></div><div class="field"><label for="hymn-review-note">审核备注</label><textarea id="hymn-review-note" name="note" maxlength="1000"></textarea></div><div class="form-error" role="alert"></div></form></div>`,
    formActions("确认审核", "hymn-review-form"),
    "HYMN REVIEW",
  );
}
function hymnAudioDialog(id) {
  const row = pageData.items.find((item) => item.id === id);
  if (
    !row?.audioAvailable ||
    !/^\/api\/audio\/(?:resources|hymns)\/[a-f0-9]{64}\.mp3$/.test(
      row.audioPath,
    )
  )
    throw new Error("此诗歌的试听文件尚未就绪");
  openDialog(
    row.titleZh,
    `<div class="dialog-body"><p>${e(row.titleEn)} · ${e(row.artist)}</p><span class="badge">${e(row.category)} · ${duration(row.duration)}</span><audio id="hymn-preview" class="audio-player" controls preload="metadata" src="/api/admin/hymns/${encodeURIComponent(row.id)}/audio"></audio><div id="hymn-audio-error" class="form-error" role="alert"></div><p class="small muted">${e(row.source)}</p><p class="small muted">${e(row.license)}</p></div>`,
    button("关闭", "close-dialog"),
    "HYMN PREVIEW",
  );
  $("#hymn-preview").onerror = () => {
    $("#hymn-audio-error").textContent =
      "暂时无法播放，请刷新后重试或检查诗歌媒体文件。";
  };
}
function dictionaryPage(data) {
  return (
    heading(
      button(
        `${icon("download")}发布到 App`,
        "publish",
        false,
        data.dirty ? "" : "disabled",
      ) + button(`${icon("plus")}新增单词`, "new-word", true),
    ) +
    `<div class="info-banner"><span>${icon("info")} ${data.dirty ? "有未发布的修改。发布后写入 App 内置词典，已安装的 App 需重新构建或发布更新后生效。" : "这里管理 App 的内置释义词典。用户设备中的个人生词本保存在本地。"}</span><span class="badge ${data.dirty ? "flagged" : "green"}">${data.dirty ? "有草稿" : "已发布"} · v${data.revision}</span></div><section class="panel"><div class="toolbar">${searchForm("搜索单词、中文释义或音标…")}</div><div class="result-meta"><span>共 ${num(data.total)} 个词条</span><span>释义 · 音标 · 词性</span></div>${data.items.length ? `<div class="table-scroll"><table><thead><tr><th>英文单词</th><th>中文释义</th><th>词性</th><th>操作</th></tr></thead><tbody>${data.items.map((row) => `<tr><td><div class="word-title">${e(row.word)}</div><div class="phonetic">${e(row.phonetic || "未填写音标")}</div></td><td class="note-text">${e(row.meaning)}</td><td><span class="badge">${e(row.type)}</span></td><td><div class="table-actions"><button class="button" data-action="edit-word" data-key="${e(row.word)}">${icon("edit")}编辑</button><button class="icon-button" data-action="delete-word" data-key="${e(row.word)}" aria-label="删除 ${e(row.word)}">${icon("trash")}</button></div></td></tr>`).join("")}</tbody></table></div>` : empty()}${pagination(data)}</section>` +
    footer()
  );
}
function reviewsPage(data) {
  return (
    heading(
      `<div class="review-filters">${[
        ["", "全部记录"],
        ["flagged", "待处理"],
        ["approved", "已审核"],
        ["pending", "待复核"],
      ]
        .map(
          ([value, label]) =>
            `<a href="#reviews${value ? `?status=${value}` : ""}" class="${(query.get("status") || "") === value ? "active" : ""}">${label}</a>`,
        )
        .join("")}</div>`,
    ) +
    `<section class="panel"><div class="toolbar">${searchForm("搜索书卷、审核备注或引用…")}</div><div class="result-meta"><span>共 ${num(data.total)} 条审核记录</span><span>经文与圣经音频的人工审核</span></div>${data.items.length ? `<div class="table-scroll"><table><thead><tr><th>审核对象</th><th>状态</th><th>备注</th><th>最近更新</th><th>操作</th></tr></thead><tbody>${data.items.map((row) => `<tr><td class="reference"><strong>${e(row.bookZh)} ${row.chapter}${["en", "zh"].includes(row.item) ? ` 章 · ${row.item === "en" ? "英文音频" : "中文音频"}` : `:${row.item}`}</strong><small>${e(row.key)}</small></td><td>${badge(row.status)}</td><td><div class="note-text">${e(row.note || "暂无备注")}</div></td><td class="small nowrap">${date(row.updatedAt)}<div class="muted">${e(row.updatedBy)}</div></td><td><button class="button" data-action="edit-review" data-key="${e(row.key)}">${icon("edit")}处理</button></td></tr>`).join("")}</tbody></table></div>` : empty("还没有审核记录", "在经文管理或圣经音频中核对内容后，保存审核状态与备注。")}${pagination(data)}</section>` +
    footer()
  );
}
function auditPage(data) {
  return (
    heading(
      `<a class="button" href="/api/admin/export" download>${icon("download")}导出管理数据</a>`,
    ) +
    `<section class="panel"><div class="toolbar">${searchForm("搜索操作、对象或管理员…")}</div><div class="result-meta"><span>共 ${num(data.total)} 条记录</span><span>保留最近 5,000 条操作日志</span></div>${data.items.length ? `<div class="table-scroll"><table><thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>对象</th></tr></thead><tbody>${data.items.map((row) => `<tr><td class="nowrap small">${date(row.at)}</td><td>${e(row.actor)}</td><td><span class="log-action">${e(actionLabel(row.action))}</span><div class="small muted">${e(row.action)}</div></td><td class="log-target">${e(row.target)}</td></tr>`).join("")}</tbody></table></div>` : empty("操作记录将在这里汇集", "保存审核、编辑词典或执行资源校验后即可查看。")}${pagination(data)}</section>` +
    footer()
  );
}
function definitions(items) {
  return `<dl class="definition">${items.map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join("")}</dl>`;
}
function safeLink(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? e(url.href) : "#";
  } catch {
    return "#";
  }
}
function systemPage(data) {
  const versions = data.manifest.versions;
  return (
    heading(button(`${icon("shield")}校验资源索引`, "check", true)) +
    `<div class="system-grid"><section class="panel"><div class="panel-head"><div><h2>服务状态</h2><p>SERVICE STATUS</p></div><span class="badge green">运行中</span></div><div class="panel-body">${definitions(
      [
        ["运行环境", e(data.node)],
        ["服务启动", date(data.startedAt)],
        ["资源导入", date(data.manifest.importedAt)],
        ["管理员会话", `${data.sessionHours} 小时 · 重启后需重新登录`],
        ["管理数据目录", `<code>${e(data.storage)}</code>`],
        ["用户学习数据", e(data.persistence)],
      ],
    )}</div></section><section class="panel"><div class="panel-head"><div><h2>词典与数据发布</h2><p>PUBLISHING & BACKUP</p></div></div><div class="panel-body">${definitions(
      [
        ["草稿版本", `v${data.revision}`],
        ["已发布版本", `v${data.publishedRevision}`],
        ["发布文件更新", date(data.dictionaryUpdatedAt)],
        ["生效方式", "重新构建 App 或发布应用更新"],
      ],
    )}<div class="notice">${icon("info")}<span>发布后更新应用内置词典，并保留发布前的词典备份。审核备注仅在管理后台中使用。</span></div><div class="system-buttons"><a class="button" href="/api/admin/export" download>${icon("download")}导出管理备份</a><a class="button" href="#dictionary">管理词典 ${icon("arrow")}</a></div></div></section><section class="panel"><div class="panel-head"><div><h2>经文与音频来源</h2><p>OPEN RESOURCES, CLEAR ATTRIBUTION</p></div></div><div class="panel-body">${Object.entries(
      versions,
    )
      .map(
        ([locale, version]) =>
          `<div class="source-card"><h3>${locale === "en" ? "English" : "中文"} · ${e(version.name || version.id)}</h3><p>${e(version.license || "")}</p><p>${e(version.reader || version.attribution || "")}</p><a href="${safeLink(version.licenseUrl)}" target="_blank" rel="noopener noreferrer">查看来源与授权 ${icon("external")}</a></div>`,
      )
      .join(
        "",
      )}</div></section><section class="panel"><div class="panel-head"><div><h2>资源验证记录</h2><p>基于已有完整性审计文件</p></div></div><div class="panel-body">${
      data.audit
        ? definitions([
            ["审计更新", date(data.audit.updatedAt)],
            ["已验证音频文件", num(data.audit.uniqueMediaFilesVerified)],
            [
              "资源体积",
              `${(data.audit.mediaBytes / 1024 ** 3).toFixed(2)} GB`,
            ],
            [
              "音频 SHA-256",
              data.audit.allMediaHashesVerified
                ? "已通过已有文件审计"
                : "未确认",
            ],
            [
              "来源经文保留",
              data.audit.allScriptureTextPreserved ? "全部保留" : "未确认",
            ],
          ])
        : empty("尚无完整资源审计", "可先执行资源索引校验。")
    }<div class="notice">${icon("info")}<span>索引校验检查经文与时间轴结构；不重新下载资源，也不替代完整文件哈希校验。</span></div></div></section></div>` +
    footer()
  );
}
function dailyVersePage(data) {
  return `<section class="panel"><div class="panel-head"><div><h2>每日经文</h2><p>已发布 ${num(data.counts.approved)} · 草稿 ${num(data.counts.draft)} · 未来储备 ${num(data.counts.futureDays)} 天 · 从今天连续 ${num(data.counts.reserveDays)} 天</p></div><div>${button("上传图片", "daily-image")}${button("新增每日经文", "daily-new", "primary")}</div></div><div class="panel-body">${data.counts.lowReserve ? '<p class="notice">储备不足30天：请补充从今天开始连续可用的每日经文。</p>' : ""}<p class="small muted">同一年内使用不同图片与经文；修改已发布内容会重新变为草稿。图片来源和授权随文件永久保存。</p><div class="table-wrap"><table><thead><tr><th>日期 / 主题</th><th>经文</th><th>图片 / 来源</th><th>状态</th><th>操作</th></tr></thead><tbody>${data.items
    .map((item) => {
      const image = data.images.find((image) => image.id === item.imageId);
      const book = books.find((book) => book.id === item.reference.bookId);
      return `<tr><td>${e(item.date)}<br>${e(item.theme)}</td><td>${e(book?.zh || item.reference.bookId)} ${item.reference.chapter}:${item.reference.verse}${item.reference.endVerse ? "-" + item.reference.endVerse : ""}</td><td><img class="daily-thumbnail" alt="${e(image?.theme)}" src="/api/admin/daily-verses/images/${e(image?.file)}"><br>${e(image?.author)} · ${e(image?.license)}<br><a target="_blank" rel="noopener noreferrer" href="${e(image?.sourceUrl)}">查看来源</a></td><td>${e({ draft: "草稿", approved: "已发布", withdrawn: "已撤回" }[item.status])}</td><td>${button("预览 / 审核", "daily-preview", false, `data-key="${e(item.id)}"`)}${button("编辑", "daily-edit", false, `data-key="${e(item.id)}"`)}</td></tr>`;
    })
    .join("")}</tbody></table></div></div></section>`;
}
function dailyField(name, label, value = "", type = "text") {
  return `<div class="field"><label for="daily-${name}">${label}</label><input id="daily-${name}" name="${name}" type="${type}" value="${e(value)}" required></div>`;
}
function dailyDialog(id) {
  const item = pageData.items.find((item) => item.id === id),
    ref = item?.reference;
  openDialog(
    item ? "编辑每日经文" : "新增每日经文",
    `<div class="dialog-body"><form id="daily-form" data-key="${e(id || "")}">${dailyField("date", "发布日期", item?.date || pageData.date, "date")}${dailyField("theme", "主题", item?.theme)}<div class="field"><label for="daily-book">书卷</label><select id="daily-book" name="bookId">${books.map((book) => `<option value="${e(book.id)}" ${book.id === ref?.bookId ? "selected" : ""}>${e(book.zh)} · ${e(book.en)}</option>`).join("")}</select></div>${dailyField("chapter", "章", ref?.chapter || 1, "number")}${dailyField("verse", "开始节", ref?.verse || 1, "number")}${dailyField("endVerse", "结束节（单节填写相同数字，最多10节）", ref?.endVerse || ref?.verse || 1, "number")}<div class="field"><label for="daily-image">图片与授权</label><select required id="daily-image" name="imageId">${pageData.images.map((image) => `<option value="${image.id}" ${image.id === item?.imageId ? "selected" : ""}>${e(image.theme)} · ${e(image.author)} · ${e(image.license)}</option>`).join("")}</select></div><p class="small muted">先上传图片，再创建草稿。保存后请预览核对经文和图片，再审核发布。</p><div class="form-error" role="alert"></div></form></div>`,
    formActions("保存草稿", "daily-form"),
  );
}
function dailyImageDialog() {
  openDialog(
    "上传每日经文图片",
    `<div class="dialog-body"><form id="daily-image-form"><div class="field"><label for="daily-file">JPEG 图片（不超过5MB / 1600万像素）</label><input required id="daily-file" name="image" type="file" accept="image/jpeg"></div>${dailyField("theme", "图片主题")}${dailyField("author", "作者")}${dailyField("sourceUrl", "原始来源 HTTPS 链接", "", "url")}${dailyField("license", "授权名称")}${dailyField("licenseUrl", "授权条款 HTTPS 链接", "", "url")}<p class="small muted">请确认具有使用授权。文件、作者、来源与授权上传后不可覆盖。</p><div class="form-error" role="alert"></div></form></div>`,
    formActions("上传并保存来源", "daily-image-form"),
  );
}
async function dailyPreview(id) {
  const data = await api(`/daily-verses/${encodeURIComponent(id)}/preview`),
    image = pageData.images.find((image) => image.id === data.item.imageId);
  openDialog(
    `${data.item.date} · ${data.item.theme}`,
    `<div class="dialog-body"><img class="daily-preview" src="/api/admin/daily-verses/images/${e(image.file)}" alt="${e(image.theme)}"><p>${e(data.scripture.bookZh)} ${data.item.reference.chapter}:${data.item.reference.verse}${data.item.reference.endVerse ? "-" + data.item.reference.endVerse : ""}</p>${data.scripture.verses.map((verse) => `<p>${verse.number}. ${e(verse.zh)}</p><p class="english-full">${e(verse.en)}</p>`).join("")}<p>${e(image.author)} · ${e(image.license)} · <a target="_blank" rel="noopener noreferrer" href="${e(image.licenseUrl)}">授权条款</a></p><form id="daily-review-form" data-key="${e(id)}"><div class="field"><label for="daily-review-status">审核决定</label><select id="daily-review-status" name="status"><option value="approved">审核通过并发布</option><option value="withdrawn">撤回（用户不可见）</option></select></div><div class="form-error" role="alert"></div></form></div>`,
    formActions("确认审核决定", "daily-review-form"),
  );
}
async function loadPage() {
  if (!session) return;
  const current = ++generation;
  const [name, search = ""] = location.hash.slice(1).split("?");
  routeName = Object.hasOwn(routes, name) ? name : "overview";
  query = new URLSearchParams(search);
  if (!$("#content")) return shell();
  $(".layout").classList.remove("menu-open");
  $$("[data-route]").forEach((node) => {
    const active = node.dataset.route === routeName;
    node.classList.toggle("active", active);
    if (active) node.setAttribute("aria-current", "page");
    else node.removeAttribute("aria-current");
  });
  $("#breadcrumb-current").textContent = routes[routeName][0];
  document.title = `${routes[routeName][0]} · Selah 息语管理中心`;
  $("#content").innerHTML =
    '<div class="loading"><span class="spinner"></span>正在读取内容…</div>';
  try {
    const data = await api(`/${routeName}${query.size ? `?${query}` : ""}`);
    if (current !== generation) return;
    pageData = data;
    const renderers = {
      overview,
      scripture,
      recordings: recordingPage,
      hymns: hymnPage,
      playlists: playlistPage,
      "daily-verses": dailyVersePage,
      dictionary: dictionaryPage,
      reviews: reviewsPage,
      audit: auditPage,
      system: systemPage,
    };
    $("#content").innerHTML = renderers[routeName](data);
  } catch (error) {
    if (current !== generation || !session) return;
    $("#content").innerHTML =
      `<div class="error-state">${icon("info")}<h2>暂时无法读取数据</h2><p>${e(error.message)}</p>${button(`${icon("refresh")}重新加载`, "refresh")}</div>`;
  }
}
function $$(selector, parent = document) {
  return [...parent.querySelectorAll(selector)];
}
function closeDialog() {
  dialogGeneration++;
  const hymnAudio = $("#hymn-preview", dialog);
  if (hymnAudio) {
    hymnAudio.pause();
    hymnAudio.removeAttribute("src");
    hymnAudio.load();
  }
  audioPreview?.dispose();
  audioPreview = null;
  if (dialog.open) dialog.close();
}
function openDialog(title, body, actions, eyebrow = "CONTENT MANAGEMENT") {
  closeDialog();
  dialog.innerHTML = `<div class="dialog-head"><div><div class="eyebrow">${eyebrow}</div><h2 id="dialog-title">${e(title)}</h2></div><button class="icon-button" data-action="close-dialog" aria-label="关闭">${icon("close")}</button></div>${body}<div class="dialog-actions">${actions}</div>`;
  dialog.showModal();
}
function formActions(label, id) {
  return `${button("取消", "close-dialog")}<button type="submit" form="${id}" class="button primary">${icon("check")}${label}</button>`;
}
function reviewDialog(key, review = {}, verse) {
  const [bookId, chapter, item] = key.split(":");
  const book = books.find((b) => b.id === bookId);
  const title = `${book?.zh || bookId} ${chapter}${["en", "zh"].includes(item) ? ` 章 · ${item === "en" ? "英文音频" : "中文音频"}` : `:${item}`}`;
  openDialog(
    title,
    `<div class="dialog-body">${verse ? `<div class="scripture-full">${e(verse.zh || "来源中省略或合并的经节")}</div><div class="english-full">${e(verse.en)}</div>` : ""}<form id="review-form" data-key="${e(key)}"><div class="field"><label for="review-status">审核状态</label><select id="review-status" name="status">${[
      ["pending", "待复核"],
      ["approved", "已审核"],
      ["flagged", "待处理"],
    ]
      .map(
        ([value, label]) =>
          `<option value="${value}" ${review.status === value ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></div><div class="field"><label for="review-note">核对备注</label><textarea id="review-note" name="note" maxlength="2000" placeholder="记录需要核对的发音、经文或资源问题…">${e(review.note || "")}</textarea></div><div class="form-hint">审核记录保存在后台，不会改动原文或音频时间轴。</div><div class="form-error" role="alert"></div></form></div>`,
    formActions("保存审核", "review-form"),
    "CONTENT REVIEW",
  );
}
function wordDialog(word) {
  const row = word ? pageData.items.find((item) => item.word === word) : {};
  openDialog(
    word ? "编辑词条" : "添加新的词条",
    `<div class="dialog-body"><form id="word-form"><div class="field"><label for="word">英文单词</label><input id="word" name="word" value="${e(row.word || "")}" placeholder="例如：grace" required maxlength="80" ${word ? "readonly" : ""}></div><div class="form-grid"><div class="field"><label for="phonetic">音标</label><input id="phonetic" name="phonetic" value="${e(row.phonetic || "")}" placeholder="/greɪs/" maxlength="150"></div><div class="field"><label for="type">词性</label><input id="type" name="type" value="${e(row.type || "noun")}" list="word-types" required maxlength="60"><datalist id="word-types">${["noun", "verb", "adjective", "adverb", "preposition", "pronoun", "conjunction"].map((type) => `<option value="${type}">`).join("")}</datalist></div></div><div class="field"><label for="meaning">中文释义</label><textarea id="meaning" name="meaning" required maxlength="1000" placeholder="填写准确、简洁的中文释义…">${e(row.meaning || "")}</textarea></div><div class="form-hint">保存为草稿。核对后点击「发布到 App」，更新内置词典。</div><div class="form-error" role="alert"></div></form></div>`,
    formActions("保存词条", "word-form"),
    "VOCABULARY EDITOR",
  );
}
async function audioDialog(key) {
  const current = generation;
  const data = await api(`/recordings/${encodeURIComponent(key)}`);
  if (current !== generation || !session) return;
  openDialog(
    `${data.bookZh} 第 ${data.chapter} 章 · ${data.locale === "en" ? "英文" : "中文"}`,
    `<div class="dialog-body"><span class="badge green">${e(data.alignmentStatus === "partial" ? "部分通过 · 来源缺录" : qualityLabel(data.timingQuality))}</span> <span class="badge">${num(data.items.length)} 节 · ${duration(data.duration)}</span><audio id="preview-audio" class="audio-player" controls preload="none"></audio><div id="audio-error" class="form-error" role="alert"></div><div class="audio-note">使用当前来源录音；独立经句按已核对边界播放，合并经句按来源范围播放。</div>${data.missingVerses?.length ? `<div class="audio-note">来源录音缺少第 ${data.missingVerses.map((item) => e(item.verse)).join("、")} 节；这些经节没有可播放音频。</div>` : ""}${data.missingFragments?.length ? `<div class="audio-note">${data.missingFragments.map((item) => `第 ${e(item.verse)} 节部分文字原录音未朗读：${e(item.text)}`).join("<br>")}；本节其余录音仍可播放。</div>` : ""}<div class="audio-list">${data.items.map((item, index) => `<div class="audio-item" data-audio-row="${index}"><button class="icon-button" data-action="play-verse" data-index="${index}" aria-label="试听第 ${item.verse} 节">${icon("play")}</button><small>${item.coveredVerses?.length ? `${item.coveredVerses[0]}–${item.coveredVerses.at(-1)}` : item.verse}</small><p>${e(item.text)}</p><small>${duration(item.duration)}</small></div>`).join("")}</div></div>`,
    `${button("关闭", "close-dialog")}${button(`${icon("review")}审核此录音`, "audio-review", true)}`,
    "AUDIO PREVIEW",
  );
  dialog.audioData = data;
  audioPreview = createAudioPreview($("#preview-audio"), (message) => {
    const error = $("#audio-error");
    if (error) error.textContent = message;
  });
}
async function runCheck(trigger) {
  if (trigger) trigger.disabled = true;
  toast("正在检查经文与音频索引…");
  try {
    const result = await api("/check", "POST", {});
    openDialog(
      result.ok ? "资源索引校验通过" : "资源校验需要关注",
      `<div class="dialog-body"><p>校验时间：${date(result.checkedAt)}</p><pre class="check-output">${e(result.output || "校验未返回详细信息。")}</pre><p>此操作检查本地经文与时间轴结构，不会重新下载资源。</p></div>`,
      button("完成", "close-dialog", true),
      "RESOURCE VALIDATION",
    );
    toast(
      result.ok ? "经文与音频索引校验通过" : "校验未通过，请查看输出",
      !result.ok,
    );
    if (session) loadPage();
  } finally {
    if (trigger) trigger.disabled = false;
  }
}
async function handleAction(node) {
  const action = node.dataset.action;
  const key = node.dataset.key;
  if (action === "menu") return $(".layout").classList.toggle("menu-open");
  if (action === "close-dialog") return closeDialog();
  if (action === "toggle-password") {
    const input = $("#password");
    input.type = input.type === "password" ? "text" : "password";
    return;
  }
  if (action === "refresh") return loadPage();
  if (action === "logout") {
    await api("/logout", "POST", {});
    session = null;
    showLogin();
    return;
  }
  if (action === "new-word" || action === "edit-word") return wordDialog(key);
  if (action === "review-verse") {
    const row = pageData.items.find((item) => item.key === key);
    return reviewDialog(key, row.review || {}, row);
  }
  if (action === "edit-review") {
    const row = pageData.items.find((item) => item.key === key);
    return reviewDialog(key, row);
  }
  if (action === "daily-new" || action === "daily-edit")
    return dailyDialog(key);
  if (action === "daily-image") return dailyImageDialog();
  if (action === "daily-preview") return dailyPreview(key);
  if (action === "new-playlist" || action === "edit-playlist")
    return playlistDialog(key);
  if (action === "delete-playlist") return playlistDeleteDialog(key);
  if (action === "playlist-add") {
    const picker = $("#playlist-song-picker");
    const selectedId = picker.value;
    const rows = $$("#playlist-songs > li");
    if (
      !selectedId ||
      rows.length >= 200 ||
      rows.some((row) => row.dataset.hymnId === selectedId)
    )
      return;
    const song = $("#playlist-form").playlistSongs.find(
      (item) => item.id === selectedId,
    );
    $("#playlist-songs").insertAdjacentHTML(
      "beforeend",
      playlistSongRow(selectedId, song),
    );
    updatePlaylistSongControls();
    return;
  }
  if (["playlist-up", "playlist-down", "playlist-remove"].includes(action)) {
    const row = node.closest("li");
    if (action === "playlist-remove") row.remove();
    else if (action === "playlist-up" && row.previousElementSibling)
      row.previousElementSibling.before(row);
    else if (action === "playlist-down" && row.nextElementSibling)
      row.nextElementSibling.after(row);
    updatePlaylistSongControls();
    return;
  }
  if (action === "upload-hymn") return hymnDialog();
  if (action === "review-hymn") return hymnReviewDialog(key);
  if (action === "edit-hymn") return hymnDialog(key);
  if (action === "delete-hymn") return hymnDeleteDialog(key);
  if (action === "hymn-audio") return hymnAudioDialog(key);
  if (action === "audio") return audioDialog(key);
  if (action === "audio-review") {
    const data = dialog.audioData;
    return reviewDialog(data.key, data.review || {});
  }
  if (action === "delete-word")
    return openDialog(
      "删除这个词条？",
      `<div class="dialog-body"><p>「${e(key)}」将从词典草稿中删除。发布前不会影响 App 内置数据。</p><form id="delete-form" data-key="${e(key)}"><div class="form-error" role="alert"></div></form></div>`,
      `${button("取消", "close-dialog")}<button type="submit" form="delete-form" class="button danger">${icon("trash")}确认删除</button>`,
      "REMOVE WORD",
    );
  if (action === "publish")
    return openDialog(
      "发布内置词典",
      `<div class="dialog-body"><p>将当前 v${pageData.revision} 词典草稿写入 App 的数据文件，发布前自动保留旧词典备份。</p><p>已安装的 App 需要重新构建或发布应用更新后，才能使用这次词典修改。</p><form id="publish-form"><div class="form-error" role="alert"></div></form></div>`,
      formActions("确认发布", "publish-form"),
      "PUBLISH DICTIONARY",
    );
  if (action === "check") return runCheck(node);
  if (action === "play-verse") {
    const item = dialog.audioData.items[Number(node.dataset.index)];
    if (
      !/^\/api\/audio\/(resources|aligned)\/[a-f0-9]{64}\.mp3$/.test(item.path)
    )
      throw new Error("此录音路径暂不支持后台试听");
    $("#audio-error").textContent = "";
    $$("[data-audio-row]", dialog).forEach((row) =>
      row.classList.toggle(
        "active",
        row.dataset.audioRow === node.dataset.index,
      ),
    );
    await audioPreview.play(item);
  }
}
async function submitForm(form) {
  const values = Object.fromEntries(new FormData(form));
  if (form.id === "global-search")
    return navigate("scripture", { q: values.q });
  if (form.id === "filter-search") return setFilter("q", values.q);
  const submit =
    document.querySelector(`[form="${form.id}"][type="submit"]`) ||
    $("button[type=submit]", form);
  const errorNode = $(".form-error", form) || $("#login-error");
  if (submit) submit.disabled = true;
  if (errorNode) errorNode.textContent = "";
  try {
    if (form.id === "login-form") {
      session = await api("/login", "POST", values);
      books = (await api("/books")).items;
      shell();
      return;
    }
    if (form.id === "playlist-form") {
      await api("/playlists", "PUT", {
        ...values,
        ...(form.dataset.key ? { id: form.dataset.key } : {}),
        enabled: values.enabled === "true",
        hymnIds: $$("#playlist-songs > li").map((row) => row.dataset.hymnId),
        revision: Number(form.dataset.revision),
      });
    } else if (form.id === "playlist-delete-form") {
      await api("/playlists", "DELETE", {
        id: form.dataset.key,
        revision: Number(form.dataset.revision),
      });
    } else if (form.id === "daily-form") {
      await api("/daily-verses", "PUT", {
        revision: pageData.revision,
        id: form.dataset.key || `daily-${values.date}`,
        date: values.date,
        theme: values.theme,
        imageId: values.imageId,
        reference: {
          bookId: values.bookId,
          chapter: Number(values.chapter),
          verse: Number(values.verse),
          endVerse: Number(values.endVerse),
        },
      });
    } else if (form.id === "daily-image-form") {
      const data = new FormData(form);
      data.set("revision", String(pageData.revision));
      await api("/daily-verses/images", "POST", data);
    } else if (form.id === "daily-review-form") {
      await api("/daily-verses/review", "PUT", {
        revision: pageData.revision,
        id: form.dataset.key,
        status: values.status,
      });
    } else if (form.id === "review-form")
      await api("/reviews", "PUT", { ...values, key: form.dataset.key });
    else if (form.id === "hymn-upload-form") {
      const data = new FormData(form);
      const file = data.get("audio");
      if (!(file instanceof File) || !file.size)
        throw new Error("请选择 MP3 文件");
      if (file.size > 30 * 1024 * 1024)
        throw new Error("单个文件不能超过 30 MB");
      data.set("revision", String(pageData.revision));
      await api("/hymns/upload", "POST", data);
    } else if (form.id === "hymn-review-form")
      await api("/hymns/review", "PUT", {
        ...values,
        id: form.dataset.key,
        revision: pageData.revision,
      });
    else if (form.id === "hymn-form")
      await api("/hymns", "PUT", {
        ...values,
        id: form.dataset.key,
        enabled: values.enabled === "enabled",
        revision: pageData.revision,
      });
    else if (form.id === "hymn-delete-form")
      await api("/hymns", "DELETE", {
        id: form.dataset.key,
        revision: Number(form.dataset.revision),
      });
    else if (form.id === "word-form")
      await api("/dictionary", "PUT", {
        ...values,
        revision: pageData.revision,
      });
    else if (form.id === "delete-form")
      await api("/dictionary", "DELETE", {
        word: form.dataset.key,
        revision: pageData.revision,
      });
    else if (form.id === "publish-form")
      await api("/dictionary/publish", "POST", { revision: pageData.revision });
    closeDialog();
    toast(
      form.id === "hymn-delete-form"
        ? "诗歌已删除，删除前的资料已备份"
        : form.id === "publish-form"
          ? "词典已发布到 App 数据文件，旧版本已备份"
          : form.id === "hymn-form"
            ? "诗歌资料已保存；上传诗歌修改资料后需重新审核"
            : form.id === "hymn-upload-form"
              ? "上传成功，等待审核"
              : form.id === "hymn-review-form"
                ? values.status === "approved"
                  ? "审核通过，已向用户发布"
                  : "已驳回，用户不可见"
                : "修改已保存",
    );
    if (
      form.id === "hymn-delete-form" &&
      pageData.items.length === 1 &&
      pageData.page > 1
    )
      setFilter("page", pageData.page - 1);
    else await loadPage();
  } catch (error) {
    if (errorNode?.isConnected) errorNode.textContent = error.message;
    else toast(error.message, true);
  } finally {
    if (submit) submit.disabled = false;
  }
}
document.addEventListener("click", (event) => {
  const actionNode = event.target.closest("[data-action]");
  if (actionNode) {
    event.preventDefault();
    handleAction(actionNode).catch((error) => toast(error.message, true));
    return;
  }
  const pageNode = event.target.closest("[data-page]");
  if (pageNode) return setFilter("page", pageNode.dataset.page);
  const testamentNode = event.target.closest("[data-testament]");
  if (testamentNode) {
    $$("[data-testament]").forEach((node) =>
      node.classList.toggle("active", node === testamentNode),
    );
    $("#overview-books").innerHTML = bookCards(
      pageData.books,
      testamentNode.dataset.testament,
    );
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "playlist-song-picker")
    return updatePlaylistSongControls();
  if (event.target.id === "hymn-audio") return updateHymnFile(event.target);
  if (event.target.dataset.filter)
    setFilter(event.target.dataset.filter, event.target.value);
});
document.addEventListener("input", (event) => {
  if (event.target.id !== "playlist-song-search") return;
  const search = event.target.value.trim().toLowerCase();
  $$("#playlist-song-picker option").forEach((option) => {
    option.hidden = !option.textContent.toLowerCase().includes(search);
  });
  updatePlaylistSongControls();
});
document.addEventListener("submit", (event) => {
  event.preventDefault();
  submitForm(event.target).catch((error) => toast(error.message, true));
});
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog();
});
window.addEventListener("hashchange", () => {
  closeDialog();
  loadPage();
});
try {
  session = await api("/session");
  books = (await api("/books")).items;
  shell();
} catch {
  showLogin();
}
