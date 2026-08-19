# macOS 签名与公证

Los Alamos 使用 `Developer ID Application` 证书和 App Store Connect API Key，
为 Mac App Store 之外的 DMG、ZIP 和 `.app` 提供签名、公证与离线票据。

## Apple 侧准备

1. 加入 Apple Developer Program。
2. 在 Apple Developer 后台创建 `Developer ID Application` 证书。
3. 将证书及其私钥从“钥匙串访问”导出为有密码的 `.p12`。
4. 在 App Store Connect 的“用户和访问 > 集成 > App Store Connect API”中创建
   Team Key，权限使用 `App Manager`。
5. 记录 Key ID 和 Issuer ID，并妥善保存只能下载一次的 `.p8` 文件。

API Key 必须来自 App Store Connect，不是 Apple Developer Portal 中用于 APNs
等服务的普通 Key。

## GitHub Secrets

在仓库 `Settings > Secrets and variables > Actions` 中配置：

| Secret | 内容 |
| --- | --- |
| `MACOS_CERTIFICATE_P12_BASE64` | `.p12` 文件的单行 Base64 |
| `MACOS_CERTIFICATE_PASSWORD` | 导出 `.p12` 时设置的密码 |
| `APPLE_API_KEY_P8_BASE64` | `.p8` 文件的单行 Base64 |
| `APPLE_API_KEY_ID` | App Store Connect API Key ID |
| `APPLE_API_ISSUER` | App Store Connect Issuer ID |

在 macOS 上生成单行 Base64：

```bash
base64 -i DeveloperIDApplication.p12 | tr -d '\n'
base64 -i AuthKey_KEYID.p8 | tr -d '\n'
```

不要提交证书、私钥、密码或编码后的 Secret。Base64 只解决传输格式问题，不提供加密。

## GitHub Actions

`.github/workflows/macos-release.yml` 支持两种入口：

- `workflow_dispatch`：构建并验证签名产物，只上传 Actions artifact；
- 推送 `v*` tag：完成相同验证后创建或更新对应 GitHub Release。

Tag 必须与 `package.json` 版本一致。例如版本为 `0.1.0` 时：

```bash
git tag v0.1.0
git push origin v0.1.0
```

Workflow 会依次执行：

1. 解码临时证书和 API Key；
2. 构建 universal macOS 应用；
3. 使用 hardened runtime 和最小 entitlements 签名；
4. 公证并 staple `.app`；
5. 签名、公证并 staple 最外层 DMG；
6. 对 DMG 和 ZIP 中的应用执行 `codesign`、`stapler` 与 Gatekeeper 验证；
7. 从 DMG 冷安装并运行完整 packaged smoke；
8. 生成 `SHA256SUMS.txt` 并上传产物；
9. 删除 runner 上的临时凭据文件。

普通 `CI` workflow 明确禁用签名发现，因此 pull request 和日常提交不依赖 Apple
凭据，也不会消耗公证配额。

## 本机发行

本机钥匙串中应存在有效的 `Developer ID Application` identity，并设置：

```bash
export CSC_LINK="/absolute/path/DeveloperIDApplication.p12"
export CSC_KEY_PASSWORD="<p12-password>"
export APPLE_API_KEY="/absolute/path/AuthKey_KEYID.p8"
export APPLE_API_KEY_ID="<key-id>"
export APPLE_API_ISSUER="<issuer-id>"

npm run dist:mac:signed
bash scripts/notarize_macos_dmg.sh release/macos-signed
bash scripts/verify_macos_release.sh release/macos-signed
```

当前机器可用 identity 可通过以下命令检查：

```bash
security find-identity -v -p codesigning
```

证书或 API Key 被撤销、过期或泄露后，应立即在 Apple 后台轮换，并同步更新 GitHub
Secrets。
