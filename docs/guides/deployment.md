# 部署指南（hexo 式）

部署复刻 hexo-deployer-git 的方式，**不经 GitHub Actions**：在本机执行
`npm run deploy`（或 `bun run deploy`）= `astro build` + `scripts/deploy.sh`。

## 前置条件

`.env`（模板见 `.env.example`，已被 gitignore）中至少配置：

```bash
SITE_URL=https://example.com                         # 站点公开地址
DEPLOY_REPO=git@github.com:<user>/<user>.github.io.git  # Pages 仓库
DEPLOY_BRANCH=main                                   # 发布分支
```

`SITE_URL` 是 sitemap / RSS / canonical 的基准 URL，部署前务必与公开域名一致。
缺少 `SITE_URL` 时构建会直接报错并提示配置方法。

## 机制

- `scripts/deploy.sh` 把目标仓库克隆为项目根的 `.deploy_git/` 缓存目录。
- 每次部署先与远端目标分支对齐，清空目录（保留 `.git`）后把 `dist/` 全量拷入。
- 提交信息为 `Site updated: <时间>`，再以 `git push --force` 推送。
- 目标仓库是**纯产物仓库**，不要在网页端直接修改其中的文件。

同名环境变量可临时覆盖（演练用），但不能替代 `.env` 中的定义。部署出错时可
`rm -rf .deploy_git` 重置缓存，下次部署会自动重新克隆。

## 首次一次性设置

1. 在 GitHub 新建空仓库（如 `zingrigger.github.io`）。
2. 首次部署后，到目标仓库 Settings → Pages → Deploy from a branch，选择
   `main` / `(root)`。
3. 按需启用 Enforce HTTPS。

## 绑定自定义域名

1. `public/CNAME` 写入域名并部署。
2. 把 `.env` 中 `SITE_URL` 改为新域名并再次部署。
3. Cloudflare 添加 `xxx.blog → <user>.github.io` 的 CNAME 记录（证书签发期间建议
   「仅 DNS」），并在目标仓库 Settings 填写 Custom domain、启用 HTTPS。

之所以 `CNAME` 必须放在源码里：部署是全量覆盖，GitHub 设置生成的 `CNAME` 文件会被
下次部署清掉（hexo 文档同款说明）。

## 演练与校验

部署脚本带干跑校验，在 `/tmp` 临时 bare 仓库上覆盖全流程与错误路径，
**不触碰真实 Pages 仓库**（测试期间临时使用受控 `.env`，退出时恢复）：

```bash
bash scripts/tests/deploy-check.sh
```

运行前需已安装依赖。
