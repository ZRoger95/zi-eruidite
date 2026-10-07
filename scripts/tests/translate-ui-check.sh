#!/usr/bin/env bash
# dev 翻译端点回归（浏览器内触发翻译 Task 1）：受控 .env（SITE_URL +
# TRANSLATE_* 指向本地桩）、/tmp 内容 fixture（TRANSLATE_DEV_CONTENT_ROOT 注入）、
# 真实 astro dev 起停（端口 4399）。覆盖：status 解析/统计（A1–A7）、POST 执行
# 与系列 skip/force 语义（A8–A13）、断连续跑（A14）、并发 409（A15）、缺配置
# 失败路径（A16）、页面组件挂载标记（A17）。trap 恢复 .env、终止 dev server 与
# 桩、清理 /tmp。
#
# 注：Vite 在 .env 变更时会自动重启 dev server；每次改 .env 后经
# wait_dev_stable 等重启发生并完成，避免请求撞上重启窗口。
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

# 防调用侧 shell 导出同名变量绕过受控 .env（loadEnvFile 不覆盖已有环境变量）。
unset TRANSLATE_BASE_URL TRANSLATE_API_KEY TRANSLATE_MODEL TRANSLATE_DEV_CONTENT_ROOT

pass_count=0
pass() { pass_count=$((pass_count + 1)); printf 'PASS  %s\n' "$1"; }
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

WORK=/tmp/translate-ui-check
BASE=http://127.0.0.1:4399
DEV_PID=""
STUB_PID=""
BG_PID=""

rm -rf "$WORK"
mkdir -p "$WORK/content/series"

# 受控 .env：备份 → 退出时恢复原文件（trap 负责最终恢复仓库原始 .env）。
ENV_KEEP=/tmp/translate-ui-check.env.keep
if [ -f .env ]; then cp .env "$ENV_KEEP"; else rm -f "$ENV_KEEP"; fi

# ---------- 进程与就绪控制 ----------

dev_stop() {
  if [ -n "${DEV_PID}" ]; then
    kill "${DEV_PID}" 2>/dev/null || true
    wait "${DEV_PID}" 2>/dev/null || true
    DEV_PID=""
  fi
}

stub_stop() {
  if [ -n "${STUB_PID}" ]; then
    kill "${STUB_PID}" 2>/dev/null || true
    wait "${STUB_PID}" 2>/dev/null || true
    STUB_PID=""
  fi
  rm -f "$WORK/stub.port"
}

stub_start() { # [flags…]
  stub_stop
  node scripts/tests/translate-stub.mjs \
    --port-file "$WORK/stub.port" --log "$WORK/stub.log" "$@" &
  STUB_PID=$!
  i=0
  while [ ! -s "$WORK/stub.port" ] && [ "$i" -lt 50 ]; do
    i=$((i+1))
    sleep 0.1
  done
  [ -s "$WORK/stub.port" ] || fail "stub 启动超时（端口文件未出现）"
}

cleanup_all() {
  dev_stop
  stub_stop
  rm -rf "$WORK" .translate
  if [ -f "$ENV_KEEP" ]; then
    mv -f "$ENV_KEEP" .env
  else
    rm -f .env
  fi
}
trap cleanup_all EXIT

wait_dev_ready() { # 轮询首页（≤60s）；超时输出 dev.log 尾部并 fail
  i=0
  while [ "${i}" -lt 120 ]; do
    i=$((i+1))
    if curl -sf -o /dev/null --max-time 2 "${BASE}/"; then
      return 0
    fi
    sleep 0.5
  done
  tail -20 "$WORK/dev.log" >&2 || true
  fail "dev server 未就绪（轮询超时）"
}

wait_dev_stable() { # .env 变更：等 Vite 重启「完成」（server restarted. 标记）再继续
  wait_dev_ready
  before=$( (grep -cF 'server restarted.' "$WORK/dev.log" || true) )
  i=0
  while [ "${i}" -lt 80 ]; do
    after=$( (grep -cF 'server restarted.' "$WORK/dev.log" || true) )
    if [ "${after}" -gt "${before}" ]; then
      wait_dev_ready
      return 0
    fi
    i=$((i+1))
    sleep 0.25
  done
  tail -5 "$WORK/dev.log" >&2 || true
  fail "等待 dev server 重启完成超时（.env 变更后未见到 server restarted. 标记）"
}

write_env_full() { # SITE_URL + TRANSLATE_*（BASE_URL 指向当前桩端口）
  port="$(cat "$WORK/stub.port")"
  {
    printf 'SITE_URL=https://example.com\n'
    printf 'TRANSLATE_BASE_URL=http://127.0.0.1:%s\n' "${port}"
    printf 'TRANSLATE_API_KEY=test-key\n'
    printf 'TRANSLATE_MODEL=test-model\n'
  } > .env
}

# ---------- HTTP 辅助（码 → $WORK/code，body → $WORK/body.json） ----------

get_status() { # $1=id
  curl -s -o "$WORK/body.json" -w '%{http_code}' \
    "${BASE}/api/translate/status?id=${1}" > "$WORK/code" \
    || fail "status 请求失败（id=${1}）"
}

post_translate() { # $1=JSON body
  curl -s -o "$WORK/body.json" -w '%{http_code}' -X POST \
    -H 'Content-Type: application/json' -d "${1}" "${BASE}/api/translate" \
    > "$WORK/code" || fail "POST 请求失败"
}

assert_code() { # $1=期望码 $2=说明
  code="$(cat "$WORK/code")"
  [ "${code}" = "${1}" ] || fail "${2}（HTTP ${code}，期望 ${1}）"
  pass "${2}（HTTP ${1}）"
}

# ---------- fixtures（逐字，UTF-8） ----------

cat > "$WORK/content/one.md" <<'EOF'
---
title: "单篇：按钮测试"
description: "dev 翻译按钮的离线测试单篇。"
date: 2026-10-07
authors:
  - enscribe
---

## 开场

ONE-MARKER 这是单篇测试正文。
EOF

cat > "$WORK/content/two.md" <<'EOF'
---
title: "单篇二：按钮测试"
description: "dev 翻译按钮的离线测试第二单篇。"
date: 2026-10-07
authors:
  - enscribe
---

## 开场

TWO-MARKER 这是第二篇测试正文。
EOF

cat > "$WORK/content/skewed-file.md" <<'EOF'
---
title: "偏斜：按钮测试"
description: "文件名与 id 不一致的离线测试单篇。"
date: 2026-10-07
authors:
  - enscribe
---

## 开场

SKEWED-MARKER 文件名与 slug 不一致的正文。
EOF

cat > "$WORK/content/series/index.md" <<'EOF'
---
title: "系列：按钮测试"
description: "dev 翻译按钮的离线测试系列。"
date: 2026-10-07
authors:
  - enscribe
---

## 系列开篇

INDEX-MARKER 系列父文章正文。
EOF

cat > "$WORK/content/series/part-a.md" <<'EOF'
---
title: "系列：按钮测试 · 上篇"
description: "dev 翻译按钮的离线测试系列子文章。"
date: 2026-10-07
order: 1
authors:
  - enscribe
---

## 上篇

PART-A-MARKER 系列上篇正文。
EOF

cat > "$WORK/content/series/part-b.md" <<'EOF'
---
title: "系列：按钮测试 · 下篇"
description: "dev 翻译按钮的离线测试系列子文章。"
date: 2026-10-07
order: 2
authors:
  - enscribe
---

## 下篇

PART-B-MARKER 系列下篇正文。
EOF

printf 'SENTINEL-INDEX-EN\n' > "$WORK/content/series/index.en.md"

# ---------- 桩与 dev server 起停 ----------

stub_start
write_env_full

if curl -s -o /dev/null --max-time 2 "${BASE}/"; then
  fail "端口 4399 已被占用（请先停止旧 dev server）"
fi

# 启动细节（Astro 7 / Vite 8 下测试专用）：
# - --ignore-lock：本仓库其它终端里可能已有 dev server 占用单实例锁，测试实例
#   绕过锁检查（也不写锁文件），与用户服务器互不干扰；
# - ASTRO_DEV_BACKGROUND：关闭 Astro 对 agent 终端的自动识别，否则会被当作
#   后台模式而禁止 --ignore-lock；
# - --host 127.0.0.1：固定 IPv4 监听，后续 curl 统一使用 127.0.0.1。
ASTRO_DEV_BACKGROUND=1 TRANSLATE_DEV_CONTENT_ROOT="$WORK/content" \
  ./node_modules/.bin/astro dev --port 4399 --ignore-lock --host 127.0.0.1 \
  > "$WORK/dev.log" 2>&1 &
DEV_PID=$!
wait_dev_ready

# ---------- A1–A3：status 正常路径 ----------

get_status one
assert_code 200 "A1：status?id=one"
assert_has "$WORK/body.json" '"kind":"single"' "A1：kind=single"
assert_has "$WORK/body.json" '"total":1' "A1：total=1"
assert_has "$WORK/body.json" '"translated":0' "A1：translated=0"
assert_has "$WORK/body.json" '"viewUrl":"/en/blog/one"' "A1：viewUrl=/en/blog/one"
assert_has "$WORK/body.json" '"running":false' "A1：running=false"

get_status series
assert_code 200 "A2：status?id=series"
assert_has "$WORK/body.json" '"kind":"series"' "A2：kind=series"
assert_has "$WORK/body.json" '"total":3' "A2：total=3"
assert_has "$WORK/body.json" '"translated":1' "A2：translated=1（index.en.md 计入）"
assert_has "$WORK/body.json" '"viewUrl":"/en/blog/series"' "A2：viewUrl=/en/blog/series"

get_status series/part-a
assert_code 200 "A3：status?id=series/part-a"
assert_has "$WORK/body.json" '"total":3' "A3：系列整组 total=3"
assert_has "$WORK/body.json" '"translated":1' "A3：系列整组 translated=1"

# ---------- A4–A7：非法/歧义 id ----------

get_status skewed
assert_code 404 "A4：status?id=skewed（文件名与 id 不一致不猜测）"

get_status "../x"
assert_code 400 "A5a：status?id=../x"
get_status "%2Fabs"
assert_code 400 "A5b：status?id=%2Fabs"

get_status _draft
assert_code 400 "A6：status?id=_draft"

get_status one.en
assert_code 400 "A7：status?id=one.en"

# ---------- A8–A13：POST 执行与系列语义 ----------

post_translate '{"id":"one"}'
assert_code 200 "A8：POST one"
assert_has "$WORK/body.json" '"ok":true' "A8：ok=true"
assert_file "$WORK/content/one.en.md" "A8：one.en.md 已生成"
assert_has "$WORK/content/one.en.md" '[EN]' "A8：译文含桩特征 [EN]"

get_status one
assert_code 200 "A9：status?id=one（翻译后）"
assert_has "$WORK/body.json" '"translated":1' "A9：translated=1"

post_translate '{"id":"series"}'
assert_code 200 "A10：POST series（无 force，已有译文跳过）"
assert_file "$WORK/content/series/part-a.en.md" "A10：part-a.en.md 已生成"
assert_has "$WORK/content/series/part-a.en.md" '[EN]' "A10：part-a 含 [EN]"
assert_file "$WORK/content/series/part-b.en.md" "A10：part-b.en.md 已生成"
assert_has "$WORK/content/series/part-b.en.md" '[EN]' "A10：part-b 含 [EN]"
assert_has "$WORK/content/series/index.en.md" 'SENTINEL-INDEX-EN' "A10：index.en.md 保持哨兵（未被重写）"

post_translate '{"id":"series","force":true}'
assert_code 200 "A11：POST series force"
assert_lacks "$WORK/content/series/index.en.md" 'SENTINEL-INDEX-EN' "A11：index.en.md 哨兵已覆盖"
assert_has "$WORK/content/series/index.en.md" '[EN]' "A11：index.en.md 含 [EN]"

en_before=$( (find "$WORK/content" -name '*.en.md' | wc -l) | tr -d ' ')
post_translate '{"id":"../x"}'
assert_code 400 "A12：POST ../x 拒绝"
en_after=$( (find "$WORK/content" -name '*.en.md' | wc -l) | tr -d ' ')
[ "${en_before}" -eq "${en_after}" ] \
  || fail "A12：非法 id 不应写盘（.en.md 数量 ${en_before} → ${en_after}）"
pass "A12：fixture 零新增译文（.en.md 数不变：${en_before}）"

post_translate '{"id":"nope"}'
assert_code 404 "A13：POST nope"

# 合法 JSON 但非对象（null / 字符串）：400（此前会抛 TypeError 拖垮 dev 进程）。
post_translate 'null'
assert_code 400 "A13b：POST body null 拒绝"

post_translate '"x"'
assert_code 400 "A13c：POST body 字符串 拒绝"

# ---------- A14：断连（页面刷新/关标签）不打断任务 ----------

stub_start --delay 1500
write_env_full
wait_dev_stable

curl -s --max-time 0.8 -X POST -H 'Content-Type: application/json' \
  -d '{"id":"two"}' "${BASE}/api/translate" -o "$WORK/disconnect.json" || true

get_status two
assert_code 200 "A14：断连后 status 可查"
assert_has "$WORK/body.json" '"running":true' "A14：任务仍在运行（running=true）"

i=0
seen_done=0
while [ "${i}" -lt 60 ]; do
  i=$((i+1))
  code=""
  code=$(curl -s -o "$WORK/status-two.json" -w '%{http_code}' --max-time 2 \
    "${BASE}/api/translate/status?id=two") || code=""
  if [ "${code}" = "200" ] && grep -qF '"running":false' "$WORK/status-two.json"; then
    seen_done=1
    break
  fi
  sleep 0.5
done
[ "${seen_done}" -eq 1 ] || fail "A14：等待 running 翻转超时（>30s）"
pass "A14：断连任务自行跑完（running=false）"
assert_file "$WORK/content/two.en.md" "A14：two.en.md 已生成"
assert_has "$WORK/content/two.en.md" '[EN]' "A14：two 译文含 [EN]"

# ---------- A15：并发锁（后台任务运行中，前台被 409 拒绝） ----------

curl -s -o "$WORK/bg.json" -X POST -H 'Content-Type: application/json' \
  -d '{"id":"series","force":true}' "${BASE}/api/translate" &
BG_PID=$!
sleep 1

post_translate '{"id":"one"}'
assert_code 409 "A15a：运行中再 POST 被拒"
assert_has "$WORK/body.json" '已有翻译进行中' "A15a：409 文案"

wait "${BG_PID}" || true
assert_has "$WORK/bg.json" '"ok":true' "A15b：后台任务正常完成"

# ---------- A16：缺 TRANSLATE_* 配置 → 500 且错误可读 ----------

printf 'SITE_URL=https://example.com\n' > .env
wait_dev_stable
post_translate '{"id":"one","force":true}'
assert_code 500 "A16：缺配置 POST 500"
assert_has "$WORK/body.json" '缺少 TRANSLATE_' "A16：错误含 缺少 TRANSLATE_"

# 恢复含 TRANSLATE_*（指向桩端口）的受控 .env；trap 只负责最终恢复仓库原始 .env。
write_env_full
wait_dev_stable

# ---------- A17：页面组件挂载（Task 2：dev-only 标记） ----------

curl -sf "${BASE}/blog/introducing-v2/" -o "$WORK/page-zh.html" \
  || fail "A17a：中文文章页请求失败（/blog/introducing-v2/）"
assert_has "$WORK/page-zh.html" 'data-translate-dev' "A17a：中文文章页含翻译按钮标记"

curl -sf "${BASE}/en/blog/welcome/" -o "$WORK/page-en.html" \
  || fail "A17b：英文文章页请求失败（/en/blog/welcome/）"
assert_lacks "$WORK/page-en.html" 'data-translate-dev' "A17b：英文文章页不含翻译按钮标记"

printf '\n全部断言通过（PASS 共 %d 项）\n' "${pass_count}"
