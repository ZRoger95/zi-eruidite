#!/usr/bin/env bash
# 翻译脚本（scripts/translate.mjs）离线回归：S1–S6b（CLI、配置加载、文件发现、
# 计划输出、单文件端到端、跳过与覆盖、frontmatter 失败零落盘）、S8–S10（正文
# 分块与已译上下文、截断续写、续写超限报错）、S11–S12（系列整组与跨文件上下
# 文链、跳过文件的盘上上下文）、S13–S16（七类结构校验失败工件、--force 不覆盖、
# 系列失败即停、源必填字段 API 前失败）、S17–S21（429 后重试成功、持续 5xx 重
# 试耗尽、401/404 不重试、网络错误、系列中途失败即停）、S22（围栏陷阱：围栏内
# 的 ## 行不得成为分块切点）。所有场景都在 /tmp 副本
# 上操作，绝不写坏仓库内 fixtures；受控 .env 由 trap 恢复，后台测试桩由 trap 先
# 行停止，工件目录 .translate/ 逐场景与退出时清理。后续任务在同一文件追加场景。
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

# 防调用侧 shell 导出同名变量绕过受控 .env（loadEnvFile 不覆盖已有环境变量）。
unset TRANSLATE_BASE_URL TRANSLATE_API_KEY TRANSLATE_MODEL

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

assert_count() { # $1=文件 $2=片段 $3=期望次数 [$4=说明]
  [ -f "${1}" ] || fail "${4:-断言计数}（缺少 ${1}）"
  local n
  n=$( (grep -oF -- "${2}" "${1}" || true) | wc -l )
  n="${n//[[:space:]]/}"
  [ "${n}" -eq "${3}" ] || fail "${4:-断言计数}（${1} 中「${2}」出现 ${n} 次，期望 ${3}）"
  pass "${4:-${1} 中「${2}」出现 ${3} 次}"
}

line_of() { # $1=文件 $2=片段：输出首次出现的行号
  grep -nF -m1 -- "${2}" "${1}" | cut -d: -f1
}

WORK=/tmp/translate-check
LOG="$WORK/run.log"
rc=0
STUB_PID=""

rm -rf "$WORK" .translate
mkdir -p "$WORK"

# 受控 .env：备份 → 各场景按需重写 → 退出时恢复原文件；同时清理场景与 .translate
ENV_KEEP=/tmp/translate-check.env.keep
if [ -f .env ]; then cp .env "$ENV_KEEP"; else rm -f "$ENV_KEEP"; fi
cleanup_restore() {
  if [ -f "$ENV_KEEP" ]; then
    mv -f "$ENV_KEEP" .env
  else
    rm -f .env
  fi
  rm -rf "$WORK" .translate
}

# 桩控制（S4+）：stub_start 先停旧桩，再后台启动并轮询端口文件（≤5s）；
# 退出时（trap）先停桩、再恢复 .env 与清理场景。
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
  stub_stop
  cleanup_restore
}
trap cleanup_all EXIT

write_env() { # [base_url]：有值时附 TRANSLATE_* 三项（测试值）
  {
    printf 'SITE_URL=https://example.com\n'
    if [ "$#" -ge 1 ] && [ -n "${1}" ]; then
      printf 'TRANSLATE_BASE_URL=%s\n' "${1}"
      printf 'TRANSLATE_API_KEY=test-key\n'
      printf 'TRANSLATE_MODEL=test-model\n'
    fi
  } > .env
}

run() { # 运行 CLI；输出入 $LOG，退出码入 $rc（rc=0 … || rc=$? 避开 set -e）
  rc=0
  npm run translate -- "$@" > "$LOG" 2>&1 || rc=$?
}

expect_error() { # $1=说明 $2=输出片段：非 0 退出 + `错误：` 前缀 + 片段
  [ "${rc}" -ne 0 ] || fail "${1}：应退出非 0（实际 0）"
  assert_has "$LOG" "错误：" "${1}：错误前缀"
  assert_has "$LOG" "${2}" "${1}：含「${2}」"
}

# ---------- S1a：dry-run 单篇（零网络证明，BASE_URL 指向关闭端口） ----------
write_env "http://127.0.0.1:9/"
cp -R scripts/tests/fixtures/translate "$WORK/s1"
LOG="$WORK/s1a.log"
run "$WORK/s1/single.md" --dry-run
[ "${rc}" -eq 0 ] || fail "S1a：dry-run 应退出 0（实际 ${rc}）"
pass "S1a：dry-run 退出 0"
assert_has "$LOG" "将翻译" "S1a：输出计划行"
assert_has "$LOG" "single.en.md" "S1a：计划含目标 single.en.md"
assert_has "$LOG" "--dry-run" "S1a：输出含 dry-run 提示"
assert_lacks "$LOG" "重试" "S1a：零网络（无重试痕迹）"
if [ -e "$WORK/s1/single.en.md" ]; then
  fail "S1a：dry-run 不应写盘（single.en.md 意外出现）"
fi
pass "S1a：dry-run 零写盘"

# ---------- S1b：dry-run 系列（order 排序、_ 前缀排除） ----------
LOG="$WORK/s1b.log"
run "$WORK/s1/series" --dry-run
[ "${rc}" -eq 0 ] || fail "S1b：dry-run 系列应退出 0（实际 ${rc}）"
pass "S1b：dry-run 系列退出 0"
assert_has "$LOG" "index.en.md" "S1b：计划含父文章"
assert_has "$LOG" "beta.en.md" "S1b：计划含 beta"
assert_has "$LOG" "alpha.en.md" "S1b：计划含 alpha"
assert_lacks "$LOG" "_wip" "S1b：_ 前缀草稿被排除"
line_index=$(line_of "$LOG" "index.en.md")
line_beta=$(line_of "$LOG" "beta.en.md")
line_alpha=$(line_of "$LOG" "alpha.en.md")
if [ "${line_index}" -lt "${line_beta}" ] && [ "${line_beta}" -lt "${line_alpha}" ]; then
  pass "S1b：顺序为 index → beta → alpha（按 frontmatter order 而非文件名）"
else
  fail "S1b：顺序应为 index → beta → alpha（实际行号 ${line_index}/${line_beta}/${line_alpha}）"
fi

# ---------- S1c：跳过与覆盖的计划显示 ----------
printf 'sentinel\n' > "$WORK/s1/single.en.md"
LOG="$WORK/s1c-skip.log"
run "$WORK/s1/single.md" --dry-run
[ "${rc}" -eq 0 ] || fail "S1c：已存在译文时 dry-run 应退出 0（实际 ${rc}）"
pass "S1c：已存在译文时 dry-run 退出 0"
assert_has "$LOG" "跳过" "S1c：显示跳过"
assert_lacks "$LOG" "将翻译" "S1c：跳过时不得显示将翻译"
LOG="$WORK/s1c-force.log"
run "$WORK/s1/single.md" --dry-run --force
[ "${rc}" -eq 0 ] || fail "S1c：--force dry-run 应退出 0（实际 ${rc}）"
pass "S1c：--force dry-run 退出 0"
assert_has "$LOG" "将翻译（覆盖）" "S1c：--force 显示覆盖"

# ---------- S2：缺配置（非 dry-run，.env 仅 SITE_URL） ----------
printf 'SITE_URL=https://example.com\n' > .env
LOG="$WORK/s2.log"
run "$WORK/s1/single.md"
[ "${rc}" -ne 0 ] || fail "S2：缺配置应退出非 0（实际 0）"
pass "S2：缺配置退出非 0"
assert_has "$LOG" "错误：" "S2：错误前缀"
assert_has "$LOG" "TRANSLATE_BASE_URL" "S2：提示缺 TRANSLATE_BASE_URL"
assert_has "$LOG" "TRANSLATE_API_KEY" "S2：提示缺 TRANSLATE_API_KEY"
assert_has "$LOG" "TRANSLATE_MODEL" "S2：提示缺 TRANSLATE_MODEL"
assert_has "$LOG" ".env.example" "S2：给出 .env.example 指引"

# ---------- S3：参数与发现错误（皆非 0 + 错误：前缀 + 片段） ----------
# 注：`_` 场景断言「拒绝翻译」而非裸「_」——缺配置报错含 TRANSLATE_* 下划线，
# 裸 `_` 会被错误路径假通过。
touch "$WORK/s1/_draft.md"
LOG="$WORK/s3-underscore.log"
run "$WORK/s1/_draft.md"
expect_error "S3：_ 前缀草稿" "拒绝翻译"

LOG="$WORK/s3-en-source.log"
run "$WORK/s1/single.en.md"
expect_error "S3：输入已是英文译文" "已是"

LOG="$WORK/s3-missing.log"
run "$WORK/s1/nope.md"
expect_error "S3：路径不存在" "不存在"

printf 'text\n' > "$WORK/s1/notes.txt"
LOG="$WORK/s3-txt.log"
run "$WORK/s1/notes.txt"
expect_error "S3：非 .md 输入" ".md"

LOG="$WORK/s3-to-value.log"
run "$WORK/s1/series" --to fr
expect_error "S3：--to fr 拒绝" "仅支持"

LOG="$WORK/s3-to-missing.log"
run "$WORK/s1/single.md" --to
expect_error "S3：--to 缺值" "用法"

LOG="$WORK/s3-unknown.log"
run "$WORK/s1/single.md" --bogus
expect_error "S3：未知参数" "未知参数"

LOG="$WORK/s3-two-targets.log"
run "$WORK/s1/single.md" "$WORK/s1/series"
expect_error "S3：多个路径参数" "用法"

LOG="$WORK/s3-no-target.log"
run
expect_error "S3：无位置参数" "用法"

mkdir -p "$WORK/s3/nodir"
LOG="$WORK/s3-nodir.log"
run "$WORK/s3/nodir"
expect_error "S3：目录缺 index.md" "index.md"

pass "S3：10 例参数/发现错误全部符合预期"

# ---------- S4：单文件端到端（frontmatter + 正文单块 + 写盘） ----------
cp -R scripts/tests/fixtures/translate "$WORK/s4"
stub_start
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s4.log"
run "$WORK/s4/single.md"
[ "${rc}" -eq 0 ] || fail "S4：应退出 0（实际 ${rc}）"
pass "S4：退出 0"
DST="$WORK/s4/single.en.md"
assert_file "$DST" "S4：生成译文"
assert_has "$DST" 'title: "[EN] 单篇示例：结构校验的陷阱"' "S4：title 为 JSON.stringify 逐字形态"
assert_has "$DST" 'aiTranslated: true' "S4：追加 aiTranslated"
assert_has "$DST" "$(grep '^date:' "$WORK/s4/single.md")" "S4：date 行与源一致"
assert_has "$DST" "$(grep '^tags:' "$WORK/s4/single.md")" "S4：tags 行与源一致"
assert_has "$DST" 'const price = "$100"' "S4：围栏内内容逐字保留"
assert_has "$DST" '`const x = 1{:ts}`' "S4：行内代码（含反引号）保留"

L="$WORK/stub.log"
assert_count "$L" '"n":' 2 "S4：桩收到 2 次请求（frontmatter+正文）"
assert_has "$L" 'Bearer test-key' "S4：Authorization 头"
assert_has "$L" '"model":"test-model"' "S4：model 传递"
assert_has "$L" '<<<SOURCE' "S4：源文分隔符"
assert_has "$L" '"role":"system"' "S4：system 消息"
assert_has "$L" '"role":"assistant"' "S4：响应含 assistant 角色"
assert_has "$L" '仅输出' "S4：system 提示含「仅输出」"
assert_has "$L" ':::note' "S4：system 示例含 :::note"
assert_has "$LOG" 'token 用量（本篇）：222 + 444 = 666' "S4：本篇 token 汇总"
assert_has "$LOG" '✓ 写入' "S4：写入提示"
assert_has "$LOG" 'git diff' "S4：审校提示"
assert_has "$LOG" 'token 用量（本次合计）：666' "S4：合计 token"

# ---------- S5：跳过（零 API、目标文件不动） ----------
cp -R scripts/tests/fixtures/translate "$WORK/s5"
printf 'SKIP-SENTINEL\n' > "$WORK/s5/single.en.md"
stub_start
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s5.log"
run "$WORK/s5/single.md"
[ "${rc}" -eq 0 ] || fail "S5：应退出 0（实际 ${rc}）"
pass "S5：退出 0"
assert_has "$WORK/s5/single.en.md" 'SKIP-SENTINEL' "S5：目标保持原样"
assert_has "$LOG" '跳过' "S5：输出跳过提示"
if [ -s "$WORK/stub.log" ]; then
  fail "S5：应为零请求（桩日志非空）"
fi
pass "S5：零请求"

# ---------- S6：--force 覆盖（复用 S5 桩实例，日志累计 2 行） ----------
LOG="$WORK/s6.log"
run "$WORK/s5/single.md" --force
[ "${rc}" -eq 0 ] || fail "S6：应退出 0（实际 ${rc}）"
pass "S6：退出 0"
assert_lacks "$WORK/s5/single.en.md" 'SKIP-SENTINEL' "S6：覆盖旧译文"
assert_has "$WORK/s5/single.en.md" '[EN] SINGLE-START' "S6：写入新译文"
assert_count "$WORK/stub.log" '"n":' 2 "S6：桩日志累计 2 行"

# ---------- S6b：frontmatter 响应无效（bad-fm）→ 报错、零落盘 ----------
cp -R scripts/tests/fixtures/translate "$WORK/s6b"
stub_start --corrupt bad-fm
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s6b.log"
run "$WORK/s6b/single.md"
expect_error "S6b：frontmatter 响应无效" "frontmatter"
if [ -e "$WORK/s6b/single.en.md" ]; then
  fail "S6b：不应落盘（single.en.md 意外出现）"
fi
pass "S6b：零落盘"
assert_count "$WORK/stub.log" '"n":' 1 "S6b：仅 frontmatter 一次请求"

# ---------- S8：正文分块（## 边界 + 6000 阈值）与已译上下文注入 ----------
cp -R scripts/tests/fixtures/translate "$WORK/s8"
stub_start
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s8.log"
run "$WORK/s8/long.md"
[ "${rc}" -eq 0 ] || fail "S8：应退出 0（实际 ${rc}）"
pass "S8：退出 0"
DST="$WORK/s8/long.en.md"
assert_file "$DST" "S8：生成译文"
assert_has "$DST" 'LONG-INTRO-MARKER' "S8：译文含引言段记号"
assert_has "$DST" 'LONG-SECTION-ONE-TAIL' "S8：译文含第一节结语"
assert_has "$DST" 'LONG-SECTION-TWO-MARKER' "S8：译文含第二节开头"
L="$WORK/stub.log"
assert_count "$L" '"n":' 3 "S8：桩收到 3 次请求（frontmatter + 2 块）"
assert_has "$L" 'LONG-SECTION-TWO-MARKER' "S8：第二块请求含第二节记号"
assert_count "$L" 'LONG-SECTION-ONE-TAIL' 2 "S8：第一节结语出现 2 次（块 1 源文 + 块 2 上下文）"
assert_count "$L" 'LONG-SECTION-TWO-MARKER' 1 "S8：第二节记号仅出现 1 次（不在上下文中）"

# ---------- S9：截断续写（--truncate-at 150 → 续写一次拼接完整） ----------
cp -R scripts/tests/fixtures/translate "$WORK/s9"
stub_start --truncate-at 150
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s9.log"
run "$WORK/s9/single.md"
[ "${rc}" -eq 0 ] || fail "S9：应退出 0（实际 ${rc}）"
pass "S9：退出 0"
DST="$WORK/s9/single.en.md"
assert_file "$DST" "S9：生成译文"
assert_has "$DST" 'SINGLE-START' "S9：截断点之前的内容保留（拼接而非替换）"
assert_has "$DST" '[EN] CALLOUT-BODY' "S9：截断点之后的内容已拼接完整"
assert_has "$DST" 'E = mc^2' "S9：译文含文末公式"
L="$WORK/stub.log"
assert_count "$L" '"n":' 3 "S9：桩收到 3 次请求（frontmatter + 首次正文 + 续写）"
assert_has "$L" '继续输出' "S9：续写请求携带续写指令"

# ---------- S10：续写超限（--truncate-forever → 3 次续写后仍截断） ----------
cp -R scripts/tests/fixtures/translate "$WORK/s10"
stub_start --truncate-forever
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s10.log"
run "$WORK/s10/single.md"
expect_error "S10：输出反复截断" "截断"
if [ -e "$WORK/s10/single.en.md" ]; then
  fail "S10：不应落盘（single.en.md 意外出现）"
fi
pass "S10：零落盘"
assert_count "$WORK/stub.log" '"n":' 5 "S10：桩日志 5 行（frontmatter + 首次 + 3 次续写）"

# ---------- S11：系列整组（order 排序、draft 无门禁、跨文件上下文链） ----------
cp -R scripts/tests/fixtures/translate "$WORK/s11"
stub_start
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s11.log"
run "$WORK/s11/series"
[ "${rc}" -eq 0 ] || fail "S11：应退出 0（实际 ${rc}）"
pass "S11：退出 0"
assert_file "$WORK/s11/series/index.en.md" "S11：生成父文章译文"
assert_file "$WORK/s11/series/beta.en.md" "S11：生成 beta 译文"
assert_file "$WORK/s11/series/alpha.en.md" "S11：生成 alpha 译文"
if [ -e "$WORK/s11/series/_wip.en.md" ]; then
  fail "S11：_ 前缀草稿不应产生译文（_wip.en.md 意外出现）"
fi
pass "S11：_wip 零产物"
assert_has "$WORK/s11/series/beta.en.md" 'draft: true' "S11：draft: true 原样复制"
L="$WORK/stub.log"
assert_count "$L" '"n":' 6 "S11：桩收到 6 次请求（每文件 frontmatter+正文）"
# 排序证据：若误为先 alpha 后 beta，三组计数会变为 (INDEX,BETA,ALPHA)=(2,1,2)。
assert_count "$L" 'INDEX-CONTEXT-MARKER' 2 "S11：index 源文 1 + beta 上下文 1"
assert_count "$L" '[EN] INDEX-CONTEXT-MARKER' 1 "S11：上下文带 [EN] 前缀（取自译文而非源文）"
assert_count "$L" 'BETA-CONTEXT-MARKER' 2 "S11：beta 源文 1 + alpha 上下文 1"
assert_count "$L" 'ALPHA-CONTEXT-MARKER' 1 "S11：alpha 源文 1（末位无后续上下文）"
assert_count "$L" 'WIP-MARKER' 0 "S11：_wip 未进入任何请求"

# ---------- S12：跳过文件的盘上译文提供上下文（beta 零请求、只读其尾段） ----------
cp -R scripts/tests/fixtures/translate "$WORK/s12"
printf 'BETA-ONDISK-MARKER 预置盘上译文，仅供读取尾段作上下文。\n' \
  > "$WORK/s12/series/beta.en.md"
cp "$WORK/s12/series/beta.en.md" "$WORK/s12-beta.before"
stub_start
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s12.log"
run "$WORK/s12/series"
[ "${rc}" -eq 0 ] || fail "S12：应退出 0（实际 ${rc}）"
pass "S12：退出 0"
assert_count "$WORK/stub.log" '"n":' 4 "S12：桩日志 4 行（index 2 + alpha 2，beta 零请求）"
assert_count "$WORK/stub.log" 'BETA-ONDISK-MARKER' 1 "S12：盘上标记只出现在 alpha 的上下文"
if cmp -s "$WORK/s12/series/beta.en.md" "$WORK/s12-beta.before"; then
  pass "S12：beta.en.md 保持原样"
else
  fail "S12：beta.en.md 被改写（跳过文件只读）"
fi
assert_has "$LOG" '－ 跳过（已存在译文）' "S12：循环逐文件输出跳过行（－ 前缀）"

# ---------- S13：结构校验失败（七类 corrupt → 非 0、零内容写入、写工件） ----------
# 工件写到工作区根 .translate/（源相对 cwd 的前导 ../ 被清洗）；每轮独立目录
# 并清空工件目录，类别词按 corrupt 模式逐一断言。unclose-fence 专门验证围栏
# 行计数：删掉闭围栏后信息串多重集不变，只有奇偶/相等检查能捕获。
for mode in drop-fence drop-callout drop-image change-link-url drop-inline extra-formula unclose-fence; do
  case "$mode" in
    drop-fence) word='代码块' ;;
    drop-callout) word='callout' ;;
    drop-image) word='图片' ;;
    change-link-url) word='链接' ;;
    drop-inline) word='行内代码' ;;
    extra-formula) word='公式' ;;
    unclose-fence) word='代码块' ;;
  esac
  rm -rf "$WORK/s13-$mode" .translate
  cp -R scripts/tests/fixtures/translate "$WORK/s13-$mode"
  stub_start --corrupt "$mode"
  write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
  LOG="$WORK/s13-$mode.log"
  run "$WORK/s13-$mode/single.md"
  [ "${rc}" -ne 0 ] || fail "S13/${mode}：应退出非 0（实际 ${rc}）"
  if [ -e "$WORK/s13-$mode/single.en.md" ]; then
    fail "S13/${mode}：不应写入内容目录（single.en.md 意外出现）"
  fi
  artifact=$(find .translate -name 'single.en.md' -print -quit 2>/dev/null || true)
  [ -n "${artifact}" ] || fail "S13/${mode}：工件译文缺失（.translate 下无 single.en.md）"
  problems_file=$(find .translate -name '*.problems.txt' -print -quit 2>/dev/null || true)
  [ -n "${problems_file}" ] || fail "S13/${mode}：工件问题清单缺失（.translate 下无 *.problems.txt）"
  assert_has "${problems_file}" "${word}" "S13/${mode}：问题清单含「${word}」"
  assert_has "$LOG" '结构校验未通过' "S13/${mode}：pinned 错误消息"
  assert_has "$LOG" '详见 .translate/' "S13/${mode}：错误消息指向失败工件"
  assert_lacks "$LOG" '翻译失败' "S13/${mode}：哨兵错误未被「翻译失败」包装"
  pass "S13/${mode}：非 0 退出、零内容写入、工件含「${word}」"
done
pass "S13：七类结构校验失败场景全部符合预期"

# ---------- S14：--force 也不覆盖既有目标（校验失败零内容写入） ----------
rm -rf "$WORK/s14" .translate
cp -R scripts/tests/fixtures/translate "$WORK/s14"
printf 'KEEP-SENTINEL\n' > "$WORK/s14/single.en.md"
stub_start --corrupt drop-fence
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s14.log"
run "$WORK/s14/single.md" --force
[ "${rc}" -ne 0 ] || fail "S14：应退出非 0（实际 ${rc}）"
pass "S14：退出非 0"
assert_has "$WORK/s14/single.en.md" 'KEEP-SENTINEL' "S14：既有译文未被 --force 覆盖"

# ---------- S15：系列失败即停（首个文件校验失败后不再请求、不再写入） ----------
# series fixtures 无围栏，用 extra-formula（对任何文件都生效）。
rm -rf "$WORK/s15" .translate
cp -R scripts/tests/fixtures/translate "$WORK/s15"
stub_start --corrupt extra-formula
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s15.log"
run "$WORK/s15/series"
[ "${rc}" -ne 0 ] || fail "S15：应退出非 0（实际 ${rc}）"
pass "S15：退出非 0"
assert_count "$WORK/stub.log" '"n":' 2 "S15：桩日志 2 行（index 的 frontmatter+正文后即败）"
for name in index beta alpha; do
  if [ -e "$WORK/s15/series/${name}.en.md" ]; then
    fail "S15：${name}.en.md 不应存在（失败即停）"
  fi
done
pass "S15：index/beta/alpha 三个译文均不存在"

# ---------- S16：源缺必填 frontmatter（API 前失败、零请求、零落盘） ----------
rm -rf "$WORK/s16" .translate
cp -R scripts/tests/fixtures/translate "$WORK/s16"
stub_start
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s16.log"
run "$WORK/s16/bad-source.md"
[ "${rc}" -ne 0 ] || fail "S16：应退出非 0（实际 ${rc}）"
pass "S16：退出非 0"
assert_has "$LOG" "必填" "S16：错误提示缺少必填字段"
if [ -s "$WORK/stub.log" ]; then
  fail "S16：应在任何 API 调用前失败（桩日志非空）"
fi
pass "S16：零请求（API 前失败）"
if [ -e "$WORK/s16/bad-source.en.md" ]; then
  fail "S16：不应写入目标（bad-source.en.md 意外出现）"
fi
pass "S16：零落盘"

# ---------- S17：429 后重试成功（fm 失败 1 → 退避后成功；总请求 3） ----------
rm -rf "$WORK/s17"
cp -R scripts/tests/fixtures/translate "$WORK/s17"
stub_start --fail-first 429
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s17.log"
run "$WORK/s17/single.md"
[ "${rc}" -eq 0 ] || fail "S17：应退出 0（429 后重试成功，实际 ${rc}）"
pass "S17：退出 0（429 后重试成功）"
assert_file "$WORK/s17/single.en.md" "S17：生成译文"
assert_count "$WORK/stub.log" '"n":' 3 "S17：桩日志 3 行（fm 失败 1 + 重试成功 1 + 正文 1）"
assert_has "$LOG" "重试 1/3（HTTP 429）" "S17：脚本日志含「重试 1/3（HTTP 429）」"

# ---------- S18：持续 5xx（4 次尝试后终局失败、零落盘） ----------
rm -rf "$WORK/s18"
cp -R scripts/tests/fixtures/translate "$WORK/s18"
stub_start --fail-always 503
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s18.log"
run "$WORK/s18/single.md"
expect_error "S18：持续 5xx" "翻译接口持续失败（HTTP 503）"
assert_has "$LOG" "重试 3/3" "S18：脚本日志含「重试 3/3」"
assert_lacks "$LOG" "翻译失败" "S18：终局哨兵错误未被「翻译失败」包装"
assert_count "$WORK/stub.log" '"n":' 4 "S18：桩日志恰 4 行（1 次 + 3 次重试）"
if [ -e "$WORK/s18/single.en.md" ]; then
  fail "S18：不应落盘（single.en.md 意外出现）"
fi
pass "S18：零落盘"

# ---------- S19：401 认证失败（不重试、pinned 配置指引） ----------
rm -rf "$WORK/s19"
cp -R scripts/tests/fixtures/translate "$WORK/s19"
stub_start --reject-auth
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s19.log"
run "$WORK/s19/single.md"
[ "${rc}" -ne 0 ] || fail "S19：应退出非 0（实际 ${rc}）"
pass "S19：退出非 0"
assert_has "$LOG" "错误：API 认证失败（HTTP 401）。请检查 .env 中的 TRANSLATE_API_KEY。" "S19：pinned 认证失败文案（含 401 与 TRANSLATE_API_KEY）"
assert_lacks "$LOG" "重试" "S19：401 不重试"
assert_lacks "$LOG" "翻译失败" "S19：终局哨兵错误未被「翻译失败」包装"
assert_count "$WORK/stub.log" '"n":' 1 "S19：桩日志 1 行（不重试）"
if [ -e "$WORK/s19/single.en.md" ]; then
  fail "S19：不应落盘（single.en.md 意外出现）"
fi
pass "S19：零落盘"

# ---------- S19b：其他 4xx（404 → 不重试、pinned「翻译接口返回 HTTP 404」） ----------
rm -rf "$WORK/s19b"
cp -R scripts/tests/fixtures/translate "$WORK/s19b"
stub_start --fail-first 404
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s19b.log"
run "$WORK/s19b/single.md"
expect_error "S19b：其他 4xx" "翻译接口返回 HTTP 404"
assert_lacks "$LOG" "重试" "S19b：其他 4xx 不重试"
assert_count "$WORK/stub.log" '"n":' 1 "S19b：桩日志 1 行（不重试）"
if [ -e "$WORK/s19b/single.en.md" ]; then
  fail "S19b：不应落盘（single.en.md 意外出现）"
fi
pass "S19b：零落盘"

# ---------- S20：网络错误（fetch 抛出 → 3 次退避重试后终局失败） ----------
rm -rf "$WORK/s20"
cp -R scripts/tests/fixtures/translate "$WORK/s20"
stub_stop
write_env "http://127.0.0.1:9/"
LOG="$WORK/s20.log"
run "$WORK/s20/single.md"
expect_error "S20：网络错误" "调用翻译接口失败（网络错误）"
assert_has "$LOG" "重试 3/3" "S20：网络错误同样退避重试 3 次"
assert_lacks "$LOG" "翻译失败" "S20：终局哨兵错误未被「翻译失败」包装"
if [ -e "$WORK/s20/single.en.md" ]; then
  fail "S20：不应落盘（single.en.md 意外出现）"
fi
pass "S20：零落盘"

# ---------- S21：系列中途持续失败（首文件已写入保留、后续零请求；Ruling 8） ----------
rm -rf "$WORK/s21"
cp -R scripts/tests/fixtures/translate "$WORK/s21"
stub_start --fail-from 3 503
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s21.log"
run "$WORK/s21/series"
expect_error "S21：系列第二文件持续 5xx" "翻译接口持续失败（HTTP 503）"
assert_file "$WORK/s21/series/index.en.md" "S21：index 已写入（首文件成果保留）"
for name in beta alpha; do
  if [ -e "$WORK/s21/series/${name}.en.md" ]; then
    fail "S21：${name}.en.md 不应存在（失败即停、零请求）"
  fi
done
pass "S21：beta/alpha 译文均不存在"
assert_count "$WORK/stub.log" '"n":' 6 "S21：桩日志 6 行（index 2 + beta frontmatter 的 4 次尝试）"
assert_count "$WORK/stub.log" 'ALPHA-CONTEXT-MARKER' 0 "S21：alpha 零请求（上下文标记 0 次）"
assert_has "$LOG" "重试 3/3" "S21：beta frontmatter 重试耗尽"
assert_lacks "$LOG" "翻译失败" "S21：终局哨兵错误未被「翻译失败」包装"

# ---------- S22：围栏陷阱（围栏内的 ## 行不得作为分块切点） ----------
# 旧实现会在围栏内的「## 」行处切段，开栏注释与闭栏注释落入两个请求。断言
# 锚定「源文区域」（<<<SOURCE 之后）而非整条日志：第二块请求的已译上下文会
# 携带第一块译文尾段（含两枚标记），整条匹配无法区分「围栏整体发送」与
# 「被上下文拼出的假象」；旧实现下两标记分属两个请求 → 命中 0。
rm -rf "$WORK/s22"
cp -R scripts/tests/fixtures/translate "$WORK/s22"
stub_start
write_env "http://127.0.0.1:$(cat "$WORK/stub.port")"
LOG="$WORK/s22.log"
run "$WORK/s22/fence-trap.md"
[ "${rc}" -eq 0 ] || fail "S22：应退出 0（实际 ${rc}）"
pass "S22：退出 0"
DST="$WORK/s22/fence-trap.en.md"
assert_file "$DST" "S22：生成译文"
assert_has "$DST" 'FENCE-TRAP-OPEN' "S22：译文含围栏起点标记"
L="$WORK/stub.log"
assert_count "$L" '"n":' 3 "S22：桩收到 3 次请求（frontmatter + 2 块）"
n=$( (grep -cE '<<<SOURCE.*FENCE-TRAP-OPEN.*FENCE-TRAP-CLOSE' "$L" || true) )
[ "${n}" -eq 1 ] || fail "S22：围栏块应整体进入同一次正文请求（源文区域同时含 OPEN/CLOSE 的请求数 = ${n}，期望 1）"
pass "S22：同一请求的源文区域同时包含 FENCE-TRAP-OPEN 与 FENCE-TRAP-CLOSE"
