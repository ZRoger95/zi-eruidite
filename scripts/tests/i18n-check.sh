#!/usr/bin/env bash
# i18n 框架回归校验：临时写入受控 .env（仅 SITE_URL）后构建，再对 dist 输出断言。
# 本脚本先于实现建立基线（中文侧路由不变），后续任务在同一文件追加英文侧断言。
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1" >&2; exit 1; }

assert_file() { # $1=路径 [$2=说明]
  [ -f "${1}" ] || fail "${2:-断言文件存在}（缺少 ${1}）"
  pass "${2:-${1}}"
}

assert_has() { # $1=文件 $2=片段 [$3=说明]
  [ -f "${1}" ] || fail "${3:-断言包含}（缺少 ${1}）"
  grep -qF -- "${2}" "${1}" || fail "${3:-断言包含}（${1} 未找到 ${2}）"
  pass "${3:-${1} 包含 ${2}}"
}

assert_lacks() { # $1=文件 $2=片段 [$3=说明]
  [ -f "${1}" ] || fail "${3:-断言不包含}（缺少 ${1}）"
  if grep -qF -- "${2}" "${1}"; then
    fail "${3:-断言不包含}（${1} 出现 ${2}）"
  fi
  pass "${3:-${1} 不含 ${2}}"
}

assert_match() { # $1=文件 $2=正则 [$3=说明]
  [ -f "${1}" ] || fail "${3:-断言匹配}（缺少 ${1}）"
  grep -qE -- "${2}" "${1}" || fail "${3:-断言匹配}（${1} 未匹配 ${2}）"
  pass "${3:-${1} 匹配 ${2}}"
}

assert_count() { # $1=文件 $2=片段 $3=期望次数 [$4=说明]
  [ -f "${1}" ] || fail "${4:-断言计数}（缺少 ${1}）"
  local n
  n=$( (grep -oF -- "${2}" "${1}" || true) | wc -l )
  n="${n//[[:space:]]/}"
  [ "${n}" -eq "${3}" ] || fail "${4:-断言计数}（${1} 中「${2}」出现 ${n} 次，期望 ${3}）"
  pass "${4:-${1} 中「${2}」出现 ${3} 次}"
}

# 受控 .env：备份 → 仅写 SITE_URL → 退出时恢复原文件
ENV_KEEP=/tmp/i18n-check.env.keep
if [ -f .env ]; then cp .env "$ENV_KEEP"; else rm -f "$ENV_KEEP"; fi
cleanup_restore() {
  if [ -f "$ENV_KEEP" ]; then
    mv -f "$ENV_KEEP" .env
  else
    rm -f .env
  fi
}
trap cleanup_restore EXIT

printf 'SITE_URL=https://example.com\n' > .env
npm run build

# ---------- 中文侧基线（blog loader id 重构不得改变既有路由） ----------
assert_file dist/index.html "首页存在"
assert_file dist/blog/index.html "博客列表存在"
assert_file dist/blog/introducing-v2/index.html "文章路由存在"
assert_file dist/blog/v1-posts/index.html "系列页存在"
assert_file dist/blog/v1-posts/rehype-patch/index.html "子文章路由存在"
assert_file dist/rss.xml "RSS 存在"

assert_match dist/blog/index.html '[0-9]{4}年[0-9]+月[0-9]+日' "中文列表日期为中文格式"
assert_has dist/blog/index.html 'href="/blog/v1-posts"' "中文列表文章链接不变"

# ---------- 英文侧（/en/ 首页与列表） ----------
assert_file dist/en/index.html "英文首页存在"
assert_file dist/en/blog/index.html "英文列表存在"
assert_has dist/en/blog/index.html 'href="/en/blog/welcome"' "英文列表含已翻译文章链接"
assert_has dist/en/blog/index.html 'Welcome: this site is now bilingual' "英文列表显示英文标题"
assert_has dist/en/blog/index.html 'Not translated yet' "未翻译徽章显示"
assert_count dist/en/blog/index.html 'Not translated yet' 1 "英文列表徽章计数 = 1（防已翻译卡片带徽章回归）"
assert_has dist/en/blog/index.html 'Introducing astro-erudite v2' "未翻译文章显示中文原标题"
assert_has dist/en/index.html 'href="/en/blog/welcome"' "英文首页含最新文章链接"
assert_lacks dist/blog/index.html 'href="/en/blog/' "中文列表不含英文链接"
assert_lacks dist/blog/index.html 'welcome.en' "中文列表不泄漏 .en id"
assert_lacks dist/authors/enscribe/index.html 'welcome.en' "作者页不泄漏 .en id"
assert_lacks dist/tags/site/index.html 'welcome.en' "标签页不泄漏 .en id"
assert_has dist/blog/index.html 'href="/blog/welcome"' "中文列表含欢迎文章"

# ---------- 中文回归：文章链渲染抽取到 PostChain 后 zh 输出逐属性等价 ----------
assert_has dist/blog/v1-posts/rehype-patch/index.html 'data-url="/blog/v1-posts/rehype-patch"' "中文文章页回归（data-url）"
assert_has dist/blog/v1-posts/index.html 'data-url="/blog/v1-posts"' "中文系列页父文章 data-url"
assert_has dist/blog/v1-posts/index.html 'id="rehype-patch"' "中文系列页子文章锚点 id"

# ---------- 英文侧（/en/blog 文章路由：译文页 / 提示页 / 系列占位块） ----------
assert_file dist/en/blog/welcome/index.html "英文文章页存在"
assert_has dist/en/blog/welcome/index.html 'Welcome: this site is now bilingual' "英文文章渲染英文内容"
assert_has dist/en/blog/welcome/index.html 'AI-translated' "AI 翻译徽章显示"
assert_file dist/en/blog/introducing-v2/index.html "未翻译文章有提示页"
# 注：Astro 动态表达式会把撇号转义为 &#39;，正则同时容忍转义与非转义两种形态
assert_match dist/en/blog/introducing-v2/index.html "hasn(&#39;|')t been translated into English" "提示页文案正确"
assert_has dist/en/blog/introducing-v2/index.html 'noindex, follow' "提示页 noindex, follow"
assert_file dist/en/blog/v1-posts/rehype-patch/index.html "未翻译子文章 URL 可用"
assert_has dist/en/blog/v1-posts/index.html 'data-untranslated' "系列占位块存在"
assert_has dist/en/blog/v1-posts/index.html 'This section hasn' "占位块文案正确"
assert_has dist/en/blog/v1-posts/rehype-patch/index.html 'data-untranslated' "未翻译子文章独立 URL 渲染系列占位锚点"

# ---------- 共享界面文案与语言切换器（Task 5） ----------
assert_has dist/blog/index.html '>博客<' "中文列表标题中文化"
assert_has dist/blog/index.html '跳到主内容' "中文跳过链接"
assert_has dist/blog/index.html 'data-language-switch' "中文列表有切换器"
assert_has dist/blog/index.html 'href="/en/blog"' "切换器指向英文"
assert_has dist/index.html 'href="/en/"' "中文首页切换器指向 /en/"
assert_has dist/en/blog/index.html '>Blog<' "英文列表标题"
assert_has dist/en/blog/index.html 'Skip to content' "英文跳过链接"
assert_has dist/en/blog/index.html 'data-language-switch' "英文列表有切换器"
assert_has dist/en/blog/index.html 'href="/blog"' "英文切换器指回中文"
assert_has dist/en/blog/index.html '>Moments<' "英文导航英文标签"
assert_has dist/en/blog/index.html 'href="/moments"' "en 导航指向中文板块"
assert_has dist/en/blog/index.html '<html lang="en"' "英文页面 html lang"
assert_has dist/blog/index.html '<html lang="zh-CN"' "中文页面 html lang"
assert_has dist/en/blog/index.html 'Oct 6, 2026' "英文日期格式"
assert_has dist/index.html '你好，我是' "中文首页 hero 中文化"
assert_file dist/moments/index.html
assert_lacks dist/moments/index.html 'data-language-switch' "zh-only 板块无切换器"

# ---------- zh-only 板块界面文案中文化（Task 6） ----------
assert_has dist/tags/index.html '标签' "标签页中文化"
assert_has dist/authors/enscribe/index.html '文章' "作者页中文化"
assert_lacks dist/tags/index.html '>Tags<' "标签页无残留英文标题"
assert_has dist/index.html '最新文章' "中文首页最新文章标题（字典，Ruling 11）"
# 敏感断言：部分 brief 断言会因既有中文提前通过（'标签'命中导航标签、'文章'
# 命中博文摘要）；tags 索引页不渲染面包屑，'>Tags<' 类断言恒真。以下逐文件
# title/属性级断言确保本次替换有真实回归保护（实现前会失败）。
assert_has dist/tags/index.html '<title>标签' "标签页标题中文化"
assert_has dist/tags/site/index.html '标注为 #site 的内容。' "标签详情页描述中文化"
assert_lacks dist/tags/site/index.html '>Tags<' "标签详情页面包屑中文化（无空格形态）"
assert_lacks dist/tags/site/index.html '> Tags <' "标签详情页面包屑中文化（空格形态）"
assert_has dist/authors/index.html '<title>作者' "作者列表标题中文化"
assert_has dist/authors/enscribe/index.html 'enscribe（作者）' "作者页 meta 标题中文化"
assert_lacks dist/authors/enscribe/index.html '>Posts<' "作者页无残留英文小标题"
assert_has dist/authors/enscribe/index.html 'aria-label="网站"' "作者卡社交 aria 中文化"
assert_has dist/projects/index.html '<title>项目' "项目页标题中文化"
assert_has dist/projects/index.html '至今' "项目卡进行中状态中文化"
assert_lacks dist/index.html '>Latest posts<' "中文首页无残留英文标题"
assert_has dist/en/index.html '>Latest posts<' "英文首页保留英文标题（字典）"

# ---------- Task 7：SEO 与输出（hreflang / canonical / sitemap / RSS） ----------
assert_has dist/blog/welcome/index.html 'hreflang="en"' "中文文章输出 en alternate"
assert_has dist/blog/welcome/index.html 'hreflang="x-default"' "输出 x-default"
assert_has dist/en/blog/welcome/index.html 'hreflang="zh-CN"' "英文文章输出 zh alternate"
assert_has dist/en/blog/introducing-v2/index.html 'rel="canonical" href="https://example.com/blog/introducing-v2' "提示页 canonical 指向中文"
assert_lacks dist/en/blog/introducing-v2/index.html 'hreflang' "提示页无 alternates"
# Ruling 17：zh 文章无译文时不得输出 hreflang（与上一条提示页断言成对）
assert_lacks dist/blog/introducing-v2/index.html 'hreflang' "zh 文章无译文时不输出 hreflang"
assert_file dist/en/rss.xml
assert_has dist/en/rss.xml 'Welcome: this site is now bilingual' "en RSS 含已翻译文章"
assert_lacks dist/en/rss.xml 'Introducing astro-erudite v2' "en RSS 不含未翻译文章"
assert_has dist/sitemap-0.xml 'hreflang="en"' "sitemap 输出 hreflang"
assert_has dist/sitemap-0.xml '/en/blog/welcome/' "sitemap 含英文文章"
assert_has dist/en/blog/index.html 'href="https://example.com/en/rss.xml"' "en 页 RSS alternate"
assert_has dist/blog/index.html 'href="https://example.com/rss.xml"' "zh 页 RSS alternate"
# Ruling 12：原 '>博客<' 实际由导航标签满足，未覆盖页面标题，追加标题断言
assert_has dist/blog/index.html '<title>博客 | ' "中文列表页面标题"
assert_has dist/en/blog/index.html '<title>Blog | ' "英文列表页面标题"
