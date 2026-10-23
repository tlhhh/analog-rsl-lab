# 将 Analog RSL 发布到 GitHub

本目录是准备上传的仓库根目录，包含源码、README、规格文件、示例结果、测试和 Git 忽略规则。当前尚未推送到任何 GitHub 仓库。

## 方法一：网页上传，无需命令行

1. 解压 `analog-rsl-github.zip`，进入其中的 `analog-rsl-github` 文件夹。你应该能直接看到 `README.md`、`analog-rsl.cjs`、`package.json` 和 `examples` 等文件。
2. 登录 GitHub，打开 [创建仓库页面](https://github.com/new?name=analog-rsl-lab&visibility=private)。
3. 检查 Owner 是你的账号；Repository name 填 `analog-rsl-lab`；Description 可填：`Educational analog IC sizing with self-learning search policies`。
4. 选择可见性：Private 供自己或受邀者使用；Public 便于他人浏览和下载。预填链接使用 Private，你可按分享意图修改。
5. 不额外生成 README 或 .gitignore，因为上传包已经包含。License 暂时不选，后续确定分发许可后再添加。点击 **Create repository**。
6. 在空仓库 Quick setup 页面点击 **uploading an existing file**。如果仓库已有文件，则选择 **Add file → Upload files**。
7. 将本地 `analog-rsl-github` 文件夹**里面的文件与 examples 文件夹**拖入上传区。不要直接上传 ZIP，也不要把外层 `analog-rsl-github` 文件夹作为一个子文件夹上传。等待上传列表完成。
8. 检查上传列表里有 `.gitignore` 和 `.gitattributes`。文件选择器中若不显示，可在 Windows 文件资源管理器中选择所有项目后拖入；这两个文件已经包含在 ZIP 内。
9. Commit message 填 `Initial release of analog RSL sizing prototype`。首次导入自己的空仓库时，如有分支选项可提交至 `main`；点击 **Commit changes** 完成。若按钮显示 **Propose changes** 并走向拉取请求，则按界面提交并合并该请求。
10. 回到仓库首页，确认 README 正常显示，源文件位于根目录。复制浏览器地址栏中的仓库地址即是分享链接。

发布的是可下载运行的源码项目，不需要开启 GitHub Pages。运行时需安装 Node.js。

网页操作依据：[创建仓库](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)、[上传文件](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)。

## 方法二：已有 Git 的环境，用终端推送

先按上面第 2–5 步创建一个空仓库，然后在本目录打开 PowerShell。依次执行以下命令，把最后的 `YOUR_USERNAME` 替换成自己的 GitHub 用户名：

```powershell
git init -b main
git add .
git commit -m "Initial release of analog RSL sizing prototype"
git remote add origin https://github.com/YOUR_USERNAME/analog-rsl-lab.git
git push -u origin main
```

如果 Git 提示缺少 author identity，在本仓库目录设置自己的提交姓名和邮箱后，重新执行 commit 与 push：

```powershell
git config user.name "你的提交显示名"
git config user.email "你在 GitHub 设置中使用的提交邮箱"
```

`git push` 需要 GitHub 身份验证。按本机 Git 的浏览器登录提示完成；不要把账号密码填写进源码。如果没有可用登录入口，使用网页上传方式即可。

已安装 GitHub CLI 的环境也可先运行 `gh auth login`，再从已提交的本地仓库运行：

```powershell
gh repo create analog-rsl-lab --private --source=. --remote=origin --push
```

这条命令会创建新仓库，适用于尚未通过网页创建同名仓库的情况。要公开分享，可将 `--private` 改成 `--public`。

命令行操作依据：[GitHub 官方导入说明](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)。

## 发布后验证

在 GitHub 仓库页面点击 **Code → Download ZIP**，解压后在项目目录运行：

```powershell
node verify.cjs
node analog-rsl.cjs demo
```

第一条应显示 8 项检查通过；第二条完成学习演示并在 `data/` 写出策略、报告、设计结果与演示网表。当前模型是教学用近似模型，项目 README 说明了适用范围与局限。

以后更新代码，可继续使用网页 Upload files 提交对应文件，或在已建立远程连接的本地仓库中运行 `git add .`、`git commit -m "Describe the update"` 和 `git push`。`data/` 被 Git 忽略；网页上传不会自动应用该忽略规则，因此只上传需要更新的源码文件。
